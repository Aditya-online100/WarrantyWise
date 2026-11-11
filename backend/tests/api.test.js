const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const config = require('../config/env');
const { app } = require('../server');
const db = require('../services/db');
const blobStorage = require('../services/blobStorage');
const adminController = require('../controllers/adminController');
const { splitSqlBatches, DEFAULT_CATEGORIES } = require('../scripts/initAzureSql');
const { readLocalSnapshot } = require('../scripts/migrateLocalToAzure');
const { REQUIRED_TABLES, EXPECTED_INDEXES, classifyAzureSqlError } = require('../scripts/testAzureSql');
const { classifyAzureBlobError } = require('../scripts/testAzureBlob');

function buildMultipartPayload(fields = {}, file = null) {
  const boundary = `----WarrantyWiseBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`,
        'utf8'
      )
    );
  }

  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName || 'file'}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`,
        'utf8'
      )
    );
    parts.push(Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(String(file.buffer || '')));
    parts.push(Buffer.from('\r\n', 'utf8'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
    buffer: Buffer.concat(parts)
  };
}

function simulateRequest({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const isRawBuffer = Buffer.isBuffer(body);
    let bodyBuffer = Buffer.alloc(0);
    if (body !== null && body !== undefined) {
      if (isRawBuffer) {
        bodyBuffer = body;
      } else {
        if (!normalizedHeaders['content-type']) {
          normalizedHeaders['content-type'] = 'application/json';
        }
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        bodyBuffer = Buffer.from(bodyStr);
      }
      if (!normalizedHeaders['content-length']) {
        normalizedHeaders['content-length'] = bodyBuffer.length.toString();
      }
    }

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
    // Pre-populate req.body only for parsed JSON objects, never for raw multipart streams
    if (body && typeof body === 'object' && !isRawBuffer) {
      req.body = { ...body };
    }
    req.connection = { remoteAddress: '127.0.0.1' };
    req.ip = '127.0.0.1';

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';
    const chunks = [];

    const res = new EventEmitter();
    res.statusCode = 200;
    res.writable = true;
    res.headersSent = false;
    res.setHeader = (name, value) => {
      responseHeaders[name.toLowerCase()] = value;
    };
    res.getHeader = (name) => responseHeaders[name.toLowerCase()];
    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.write = (chunk) => {
      res.headersSent = true;
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return true;
    };
    res.json = (data) => {
      res.headersSent = true;
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
      res.headersSent = true;
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
      res.headersSent = true;
      if (data) {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      }
      const rawBuffer = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
      resolve({
        status: statusCode,
        headers: responseHeaders,
        data: chunks.length > 0 ? rawBuffer : responseBody,
        rawBuffer
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

  // Isolate SQLite & disk storage in a temp sandbox so real local DB & uploads remain untouched
  const origLocalDbPath = config.LOCAL_DB_PATH;
  const origUploadDir = config.UPLOAD_DIR;
  const testSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warrantywise-api-test-'));
  const tempDbPath = path.join(testSandboxDir, 'warrantywise.db');
  const tempUploadDir = path.join(testSandboxDir, 'uploads');

  if (fs.existsSync(origLocalDbPath)) {
    fs.copyFileSync(origLocalDbPath, tempDbPath);
  }
  config.LOCAL_DB_PATH = tempDbPath;
  config.UPLOAD_DIR = tempUploadDir;

  let passed = 0;
  let failed = 0;

  try {
    await db.initDb();

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

  // 13b. Document Vault Upload, Download, Listing, Validation, Access Control & Deletion
  console.log('\n--- Suite 4b: Document Vault, Access Control & Storage Lifecycle ---');
  const uploadMiddleware = require('../middleware/uploadMiddleware');
  const initialStoredFiles = await blobStorage.listFiles({});
  const docProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Document Lifecycle Test Device',
      brand: 'Anker',
      category_id: 1,
      purchase_date: '2026-09-01',
      purchase_price: 99.00
    }
  });
  const docProdId = docProdRes.data?.data?.id;
  const secondDocProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${demoToken}` },
    body: {
      name: 'Second Document Lifecycle Device',
      brand: 'Belkin',
      category_id: 1,
      purchase_date: '2026-09-02',
      purchase_price: 49.00
    }
  });
  const secondDocProdId = secondDocProdRes.data?.data?.id;
  const uploadRootDir = config.UPLOAD_DIR;

  // Upload valid PDF document
  const pdfPayloadBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
  const validUploadMp = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Invoice' },
    { filename: 'invoice-anker-2026.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const uploadRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': validUploadMp.contentType,
      'Content-Length': String(validUploadMp.buffer.length)
    },
    body: validUploadMp.buffer
  });
  const uploadedDocId = uploadRes.data?.data?.id;
  const uploadedDocRows = uploadedDocId
    ? await db.query('SELECT * FROM Documents WHERE id = ?;', [uploadedDocId])
    : [];
  const uploadedDocRow = uploadedDocRows[0];
  const uploadedDiskPath = uploadedDocRow ? path.resolve(uploadRootDir, uploadedDocRow.storage_path) : '';
  assert(
    uploadRes.status === 201 &&
    uploadRes.data.success &&
    uploadedDocRow &&
    uploadedDocRow.user_id === 2 &&
    uploadedDocRow.product_id === docProdId &&
    uploadedDocRow.storage_path.startsWith('user_2/') &&
    fs.existsSync(uploadedDiskPath),
    'Document upload succeeds, stores file in user-scoped folder, and links user_id + product_id in database'
  );

  // List documents & verify association
  const listDocsRes = await simulateRequest({
    method: 'GET',
    url: `/api/documents?product_id=${docProdId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(
    listDocsRes.status === 200 &&
    listDocsRes.data.data.some((d) => d.id === uploadedDocId && d.original_name === 'invoice-anker-2026.pdf'),
    'GET /api/documents returns newly uploaded document linked to product'
  );

  // Download document and verify exact bytes & headers
  const downloadRes = await simulateRequest({
    method: 'GET',
    url: `/api/documents/${uploadedDocId}/download`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(
    downloadRes.status === 200 &&
    Buffer.isBuffer(downloadRes.rawBuffer) &&
    downloadRes.rawBuffer.equals(pdfPayloadBytes) &&
    /attachment;/i.test(downloadRes.headers['content-disposition'] || '') &&
    downloadRes.headers['x-content-type-options'] === 'nosniff',
    'GET /api/documents/:id/download streams exact file bytes with attachment + nosniff headers'
  );

  // Cross-user isolation (IDOR checks for download, delete, and cross-user upload)
  const crossDownloadRes = await simulateRequest({
    method: 'GET',
    url: `/api/documents/${uploadedDocId}/download`,
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  const crossDeleteRes = await simulateRequest({
    method: 'DELETE',
    url: `/api/documents/${uploadedDocId}`,
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  const crossUploadMp = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Invoice' },
    { filename: 'hijack.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const crossUploadRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${otherToken}`,
      'Content-Type': crossUploadMp.contentType,
      'Content-Length': String(crossUploadMp.buffer.length)
    },
    body: crossUploadMp.buffer
  });
  assert(
    crossDownloadRes.status === 404 &&
    crossDeleteRes.status === 404 &&
    crossUploadRes.status === 404,
    'Cross-user document download, delete, and upload against another user product are blocked (404)'
  );

  // Validate product_id & repair_id must be valid positive integers
  const invalidIdsChecks = [];
  for (const badProdId of ['', 'abc', '1.5', '0', '-2', '12abc']) {
    const mp = buildMultipartPayload(
      { product_id: badProdId, document_type: 'Invoice' },
      { filename: 'bad-prod-id.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
    );
    const r = await simulateRequest({
      method: 'POST',
      url: '/api/documents/upload',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': mp.contentType,
        'Content-Length': String(mp.buffer.length)
      },
      body: mp.buffer
    });
    invalidIdsChecks.push(r.status === 400 && !r.data.success);
  }
  for (const badRepId of ['abc', '2.5', '0', '-7', '9abc']) {
    const mp = buildMultipartPayload(
      { product_id: docProdId, repair_id: badRepId, document_type: 'Repair Receipt' },
      { filename: 'bad-repair-id.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
    );
    const r = await simulateRequest({
      method: 'POST',
      url: '/api/documents/upload',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': mp.contentType,
        'Content-Length': String(mp.buffer.length)
      },
      body: mp.buffer
    });
    invalidIdsChecks.push(r.status === 400 && !r.data.success);
  }
  const badQueryProdRes = await simulateRequest({
    method: 'GET',
    url: '/api/documents?product_id=notanint',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  const badQueryRepRes = await simulateRequest({
    method: 'GET',
    url: '/api/documents?repair_id=-1',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  const badParamProdRes = await simulateRequest({
    method: 'GET',
    url: '/api/products/notanint',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  assert(
    invalidIdsChecks.every(Boolean) &&
    badQueryProdRes.status === 400 &&
    badQueryRepRes.status === 400 &&
    badParamProdRes.status === 400,
    'Upload, query, and route validation reject non-integer/zero/negative product_id and repair_id with HTTP 400'
  );

  // Repair association checks: valid same-product+user succeeds (201); different product same user rejected (400); missing or other user repair rejected (404)
  const validRepairDocMp = buildMultipartPayload(
    { product_id: newProdId, repair_id: newRepairId, document_type: 'Repair Receipt' },
    { filename: 'valid-repair-receipt.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const validRepairDocRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': validRepairDocMp.contentType,
      'Content-Length': String(validRepairDocMp.buffer.length)
    },
    body: validRepairDocMp.buffer
  });
  const validRepairDocId = validRepairDocRes.data?.data?.id;
  if (validRepairDocId) {
    await simulateRequest({
      method: 'DELETE',
      url: `/api/documents/${validRepairDocId}`,
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
  }

  const mismatchRepairDocMp = buildMultipartPayload(
    { product_id: secondDocProdId, repair_id: newRepairId, document_type: 'Repair Receipt' },
    { filename: 'wrong-product-repair.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const mismatchRepairDocRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': mismatchRepairDocMp.contentType,
      'Content-Length': String(mismatchRepairDocMp.buffer.length)
    },
    body: mismatchRepairDocMp.buffer
  });

  const sarahProdRes = await simulateRequest({
    method: 'POST',
    url: '/api/products',
    headers: { 'Authorization': `Bearer ${otherToken}` },
    body: {
      name: 'Sarah Isolation Phone',
      brand: 'Google',
      category_id: 2,
      purchase_date: '2026-09-01',
      purchase_price: 799
    }
  });
  const sarahProdId = sarahProdRes.data?.data?.id;
  const sarahRepairRes = await simulateRequest({
    method: 'POST',
    url: '/api/repairs',
    headers: { 'Authorization': `Bearer ${otherToken}` },
    body: {
      product_id: sarahProdId,
      repair_date: '2026-09-05',
      service_center: 'Google Repair Lab',
      issue_description: 'Battery calibration check',
      cost: 0
    }
  });
  const sarahRepairId = sarahRepairRes.data?.data?.id;
  const crossUserRepairDocMp = buildMultipartPayload(
    { product_id: docProdId, repair_id: sarahRepairId, document_type: 'Repair Receipt' },
    { filename: 'cross-user-repair.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const crossUserRepairDocRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': crossUserRepairDocMp.contentType,
      'Content-Length': String(crossUserRepairDocMp.buffer.length)
    },
    body: crossUserRepairDocMp.buffer
  });
  await simulateRequest({
    method: 'DELETE',
    url: `/api/products/${sarahProdId}`,
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });

  const badRepairDocMp = buildMultipartPayload(
    { product_id: docProdId, repair_id: 999999, document_type: 'Repair Receipt' },
    { filename: 'orphan-repair.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const badRepairDocRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': badRepairDocMp.contentType,
      'Content-Length': String(badRepairDocMp.buffer.length)
    },
    body: badRepairDocMp.buffer
  });

  assert(
    validRepairDocRes.status === 201 &&
    validRepairDocRes.data.data.repair_id === newRepairId &&
    mismatchRepairDocRes.status === 400 &&
    crossUserRepairDocRes.status === 404 &&
    badRepairDocRes.status === 404,
    'repair_id allows matching product+user (201) and blocks cross-product (400), cross-user (404), and nonexistent repairs (404)'
  );

  // Validation: dangerous extensions (even spoofed MIME), invalid MIME types, mismatched PDF extension, empty 0-byte file, invalid document_type
  const dangerousCases = [
    { filename: 'malware.exe', contentType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
    { filename: 'spoofed.sh', contentType: 'application/pdf', buffer: pdfPayloadBytes },
    { filename: 'payload.exe.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes },
    { filename: 'xss.svg', contentType: 'image/svg+xml', buffer: Buffer.from('<svg></svg>') },
    { filename: 'script.ps1 ', contentType: 'image/png', buffer: Buffer.from('test') },
    { filename: 'notes.txt', contentType: 'text/plain', buffer: Buffer.from('hello') },
    { filename: 'mismatch.pdf', contentType: 'image/png', buffer: Buffer.from('not-a-pdf') }
  ];
  const dangerousStatuses = [];
  for (const tc of dangerousCases) {
    const mp = buildMultipartPayload(
      { product_id: docProdId, document_type: 'Invoice' },
      tc
    );
    const r = await simulateRequest({
      method: 'POST',
      url: '/api/documents/upload',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': mp.contentType,
        'Content-Length': String(mp.buffer.length)
      },
      body: mp.buffer
    });
    dangerousStatuses.push(r.status);
  }

  const emptyFileMp = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Invoice' },
    { filename: 'empty.pdf', contentType: 'application/pdf', buffer: Buffer.alloc(0) }
  );
  const emptyFileRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': emptyFileMp.contentType,
      'Content-Length': String(emptyFileMp.buffer.length)
    },
    body: emptyFileMp.buffer
  });

  const badTypeMp = buildMultipartPayload(
    { product_id: docProdId, document_type: 'NotAllowedType' },
    { filename: 'typecheck.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const badTypeRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': badTypeMp.contentType,
      'Content-Length': String(badTypeMp.buffer.length)
    },
    body: badTypeMp.buffer
  });

  // 10 MB upload limit enforcement check (10 MB + 1 byte rejected with HTTP 400)
  const oversizedMp = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Invoice' },
    { filename: 'oversized.pdf', contentType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x25) }
  );
  const oversizedRes = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': oversizedMp.contentType,
      'Content-Length': String(oversizedMp.buffer.length)
    },
    body: oversizedMp.buffer
  });

  assert(
    dangerousStatuses.every((s) => s === 400) &&
    emptyFileRes.status === 400 &&
    badTypeRes.status === 400 &&
    uploadMiddleware.limits.fileSize === 10 * 1024 * 1024 &&
    oversizedRes.status === 400,
    'Upload rejects dangerous/invalid extensions & MIME types (400), 0-byte empty files (400), invalid document_type (400), and >10 MB files (400)'
  );

  // DB insert failure rollback: delete uploaded file if Documents DB INSERT fails (no orphan blobs/files)
  const filesBeforeRollback = await blobStorage.listFiles({ userId: 2 });
  const docsCountBeforeRollback = (await db.query('SELECT COUNT(*) AS count FROM Documents;'))[0].count;
  const origDbRun = db.run;
  const origUploadFile = blobStorage.uploadFile;
  const origDeleteFile = blobStorage.deleteFile;
  let capturedRollbackUpload = null;
  let rollbackDeleteCall = null;
  let rollbackRes = null;

  try {
    blobStorage.uploadFile = async (...args) => {
      const res = await origUploadFile(...args);
      capturedRollbackUpload = res;
      return res;
    };
    blobStorage.deleteFile = async (storagePath, storageType) => {
      rollbackDeleteCall = { storagePath, storageType };
      return origDeleteFile(storagePath, storageType);
    };
    db.run = async (sqlText, params) => {
      if (/INSERT\s+INTO\s+Documents\b/i.test(sqlText)) {
        throw new Error('Simulated DB insert failure after storage upload');
      }
      return origDbRun(sqlText, params);
    };

    const rollbackMp = buildMultipartPayload(
      { product_id: docProdId, document_type: 'Invoice' },
      { filename: 'rollback-orphan-check.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
    );
    rollbackRes = await simulateRequest({
      method: 'POST',
      url: '/api/documents/upload',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': rollbackMp.contentType,
        'Content-Length': String(rollbackMp.buffer.length)
      },
      body: rollbackMp.buffer
    });
  } finally {
    db.run = origDbRun;
    blobStorage.uploadFile = origUploadFile;
    blobStorage.deleteFile = origDeleteFile;
  }

  const filesAfterRollback = await blobStorage.listFiles({ userId: 2 });
  const docsCountAfterRollback = (await db.query('SELECT COUNT(*) AS count FROM Documents;'))[0].count;
  const rolledBackDiskPath = capturedRollbackUpload
    ? path.resolve(uploadRootDir, capturedRollbackUpload.storagePath)
    : '';
  assert(
    rollbackRes &&
    rollbackRes.status === 500 &&
    capturedRollbackUpload &&
    rollbackDeleteCall &&
    rollbackDeleteCall.storagePath === capturedRollbackUpload.storagePath &&
    rollbackDeleteCall.storageType === capturedRollbackUpload.storageType &&
    !fs.existsSync(rolledBackDiskPath) &&
    filesAfterRollback.length === filesBeforeRollback.length &&
    docsCountAfterRollback === docsCountBeforeRollback,
    'DB insert failure after upload rolls back and deletes uploaded file cleanly with zero orphans'
  );

  // Also verify rollback behavior when storageType is AzureBlob
  let azureRollbackDeleted = null;
  try {
    blobStorage.uploadFile = async () => ({
      storageType: 'AzureBlob',
      storagePath: 'user_2/1700000000000-azure-rollback.pdf',
      fileName: '1700000000000-azure-rollback.pdf'
    });
    blobStorage.deleteFile = async (storagePath, storageType) => {
      azureRollbackDeleted = { storagePath, storageType };
      return true;
    };
    db.run = async (sqlText, params) => {
      if (/INSERT\s+INTO\s+Documents\b/i.test(sqlText)) {
        throw new Error('Simulated Azure SQL insert failure');
      }
      return origDbRun(sqlText, params);
    };
    const azRollbackMp = buildMultipartPayload(
      { product_id: docProdId, document_type: 'Invoice' },
      { filename: 'azure-rollback.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
    );
    await simulateRequest({
      method: 'POST',
      url: '/api/documents/upload',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': azRollbackMp.contentType,
        'Content-Length': String(azRollbackMp.buffer.length)
      },
      body: azRollbackMp.buffer
    });
  } finally {
    db.run = origDbRun;
    blobStorage.uploadFile = origUploadFile;
    blobStorage.deleteFile = origDeleteFile;
  }
  assert(
    azureRollbackDeleted &&
    azureRollbackDeleted.storagePath === 'user_2/1700000000000-azure-rollback.pdf' &&
    azureRollbackDeleted.storageType === 'AzureBlob',
    'DB insert failure after AzureBlob upload calls blobStorage.deleteFile with AzureBlob storageType'
  );

  // Delete single document & verify file + DB record removed
  const deleteDocRes = await simulateRequest({
    method: 'DELETE',
    url: `/api/documents/${uploadedDocId}`,
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  const docAfterDelete = await db.query('SELECT COUNT(*) AS count FROM Documents WHERE id = ?;', [uploadedDocId]);
  assert(
    deleteDocRes.status === 200 &&
    docAfterDelete[0].count === 0 &&
    !fs.existsSync(uploadedDiskPath),
    'DELETE /api/documents/:id removes both stored file and database record'
  );

  // Upload TWO files + one synthetic AzureBlob DB record to verify product deletion cleans up ALL files/blobs BEFORE deleting DB records
  const pngHeaderBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const cascadeUploadMp1 = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Warranty Card' },
    { filename: 'warranty-card-cascade.pdf', contentType: 'application/pdf', buffer: pdfPayloadBytes }
  );
  const cascadeUploadMp2 = buildMultipartPayload(
    { product_id: docProdId, document_type: 'Other' },
    { filename: 'product-photo-cascade.png', contentType: 'image/png', buffer: pngHeaderBytes }
  );
  const cascadeUploadRes1 = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': cascadeUploadMp1.contentType,
      'Content-Length': String(cascadeUploadMp1.buffer.length)
    },
    body: cascadeUploadMp1.buffer
  });
  const cascadeUploadRes2 = await simulateRequest({
    method: 'POST',
    url: '/api/documents/upload',
    headers: {
      'Authorization': `Bearer ${demoToken}`,
      'Content-Type': cascadeUploadMp2.contentType,
      'Content-Length': String(cascadeUploadMp2.buffer.length)
    },
    body: cascadeUploadMp2.buffer
  });
  const cascadeDocId1 = cascadeUploadRes1.data?.data?.id;
  const cascadeDocId2 = cascadeUploadRes2.data?.data?.id;

  // Insert one synthetic AzureBlob metadata record attached to the same product
  const azureRowInsert = await db.run(
    `INSERT INTO Documents (
      product_id, user_id, repair_id, document_type,
      file_name, original_name, file_size, mime_type,
      storage_path, storage_type
    ) VALUES (?, ?, NULL, 'Invoice', 'fake-blob.pdf', 'fake-blob.pdf', 128, 'application/pdf', 'user_2/fake-blob.pdf', 'AzureBlob');`,
    [docProdId, 2]
  );
  const azureSyntheticDocId = azureRowInsert.lastInsertRowid;

  const cascadeDocsRows = await db.query(
    'SELECT id, storage_path, storage_type FROM Documents WHERE product_id = ? ORDER BY id ASC;',
    [docProdId]
  );
  const localDiskCascadePaths = cascadeDocsRows
    .filter((d) => d.storage_type === 'LocalDisk')
    .map((d) => path.resolve(uploadRootDir, d.storage_path));

  const deleteOrderEvents = [];
  try {
    blobStorage.deleteFile = async (storagePath, storageType) => {
      const docsStillInDb = (await db.query('SELECT COUNT(*) AS count FROM Documents WHERE product_id = ?;', [docProdId]))[0].count;
      const prodStillInDb = (await db.query('SELECT COUNT(*) AS count FROM Products WHERE id = ?;', [docProdId]))[0].count;
      deleteOrderEvents.push({ storagePath, storageType, docsStillInDb, prodStillInDb });
      if (storageType === 'AzureBlob') return true;
      return origDeleteFile(storagePath, storageType);
    };

    await simulateRequest({
      method: 'DELETE',
      url: `/api/products/${docProdId}`,
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    await simulateRequest({
      method: 'DELETE',
      url: `/api/products/${secondDocProdId}`,
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
  } finally {
    blobStorage.deleteFile = origDeleteFile;
  }

  const cascadeDocsRemaining = await db.query('SELECT COUNT(*) AS count FROM Documents WHERE product_id = ?;', [docProdId]);
  const finalStoredFiles = await blobStorage.listFiles({});
  assert(
    deleteOrderEvents.length === 3 &&
    deleteOrderEvents.every((ev) => ev.docsStillInDb === 3 && ev.prodStillInDb === 1) &&
    deleteOrderEvents.some((ev) => ev.storageType === 'AzureBlob' && ev.storagePath === 'user_2/fake-blob.pdf') &&
    cascadeDocsRemaining[0].count === 0 &&
    localDiskCascadePaths.every((p) => !fs.existsSync(p)) &&
    finalStoredFiles.length === initialStoredFiles.length,
    'Deleting product deletes ALL associated AzureBlob and LocalDisk files BEFORE deleting DB records with zero leftover uploads'
  );

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
  const tempUserUploadDir = path.join(config.UPLOAD_DIR, 'user_2');
  fs.mkdirSync(tempUserUploadDir, { recursive: true });
  const tempStorageCheckFile = path.join(tempUserUploadDir, 'storage-list-check.pdf');
  fs.writeFileSync(tempStorageCheckFile, pdfPayloadBytes);
  const userStorageRes = await simulateRequest({
    method: 'GET',
    url: '/api/documents/storage',
    headers: { 'Authorization': `Bearer ${demoToken}` }
  });
  if (fs.existsSync(tempStorageCheckFile)) {
    fs.unlinkSync(tempStorageCheckFile);
  }
  assert(
    userStorageRes.status === 200 &&
    userStorageRes.data.success &&
    userStorageRes.data.container === 'warranty-documents' &&
    Array.isArray(userStorageRes.data.data) &&
    userStorageRes.data.data.length >= 1 &&
    userStorageRes.data.data.every((f) => f.storagePath.startsWith('user_2/')),
    'GET /api/documents/storage lists user-scoped files inside storage container'
  );

  // Non-destructive schema.sql + SQL batch splitting + read-only local snapshot check
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  const viewsSql = fs.readFileSync(path.resolve(__dirname, '../../database/views.sql'), 'utf8');
  const triggersSql = fs.readFileSync(path.resolve(__dirname, '../../database/triggers.sql'), 'utf8');
  const snapshot = await readLocalSnapshot();
  const hasAllTablesInSchema = REQUIRED_TABLES.every((t) =>
    new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${t}\\b`, 'i').test(schemaSql)
  );
  const hasAllIndexesInSchema = EXPECTED_INDEXES.every((ix) =>
    new RegExp(`CREATE\\s+NONCLUSTERED\\s+INDEX\\s+${ix}\\b`, 'i').test(schemaSql)
  );
  assert(
    !/DROP\s+TABLE/i.test(schemaSql) &&
    /IF\s+OBJECT_ID\(N'dbo\.Users',\s*N'U'\)\s+IS\s+NULL/i.test(schemaSql) &&
    hasAllTablesInSchema &&
    hasAllIndexesInSchema &&
    DEFAULT_CATEGORIES.length === 6 &&
    splitSqlBatches(viewsSql).length === 3 &&
    /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+dbo\.Users/i.test(triggersSql) &&
    snapshot.Users.length >= 3 &&
    snapshot.Products.length >= 8,
    'database/schema.sql defines all 7 tables + 9 indexes idempotently, triggers.sql guards user deletion, and local SQLite data is intact'
  );

  // Managed Identity override ignores SQL user/password; explicit sql mode rejects missing credentials
  const forcedMsiConfig = db.buildAzureSqlConfig({
    server: 'warrantywise-sql-2026.database.windows.net',
    database: 'WarrantyWiseDB',
    authMode: 'managed_identity',
    user: 'ignored_user',
    password: 'ignored_password'
  });
  let missingSqlCredsError = null;
  try {
    db.buildAzureSqlConfig({
      server: 'warrantywise-sql-2026.database.windows.net',
      database: 'WarrantyWiseDB',
      authMode: 'sql',
      user: '',
      password: ''
    });
  } catch (err) {
    missingSqlCredsError = err.message;
  }
  assert(
    forcedMsiConfig.authentication?.type === 'azure-active-directory-default' &&
    !('user' in forcedMsiConfig) &&
    !('password' in forcedMsiConfig) &&
    /DB_USER and DB_PASSWORD are required/i.test(missingSqlCredsError || ''),
    'Managed Identity ignores SQL credentials and DB_AUTH_MODE=sql rejects missing credentials'
  );

  // Production guard: NODE_ENV=production must NEVER silently fall back to Local SQLite
  const { execFileSync } = require('child_process');
  let prodNoServerError = '';
  try {
    execFileSync(
      process.execPath,
      ['-e', "const db = require('./services/db'); db.initDb().catch((e) => { console.error(e.message); process.exit(42); });"],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'ci-verification-secret-only',
          DB_SERVER: '',
          ALLOW_SQLITE_IN_PRODUCTION: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (err) {
    prodNoServerError = String(err.stderr || err.message || '');
  }
  const loginTips = classifyAzureSqlError(new Error("Login failed for user '<token-identified principal>'."));
  assert(
    /Local SQLite fallback is disabled in production/i.test(prodNoServerError) &&
    loginTips.some((t) => /CREATE USER \[warrantywise-web-123\] FROM EXTERNAL PROVIDER/i.test(t)),
    'Production mode refuses Local SQLite fallback when DB_SERVER is unset and diagnostic classifies Managed Identity SQL login errors'
  );

  // Production guard: NODE_ENV=production must NEVER silently fall back to Local Disk storage
  let prodNoStorageError = '';
  try {
    execFileSync(
      process.execPath,
      ['-e', "const blob = require('./services/blobStorage'); blob.initStorage();"],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'ci-verification-secret-only',
          AZURE_STORAGE_ACCOUNT_NAME: '',
          ALLOW_LOCAL_STORAGE_IN_PRODUCTION: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (err) {
    prodNoStorageError = String(err.stderr || err.message || '');
  }
  const blobRbacTips = classifyAzureBlobError({ code: 'AuthorizationPermissionMismatch', statusCode: 403, message: '403' });
  assert(
    /Local disk storage fallback is disabled in production/i.test(prodNoStorageError) &&
    blobRbacTips.some((t) => /Storage Blob Data Contributor/i.test(t)),
    'Production mode refuses Local Disk storage fallback when AZURE_STORAGE_ACCOUNT_NAME is unset and diagnostic classifies Storage Blob Data Contributor 403'
  );

  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
  } finally {
    config.LOCAL_DB_PATH = origLocalDbPath;
    config.UPLOAD_DIR = origUploadDir;
    await db.closeDb().catch(() => {});
    fs.rmSync(testSandboxDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}
