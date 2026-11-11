const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let mode = 'LOCAL_SQLITE'; // 'AZURE_SQL' or 'LOCAL_SQLITE'
let dbAuthMode = 'LOCAL'; // 'MANAGED_IDENTITY', 'SQL_PASSWORD', or 'LOCAL'
let mssqlPool = null;
let sqlJsDb = null;
let SQL = null;

function ensureLocalDirs() {
  if (!fs.existsSync(path.dirname(config.LOCAL_DB_PATH))) {
    fs.mkdirSync(path.dirname(config.LOCAL_DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(config.UPLOAD_DIR)) {
    fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  }
}

function isAzureSqlConfigured(sqlCfg = config.AZURE_SQL) {
  return Boolean(sqlCfg && sqlCfg.server && String(sqlCfg.server).trim().length > 0);
}

function shouldUseManagedIdentity(sqlCfg = config.AZURE_SQL) {
  const authMode = String(sqlCfg?.authMode || 'auto').trim().toLowerCase();
  const hasSqlCredentials = Boolean(sqlCfg?.user && sqlCfg?.password);

  if (authMode === 'managed_identity' || authMode === 'aad' || authMode === 'msi') {
    return true;
  }
  if (authMode === 'sql') {
    return false;
  }
  // When no SQL username/password is provided, default to Azure Managed Identity
  return !hasSqlCredentials;
}

/**
 * Builds the node-mssql connection configuration for Azure SQL Database.
 * Prefers Azure Managed Identity via DefaultAzureCredential (no SQL password needed).
 */
function buildAzureSqlConfig(sqlCfg = config.AZURE_SQL) {
  const server = String(sqlCfg?.server || '').trim();
  if (!server) {
    throw new Error('DB_SERVER must be configured to build Azure SQL connection config.');
  }

  const useManagedIdentity = shouldUseManagedIdentity(sqlCfg);
  const clientId = String(sqlCfg?.managedIdentityClientId || '').trim();

  const poolConfig = {
    server,
    database: String(sqlCfg.database || 'WarrantyWiseDB').trim(),
    port: parseInt(sqlCfg.port, 10) || 1433,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
      useUTC: true,
      connectTimeout: 30000,
      requestTimeout: 30000,
      ...(sqlCfg.options || {})
    }
  };

  if (useManagedIdentity) {
    return {
      ...poolConfig,
      authentication: {
        type: 'azure-active-directory-default',
        options: clientId ? { clientId } : {}
      }
    };
  }

  if (!sqlCfg?.user || !sqlCfg?.password) {
    throw new Error('DB_USER and DB_PASSWORD are required when DB_AUTH_MODE=sql.');
  }

  return {
    ...poolConfig,
    user: sqlCfg.user,
    password: sqlCfg.password
  };
}

/**
 * Converts positional '?' placeholders to T-SQL '@p0, @p1, ...' while ignoring '?' inside string literals.
 */
function convertPlaceholdersToTsql(sqlText) {
  let result = '';
  let paramIndex = 0;
  let inSingleQuote = false;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (ch === "'") {
      result += ch;
      if (inSingleQuote && sqlText[i + 1] === "'") {
        result += sqlText[i + 1];
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (ch === '?' && !inSingleQuote) {
      result += `@p${paramIndex}`;
      paramIndex++;
    } else {
      result += ch;
    }
  }

  return result;
}

/**
 * Formats a JavaScript Date from SQL Server into a consistent string matching SQLite formatting:
 * - DATE columns -> 'YYYY-MM-DD'
 * - DATETIME/DATETIME2 columns -> 'YYYY-MM-DD HH:mm:ss' (UTC)
 */
function formatSqlServerDate(value, isDateOnly = false) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return value;
  }
  const iso = value.toISOString();
  if (isDateOnly) {
    return iso.slice(0, 10);
  }
  return iso.slice(0, 19).replace('T', ' ');
}

/**
 * Normalizes mssql recordsets so DATE and DATETIME2 JavaScript Date instances
 * serialize identically to local SQLite date/timestamp strings.
 */
function normalizeAzureSqlRows(recordset) {
  if (!Array.isArray(recordset)) {
    return [];
  }

  const columnsMeta = recordset.columns || {};
  return recordset.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        const colMeta = columnsMeta[key];
        const colTypeName = colMeta && colMeta.type && colMeta.type.name;
        const isDateOnly = colTypeName === 'Date';
        normalized[key] = formatSqlServerDate(value, isDateOnly);
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  });
}

/**
 * Initialize Database Connection
 * Uses Azure SQL Database (with Managed Identity via @azure/identity) when configured.
 * In production with Azure SQL configured, connection failures fail loudly instead of falling back to ephemeral SQLite.
 * Otherwise initializes local SQLite engine with disk persistence for local development.
 */
async function initDb() {
  if (mssqlPool) {
    return;
  }

  const azureConfigured = isAzureSqlConfigured(config.AZURE_SQL);

  if (azureConfigured) {
    const useManagedIdentity = shouldUseManagedIdentity(config.AZURE_SQL);
    try {
      const mssql = require('mssql');
      const authLabel = useManagedIdentity ? 'Managed Identity (@azure/identity)' : 'SQL Credentials';
      console.log(`[Database] Connecting to Azure SQL Server: ${config.AZURE_SQL.server} (${authLabel})...`);

      if (useManagedIdentity) {
        const { DefaultAzureCredential } = require('@azure/identity');
        const clientId = config.AZURE_SQL.managedIdentityClientId;
        const credential = new DefaultAzureCredential(
          clientId ? { managedIdentityClientId: clientId } : undefined
        );
        // Verify Azure AD token acquisition upfront so Managed Identity / RBAC errors surface immediately
        await credential.getToken('https://database.windows.net/.default');
      }

      const poolConfig = buildAzureSqlConfig(config.AZURE_SQL);
      mssqlPool = new mssql.ConnectionPool(poolConfig);
      await mssqlPool.connect();
      await mssqlPool.request().query('SELECT 1 AS connection_ok;');

      mode = 'AZURE_SQL';
      dbAuthMode = useManagedIdentity ? 'MANAGED_IDENTITY' : 'SQL_PASSWORD';
      console.log(`[Database] Successfully connected to Azure SQL Database (${config.AZURE_SQL.database}) via ${dbAuthMode}`);
      return;
    } catch (err) {
      mssqlPool = null;
      if (config.NODE_ENV === 'production' || process.env.DB_STRICT_AZURE === 'true') {
        console.error(`[Database] Fatal Azure SQL connection failure in ${config.NODE_ENV}: ${err.message}`);
        throw err;
      }
      console.warn(`[Database] Azure SQL connection failed: ${err.message}. Falling back to Local SQLite mode.`);
    }
  } else if (
    (config.NODE_ENV === 'production' || process.env.DB_STRICT_AZURE === 'true') &&
    process.env.ALLOW_SQLITE_IN_PRODUCTION !== 'true'
  ) {
    const err = new Error(
      'DB_SERVER must be configured in production to use Azure SQL Database. Local SQLite fallback is disabled in production.'
    );
    console.error(`[Database] Fatal configuration error: ${err.message}`);
    throw err;
  }

  // Local SQLite Initialization using sql.js
  ensureLocalDirs();
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  if (fs.existsSync(config.LOCAL_DB_PATH)) {
    const fileBuffer = fs.readFileSync(config.LOCAL_DB_PATH);
    sqlJsDb = new SQL.Database(fileBuffer);
    console.log(`[Database] Loaded existing local database from: ${config.LOCAL_DB_PATH}`);
  } else {
    sqlJsDb = new SQL.Database();
    console.log(`[Database] Initialized new local database.`);
  }

  mode = 'LOCAL_SQLITE';
  dbAuthMode = 'LOCAL';
  sqlJsDb.run('PRAGMA foreign_keys = ON;');
  await createTablesAndSeedLocal();
  persistLocalDb();
}

/**
 * Closes active database pool/handles during graceful shutdown.
 */
async function closeDb() {
  if (mssqlPool) {
    try {
      await mssqlPool.close();
    } finally {
      mssqlPool = null;
    }
  }
}

/**
 * Persists the sql.js database buffer to local disk.
 */
function persistLocalDb() {
  if (mode === 'LOCAL_SQLITE' && sqlJsDb) {
    const data = sqlJsDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.LOCAL_DB_PATH, buffer);
  }
}

/**
 * Executes a SELECT query and returns an array of objects.
 * Handles both Azure SQL and SQLite parameter bindings and normalizes Azure SQL Date columns.
 */
async function query(sqlText, params = []) {
  if (mode === 'AZURE_SQL') {
    const request = mssqlPool.request();
    params.forEach((param, index) => {
      request.input(`p${index}`, param === undefined ? null : param);
    });
    const tsql = convertPlaceholdersToTsql(sqlText);
    const result = await request.query(tsql);
    return normalizeAzureSqlRows(result.recordset || []);
  } else {
    const stmt = sqlJsDb.prepare(sqlText);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
}

/**
 * Executes an INSERT, UPDATE, or DELETE statement.
 */
async function run(sqlText, params = []) {
  if (mode === 'AZURE_SQL') {
    const request = mssqlPool.request();
    params.forEach((param, index) => {
      request.input(`p${index}`, param === undefined ? null : param);
    });
    let tsql = convertPlaceholdersToTsql(sqlText);
    // Append SCOPE_IDENTITY() to capture inserted ID if INSERT
    if (/^\s*insert\s+/i.test(tsql) && !/output\s+inserted/i.test(tsql)) {
      tsql = tsql.replace(/;\s*$/, '') + '; SELECT CAST(SCOPE_IDENTITY() AS INT) AS lastInsertRowid;';
      const result = await request.query(tsql);
      const lastId = result.recordset && result.recordset[0] ? result.recordset[0].lastInsertRowid : null;
      return { lastInsertRowid: lastId, rowsAffected: result.rowsAffected[0] || 1 };
    }
    const result = await request.query(tsql);
    return { rowsAffected: result.rowsAffected[0] || 0 };
  } else {
    sqlJsDb.run(sqlText, params);
    // Get last insert row id
    let lastId = null;
    const idRes = sqlJsDb.exec('SELECT last_insert_rowid() AS id;');
    if (idRes.length > 0 && idRes[0].values.length > 0) {
      lastId = idRes[0].values[0][0];
    }
    persistLocalDb();
    return { lastInsertRowid: lastId };
  }
}

/**
 * Get current database mode ('AZURE_SQL' | 'LOCAL_SQLITE')
 */
function getDbMode() {
  return mode;
}

/**
 * Get current database authentication mode ('MANAGED_IDENTITY' | 'SQL_PASSWORD' | 'LOCAL')
 */
function getDbAuthMode() {
  return dbAuthMode;
}

function getMssqlPool() {
  return mssqlPool;
}

/**
 * Create local SQLite schema and seed demo records if database is fresh.
 */
async function createTablesAndSeedLocal() {
  sqlJsDb.run(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'User',
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'tag',
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model_number TEXT,
      serial_number TEXT,
      purchase_date TEXT NOT NULL,
      purchase_price REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      retailer TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES Categories(id)
    );

    CREATE TABLE IF NOT EXISTS Warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      provider_name TEXT NOT NULL,
      policy_number TEXT,
      warranty_type TEXT DEFAULT 'Manufacturer',
      duration_months INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      coverage_details TEXT,
      support_contact TEXT,
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      repair_date TEXT NOT NULL,
      service_center TEXT NOT NULL,
      issue_description TEXT NOT NULL,
      cost REAL DEFAULT 0,
      status TEXT DEFAULT 'Completed',
      technician_notes TEXT,
      completion_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS Documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      repair_id INTEGER,
      document_type TEXT DEFAULT 'Invoice',
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      storage_type TEXT DEFAULT 'LocalDisk',
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES Users(id),
      FOREIGN KEY (repair_id) REFERENCES Repairs(id)
    );

    CREATE TABLE IF NOT EXISTS ActivityLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
    );
  `);

  await migrateLocalSchemaIfNeeded();

  // Check if categories already exist
  const catCheck = await query('SELECT COUNT(*) AS count FROM Categories;');
  if (catCheck[0].count === 0) {
    console.log('[Database] Seeding initial categories...');
    sqlJsDb.run(`
      INSERT INTO Categories (name, description, icon, display_order) VALUES
      ('Computing & Laptops', 'Laptops, desktop PCs, workstations, and computing accessories', 'laptop', 1),
      ('Mobile & Tablets', 'Smartphones, iPads, tablets, smartwatches, and wearables', 'smartphone', 2),
      ('Home Appliances', 'Refrigerators, washing machines, vacuums, and air conditioners', 'home', 3),
      ('Audio & Entertainment', 'Smart TVs, soundbars, headphones, and gaming consoles', 'tv', 4),
      ('Kitchen & Dining', 'Espresso machines, blenders, air fryers, and culinary gadgets', 'coffee', 5),
      ('Vehicles & Mobility', 'Cars, e-bikes, scooters, and automotive accessories', 'car', 6);
    `);
  }

  // Check if users exist
  const userCheck = await query('SELECT COUNT(*) AS count FROM Users;');
  if (userCheck[0].count === 0) {
    console.log('[Database] Seeding initial users (admin and demo)...');
    // Password is Password123!
    const defaultPasswordHash = '$2a$10$q/zFGP0a0z2ViuvlCeSlqe.4SSTHkbODG0/NihAE0m3HesgLJVT0m';
    sqlJsDb.run(`
      INSERT INTO Users (full_name, email, password_hash, role, phone) VALUES
      ('System Administrator', 'admin@warrantywise.com', '${defaultPasswordHash}', 'Admin', '+1 (555) 019-2834'),
      ('Alex Johnson', 'demo@warrantywise.com', '${defaultPasswordHash}', 'User', '+1 (555) 304-8821'),
      ('Sarah Miller', 'sarah@example.com', '${defaultPasswordHash}', 'User', '+1 (555) 912-4409');
    `);

    // Seed products for Alex Johnson (User 2)
    console.log('[Database] Seeding initial demo products, warranties, repairs, and documents...');
    sqlJsDb.run(`
      INSERT INTO Products (user_id, category_id, name, brand, model_number, serial_number, purchase_date, purchase_price, currency, retailer, notes) VALUES
      (2, 1, 'MacBook Pro 16" M3 Max', 'Apple', 'A2991', 'C02G8990MD6R', '2026-01-10', 3499.00, 'USD', 'Apple Store Regent St', 'Primary development and video editing workstation'),
      (2, 4, 'Sony Bravia 65" XR OLED TV', 'Sony', 'XR-65A80L', 'SN-88201944-B', '2025-11-25', 1899.99, 'USD', 'Best Buy', 'Living room entertainment center'),
      (2, 3, 'Dyson V15 Detect Cordless Vacuum', 'Dyson', 'V15-ABS', 'DY-99214-X', '2024-08-14', 749.99, 'USD', 'Target', 'Includes laser slim fluffy head and hair screw tool'),
      (2, 2, 'Samsung Galaxy S24 Ultra', 'Samsung', 'SM-S928B', 'R5CW301828A', '2026-03-05', 1299.00, 'USD', 'Samsung Official Store', 'Titanium Gray, 512GB storage'),
      (2, 3, 'LG French Door Smart Refrigerator', 'LG', 'LRFCS2503S', 'LG-8871029', '2025-06-18', 2199.00, 'USD', 'Home Depot', 'Smart Wi-Fi enabled with dual ice maker'),
      (2, 1, 'Dell UltraSharp 32" 4K USB-C Hub Monitor', 'Dell', 'U3223QE', 'CN-0P8219-74441', '2025-11-28', 829.50, 'USD', 'Dell.com', 'IPS Black technology with 90W Power Delivery'),
      (2, 4, 'Bose QuietComfort 45 Headphones', 'Bose', 'QC45-BLK', 'BOS-4481023', '2024-03-12', 329.00, 'USD', 'Amazon', 'Active noise cancelling wireless headphones'),
      (2, 5, 'DeLonghi Magnifica S Espresso Machine', 'DeLonghi', 'ECAM22110B', 'DL-20239100', '2026-02-14', 649.95, 'USD', 'Williams Sonoma', 'Bean-to-cup automated coffee machine');

      INSERT INTO Warranties (product_id, provider_name, policy_number, warranty_type, duration_months, start_date, end_date, coverage_details, support_contact, status) VALUES
      (1, 'AppleCare+ for Mac', 'AC-MAC-98231', 'Manufacturer', 24, '2026-01-10', '2028-01-10', 'Accidental damage protection with priority 24/7 technical support', 'apple.com/support / 1-800-APL-CARE', 'Active'),
      (2, 'Sony Care Protect Plan', 'SN-WTY-77192', 'Manufacturer', 12, '2025-11-25', '2026-11-29', 'Full panel replacement and in-home technician dispatch', 'support.sony.com / 1-800-222-7669', 'Expiring Soon'),
      (3, 'Dyson 2-Year Limited Warranty', 'DY-LTD-1092', 'Manufacturer', 12, '2024-08-14', '2025-08-14', 'Parts and labor coverage for mechanical failure', 'dyson.com/support', 'Expired'),
      (4, 'Samsung Care+', 'SC-GAL-33810', 'Manufacturer', 24, '2026-03-05', '2027-03-05', 'Covers screen cracks, liquid spills, and battery degradation', 'samsungcareplus.com', 'Active'),
      (5, 'LG Appliance Protection', 'LG-REF-99012', 'Manufacturer', 24, '2025-06-18', '2027-06-18', 'Linear compressor covered for 10 years, all parts covered 2 years', 'lg.com/us/support', 'Active'),
      (6, 'Dell Premium Panel Exchange', 'DELL-MON-4412', 'Manufacturer', 12, '2025-11-28', '2026-12-02', 'Zero bright-dot guarantee and advanced device exchange', 'dell.com/monitorsupport', 'Expiring Soon'),
      (7, 'Bose Standard Limited Warranty', 'BOSE-4819-A', 'Manufacturer', 12, '2024-03-12', '2025-03-12', 'Factory defect warranty', 'bose.com/support', 'Expired'),
      (8, 'DeLonghi Club Care', 'DL-ESP-88192', 'Extended', 24, '2026-02-14', '2027-02-14', 'Annual descaling kit + free pump and boiler maintenance', 'delonghi.com/service', 'Active');

      INSERT INTO Repairs (product_id, user_id, repair_date, service_center, issue_description, cost, status, technician_notes, completion_date) VALUES
      (3, 2, '2025-04-10', 'Dyson Authorized Service Hub', 'Motor stopped spinning; battery indicator flashing red 10 times', 125.00, 'Completed', 'Replaced digital motor assembly and cleaned cyclonic filters', '2025-04-14'),
      (7, 2, '2024-11-05', 'AudioFix Specialists', 'Left ear cup audio cutting out intermittently when pivoting headband', 65.00, 'Completed', 'Re-soldered ribbon cable connector inside left hinge assembly', '2024-11-08'),
      (5, 2, '2026-03-22', 'Sears Home Services / LG Certified', 'Ice maker jamming and leaking small amounts of water in freezer tray', 145.00, 'Completed', 'Replaced solenoid water inlet valve and recalibrated optical ice sensor', '2026-03-24'),
      (1, 2, '2026-11-02', 'Apple Store Regent St Genius Bar', 'Sticky spacebar and slight liquid stain on keycap switch', 0.00, 'In Progress', 'Covered under AppleCare+ zero dollar accidental keyboard repair tier', NULL),
      (2, 2, '2026-11-08', 'Sony Direct Care Dispatch', 'Intermittent HDMI eARC audio handshake dropouts with Sonos Arc soundbar', 0.00, 'Pending', 'Awaiting field engineer visit before warranty expiration window closes', NULL);

      INSERT INTO Documents (product_id, user_id, repair_id, document_type, file_name, original_name, file_size, mime_type, storage_path, storage_type, upload_date) VALUES
      (1, 2, NULL, 'Invoice', 'sample_invoice_macbook.pdf', 'Apple_Store_Invoice_C02G8990.pdf', 245760, 'application/pdf', 'uploads/sample_invoice_macbook.pdf', 'LocalDisk', '2026-01-10 11:30:00'),
      (1, 2, NULL, 'Warranty Card', 'sample_warranty_macbook.pdf', 'AppleCare_Plus_Certificate.pdf', 184320, 'application/pdf', 'uploads/sample_warranty_macbook.pdf', 'LocalDisk', '2026-01-10 11:32:00'),
      (2, 2, NULL, 'Invoice', 'sample_invoice_sony.pdf', 'BestBuy_Receipt_65A80L.pdf', 312400, 'application/pdf', 'uploads/sample_invoice_sony.pdf', 'LocalDisk', '2025-11-25 18:22:00'),
      (3, 2, 1, 'Repair Receipt', 'sample_receipt_dyson.pdf', 'DysonService_WorkOrder_125USD.pdf', 158900, 'application/pdf', 'uploads/sample_receipt_dyson.pdf', 'LocalDisk', '2025-04-14 16:45:00'),
      (4, 2, NULL, 'Invoice', 'sample_invoice_s24.pdf', 'Samsung_TaxInvoice_S24Ultra.pdf', 420100, 'application/pdf', 'uploads/sample_invoice_s24.pdf', 'LocalDisk', '2026-03-05 09:15:00'),
      (5, 2, 3, 'Repair Receipt', 'sample_receipt_lg.pdf', 'LG_RepairInvoice_March2026.pdf', 198500, 'application/pdf', 'uploads/sample_receipt_lg.pdf', 'LocalDisk', '2026-03-24 14:10:00');

      INSERT INTO ActivityLogs (user_id, action, entity_type, entity_id, details) VALUES
      (2, 'USER_LOGIN', 'User', 2, 'Successful authentication from Web Portal'),
      (2, 'PRODUCT_REGISTERED', 'Product', 1, 'Registered MacBook Pro 16" M3 Max with AppleCare+'),
      (2, 'DOCUMENT_UPLOADED', 'Document', 1, 'Uploaded purchase invoice for MacBook Pro'),
      (2, 'REPAIR_LOGGED', 'Repair', 1, 'Logged Dyson vacuum repair ($125.00)'),
      (2, 'PRODUCT_REGISTERED', 'Product', 4, 'Registered Samsung Galaxy S24 Ultra'),
      (1, 'USER_LOGIN', 'User', 1, 'Admin logged in to system dashboard');
    `);
  }
}

/**
 * Safely migrate existing local SQLite schema without losing data.
 * Ensures ActivityLogs.user_id foreign key uses ON DELETE SET NULL.
 */
async function migrateLocalSchemaIfNeeded() {
  const fkList = await query('PRAGMA foreign_key_list(ActivityLogs);');
  const needsActivityLogsFkMigration = fkList.some(
    (fk) =>
      fk.table === 'Users' &&
      fk.from === 'user_id' &&
      String(fk.on_delete || '').toUpperCase() !== 'SET NULL'
  );

  if (!needsActivityLogsFkMigration) {
    return;
  }

  console.log('[Database] Migrating ActivityLogs foreign key to ON DELETE SET NULL...');

  const seqRows = await query("SELECT seq FROM sqlite_sequence WHERE name = 'ActivityLogs';");
  const prevSeq = seqRows.length > 0 ? seqRows[0].seq : 0;

  sqlJsDb.run('PRAGMA foreign_keys = OFF;');
  try {
    sqlJsDb.run('BEGIN TRANSACTION;');
    sqlJsDb.run('DROP TABLE IF EXISTS ActivityLogs_migrated;');
    sqlJsDb.run(`
      CREATE TABLE ActivityLogs_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
      );
    `);
    sqlJsDb.run(`
      INSERT INTO ActivityLogs_migrated (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      SELECT id, user_id, action, entity_type, entity_id, details, ip_address, created_at
      FROM ActivityLogs;
    `);
    sqlJsDb.run('DROP TABLE ActivityLogs;');
    sqlJsDb.run('ALTER TABLE ActivityLogs_migrated RENAME TO ActivityLogs;');

    const maxRows = await query('SELECT COALESCE(MAX(id), 0) AS max_id FROM ActivityLogs;');
    const maxId = maxRows[0].max_id;
    const targetSeq = Math.max(prevSeq, maxId);
    if (targetSeq > 0) {
      const hasSeqRow = await query("SELECT name FROM sqlite_sequence WHERE name = 'ActivityLogs';");
      if (hasSeqRow.length > 0) {
        sqlJsDb.run("UPDATE sqlite_sequence SET seq = ? WHERE name = 'ActivityLogs';", [targetSeq]);
      } else {
        sqlJsDb.run("INSERT INTO sqlite_sequence (name, seq) VALUES ('ActivityLogs', ?);", [targetSeq]);
      }
    }

    const fkErrors = await query('PRAGMA foreign_key_check(ActivityLogs);');
    if (fkErrors.length > 0) {
      throw new Error(`ActivityLogs foreign key check failed: ${JSON.stringify(fkErrors)}`);
    }

    sqlJsDb.run('COMMIT;');
    console.log('[Database] ActivityLogs schema migrated safely.');
  } catch (err) {
    try {
      sqlJsDb.run('ROLLBACK;');
    } catch (rollbackErr) {
      console.error('[Database] Migration rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    sqlJsDb.run('PRAGMA foreign_keys = ON;');
  }
}

module.exports = {
  initDb,
  closeDb,
  query,
  run,
  getDbMode,
  getDbAuthMode,
  getMssqlPool,
  persistLocalDb,
  isAzureSqlConfigured,
  shouldUseManagedIdentity,
  buildAzureSqlConfig,
  convertPlaceholdersToTsql,
  formatSqlServerDate,
  normalizeAzureSqlRows
};

