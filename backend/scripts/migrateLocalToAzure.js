#!/usr/bin/env node
/**
 * Non-Destructive Local SQLite & Disk -> Azure SQL & Private Blob Storage Migration
 *
 * Reads local backend/data/warrantywise.db read-only and local files from backend/uploads/,
 * preserving all local data untouched while idempotently inserting missing records and
 * uploading local files to the private Azure Blob container (warranty-documents).
 *
 * Usage:
 *   node scripts/migrateLocalToAzure.js
 *   node scripts/migrateLocalToAzure.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const db = require('../services/db');
const blobStorage = require('../services/blobStorage');

function parseSqlDateOnly(dateValue) {
  if (!dateValue) return null;
  const s = String(dateValue).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return new Date(`${match[1]}T00:00:00.000Z`);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSqlDateTime(dtValue) {
  if (!dtValue) return null;
  const s = String(dtValue).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(`${s.replace(' ', 'T')}.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readAllSqliteRows(localDb, tableName) {
  const res = localDb.exec(`SELECT * FROM ${tableName} ORDER BY id ASC;`);
  if (!res || res.length === 0) return [];
  const { columns, values } = res[0];
  return values.map((rowValues) => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = rowValues[idx];
    });
    return obj;
  });
}

async function readLocalSnapshot() {
  if (!fs.existsSync(config.LOCAL_DB_PATH)) {
    throw new Error(`Local SQLite database not found at: ${config.LOCAL_DB_PATH}`);
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(config.LOCAL_DB_PATH);
  const localDb = new SQL.Database(fileBuffer);

  try {
    return {
      Users: readAllSqliteRows(localDb, 'Users'),
      Categories: readAllSqliteRows(localDb, 'Categories'),
      Products: readAllSqliteRows(localDb, 'Products'),
      Warranties: readAllSqliteRows(localDb, 'Warranties'),
      Repairs: readAllSqliteRows(localDb, 'Repairs'),
      Documents: readAllSqliteRows(localDb, 'Documents'),
      ActivityLogs: readAllSqliteRows(localDb, 'ActivityLogs')
    };
  } finally {
    localDb.close();
  }
}

async function migrateDocumentsToBlob(documents, { dryRun = false } = {}) {
  const uploadRoot = path.resolve(config.UPLOAD_DIR);
  const azureBlobEnabled = blobStorage.isAzureBlobConfigured(config.AZURE_STORAGE);
  const migratedDocs = [];

  let containerClient = null;
  if (azureBlobEnabled && !dryRun) {
    const clients = blobStorage.createBlobStorageClients(config.AZURE_STORAGE);
    containerClient = clients.containerClient;
    try {
      await containerClient.createIfNotExists();
    } catch (err) {
      const code = err && (err.statusCode || err.code);
      if (code === 403 || code === 409) {
        const exists = await containerClient.exists().catch(() => false);
        if (!exists) throw err;
      } else {
        throw err;
      }
    }
  }

  for (const doc of documents) {
    const localCandidate = path.resolve(uploadRoot, String(doc.storage_path || ''));
    const hasPhysicalFile =
      localCandidate.startsWith(`${uploadRoot}${path.sep}`) &&
      fs.existsSync(localCandidate) &&
      fs.statSync(localCandidate).isFile();

    if (azureBlobEnabled && hasPhysicalFile) {
      const targetBlobPath = String(doc.storage_path).replace(/^\/+/, '').replace(/\\/g, '/');
      if (dryRun) {
        console.log(`  [Dry-Run] Would upload local file to Blob (${config.AZURE_STORAGE.containerName}): ${targetBlobPath}`);
      } else {
        const blockBlobClient = containerClient.getBlockBlobClient(targetBlobPath);
        const alreadyUploaded = await blockBlobClient.exists();
        if (!alreadyUploaded) {
          const buffer = fs.readFileSync(localCandidate);
          await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: {
              blobContentType: doc.mime_type || 'application/octet-stream'
            }
          });
          console.log(`  [Blob] Uploaded: ${targetBlobPath} (${buffer.length} bytes)`);
        } else {
          console.log(`  [Blob] Already exists, skipping upload: ${targetBlobPath}`);
        }
      }
      migratedDocs.push({
        ...doc,
        storage_path: targetBlobPath,
        storage_type: 'AzureBlob'
      });
    } else {
      migratedDocs.push({
        ...doc,
        storage_type: doc.storage_type === 'AzureBlob' ? 'AzureBlob' : 'LocalDisk'
      });
    }
  }

  return migratedDocs;
}

async function migrateLocalToAzure({ dryRun = false } = {}) {
  const snapshot = await readLocalSnapshot();

  console.log('===============================================================');
  console.log(`WarrantyWise — Safe Local-to-Azure Migration ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`Local DB   : ${config.LOCAL_DB_PATH}`);
  console.log(`Azure SQL  : ${config.AZURE_SQL.server || '(not configured)'} / ${config.AZURE_SQL.database}`);
  console.log(`Azure Blob : ${config.AZURE_STORAGE.accountName || '(not configured)'} / ${config.AZURE_STORAGE.containerName}`);
  console.log('Local row counts:');
  for (const [table, rows] of Object.entries(snapshot)) {
    console.log(`  - ${table}: ${rows.length}`);
  }
  console.log('===============================================================\n');

  const preparedDocs = await migrateDocumentsToBlob(snapshot.Documents, { dryRun });

  if (dryRun) {
    console.log('[Migration] Dry-run completed. No Azure SQL or local files were modified.');
    return { dryRun: true, counts: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])) };
  }

  if (!db.isAzureSqlConfigured(config.AZURE_SQL)) {
    throw new Error('DB_SERVER must be set (e.g. warrantywise-sql-2026.database.windows.net) before running Azure SQL migration.');
  }

  const mssql = require('mssql');
  if (db.shouldUseManagedIdentity(config.AZURE_SQL)) {
    const { DefaultAzureCredential } = require('@azure/identity');
    const clientId = config.AZURE_SQL.managedIdentityClientId;
    const cred = new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : undefined);
    await cred.getToken('https://database.windows.net/.default');
  }

  const pool = new mssql.ConnectionPool(db.buildAzureSqlConfig(config.AZURE_SQL));
  await pool.connect();

  try {
    // Verify schema exists before starting transaction
    const tableCheck = await pool.request().query(`
      SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo');
    `);
    const existingTables = new Set(tableCheck.recordset.map((r) => r.name));
    const requiredTables = ['Users', 'Categories', 'Products', 'Warranties', 'Repairs', 'Documents', 'ActivityLogs'];
    const missingTables = requiredTables.filter((t) => !existingTables.has(t));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables in Azure SQL (${missingTables.join(', ')}). Run "npm run azure:init-db" first.`);
    }

    const tx = new mssql.Transaction(pool);
    await tx.begin();

    const stats = { inserted: {}, skipped: {} };
    const bump = (bucket, table) => {
      stats[bucket][table] = (stats[bucket][table] || 0) + 1;
    };

    try {
      const req = () => new mssql.Request(tx);

      // 1. Users
      const userIdMap = new Map();
      const existingUsers = (await req().query('SELECT id, LOWER(email) AS email_lower FROM dbo.Users;')).recordset;
      const userByEmail = new Map(existingUsers.map((u) => [u.email_lower, u.id]));
      const existingUserIds = new Set(existingUsers.map((u) => u.id));

      for (const u of snapshot.Users) {
        const emailLower = String(u.email || '').trim().toLowerCase();
        if (userByEmail.has(emailLower)) {
          userIdMap.set(u.id, userByEmail.get(emailLower));
          bump('skipped', 'Users');
          continue;
        }
        if (existingUserIds.has(u.id)) {
          const ins = await req()
            .input('full_name', mssql.NVarChar(100), u.full_name)
            .input('email', mssql.NVarChar(255), u.email)
            .input('password_hash', mssql.NVarChar(255), u.password_hash)
            .input('role', mssql.NVarChar(20), u.role || 'User')
            .input('phone', mssql.NVarChar(20), u.phone || null)
            .input('created_at', mssql.DateTime2, parseSqlDateTime(u.created_at) || new Date())
            .input('updated_at', mssql.DateTime2, parseSqlDateTime(u.updated_at) || new Date())
            .query(`
              INSERT INTO dbo.Users (full_name, email, password_hash, role, phone, created_at, updated_at)
              VALUES (@full_name, @email, @password_hash, @role, @phone, @created_at, @updated_at);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS new_id;
            `);
          userIdMap.set(u.id, ins.recordset[0].new_id);
        } else {
          await req()
            .input('id', mssql.Int, u.id)
            .input('full_name', mssql.NVarChar(100), u.full_name)
            .input('email', mssql.NVarChar(255), u.email)
            .input('password_hash', mssql.NVarChar(255), u.password_hash)
            .input('role', mssql.NVarChar(20), u.role || 'User')
            .input('phone', mssql.NVarChar(20), u.phone || null)
            .input('created_at', mssql.DateTime2, parseSqlDateTime(u.created_at) || new Date())
            .input('updated_at', mssql.DateTime2, parseSqlDateTime(u.updated_at) || new Date())
            .query(`
              SET IDENTITY_INSERT dbo.Users ON;
              INSERT INTO dbo.Users (id, full_name, email, password_hash, role, phone, created_at, updated_at)
              VALUES (@id, @full_name, @email, @password_hash, @role, @phone, @created_at, @updated_at);
              SET IDENTITY_INSERT dbo.Users OFF;
            `);
          userIdMap.set(u.id, u.id);
          existingUserIds.add(u.id);
        }
        userByEmail.set(emailLower, userIdMap.get(u.id));
        bump('inserted', 'Users');
      }

      // 2. Categories
      const categoryIdMap = new Map();
      const existingCats = (await req().query('SELECT id, LOWER(name) AS name_lower FROM dbo.Categories;')).recordset;
      const catByName = new Map(existingCats.map((c) => [c.name_lower, c.id]));
      const existingCatIds = new Set(existingCats.map((c) => c.id));

      for (const c of snapshot.Categories) {
        const nameLower = String(c.name || '').trim().toLowerCase();
        if (catByName.has(nameLower)) {
          categoryIdMap.set(c.id, catByName.get(nameLower));
          bump('skipped', 'Categories');
          continue;
        }
        if (existingCatIds.has(c.id)) {
          const ins = await req()
            .input('name', mssql.NVarChar(100), c.name)
            .input('description', mssql.NVarChar(500), c.description || null)
            .input('icon', mssql.NVarChar(50), c.icon || 'tag')
            .input('display_order', mssql.Int, c.display_order || 0)
            .input('created_at', mssql.DateTime2, parseSqlDateTime(c.created_at) || new Date())
            .query(`
              INSERT INTO dbo.Categories (name, description, icon, display_order, created_at)
              VALUES (@name, @description, @icon, @display_order, @created_at);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS new_id;
            `);
          categoryIdMap.set(c.id, ins.recordset[0].new_id);
        } else {
          await req()
            .input('id', mssql.Int, c.id)
            .input('name', mssql.NVarChar(100), c.name)
            .input('description', mssql.NVarChar(500), c.description || null)
            .input('icon', mssql.NVarChar(50), c.icon || 'tag')
            .input('display_order', mssql.Int, c.display_order || 0)
            .input('created_at', mssql.DateTime2, parseSqlDateTime(c.created_at) || new Date())
            .query(`
              SET IDENTITY_INSERT dbo.Categories ON;
              INSERT INTO dbo.Categories (id, name, description, icon, display_order, created_at)
              VALUES (@id, @name, @description, @icon, @display_order, @created_at);
              SET IDENTITY_INSERT dbo.Categories OFF;
            `);
          categoryIdMap.set(c.id, c.id);
          existingCatIds.add(c.id);
        }
        catByName.set(nameLower, categoryIdMap.get(c.id));
        bump('inserted', 'Categories');
      }

      // 3. Products
      const productIdMap = new Map();
      const existingProducts = (await req().query('SELECT id, user_id, name, brand, purchase_date FROM dbo.Products;')).recordset;
      const existingProdIds = new Set(existingProducts.map((p) => p.id));

      for (const p of snapshot.Products) {
        const targetUserId = userIdMap.get(p.user_id) ?? p.user_id;
        const targetCatId = categoryIdMap.get(p.category_id) ?? p.category_id;

        if (existingProdIds.has(p.id)) {
          productIdMap.set(p.id, p.id);
          bump('skipped', 'Products');
          continue;
        }

        await req()
          .input('id', mssql.Int, p.id)
          .input('user_id', mssql.Int, targetUserId)
          .input('category_id', mssql.Int, targetCatId)
          .input('name', mssql.NVarChar(150), p.name)
          .input('brand', mssql.NVarChar(100), p.brand)
          .input('model_number', mssql.NVarChar(100), p.model_number || null)
          .input('serial_number', mssql.NVarChar(100), p.serial_number || null)
          .input('purchase_date', mssql.Date, parseSqlDateOnly(p.purchase_date))
          .input('purchase_price', mssql.Decimal(18, 2), Number(p.purchase_price || 0))
          .input('currency', mssql.NVarChar(10), p.currency || 'USD')
          .input('retailer', mssql.NVarChar(150), p.retailer || null)
          .input('notes', mssql.NVarChar(mssql.MAX), p.notes || null)
          .input('created_at', mssql.DateTime2, parseSqlDateTime(p.created_at) || new Date())
          .input('updated_at', mssql.DateTime2, parseSqlDateTime(p.updated_at) || new Date())
          .query(`
            SET IDENTITY_INSERT dbo.Products ON;
            INSERT INTO dbo.Products (id, user_id, category_id, name, brand, model_number, serial_number, purchase_date, purchase_price, currency, retailer, notes, created_at, updated_at)
            VALUES (@id, @user_id, @category_id, @name, @brand, @model_number, @serial_number, @purchase_date, @purchase_price, @currency, @retailer, @notes, @created_at, @updated_at);
            SET IDENTITY_INSERT dbo.Products OFF;
          `);
        productIdMap.set(p.id, p.id);
        existingProdIds.add(p.id);
        bump('inserted', 'Products');
      }

      // 4. Warranties
      const existingWtyIds = new Set(
        (await req().query('SELECT id FROM dbo.Warranties;')).recordset.map((w) => w.id)
      );
      for (const w of snapshot.Warranties) {
        if (existingWtyIds.has(w.id)) {
          bump('skipped', 'Warranties');
          continue;
        }
        const targetProductId = productIdMap.get(w.product_id) ?? w.product_id;
        await req()
          .input('id', mssql.Int, w.id)
          .input('product_id', mssql.Int, targetProductId)
          .input('provider_name', mssql.NVarChar(150), w.provider_name)
          .input('policy_number', mssql.NVarChar(100), w.policy_number || null)
          .input('warranty_type', mssql.NVarChar(50), w.warranty_type || 'Manufacturer')
          .input('duration_months', mssql.Int, Math.max(parseInt(w.duration_months, 10) || 12, 1))
          .input('start_date', mssql.Date, parseSqlDateOnly(w.start_date))
          .input('end_date', mssql.Date, parseSqlDateOnly(w.end_date))
          .input('coverage_details', mssql.NVarChar(mssql.MAX), w.coverage_details || null)
          .input('support_contact', mssql.NVarChar(255), w.support_contact || null)
          .input('status', mssql.NVarChar(30), w.status || 'Active')
          .input('created_at', mssql.DateTime2, parseSqlDateTime(w.created_at) || new Date())
          .input('updated_at', mssql.DateTime2, parseSqlDateTime(w.updated_at) || new Date())
          .query(`
            SET IDENTITY_INSERT dbo.Warranties ON;
            INSERT INTO dbo.Warranties (id, product_id, provider_name, policy_number, warranty_type, duration_months, start_date, end_date, coverage_details, support_contact, status, created_at, updated_at)
            VALUES (@id, @product_id, @provider_name, @policy_number, @warranty_type, @duration_months, @start_date, @end_date, @coverage_details, @support_contact, @status, @created_at, @updated_at);
            SET IDENTITY_INSERT dbo.Warranties OFF;
          `);
        existingWtyIds.add(w.id);
        bump('inserted', 'Warranties');
      }

      // 5. Repairs
      const repairIdMap = new Map();
      const existingRepairIds = new Set(
        (await req().query('SELECT id FROM dbo.Repairs;')).recordset.map((r) => r.id)
      );
      for (const r of snapshot.Repairs) {
        if (existingRepairIds.has(r.id)) {
          repairIdMap.set(r.id, r.id);
          bump('skipped', 'Repairs');
          continue;
        }
        const targetProductId = productIdMap.get(r.product_id) ?? r.product_id;
        const targetUserId = userIdMap.get(r.user_id) ?? r.user_id;
        await req()
          .input('id', mssql.Int, r.id)
          .input('product_id', mssql.Int, targetProductId)
          .input('user_id', mssql.Int, targetUserId)
          .input('repair_date', mssql.Date, parseSqlDateOnly(r.repair_date))
          .input('service_center', mssql.NVarChar(150), r.service_center)
          .input('issue_description', mssql.NVarChar(1000), r.issue_description)
          .input('cost', mssql.Decimal(18, 2), Number(r.cost || 0))
          .input('status', mssql.NVarChar(30), r.status || 'Completed')
          .input('technician_notes', mssql.NVarChar(mssql.MAX), r.technician_notes || null)
          .input('completion_date', mssql.Date, parseSqlDateOnly(r.completion_date))
          .input('created_at', mssql.DateTime2, parseSqlDateTime(r.created_at) || new Date())
          .input('updated_at', mssql.DateTime2, parseSqlDateTime(r.updated_at) || new Date())
          .query(`
            SET IDENTITY_INSERT dbo.Repairs ON;
            INSERT INTO dbo.Repairs (id, product_id, user_id, repair_date, service_center, issue_description, cost, status, technician_notes, completion_date, created_at, updated_at)
            VALUES (@id, @product_id, @user_id, @repair_date, @service_center, @issue_description, @cost, @status, @technician_notes, @completion_date, @created_at, @updated_at);
            SET IDENTITY_INSERT dbo.Repairs OFF;
          `);
        repairIdMap.set(r.id, r.id);
        existingRepairIds.add(r.id);
        bump('inserted', 'Repairs');
      }

      // 6. Documents
      const existingDocIds = new Set(
        (await req().query('SELECT id FROM dbo.Documents;')).recordset.map((d) => d.id)
      );
      for (const d of preparedDocs) {
        if (existingDocIds.has(d.id)) {
          bump('skipped', 'Documents');
          continue;
        }
        const targetProductId = productIdMap.get(d.product_id) ?? d.product_id;
        const targetUserId = userIdMap.get(d.user_id) ?? d.user_id;
        const targetRepairId = d.repair_id ? (repairIdMap.get(d.repair_id) ?? d.repair_id) : null;
        await req()
          .input('id', mssql.Int, d.id)
          .input('product_id', mssql.Int, targetProductId)
          .input('user_id', mssql.Int, targetUserId)
          .input('repair_id', mssql.Int, targetRepairId)
          .input('document_type', mssql.NVarChar(50), d.document_type || 'Invoice')
          .input('file_name', mssql.NVarChar(255), d.file_name)
          .input('original_name', mssql.NVarChar(255), d.original_name)
          .input('file_size', mssql.BigInt, Math.max(parseInt(d.file_size, 10) || 1, 1))
          .input('mime_type', mssql.NVarChar(100), d.mime_type)
          .input('storage_path', mssql.NVarChar(1000), d.storage_path)
          .input('storage_type', mssql.NVarChar(20), d.storage_type)
          .input('upload_date', mssql.DateTime2, parseSqlDateTime(d.upload_date) || new Date())
          .query(`
            SET IDENTITY_INSERT dbo.Documents ON;
            INSERT INTO dbo.Documents (id, product_id, user_id, repair_id, document_type, file_name, original_name, file_size, mime_type, storage_path, storage_type, upload_date)
            VALUES (@id, @product_id, @user_id, @repair_id, @document_type, @file_name, @original_name, @file_size, @mime_type, @storage_path, @storage_type, @upload_date);
            SET IDENTITY_INSERT dbo.Documents OFF;
          `);
        existingDocIds.add(d.id);
        bump('inserted', 'Documents');
      }

      // 7. ActivityLogs
      const existingLogIds = new Set(
        (await req().query('SELECT id FROM dbo.ActivityLogs;')).recordset.map((l) => l.id)
      );
      for (const l of snapshot.ActivityLogs) {
        if (existingLogIds.has(l.id)) {
          bump('skipped', 'ActivityLogs');
          continue;
        }
        const targetUserId = l.user_id ? (userIdMap.get(l.user_id) ?? l.user_id) : null;
        await req()
          .input('id', mssql.Int, l.id)
          .input('user_id', mssql.Int, targetUserId)
          .input('action', mssql.NVarChar(100), l.action)
          .input('entity_type', mssql.NVarChar(50), l.entity_type)
          .input('entity_id', mssql.Int, l.entity_id ?? null)
          .input('details', mssql.NVarChar(1000), l.details || null)
          .input('ip_address', mssql.NVarChar(50), l.ip_address || null)
          .input('created_at', mssql.DateTime2, parseSqlDateTime(l.created_at) || new Date())
          .query(`
            SET IDENTITY_INSERT dbo.ActivityLogs ON;
            INSERT INTO dbo.ActivityLogs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
            VALUES (@id, @user_id, @action, @entity_type, @entity_id, @details, @ip_address, @created_at);
            SET IDENTITY_INSERT dbo.ActivityLogs OFF;
          `);
        existingLogIds.add(l.id);
        bump('inserted', 'ActivityLogs');
      }

      await tx.commit();
      console.log('[Migration] Transaction committed cleanly!');
      console.log('[Migration] Summary:', JSON.stringify(stats, null, 2));
      return { dryRun: false, stats };
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } finally {
    await pool.close().catch(() => {});
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  migrateLocalToAzure({ dryRun }).catch((err) => {
    console.error('[Migration] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseSqlDateOnly,
  parseSqlDateTime,
  readLocalSnapshot,
  migrateLocalToAzure
};
