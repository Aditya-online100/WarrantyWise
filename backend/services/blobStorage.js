const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const config = require('../config/env');

let blobServiceClient = null;
let containerClient = null;
let storageMode = 'LOCAL_DISK'; // 'AZURE_BLOB' or 'LOCAL_DISK'
let storageAuthMode = 'LOCAL'; // 'MANAGED_IDENTITY' or 'LOCAL'

function isAzureBlobConfigured(storageCfg = config.AZURE_STORAGE) {
  return Boolean(storageCfg && storageCfg.accountName && String(storageCfg.accountName).trim().length > 0);
}

/**
 * Creates Azure Blob Storage SDK clients using DefaultAzureCredential (no storage account keys).
 */
function createBlobStorageClients(storageCfg = config.AZURE_STORAGE) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const { DefaultAzureCredential } = require('@azure/identity');

  const accountName = String(storageCfg.accountName || '').trim();
  const containerName = String(storageCfg.containerName || 'warranty-documents').trim();
  const clientId = String(storageCfg.managedIdentityClientId || '').trim();

  if (!accountName) {
    throw new Error('AZURE_STORAGE_ACCOUNT_NAME is required to initialize Azure Blob Storage.');
  }

  const accountUrl = `https://${accountName}.blob.core.windows.net`;
  const credential = new DefaultAzureCredential(
    clientId ? { managedIdentityClientId: clientId } : undefined
  );
  const serviceClient = new BlobServiceClient(accountUrl, credential);
  const container = serviceClient.getContainerClient(containerName);

  return {
    serviceClient,
    containerClient: container,
    accountName,
    accountUrl,
    containerName
  };
}

// Initialize Azure Blob Client if storage account name is configured
if (isAzureBlobConfigured(config.AZURE_STORAGE)) {
  try {
    const clients = createBlobStorageClients(config.AZURE_STORAGE);
    blobServiceClient = clients.serviceClient;
    containerClient = clients.containerClient;
    storageMode = 'AZURE_BLOB';
    storageAuthMode = 'MANAGED_IDENTITY';
    console.log(
      `[Storage] Azure Blob Storage initialized (Account: ${clients.accountName}, Container: ${clients.containerName}, Auth: DefaultAzureCredential)`
    );
  } catch (err) {
    if (config.NODE_ENV === 'production' || process.env.AZURE_STRICT_STORAGE === 'true') {
      console.error(`[Storage] Fatal Azure Blob Storage initialization error: ${err.message}`);
      throw err;
    }
    console.warn(`[Storage] Failed to initialize Azure Blob Storage: ${err.message}. Defaulting to Local Disk.`);
  }
}

/**
 * Ensures the target container exists and remains strictly private (no public access option passed).
 */
async function ensurePrivateContainer() {
  if (!containerClient) return;
  try {
    await containerClient.createIfNotExists();
  } catch (err) {
    // Container-scoped Storage Blob Data Contributor RBAC may forbid createContainer while allowing blob ops
    const statusCode = err && (err.statusCode || err.code);
    if (statusCode === 403 || statusCode === 409) {
      const exists = await containerClient.exists().catch(() => false);
      if (exists) return;
    }
    throw err;
  }
}

function buildSamplePlaceholderStream(storagePath) {
  const demoBuffer = Buffer.from(
    `WarrantyWise Sample Document Demo\nDocument: ${path.basename(storagePath)}\nThis is a verified test placeholder document.`
  );
  return {
    stream: Readable.from(demoBuffer),
    contentLength: demoBuffer.length,
    contentType: 'text/plain'
  };
}

function resolveSafeLocalPath(storagePath) {
  const uploadRoot = path.resolve(config.UPLOAD_DIR);
  const fullPath = path.resolve(uploadRoot, storagePath);
  if (fullPath !== uploadRoot && !fullPath.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error('Invalid storage path');
  }
  return fullPath;
}

/**
 * Uploads a file to Azure Blob Storage (private container) or Local Disk fallback.
 * @param {Object} file Multer file object
 * @param {number} userId User ID for folder segregation
 */
async function uploadFile(file, userId) {
  const timestamp = Date.now();
  const safeFilename = `${timestamp}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  // If Azure Blob Storage is active
  if (storageMode === 'AZURE_BLOB' && containerClient) {
    await ensurePrivateContainer();
    const blobPath = `user_${userId}/${safeFilename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const buffer = file.buffer || fs.readFileSync(file.path);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype || 'application/octet-stream'
      }
    });

    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return {
      storageType: 'AzureBlob',
      storagePath: blobPath,
      fileName: safeFilename
    };
  }

  // Local Disk Storage Fallback (only when Azure Blob is not configured)
  const userFolder = path.join(config.UPLOAD_DIR, `user_${userId}`);
  if (!fs.existsSync(userFolder)) {
    fs.mkdirSync(userFolder, { recursive: true });
  }

  const destinationPath = path.join(userFolder, safeFilename);

  if (file.buffer) {
    fs.writeFileSync(destinationPath, file.buffer);
  } else if (file.path) {
    fs.copyFileSync(file.path, destinationPath);
    fs.unlinkSync(file.path);
  }

  const relativePath = path.join(`user_${userId}`, safeFilename).replace(/\\/g, '/');

  return {
    storageType: 'LocalDisk',
    storagePath: relativePath,
    fileName: safeFilename
  };
}

/**
 * Retrieves file stream for secure downloading.
 * Never exposes Azure containers publicly; serves stream via authenticated API.
 */
async function getFileStream(storagePath, storageType) {
  if (storageType === 'AzureBlob') {
    if (!containerClient) {
      if (storagePath.includes('sample_')) {
        return buildSamplePlaceholderStream(storagePath);
      }
      throw new Error('Document is stored in Azure Blob Storage, which is not configured in this environment.');
    }

    const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
    try {
      const downloadResponse = await blockBlobClient.download(0);
      return {
        stream: downloadResponse.readableStreamBody,
        contentLength: downloadResponse.contentLength,
        contentType: downloadResponse.contentType
      };
    } catch (err) {
      if (err && err.statusCode === 404 && storagePath.includes('sample_')) {
        return buildSamplePlaceholderStream(storagePath);
      }
      throw err;
    }
  }

  // Local disk
  const fullPath = resolveSafeLocalPath(storagePath);
  if (!fs.existsSync(fullPath)) {
    if (storagePath.includes('sample_')) {
      return buildSamplePlaceholderStream(storagePath);
    }
    if (containerClient) {
      const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
      const existsInBlob = await blockBlobClient.exists().catch(() => false);
      if (existsInBlob) {
        const downloadResponse = await blockBlobClient.download(0);
        return {
          stream: downloadResponse.readableStreamBody,
          contentLength: downloadResponse.contentLength,
          contentType: downloadResponse.contentType
        };
      }
    }
    throw new Error('File not found on storage server');
  }

  return {
    stream: fs.createReadStream(fullPath),
    contentLength: fs.statSync(fullPath).size
  };
}

/**
 * Lists files in the private Azure Blob container (or Local Disk directory).
 * Supports prefix / userId scoping for authenticated multi-tenant isolation.
 */
async function listFiles({ userId = null, prefix = '' } = {}) {
  const effectivePrefix =
    userId !== null && userId !== undefined && userId !== ''
      ? `user_${userId}/`
      : String(prefix || '').replace(/^\/+/, '');

  if (storageMode === 'AZURE_BLOB' && containerClient) {
    const files = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: effectivePrefix })) {
      files.push({
        name: path.posix.basename(blob.name),
        storagePath: blob.name,
        size: blob.properties?.contentLength ?? 0,
        contentType: blob.properties?.contentType || 'application/octet-stream',
        lastModified: blob.properties?.lastModified
          ? blob.properties.lastModified.toISOString()
          : null,
        storageType: 'AzureBlob'
      });
    }
    return files;
  }

  // Local disk listing fallback
  const uploadRoot = path.resolve(config.UPLOAD_DIR);
  if (!fs.existsSync(uploadRoot)) {
    return [];
  }

  const results = [];
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullEntryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullEntryPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(uploadRoot, fullEntryPath).replace(/\\/g, '/');
        if (!effectivePrefix || relPath.startsWith(effectivePrefix)) {
          const stats = fs.statSync(fullEntryPath);
          results.push({
            name: entry.name,
            storagePath: relPath,
            size: stats.size,
            contentType: null,
            lastModified: stats.mtime.toISOString(),
            storageType: 'LocalDisk'
          });
        }
      }
    }
  }

  walk(uploadRoot);
  results.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
  return results;
}

/**
 * Deletes a file from Azure Blob or Local Disk
 */
async function deleteFile(storagePath, storageType) {
  if (storageType === 'AzureBlob' && containerClient) {
    const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
    const result = await blockBlobClient.deleteIfExists();
    return Boolean(result.succeeded);
  }

  const fullPath = resolveSafeLocalPath(storagePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

function getStorageMode() {
  return storageMode;
}

function getStorageAuthMode() {
  return storageAuthMode;
}

function getContainerName() {
  return config.AZURE_STORAGE.containerName;
}

function getAccountName() {
  return config.AZURE_STORAGE.accountName || null;
}

module.exports = {
  uploadFile,
  getFileStream,
  listFiles,
  deleteFile,
  getStorageMode,
  getStorageAuthMode,
  getContainerName,
  getAccountName,
  isAzureBlobConfigured,
  createBlobStorageClients,
  ensurePrivateContainer
};

