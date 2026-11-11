#!/usr/bin/env node
/**
 * Safe Live Azure Blob Storage Diagnostic & Private Container Verifier
 *
 * Verifies:
 *   1. Environment configuration (AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_CONTAINER_NAME) with zero storage keys
 *   2. Microsoft Entra ID / Managed Identity token acquisition for https://storage.azure.com/.default
 *   3. Private container check (ensuring container exists and public blob access is disabled)
 *   4. Read-only container blob listing
 *   5. Optional (--roundtrip) temporary blob upload -> list -> download byte verification -> delete cleanup
 *      and anonymous public HTTPS check (must fail with 403/404/409, never 200)
 *
 * Usage:
 *   npm run azure:test-blob                  # Read-only container, privacy & RBAC check
 *   npm run azure:test-blob -- --roundtrip   # Full upload/list/download/delete + public-block check
 */

const crypto = require('crypto');
const https = require('https');
const config = require('../config/env');
const blobStorage = require('../services/blobStorage');

function classifyAzureBlobError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || err?.statusCode || '');
  const tips = [];

  if (/ChainedTokenCredential|DefaultAzureCredential|AzureCliCredential|az login/i.test(msg)) {
    tips.push('No Microsoft Entra ID token could be acquired in the current runtime.');
    tips.push('On your local machine: run "az login" first (and ensure your user has "Storage Blob Data Contributor"), then re-run this test.');
    tips.push('On Azure App Service (warrantywise-web-123): enable System-Assigned Managed Identity in App Service -> Identity.');
  } else if (/AuthorizationPermissionMismatch|403/.test(`${code} ${msg}`)) {
    tips.push('Authenticated successfully, but the principal lacks data-plane RBAC permissions on warrantystorage2026 / warranty-documents.');
    tips.push('In Azure Portal -> Storage account warrantystorage2026 (or container warranty-documents) -> Access control (IAM):');
    tips.push('  Assign role "Storage Blob Data Contributor" to Managed Identity "warrantywise-web-123" (and your signed-in account for local CLI tests).');
  } else if (/AuthorizationFailure|Firewall|PublicAccessNotPermitted|network/i.test(`${code} ${msg}`)) {
    tips.push('Blocked by Storage Account firewall / networking settings or public access policies.');
    tips.push('In Azure Portal -> warrantystorage2026 -> Security + networking -> Networking: allow App Service subnet / outbound IPs (or your client IP temporarily).');
  } else if (/ContainerNotFound|404/.test(`${code} ${msg}`)) {
    tips.push(`Private container "${config.AZURE_STORAGE.containerName}" does not exist yet in storage account "${config.AZURE_STORAGE.accountName}".`);
    tips.push('Create private container "warranty-documents" (Anonymous access level: Private) in Azure Portal -> Containers.');
  }

  return tips;
}

function probeAnonymousHttpsGet(urlString) {
  return new Promise((resolve) => {
    const req = https.get(urlString, { timeout: 8000 }, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage });
    });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 0, error: 'TIMEOUT' });
    });
  });
}

async function streamToBuffer(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function testAzureBlobConnection({ roundtrip = false, overrideConfig = null } = {}) {
  const effectiveCfg = overrideConfig || config.AZURE_STORAGE;
  const isAppServiceMsi = Boolean(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);

  console.log('====================================================================');
  console.log('WarrantyWise — Azure Blob Storage Diagnostic');
  console.log('====================================================================');
  console.log(`Runtime Context : ${isAppServiceMsi ? 'Azure App Service (MSI Environment)' : 'Local Workstation / CLI'}`);
  console.log(`Storage Account : ${effectiveCfg.accountName || '(NOT SET)'}`);
  console.log(`Container       : ${effectiveCfg.containerName || 'warranty-documents'}`);
  console.log(`Roundtrip Write : ${roundtrip ? 'ENABLED (creates & deletes 1 temporary test blob)' : 'DISABLED (read-only)'}`);

  if (!blobStorage.isAzureBlobConfigured(effectiveCfg)) {
    throw new Error(
      'AZURE_STORAGE_ACCOUNT_NAME is not set. Example:\n' +
      '  $env:AZURE_STORAGE_ACCOUNT_NAME="warrantystorage2026"\n' +
      '  $env:AZURE_STORAGE_CONTAINER_NAME="warranty-documents"\n' +
      '  npm run azure:test-blob'
    );
  }

  const { DefaultAzureCredential } = require('@azure/identity');
  const clientId = String(effectiveCfg.managedIdentityClientId || '').trim();
  const credential = new DefaultAzureCredential(
    clientId ? { managedIdentityClientId: clientId } : undefined
  );

  console.log('--------------------------------------------------------------------');
  console.log('[1/4] Requesting Entra ID access token for https://storage.azure.com/.default ...');
  const token = await credential.getToken('https://storage.azure.com/.default');
  const expiresIso = token?.expiresOnTimestamp ? new Date(token.expiresOnTimestamp).toISOString() : 'unknown';
  console.log(`      PASS — Entra ID token acquired (expires ${expiresIso}).`);

  const { containerClient, accountUrl, containerName } = blobStorage.createBlobStorageClients(effectiveCfg);
  console.log(`[2/4] Verifying container "${containerName}" exists & is STRICTLY PRIVATE...`);
  const exists = await containerClient.exists();
  if (!exists) {
    const missingErr = new Error(`Container "${containerName}" does not exist in "${accountUrl}".`);
    missingErr.code = 'ContainerNotFound';
    throw missingErr;
  }

  const props = await containerClient.getProperties();
  const publicAccess = props.blobPublicAccess || null;
  if (publicAccess !== null) {
    throw new Error(
      `SECURITY FAILURE: Container "${containerName}" allows public access ("${publicAccess}"). Change container access level to Private (no anonymous access).`
    );
  }
  console.log(`      PASS — Container "${containerName}" exists and blobPublicAccess is null (Private).`);

  console.log('[3/4] Listing blobs (read permission check)...');
  let listedCount = 0;
  for await (const _blob of containerClient.listBlobsFlat({ maxPageSize: 10 })) {
    listedCount++;
    if (listedCount >= 10) break;
  }
  console.log(`      PASS — Listed blobs cleanly (sampled ${listedCount} object${listedCount === 1 ? '' : 's'}).`);

  if (!roundtrip) {
    console.log('[4/4] Skipping write/download/delete round-trip (pass "-- --roundtrip" to run end-to-end blob test).');
    console.log('--------------------------------------------------------------------');
    console.log('RESULT: AZURE BLOB CONTAINER ACCESS, PRIVACY & LISTING VERIFIED.');
    return { ok: true, roundtrip: false, privateContainer: true, listedSampleCount: listedCount };
  }

  // Roundtrip test: upload -> list -> anonymous-block probe -> authenticated download -> delete
  const testPath = `diagnostics/warrantywise-health-${Date.now()}.txt`;
  const payloadText = `WarrantyWise Private Blob Roundtrip Test\nTimestamp: ${new Date().toISOString()}\nNonce: ${crypto.randomBytes(8).toString('hex')}\n`;
  const expectedBuffer = Buffer.from(payloadText, 'utf8');
  const blockBlobClient = containerClient.getBlockBlobClient(testPath);

  console.log(`[4/4] Running temporary upload -> list -> private check -> download -> delete (${testPath})...`);
  try {
    await blockBlobClient.uploadData(expectedBuffer, {
      blobHTTPHeaders: { blobContentType: 'text/plain' }
    });

    let foundInListing = false;
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'diagnostics/' })) {
      if (blob.name === testPath) {
        foundInListing = true;
        break;
      }
    }
    if (!foundInListing) {
      throw new Error('Uploaded test blob did not appear in listBlobsFlat.');
    }

    const anonProbe = await probeAnonymousHttpsGet(blockBlobClient.url);
    if (anonProbe.statusCode === 200) {
      throw new Error('SECURITY FAILURE: Unauthenticated anonymous GET returned HTTP 200 for blob!');
    }

    const downloadResponse = await blockBlobClient.download(0);
    const downloadedBuffer = await streamToBuffer(downloadResponse.readableStreamBody);
    if (!downloadedBuffer.equals(expectedBuffer)) {
      throw new Error('Downloaded blob content did not match uploaded bytes.');
    }

    console.log(`      PASS — Upload, list, anonymous-access block (HTTP ${anonProbe.statusCode}), and byte-exact download succeeded.`);
  } finally {
    await blockBlobClient.deleteIfExists().catch((delErr) => {
      console.warn(`      WARN — Failed to clean up temporary blob ${testPath}: ${delErr.message}`);
    });
  }

  const existsAfterDelete = await blockBlobClient.exists();
  if (existsAfterDelete) {
    throw new Error('Temporary blob still existed after deleteIfExists().');
  }
  console.log('      PASS — Temporary test blob deleted cleanly.');
  console.log('--------------------------------------------------------------------');
  console.log('RESULT: FULL LIVE AZURE BLOB UPLOAD, DOWNLOAD, LISTING, DELETE & PRIVACY VERIFIED.');
  return { ok: true, roundtrip: true, privateContainer: true };
}

if (require.main === module) {
  const roundtrip = process.argv.includes('--roundtrip');
  testAzureBlobConnection({ roundtrip }).catch((err) => {
    console.error(`\nLIVE BLOB TEST FAILED: ${err.message}`);
    const tips = classifyAzureBlobError(err);
    if (tips.length > 0) {
      console.error('\nAction required:');
      for (const tip of tips) {
        console.error(`  - ${tip}`);
      }
    }
    process.exit(1);
  });
}

module.exports = {
  classifyAzureBlobError,
  testAzureBlobConnection
};

