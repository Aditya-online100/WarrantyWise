#!/usr/bin/env node
/**
 * Safe, Read-Only Live Azure SQL Connection & Permissions Diagnostic
 *
 * Verifies:
 *   1. Environment configuration (DB_SERVER, DB_NAME, DB_AUTH_MODE) without SQL passwords
 *   2. Microsoft Entra ID / Managed Identity token acquisition via @azure/identity
 *   3. Encrypted TLS connection to Azure SQL Database via node-mssql
 *   4. Authenticated principal identity (SUSER_SNAME / USER_NAME) and effective database permissions
 *   5. Presence of all 7 required tables, indexes, foreign keys, views, procedures, and triggers
 *
 * Performs ONLY read-only SELECT queries (safe to run against live production/staging databases).
 * Never prints tokens, passwords, or secrets.
 */

const config = require('../config/env');
const db = require('../services/db');

const REQUIRED_TABLES = [
  'Users',
  'Categories',
  'Products',
  'Warranties',
  'Repairs',
  'Documents',
  'ActivityLogs'
];

const EXPECTED_INDEXES = [
  'IX_Products_UserId',
  'IX_Products_CategoryId',
  'IX_Warranties_ProductId',
  'IX_Warranties_EndDate',
  'IX_Repairs_ProductId',
  'IX_Repairs_UserId',
  'IX_Documents_ProductId',
  'IX_Documents_UserId',
  'IX_ActivityLogs_CreatedAt'
];

function classifyAzureSqlError(err) {
  const msg = String(err?.message || err || '');
  const tips = [];

  if (/ChainedTokenCredential|DefaultAzureCredential|AzureCliCredential|az login/i.test(msg)) {
    tips.push('No Microsoft Entra ID token could be acquired in the current runtime.');
    tips.push('On your local machine: run "az login" first, then re-run this test.');
    tips.push('On Azure App Service (warrantywise-web-123): enable System-Assigned Managed Identity in App Service -> Identity.');
  } else if (/Client with IP address .* is not allowed|firewall/i.test(msg)) {
    tips.push('Blocked by Azure SQL Server firewall.');
    tips.push('In Azure Portal -> SQL Server -> Networking: enable "Allow Azure services and resources to access this server" for App Service, and add your client IPv4 address for local testing.');
  } else if (/Login failed for user/i.test(msg)) {
    tips.push('Entra ID token succeeded, but this identity does not yet have a contained user in WarrantyWiseDB.');
    tips.push('Connect to WarrantyWiseDB as the Microsoft Entra Admin and run:');
    tips.push('  CREATE USER [warrantywise-web-123] FROM EXTERNAL PROVIDER;');
    tips.push('  ALTER ROLE db_datareader ADD MEMBER [warrantywise-web-123];');
    tips.push('  ALTER ROLE db_datawriter ADD MEMBER [warrantywise-web-123];');
    tips.push('  GRANT EXECUTE TO [warrantywise-web-123];');
  } else if (/ENOTFOUND|getaddrinfo|ETIMEDOUT|ECONNREFUSED|timeout/i.test(msg)) {
    tips.push('Network/TLS connection to Azure SQL Server failed.');
    tips.push('Verify DB_SERVER=warrantywise-sql-2026.database.windows.net, port 1433 outbound connectivity, and SQL Server networking rules.');
  }

  return tips;
}

async function testAzureSqlConnection(overrideConfig = null) {
  const effectiveSqlConfig = overrideConfig || config.AZURE_SQL;
  const isAppServiceMsi = Boolean(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);

  console.log('====================================================================');
  console.log('WarrantyWise — Safe Read-Only Live Azure SQL Connection Test');
  console.log('====================================================================');
  console.log(`Runtime Context : ${isAppServiceMsi ? 'Azure App Service (MSI Environment)' : 'Local Workstation / CLI'}`);
  console.log(`Server          : ${effectiveSqlConfig.server || '(NOT SET)'}`);
  console.log(`Database        : ${effectiveSqlConfig.database || '(NOT SET)'}`);
  console.log(`Auth Mode       : ${effectiveSqlConfig.authMode || 'auto'}`);

  if (!db.isAzureSqlConfigured(effectiveSqlConfig)) {
    throw new Error(
      'DB_SERVER is not set. Example:\n' +
      '  $env:DB_SERVER="warrantywise-sql-2026.database.windows.net"\n' +
      '  $env:DB_NAME="WarrantyWiseDB"\n' +
      '  $env:DB_AUTH_MODE="managed_identity"\n' +
      '  npm run azure:test-db'
    );
  }

  const useManagedIdentity = db.shouldUseManagedIdentity(effectiveSqlConfig);
  const poolConfig = db.buildAzureSqlConfig(effectiveSqlConfig);

  console.log(`Resolved Auth   : ${useManagedIdentity ? 'Azure Managed Identity / Entra ID (@azure/identity)' : 'SQL Authentication'}`);
  console.log(`TLS Encrypt     : ${Boolean(poolConfig.options?.encrypt)} (trustServerCertificate=${Boolean(poolConfig.options?.trustServerCertificate)})`);
  console.log('--------------------------------------------------------------------');

  // Step 1: Acquire Entra ID access token explicitly (without logging token contents)
  if (useManagedIdentity) {
    const { DefaultAzureCredential } = require('@azure/identity');
    const clientId = String(effectiveSqlConfig.managedIdentityClientId || '').trim();
    const credential = new DefaultAzureCredential(
      clientId ? { managedIdentityClientId: clientId } : undefined
    );
    console.log('[1/3] Requesting Entra ID access token for https://database.windows.net/.default ...');
    const token = await credential.getToken('https://database.windows.net/.default');
    const expiresIso = token?.expiresOnTimestamp ? new Date(token.expiresOnTimestamp).toISOString() : 'unknown';
    console.log(`      PASS — Entra ID token acquired (expires ${expiresIso}).`);
  } else {
    console.log('[1/3] Skipping Entra token acquisition (DB_AUTH_MODE=sql configured).');
  }

  // Step 2: Open ConnectionPool and run read-only health + permission check
  const mssql = require('mssql');
  const pool = new mssql.ConnectionPool(poolConfig);

  try {
    console.log('[2/3] Connecting to Azure SQL Database over TLS...');
    await pool.connect();

    const identityRes = await pool.request().query(`
      SELECT
        1 AS connection_ok,
        DB_NAME() AS current_db,
        @@SERVERNAME AS server_name,
        SUSER_SNAME() AS login_name,
        USER_NAME() AS db_user,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SELECT') AS can_select,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'EXECUTE') AS can_execute;
    `);
    const info = identityRes.recordset[0] || {};
    console.log(`      PASS — Connected to [${info.current_db}] on server [${info.server_name}]`);
    console.log(`      Authenticated As : login="${info.login_name}" | db_user="${info.db_user}"`);
    console.log(
      `      DB Permissions   : SELECT=${info.can_select} INSERT=${info.can_insert} UPDATE=${info.can_update} DELETE=${info.can_delete} EXECUTE=${info.can_execute}`
    );

    // Step 3: Read-only schema, index, FK, view, procedure, trigger audit
    console.log('[3/3] Inspecting schema objects (tables, FKs, indexes, views, procedures, triggers)...');
    const tablesRes = await pool.request().query(`
      SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo') ORDER BY name;
    `);
    const existingTables = new Set(tablesRes.recordset.map((r) => r.name));
    const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

    const indexesRes = await pool.request().query(`
      SELECT i.name
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      WHERE t.schema_id = SCHEMA_ID('dbo') AND i.name IS NOT NULL;
    `);
    const existingIndexes = new Set(indexesRes.recordset.map((r) => r.name));
    const missingIndexes = EXPECTED_INDEXES.filter((ix) => !existingIndexes.has(ix));

    const countsRes = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM sys.foreign_keys) AS fk_count,
        (SELECT COUNT(*) FROM sys.views WHERE schema_id = SCHEMA_ID('dbo')) AS view_count,
        (SELECT COUNT(*) FROM sys.procedures WHERE schema_id = SCHEMA_ID('dbo')) AS proc_count,
        (SELECT COUNT(*) FROM sys.triggers WHERE parent_class = 1) AS trigger_count,
        CASE WHEN OBJECT_ID(N'dbo.Categories', N'U') IS NOT NULL THEN (SELECT COUNT(*) FROM dbo.Categories) ELSE 0 END AS category_count,
        CASE WHEN OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL THEN (SELECT COUNT(*) FROM dbo.Users) ELSE 0 END AS user_count;
    `);
    const counts = countsRes.recordset[0] || {};

    console.log(`      Tables (${existingTables.size}/${REQUIRED_TABLES.length}) : ${[...existingTables].join(', ') || '(none)'}`);
    console.log(`      Foreign Keys     : ${counts.fk_count ?? 0}`);
    console.log(`      Custom Indexes   : ${EXPECTED_INDEXES.length - missingIndexes.length}/${EXPECTED_INDEXES.length}`);
    console.log(`      Views / Procs / Triggers : ${counts.view_count ?? 0} / ${counts.proc_count ?? 0} / ${counts.trigger_count ?? 0}`);
    console.log(`      Categories / Users Rows  : ${counts.category_count ?? 0} / ${counts.user_count ?? 0}`);

    const hasCrudPerms = Boolean(info.can_select && info.can_insert && info.can_update && info.can_delete);
    console.log('--------------------------------------------------------------------');
    if (missingTables.length > 0 || missingIndexes.length > 0 || !hasCrudPerms) {
      if (missingTables.length > 0) {
        console.warn(`WARNING: Missing tables: ${missingTables.join(', ')} — run "npm run azure:init-db".`);
      }
      if (missingIndexes.length > 0) {
        console.warn(`WARNING: Missing indexes: ${missingIndexes.join(', ')} — run "npm run azure:init-db".`);
      }
      if (!hasCrudPerms) {
        console.warn('WARNING: Principal lacks full db_datareader / db_datawriter permissions (SELECT/INSERT/UPDATE/DELETE).');
      }
      return {
        connected: true,
        healthy: false,
        info,
        missingTables,
        missingIndexes
      };
    }

    console.log('RESULT: LIVE AZURE SQL CONNECTION, PERMISSIONS & SCHEMA VERIFIED.');
    return {
      connected: true,
      healthy: true,
      info,
      missingTables: [],
      missingIndexes: []
    };
  } finally {
    await pool.close().catch(() => {});
  }
}

if (require.main === module) {
  testAzureSqlConnection()
    .then((res) => {
      if (!res.healthy) {
        process.exit(2);
      }
    })
    .catch((err) => {
      console.error(`\nLIVE TEST FAILED: ${err.message}`);
      const tips = classifyAzureSqlError(err);
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
  REQUIRED_TABLES,
  EXPECTED_INDEXES,
  classifyAzureSqlError,
  testAzureSqlConnection
};

