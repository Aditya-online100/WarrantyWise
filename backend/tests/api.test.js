const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { app } = require('../server');
const db = require('../services/db');
const blobStorage = require('../services/blobStorage');
const adminController = require('../controllers/adminController');
const { splitSqlBatches } = require('../scripts/initAzureSql');
const { readLocalSnapshot } = require('../scripts/migrateLocalToAzure');

function simulateRequest({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    if (body) {
      if (!normalizedHeaders['content-type']) {
        normalizedHeaders['content-type'] = 'application/json';
      }
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      normalizedHeaders['content-length'] = Buffer.byteLength(bodyStr).toString();
    }

    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const bodyBuffer = Buffer.from(bodyStr);

    let sent = false;
    const req = new Readable({
      read() {
        if (!sent && bodyBuffer.length > 0) {
          this.push(bodyBuffer);
          sent = true;
        } else {
          this.push(null);
        }
      }
    });

    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = normalizedHeaders;
    // Pre-populate req.body so express body parser or handlers have it directly
    if (body && typeof body === 'object') {
      req.body = { ...body };
    }
    req.connection = { remoteAddress: '127.0.0.1' };
    req.ip = '127.0.0.1';

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';

    const res = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = (name, value) => {
      responseHeaders[name.toLowerCase()] = value;
    };
    res.getHeader = (name) => responseHeaders[name.toLowerCase()];
    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      responseHeaders['content-type'] = 'application/json';
      responseBody = data;
      resolve({
        status: statusCode,
        headers: responseHeaders,
        data: data
      });
      res.emit('finish');
    };
    res.send = (data) => {
      responseBody = data;
      let parsed = data;
      try {
        if (typeof data === 'string') parsed = JSON.parse(data);
      } catch (e) {}
      resolve({
        status: statusCode,
        headers: responseHeaders,
        data: parsed,
        raw: data
      });
      res.emit('finish');
    };
    res.end = (data) => {
      if (data) responseBody = data;
      resolve({
        status: statusCode,
        headers: responseHeaders,
        data: responseBody
      });
      res.emit('finish');
    };

    app(req, res);
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🧪 WARRANTYWISE AUTOMATED INTEGRATION TEST SUITE');
  console.log('===============================================================\n');

  await db.initDb();

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Health Check & Database Enforcement
  console.log('--- Suite 1: Health & System Diagnostics ---');
  const healthRes = await simulateRequest({ method: 'GET', url: '/api/health' });
  assert(healthRes.status === 200 && healthRes.data.status === 'UP', 'Health check returns 200 UP status');

  if (db.getDbMode() === 'LOCAL_SQLITE') {
    const fkRes = await db.query('PRAGMA foreign_keys;');
    assert(fkRes.length > 0 && fkRes[0].foreign_keys === 1, 'SQLite foreign key enforcement is enabled (PRAGMA foreign_keys = 1)');

    const activityFkRes = await db.query('PRAGMA foreign_key_list(ActivityLogs);');
    const hasSetNull = activityFkRes.some(
      (fk) => fk.table === 'Users' && fk.from === 'user_id' && fk.on_delete === 'SET NULL'
    );
    assert(hasSetNull, 'ActivityLogs.user_id foreign key enforces ON DELETE SET NULL');
  }

  // 2. Authentication: Demo User Login
  console.log('\n--- Suite 2: Authentication & RBAC ---');
  const demoLogin = await simulateRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'demo@warrantywise.com', password: 'Password123!' }
  });
  assert(demoLogin.status === 200 && demoLogin.data.token, 'Seeded demo user login succeeds and receives JWT');
  const demoToken = demoLogin.data.token;

  // 3. Authentication: Invalid Password
  const badLogin = await simulateRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'demo@warrantywise.com', password: 'WrongPassword999' }
  });
  assert(badLogin.status === 401 && !badLogin.data.success, 'Invalid password rejected with 401 Unauthorized');

  // 4. Authentication: Admin Login
  const adminLogin = await simulateRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'admin@warrantywise.com', password: 'Password123!' }
  });
  assert(adminLogin.status === 200 && adminLogin.data.user.role === 'Admin', 'Admin login succeeds with Admin role');
  const adminToken = adminLogin.data.token;

  // 5. RBAC: User blocked from Admin route
  const userBlocked = await simulateRequest({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(userBlocked.status === 403, 'Regular user blocked from Admin route with 403 Forbidden');

  // 6. RBAC: Admin allowed into Admin route
  const adminAllowed = await simulateRequest({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert(adminAllowed.status === 200 && adminAllowed.data.success, 'Admin successfully accesses Admin stats route');

  // 7. Categories
  console.log('\n--- Suite 3: Categories & Product Management ---');
  const categoriesRes = await simulateRequest({ method: 'GET', url: '/api/categories' });
  assert(categoriesRes.status === 200 && categoriesRes.data.data.length >= 6, 'Fetched categories list (6 standard categories)');

  // 8. Fetch Demo User Products
  const productsRes = await simulateRequest({
    method: 'GET',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(productsRes.status === 200 && productsRes.data.data.length > 0, `Listed user products (${productsRes.data.data.length} registered products)`);

  // 9. Register a New Product with Warranty
  const newProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'iPad Pro 13" M4',
      brand: 'Apple',
      category_id: 1,
      model_number: 'MVX33LL/A',
      serial_number: 'DLXX88902',
      purchase_date: '2026-06-15',
      purchase_price: 1299.00,
      currency: 'USD',
      retailer: 'Apple Store Regent St',
      provider_name: 'AppleCare+ Extended',
      duration_months: 24,
      start_date: '2026-06-15',
      end_date: '2028-06-15',
      coverage_details: 'Includes accidental damage protection with $29 screen fee'
    }
  });
  assert(newProdRes.status === 201 && newProdRes.data.success, 'Created product with attached warranty');
  const newProdId = newProdRes.data.data.id;

  // 10. Fetch Single Product Details
  const singleProdRes = await simulateRequest({
    method: 'GET',
    url: `/api/products/${newProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(singleProdRes.status === 200 && singleProdRes.data.data.warranty !== null, 'Fetched single product with full warranty & repair breakdown');

  // 11. Update Product
  const updateProdRes = await simulateRequest({
    method: 'PUT',
    url: `/api/products/${newProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'iPad Pro 13" M4 (Space Black)',
      brand: 'Apple',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: 1399.00,
      notes: 'Upgraded storage model'
    }
  });
  assert(updateProdRes.status === 200 && updateProdRes.data.success, 'Updated product information successfully');

  // 11b. Purchase Price Edge Cases (blank, zero, negative, non-numeric, valid)
  const negProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Negative Price Product',
      brand: 'TestBrand',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: -25
    }
  });
  assert(negProdRes.status === 400 && !negProdRes.data.success, 'Creating product with negative purchase_price rejected with 400');

  const nanProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Invalid Price Product',
      brand: 'TestBrand',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: 'abc'
    }
  });
  assert(nanProdRes.status === 400 && !nanProdRes.data.success, 'Creating product with non-numeric purchase_price rejected with 400');

  const blankProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Blank Price Accessory',
      brand: 'Logitech',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: ''
    }
  });
  const blankProdId = blankProdRes.data?.data?.id;
  const blankProdRow = blankProdId
    ? await db.query('SELECT purchase_price FROM Products WHERE id = ?;', [blankProdId])
    : [];
  assert(
    blankProdRes.status === 201 &&
    blankProdRes.data.data.purchase_price === 0 &&
    blankProdRow.length === 1 &&
    Number(blankProdRow[0].purchase_price) === 0,
    'Creating product with blank purchase_price succeeds and normalizes price to 0'
  );

  const zeroUpdateProdRes = await simulateRequest({
    method: 'PUT',
    url: `/api/products/${blankProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Zero Price Accessory',
      brand: 'Logitech',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: 0
    }
  });
  const zeroProdRow = await db.query('SELECT purchase_price FROM Products WHERE id = ?;', [blankProdId]);
  assert(
    zeroUpdateProdRes.status === 200 &&
    zeroProdRow.length === 1 &&
    Number(zeroProdRow[0].purchase_price) === 0,
    'Updating product with zero purchase_price succeeds and stores 0'
  );

  const validUpdateProdRes = await simulateRequest({
    method: 'PUT',
    url: `/api/products/${blankProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Valid Price Accessory',
      brand: 'Logitech',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: 199.50
    }
  });
  const validProdRow = await db.query('SELECT purchase_price FROM Products WHERE id = ?;', [blankProdId]);
  assert(
    validUpdateProdRes.status === 200 &&
    validProdRow.length === 1 &&
    Number(validProdRow[0].purchase_price) === 199.5,
    'Updating product with valid purchase_price stores 199.50'
  );

  const blankUpdateProdRes = await simulateRequest({
    method: 'PUT',
    url: `/api/products/${blankProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Cleared Price Accessory',
      brand: 'Logitech',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: ''
    }
  });
  const clearedProdRow = await db.query('SELECT purchase_price FROM Products WHERE id = ?;', [blankProdId]);
  assert(
    blankUpdateProdRes.status === 200 &&
    clearedProdRow.length === 1 &&
    Number(clearedProdRow[0].purchase_price) === 0,
    'Updating product with blank purchase_price succeeds and normalizes price to 0'
  );

  const negUpdateProdRes = await simulateRequest({
    method: 'PUT',
    url: `/api/products/${blankProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Negative Update Product',
      brand: 'Logitech',
      category_id: 1,
      purchase_date: '2026-06-15',
      purchase_price: -10
    }
  });
  assert(negUpdateProdRes.status === 400 && !negUpdateProdRes.data.success, 'Updating product with negative purchase_price rejected with 400');

  await simulateRequest({
    method: 'DELETE',
    url: `/api/products/${blankProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });

  // 12. Create Repair Record (Fails without product_id)
  console.log('\n--- Suite 4: Repairs & Expenditure History ---');
  const badRepairRes = await simulateRequest({
    method: 'POST',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-10',
      service_center: 'Apple Genius Bar',
      issue_description: 'Missing product ID test',
      cost: 29.00
    }
  });
  assert(badRepairRes.status === 400 && !badRepairRes.data.success, 'Creating repair without product_id correctly fails with 400');

  // Create Repair with Negative Cost (Must Fail)
  const negCreateRepairRes = await simulateRequest({
    method: 'POST',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      product_id: newProdId,
      repair_date: '2026-08-10',
      service_center: 'Apple Genius Bar',
      issue_description: 'Negative cost create test',
      cost: -15.00
    }
  });
  assert(negCreateRepairRes.status === 400 && !negCreateRepairRes.data.success, 'Creating repair with negative cost rejected with 400 Bad Request');

  // Create Repair with Blank Cost (Optional -> normalized to 0)
  const blankCreateRepairRes = await simulateRequest({
    method: 'POST',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      product_id: newProdId,
      repair_date: '2026-08-11',
      service_center: 'Warranty Service Center',
      issue_description: 'Blank cost warranty inspection test',
      cost: ''
    }
  });
  const blankRepairId = blankCreateRepairRes.data?.data?.id;
  const blankCreatedRow = blankRepairId
    ? await db.query('SELECT cost FROM Repairs WHERE id = ?;', [blankRepairId])
    : [];
  assert(
    blankCreateRepairRes.status === 201 &&
    blankCreateRepairRes.data.data.cost === 0 &&
    blankCreatedRow.length === 1 &&
    Number(blankCreatedRow[0].cost) === 0,
    'Creating repair with blank cost succeeds and normalizes cost to 0'
  );

  // Create Valid Repair Record
  const repairRes = await simulateRequest({
    method: 'POST',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      product_id: newProdId,
      repair_date: '2026-08-10',
      service_center: 'Apple Genius Bar',
      issue_description: 'Screen glass micro-crack replacement under AppleCare',
      cost: 29.00,
      status: 'Completed'
    }
  });
  assert(repairRes.status === 201 && repairRes.data.success, 'Repair record registered successfully ($29.00)');
  const newRepairId = repairRes.data.data.id;

  // Edit Repair Record WITHOUT product_id (Must Succeed)
  const updateRepairRes = await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${newRepairId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-12',
      service_center: 'Apple Genius Bar Regent St',
      issue_description: 'Updated screen glass micro-crack replacement',
      cost: 35.00,
      status: 'Completed'
    }
  });
  assert(updateRepairRes.status === 200 && updateRepairRes.data.success, 'Editing repair without product_id succeeds (200 OK)');

  // Edit Repair Record with non-zero cost -> then blank cost (Must normalize to 0)
  await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${blankRepairId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-11',
      service_center: 'Warranty Service Center',
      issue_description: 'Temporary non-zero cost before clearing',
      cost: 45.50,
      status: 'In Progress'
    }
  });
  const blankUpdateRepairRes = await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${blankRepairId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-11',
      service_center: 'Warranty Service Center',
      issue_description: 'Cleared cost to blank (covered under warranty)',
      cost: '',
      status: 'Completed'
    }
  });
  const blankUpdatedRow = await db.query('SELECT cost FROM Repairs WHERE id = ?;', [blankRepairId]);
  assert(
    blankUpdateRepairRes.status === 200 &&
    blankUpdateRepairRes.data.success &&
    blankUpdatedRow.length === 1 &&
    Number(blankUpdatedRow[0].cost) === 0,
    'Editing repair with blank cost succeeds and normalizes cost to 0'
  );

  // Verify other repair validations remain active on PUT (negative cost & non-numeric cost)
  const badUpdateRepairRes = await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${newRepairId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-12',
      service_center: 'Apple Genius Bar Regent St',
      issue_description: 'Negative cost validation check',
      cost: -50.00
    }
  });
  assert(badUpdateRepairRes.status === 400, 'Repair update still rejects negative cost with 400 Bad Request');

  const nanUpdateRepairRes = await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${newRepairId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      repair_date: '2026-08-12',
      service_center: 'Apple Genius Bar Regent St',
      issue_description: 'Non-numeric cost validation check',
      cost: 'abc'
    }
  });
  assert(nanUpdateRepairRes.status === 400, 'Repair update rejects non-numeric cost with 400 Bad Request');

  // Verify another user cannot edit this repair (User isolation)
  const otherLogin = await simulateRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'sarah@example.com', password: 'Password123!' }
  });
  const otherToken = otherLogin.data.token;
  const hijackRepairRes = await simulateRequest({
    method: 'PUT',
    url: `/api/repairs/${newRepairId}`,
    headers: { 'Authorization': `Bearer ${otherToken}` },
    body: {
      repair_date: '2026-08-12',
      service_center: 'Unauthorized Shop',
      issue_description: 'Unauthorized edit attempt',
      cost: 0.00
    }
  });
  assert(hijackRepairRes.status === 404, 'Other user blocked from editing another user repair (404 Not Found)');

  // 13. List Repairs
  const listRepairs = await simulateRequest({
    method: 'GET',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(listRepairs.status === 200 && listRepairs.data.total_expenditure > 0, `Repairs ledger retrieved with expenditure total ($${listRepairs.data.total_expenditure})`);

  // 14. Analytics Dashboard
  console.log('\n--- Suite 5: Warranty Analytics Dashboard ---');
  const analyticsRes = await simulateRequest({
    method: 'GET',
    url: '/api/analytics/dashboard',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(
    analyticsRes.status === 200 &&
    analyticsRes.data.data.kpis.total_products > 0 &&
    analyticsRes.data.data.category_distribution.length > 0 &&
    analyticsRes.data.data.upcoming_expirations !== undefined,
    'Dashboard analytics accurately computed (KPIs, Category breakdown, Upcoming expirations)'
  );

  // 15. Delete Product and Cascade
  console.log('\n--- Suite 6: Deletion & Referential Integrity ---');
  const delRes = await simulateRequest({
    method: 'DELETE',
    url: `/api/products/${newProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(delRes.status === 200 && delRes.data.success, 'Product and cascading relations deleted cleanly');

  // Verify product is gone
  const verifyGone = await simulateRequest({
    method: 'GET',
    url: `/api/products/${newProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(verifyGone.status === 404, 'Deleted product verified removed (404 Not Found)');

  // Verify related records (Warranties & Repairs) were cleaned up
  const leftoverWty = await db.query('SELECT COUNT(*) AS count FROM Warranties WHERE product_id = ?;', [newProdId]);
  const leftoverRep = await db.query('SELECT COUNT(*) AS count FROM Repairs WHERE product_id = ?;', [newProdId]);
  assert(leftoverWty[0].count === 0 && leftoverRep[0].count === 0, 'Related warranties and repairs verified cleaned up after product deletion');

  // Verify deleting a user with ActivityLogs references succeeds (ON DELETE SET NULL)
  const tempEmail = `fk_audit_${Date.now()}@example.com`;
  const tempRegRes = await simulateRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      full_name: 'Temp FK User',
      email: tempEmail,
      password: 'Password123!'
    }
  });
  assert(tempRegRes.status === 201 && tempRegRes.data.user?.id, 'Temporary test user registered (with ActivityLogs entry)');
  const tempUserId = tempRegRes.data.user.id;

  const tempLogsBefore = await db.query('SELECT id, user_id FROM ActivityLogs WHERE user_id = ?;', [tempUserId]);
  assert(tempLogsBefore.length > 0, 'ActivityLogs recorded reference to temporary test user');

  let userDeleteSucceeded = false;
  try {
    await db.run('DELETE FROM Users WHERE id = ?;', [tempUserId]);
    userDeleteSucceeded = true;
  } catch (err) {
    console.error('  User deletion failed:', err.message);
  }
  const userCheckAfter = await db.query('SELECT COUNT(*) AS count FROM Users WHERE id = ?;', [tempUserId]);
  const tempLogAfter = tempLogsBefore.length > 0
    ? await db.query('SELECT id, user_id FROM ActivityLogs WHERE id = ?;', [tempLogsBefore[0].id])
    : [];

  assert(
    userDeleteSucceeded &&
    userCheckAfter[0].count === 0 &&
    tempLogAfter.length === 1 &&
    tempLogAfter[0].user_id === null,
    'User deletion succeeds with ActivityLogs preserved (user_id set to NULL)'
  );

  // Clean up temporary ActivityLogs row created by the temp user test
  for (const row of tempLogsBefore) {
    await db.run('DELETE FROM ActivityLogs WHERE id = ?;', [row.id]);
  }

  // 16. Azure Integration, Managed Identity Config, Date Normalization & Blob Storage Unit Tests
  console.log('\n--- Suite 7: Azure SQL, Managed Identity, Date Formatting & Private Blob Storage ---');

  assert(
    Boolean(healthRes.data.storage_mode) &&
    Boolean(healthRes.data.database_auth_mode) &&
    healthRes.data.storage_container === 'warranty-documents',
    'Health endpoint reports database_auth_mode, storage_mode, and private container warranty-documents'
  );

  // Azure SQL Managed Identity config builder (no DB_USER/DB_PASSWORD required)
  const msiSqlConfig = db.buildAzureSqlConfig({
    server: 'warrantywise-sql-2026.database.windows.net',
    database: 'WarrantyWiseDB',
    authMode: 'managed_identity',
    user: '',
    password: ''
  });
  assert(
    msiSqlConfig.server === 'warrantywise-sql-2026.database.windows.net' &&
    msiSqlConfig.database === 'WarrantyWiseDB' &&
    msiSqlConfig.authentication?.type === 'azure-active-directory-default' &&
    msiSqlConfig.options?.encrypt === true &&
    msiSqlConfig.options?.trustServerCertificate === false &&
    msiSqlConfig.options?.useUTC === true &&
    !('user' in msiSqlConfig) &&
    !('password' in msiSqlConfig),
    'Azure SQL config uses Managed Identity (azure-active-directory-default) without SQL password'
  );

  const uamiSqlConfig = db.buildAzureSqlConfig({
    server: 'warrantywise-sql-2026.database.windows.net',
    database: 'WarrantyWiseDB',
    authMode: 'auto',
    managedIdentityClientId: '11111111-2222-3333-4444-555555555555'
  });
  assert(
    uamiSqlConfig.authentication?.type === 'azure-active-directory-default' &&
    uamiSqlConfig.authentication?.options?.clientId === '11111111-2222-3333-4444-555555555555',
    'Azure SQL auto-selects Managed Identity and forwards optional clientId'
  );

  // T-SQL parameter conversion & Date normalization
  const convertedSql = db.convertPlaceholdersToTsql(
    "SELECT TOP (?) * FROM ActivityLogs WHERE entity_type = ? AND details <> 'what?';"
  );
  assert(
    convertedSql === "SELECT TOP (@p0) * FROM ActivityLogs WHERE entity_type = @p1 AND details <> 'what?';",
    'T-SQL placeholder converter converts ? to @pN while preserving string literals'
  );

  const mockRecordset = [
    {
      id: 11,
      repair_date: new Date('2026-11-10T00:00:00.000Z'),
      created_at: new Date('2026-11-10T20:07:35.000Z'),
      cost: 125.5
    }
  ];
  mockRecordset.columns = {
    repair_date: { type: { name: 'Date' } },
    created_at: { type: { name: 'DateTime2' } }
  };
  const normalizedRows = db.normalizeAzureSqlRows(mockRecordset);
  assert(
    normalizedRows[0].repair_date === '2026-11-10' &&
    normalizedRows[0].created_at === '2026-11-10 20:07:35' &&
    normalizedRows[0].cost === 125.5,
    'Azure SQL Date & DateTime2 JS Date objects normalize to YYYY-MM-DD and YYYY-MM-DD HH:mm:ss'
  );

  // Admin ActivityLogs T-SQL vs SQLite LIMIT dialect check
  const azureLogsSql = adminController.buildActivityLogsSql('AZURE_SQL');
  const sqliteLogsSql = adminController.buildActivityLogsSql('LOCAL_SQLITE');
  assert(
    /SELECT\s+TOP\s+\(\?\)/i.test(azureLogsSql) &&
    !/\bLIMIT\b/i.test(azureLogsSql) &&
    /\bLIMIT\s+\?/i.test(sqliteLogsSql),
    'Admin activity logs query uses TOP (?) for Azure SQL and LIMIT ? for SQLite'
  );

  // Private Azure Blob Storage SDK client check (DefaultAzureCredential, no keys, private container)
  const blobClients = blobStorage.createBlobStorageClients({
    accountName: 'warrantystorage2026',
    containerName: 'warranty-documents'
  });
  const blobServiceSource = fs.readFileSync(path.resolve(__dirname, '../services/blobStorage.js'), 'utf8');
  assert(
    blobClients.accountUrl === 'https://warrantystorage2026.blob.core.windows.net' &&
    blobClients.containerName === 'warranty-documents' &&
    !blobServiceSource.includes("access: 'blob'") &&
    !blobServiceSource.includes('fromConnectionString'),
    'Blob Storage client targets https://warrantystorage2026.blob.core.windows.net / warranty-documents privately with DefaultAzureCredential'
  );

  // Document storage listing endpoint (scoped per user & admin)
  const userStorageRes = await simulateRequest({
    method: 'GET',
    url: '/api/documents/storage',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(
    userStorageRes.status === 200 &&
    userStorageRes.data.success &&
    userStorageRes.data.container === 'warranty-documents' &&
    Array.isArray(userStorageRes.data.data) &&
    userStorageRes.data.data.every((f) => f.storagePath.startsWith('user_2/')),
    'GET /api/documents/storage lists user-scoped files inside storage container'
  );

  // Non-destructive schema.sql + SQL batch splitting + read-only local snapshot check
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  const viewsSql = fs.readFileSync(path.resolve(__dirname, '../../database/views.sql'), 'utf8');
  const snapshot = await readLocalSnapshot();
  assert(
    !/DROP\s+TABLE/i.test(schemaSql) &&
    /IF\s+OBJECT_ID\(N'dbo\.Users',\s*N'U'\)\s+IS\s+NULL/i.test(schemaSql) &&
    splitSqlBatches(viewsSql).length === 3 &&
    snapshot.Users.length >= 3 &&
    snapshot.Products.length >= 9,
    'database/schema.sql is non-destructive, SQL batches split cleanly, and local SQLite data is intact'
  );

  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}
