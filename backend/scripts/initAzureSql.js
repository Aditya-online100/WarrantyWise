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

const DEFAULT_CATEGORIES = [
  ['Computing & Laptops', 'Laptops, desktop PCs, workstations, and computing accessories', 'laptop', 1],
  ['Mobile & Tablets', 'Smartphones, iPads, tablets, smartwatches, and wearables', 'smartphone', 2],
  ['Home Appliances', 'Refrigerators, washing machines, vacuums, and air conditioners', 'home', 3],
  ['Audio & Entertainment', 'Smart TVs, soundbars, headphones, and gaming consoles', 'tv', 4],
  ['Kitchen & Dining', 'Espresso machines, blenders, air fryers, and culinary gadgets', 'coffee', 5],
  ['Vehicles & Mobility', 'Cars, e-bikes, scooters, and automotive accessories', 'car', 6]
];

async function ensureDefaultCategories(pool, mssql) {
  let seededCount = 0;
  for (const [name, description, icon, displayOrder] of DEFAULT_CATEGORIES) {
    const result = await pool
      .request()
      .input('name', mssql.NVarChar(100), name)
      .input('description', mssql.NVarChar(500), description)
      .input('icon', mssql.NVarChar(50), icon)
      .input('display_order', mssql.Int, displayOrder)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE name = @name)
        BEGIN
          INSERT INTO dbo.Categories (name, description, icon, display_order)
          VALUES (@name, @description, @icon, @display_order);
          SELECT 1 AS inserted;
        END
        ELSE
        BEGIN
          SELECT 0 AS inserted;
        END
      `);
    if (result.recordset && result.recordset[0] && result.recordset[0].inserted === 1) {
      seededCount++;
    }
  }
  if (seededCount > 0) {
    console.log(`[AzureSQL Init] Seeded ${seededCount} missing default product categories.`);
  }
}

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

    if (!process.argv.includes('--schema-only')) {
      await ensureDefaultCategories(pool, mssql);
    }

    // Verify all 7 tables, indexes, categories, and programmable objects exist
    const verification = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')) AS table_count,
        (SELECT COUNT(*) FROM sys.foreign_keys) AS fk_count,
        (SELECT COUNT(*) FROM sys.indexes i INNER JOIN sys.tables t ON i.object_id = t.object_id WHERE t.schema_id = SCHEMA_ID('dbo') AND i.name LIKE 'IX_%') AS index_count,
        (SELECT COUNT(*) FROM sys.views WHERE schema_id = SCHEMA_ID('dbo')) AS view_count,
        (SELECT COUNT(*) FROM sys.procedures WHERE schema_id = SCHEMA_ID('dbo')) AS proc_count,
        (SELECT COUNT(*) FROM sys.triggers WHERE parent_class = 1) AS trigger_count,
        (SELECT COUNT(*) FROM dbo.Categories) AS category_count;
    `);

    const summary = verification.recordset[0] || {};
    console.log('\n[AzureSQL Init] Schema verification complete:');
    console.log(`  Tables       : ${summary.table_count ?? 0}`);
    console.log(`  Foreign Keys : ${summary.fk_count ?? 0}`);
    console.log(`  Indexes (IX) : ${summary.index_count ?? 0}`);
    console.log(`  Views        : ${summary.view_count ?? 0}`);
    console.log(`  Procedures   : ${summary.proc_count ?? 0}`);
    console.log(`  Triggers     : ${summary.trigger_count ?? 0}`);
    console.log(`  Categories   : ${summary.category_count ?? 0}`);
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
  DEFAULT_CATEGORIES,
  ensureDefaultCategories,
  splitSqlBatches,
  initAzureSql
};
