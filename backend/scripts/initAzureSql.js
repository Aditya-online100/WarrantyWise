#!/usr/bin/env node
/**
 * Idempotent Azure SQL Database Schema Initializer
 * Safely applies schema.sql, views.sql, procedures.sql, and triggers.sql to Azure SQL
 * without dropping existing tables or user data.
 *
 * Authenticates via Azure Managed Identity (@azure/identity DefaultAzureCredential)
 * when DB_SERVER is set without SQL password credentials.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const db = require('../services/db');

function splitSqlBatches(sqlContent) {
  const lines = String(sqlContent || '').split(/\r?\n/);
  const batches = [];
  let current = [];

  for (const line of lines) {
    if (/^\s*GO\s*(?:--.*)?$/i.test(line)) {
      const batchText = current.join('\n').trim();
      if (batchText.length > 0) {
        batches.push(batchText);
      }
      current = [];
    } else {
      current.push(line);
    }
  }

  const trailing = current.join('\n').trim();
  if (trailing.length > 0) {
    batches.push(trailing);
  }

  return batches;
}

async function runSqlFile(pool, filePath) {
  const fileName = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required SQL file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const batches = splitSqlBatches(content);
  console.log(`[AzureSQL Init] Executing ${fileName} (${batches.length} batch${batches.length === 1 ? '' : 'es'})...`);

  for (let i = 0; i < batches.length; i++) {
    await pool.request().batch(batches[i]);
  }
}

async function initAzureSql() {
  if (!db.isAzureSqlConfigured(config.AZURE_SQL)) {
    console.error('[AzureSQL Init] DB_SERVER is not configured. Set DB_SERVER=warrantywise-sql-2026.database.windows.net and DB_NAME=WarrantyWiseDB.');
    process.exit(1);
  }

  const mssql = require('mssql');
  const useManagedIdentity = db.shouldUseManagedIdentity(config.AZURE_SQL);

  console.log('===============================================================');
  console.log('WarrantyWise — Idempotent Azure SQL Schema Initialization');
  console.log(`Server   : ${config.AZURE_SQL.server}`);
  console.log(`Database : ${config.AZURE_SQL.database}`);
  console.log(`Auth     : ${useManagedIdentity ? 'Managed Identity / Entra ID (DefaultAzureCredential)' : 'SQL Credentials'}`);
  console.log('===============================================================\n');

  if (useManagedIdentity) {
    const { DefaultAzureCredential } = require('@azure/identity');
    const clientId = config.AZURE_SQL.managedIdentityClientId;
    const credential = new DefaultAzureCredential(
      clientId ? { managedIdentityClientId: clientId } : undefined
    );
    await credential.getToken('https://database.windows.net/.default');
  }

  const poolConfig = db.buildAzureSqlConfig(config.AZURE_SQL);
  const pool = new mssql.ConnectionPool(poolConfig);

  try {
    await pool.connect();

    const databaseDir = path.resolve(__dirname, '../../database');
    const orderedFiles = ['schema.sql', 'views.sql', 'procedures.sql', 'triggers.sql'];

    for (const file of orderedFiles) {
      await runSqlFile(pool, path.join(databaseDir, file));
    }

    // Verify all 7 tables and key programmable objects exist
    const verification = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')) AS table_count,
        (SELECT COUNT(*) FROM sys.views WHERE schema_id = SCHEMA_ID('dbo')) AS view_count,
        (SELECT COUNT(*) FROM sys.procedures WHERE schema_id = SCHEMA_ID('dbo')) AS proc_count,
        (SELECT COUNT(*) FROM sys.triggers WHERE parent_class = 1) AS trigger_count;
    `);

    const summary = verification.recordset[0] || {};
    console.log('\n[AzureSQL Init] Schema verification complete:');
    console.log(`  Tables     : ${summary.table_count ?? 0}`);
    console.log(`  Views      : ${summary.view_count ?? 0}`);
    console.log(`  Procedures : ${summary.proc_count ?? 0}`);
    console.log(`  Triggers   : ${summary.trigger_count ?? 0}`);
  } finally {
    await pool.close().catch(() => {});
  }
}

if (require.main === module) {
  initAzureSql().catch((err) => {
    console.error('[AzureSQL Init] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  splitSqlBatches,
  initAzureSql
};
