const db = require('../services/db');
const blobStorage = require('../services/blobStorage');
const { logActivity } = require('../services/activityLogService');

function parsePositiveInt(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val > 0 ? val : NaN;
  }
  const trimmed = String(val).trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return NaN;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : NaN;
}

/**
 * Helper to compute status and days remaining for a warranty
 */
function computeWarrantyStatus(endDateStr) {
  if (!endDateStr) return { status: 'Expired', daysRemaining: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = 'Active';
  if (diffDays < 0) {
    status = 'Expired';
  } else if (diffDays <= 30) {
    status = 'Expiring Soon';
  }

  return { status, daysRemaining: diffDays };
}

/**
 * Get all products for user with search, filter, and pagination
 */
async function getProducts(req, res, next) {
  try {
    const userId = req.user.id;
    const { q, category_id, status, brand, sort_by } = req.query;

    let sql = `
      SELECT 
        p.id, p.user_id, p.category_id, p.name, p.brand, p.model_number, p.serial_number,
        p.purchase_date, p.purchase_price, p.currency, p.retailer, p.notes,
        c.name AS category_name, c.icon AS category_icon,
        w.id AS warranty_id, w.provider_name AS warranty_provider, w.policy_number,
        w.warranty_type, w.duration_months, w.start_date AS warranty_start,
        w.end_date AS warranty_end, w.status AS warranty_status, w.support_contact,
        COALESCE(r.repair_count, 0) AS total_repairs,
        COALESCE(r.total_repair_cost, 0.0) AS total_repair_expenditure
      FROM Products p
      INNER JOIN Categories c ON p.category_id = c.id
      LEFT JOIN Warranties w ON p.id = w.product_id
      LEFT JOIN (
        SELECT product_id, COUNT(id) AS repair_count, SUM(cost) AS total_repair_cost
        FROM Repairs
        GROUP BY product_id
      ) r ON p.id = r.product_id
      WHERE p.user_id = ?
    `;

    const params = [userId];

    if (category_id !== undefined && String(category_id).trim() !== '') {
      const parsedCategoryId = parsePositiveInt(category_id);
      if (!parsedCategoryId || Number.isNaN(parsedCategoryId)) {
        return res.status(400).json({ success: false, message: 'Category ID must be a valid positive integer.' });
      }
      sql += ' AND p.category_id = ?';
      params.push(parsedCategoryId);
    }

    if (brand) {
      sql += ' AND LOWER(p.brand) = LOWER(?)';
      params.push(brand);
    }

    if (q && q.trim().length > 0) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(p.name) LIKE ? OR 
        LOWER(p.brand) LIKE ? OR 
        LOWER(COALESCE(p.model_number, '')) LIKE ? OR 
        LOWER(COALESCE(p.serial_number, '')) LIKE ? OR 
        LOWER(COALESCE(w.provider_name, '')) LIKE ?
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Dynamic sorting
    switch (sort_by) {
      case 'price_desc':
        sql += ' ORDER BY p.purchase_price DESC';
        break;
      case 'price_asc':
        sql += ' ORDER BY p.purchase_price ASC';
        break;
      case 'warranty_expiring':
        sql += ' ORDER BY w.end_date ASC';
        break;
      case 'name_asc':
        sql += ' ORDER BY p.name ASC';
        break;
      default:
        sql += ' ORDER BY p.created_at DESC';
    }

    const rows = await db.query(sql, params);

    // Compute dynamic live warranty status and days remaining
    const products = rows.map(prod => {
      const calc = computeWarrantyStatus(prod.warranty_end);
      return {
        ...prod,
        warranty_status: prod.warranty_end ? calc.status : 'None',
        days_remaining: prod.warranty_end ? calc.daysRemaining : null
      };
    });

    // Post-filter by status if requested
    const filteredProducts = status 
      ? products.filter(p => p.warranty_status.toLowerCase() === status.toLowerCase())
      : products;

    res.json({
      success: true,
      count: filteredProducts.length,
      data: filteredProducts
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get product details by ID (including warranty, repairs, documents)
 */
async function getProductById(req, res, next) {
  try {
    const productId = parsePositiveInt(req.params.id);
    if (!productId || Number.isNaN(productId)) {
      return res.status(400).json({ success: false, message: 'Product ID must be a valid positive integer.' });
    }
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    let sql = `
      SELECT 
        p.*, c.name AS category_name, c.icon AS category_icon,
        u.full_name AS owner_name, u.email AS owner_email
      FROM Products p
      INNER JOIN Categories c ON p.category_id = c.id
      INNER JOIN Users u ON p.user_id = u.id
      WHERE p.id = ?
    `;
    const params = [productId];

    if (!isAdmin) {
      sql += ' AND p.user_id = ?';
      params.push(userId);
    }

    const products = await db.query(sql, params);

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied.'
      });
    }

    const product = products[0];

    // Fetch Warranty
    const warranties = await db.query('SELECT * FROM Warranties WHERE product_id = ?;', [productId]);
    let warranty = warranties.length > 0 ? warranties[0] : null;
    if (warranty) {
      const calc = computeWarrantyStatus(warranty.end_date);
      warranty = {
        ...warranty,
        status: calc.status,
        days_remaining: calc.daysRemaining
      };
    }

    // Fetch Repairs
    const repairs = await db.query(
      'SELECT * FROM Repairs WHERE product_id = ? ORDER BY repair_date DESC;',
      [productId]
    );

    // Fetch Documents
    const documents = await db.query(
      'SELECT id, document_type, file_name, original_name, file_size, mime_type, upload_date FROM Documents WHERE product_id = ? ORDER BY upload_date DESC;',
      [productId]
    );

    // Total repair cost
    const totalRepairCost = repairs.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    res.json({
      success: true,
      data: {
        ...product,
        warranty,
        repairs,
        documents,
        total_repair_expenditure: totalRepairCost,
        total_cost_of_ownership: (parseFloat(product.purchase_price) || 0) + totalRepairCost
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new product and attached warranty
 */
async function createProduct(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      name,
      brand,
      category_id,
      model_number,
      serial_number,
      purchase_date,
      purchase_price,
      currency,
      retailer,
      notes,
      // Warranty information
      provider_name,
      policy_number,
      warranty_type,
      duration_months,
      start_date,
      end_date,
      coverage_details,
      support_contact
    } = req.body;

    const priceNum =
      purchase_price === undefined ||
      purchase_price === null ||
      (typeof purchase_price === 'string' && purchase_price.trim() === '')
        ? 0.0
        : parseFloat(purchase_price) || 0.0;

    // Insert Product
    const insertProd = await db.run(
      `INSERT INTO Products (
        user_id, category_id, name, brand, model_number, serial_number,
        purchase_date, purchase_price, currency, retailer, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        userId,
        parseInt(category_id, 10),
        name.trim(),
        brand.trim(),
        model_number ? model_number.trim() : null,
        serial_number ? serial_number.trim() : null,
        purchase_date,
        priceNum,
        currency || 'USD',
        retailer ? retailer.trim() : null,
        notes ? notes.trim() : null
      ]
    );

    const newProductId = insertProd.lastInsertRowid;

    // Insert Warranty if provided
    let newWarrantyId = null;
    let warrantyObj = null;

    if (provider_name || duration_months || end_date) {
      const pName = provider_name && provider_name.trim().length > 0 ? provider_name.trim() : `${brand.trim()} Manufacturer Warranty`;
      const wMonths = duration_months ? parseInt(duration_months, 10) : 12;
      const wStart = start_date || purchase_date;

      // Compute end date if not explicitly supplied
      let wEnd = end_date;
      if (!wEnd) {
        const d = new Date(wStart);
        d.setMonth(d.getMonth() + wMonths);
        wEnd = d.toISOString().split('T')[0];
      }

      const calc = computeWarrantyStatus(wEnd);

      const insertWty = await db.run(
        `INSERT INTO Warranties (
          product_id, provider_name, policy_number, warranty_type,
          duration_months, start_date, end_date, coverage_details,
          support_contact, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          newProductId,
          pName,
          policy_number ? policy_number.trim() : null,
          warranty_type || 'Manufacturer',
          wMonths,
          wStart,
          wEnd,
          coverage_details ? coverage_details.trim() : null,
          support_contact ? support_contact.trim() : null,
          calc.status
        ]
      );

      newWarrantyId = insertWty.lastInsertRowid;
      warrantyObj = {
        id: newWarrantyId,
        provider_name: pName,
        duration_months: wMonths,
        start_date: wStart,
        end_date: wEnd,
        status: calc.status,
        days_remaining: calc.daysRemaining
      };
    }

    await logActivity({
      userId,
      action: 'PRODUCT_REGISTERED',
      entityType: 'Product',
      entityId: newProductId,
      details: `Registered product "${name}" (Brand: ${brand})`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Product registered successfully!',
      data: {
        id: newProductId,
        user_id: userId,
        name,
        brand,
        category_id,
        purchase_date,
        purchase_price: priceNum,
        warranty: warrantyObj
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing product and its warranty
 */
async function updateProduct(req, res, next) {
  try {
    const productId = parsePositiveInt(req.params.id);
    if (!productId || Number.isNaN(productId)) {
      return res.status(400).json({ success: false, message: 'Product ID must be a valid positive integer.' });
    }
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    // Verify ownership
    const checkSql = isAdmin 
      ? 'SELECT id FROM Products WHERE id = ?;'
      : 'SELECT id FROM Products WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [productId] : [productId, userId];

    const existing = await db.query(checkSql, checkParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    const {
      name,
      brand,
      category_id,
      model_number,
      serial_number,
      purchase_date,
      purchase_price,
      currency,
      retailer,
      notes,
      // Warranty fields
      provider_name,
      policy_number,
      warranty_type,
      duration_months,
      start_date,
      end_date,
      coverage_details,
      support_contact
    } = req.body;

    const normalizedPrice =
      purchase_price === undefined ||
      purchase_price === null ||
      (typeof purchase_price === 'string' && purchase_price.trim() === '')
        ? 0.0
        : parseFloat(purchase_price) || 0.0;

    await db.run(
      `UPDATE Products SET 
        name = ?, brand = ?, category_id = ?, model_number = ?, serial_number = ?,
        purchase_date = ?, purchase_price = ?, currency = ?, retailer = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [
        name.trim(),
        brand.trim(),
        parseInt(category_id, 10),
        model_number ? model_number.trim() : null,
        serial_number ? serial_number.trim() : null,
        purchase_date,
        normalizedPrice,
        currency || 'USD',
        retailer ? retailer.trim() : null,
        notes ? notes.trim() : null,
        productId
      ]
    );

    // Update or Insert Warranty
    if (provider_name || end_date) {
      const existingWty = await db.query('SELECT id FROM Warranties WHERE product_id = ?;', [productId]);
      const calc = computeWarrantyStatus(end_date);

      if (existingWty.length > 0) {
        await db.run(
          `UPDATE Warranties SET
            provider_name = ?, policy_number = ?, warranty_type = ?,
            duration_months = ?, start_date = ?, end_date = ?,
            coverage_details = ?, support_contact = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?;`,
          [
            provider_name,
            policy_number || null,
            warranty_type || 'Manufacturer',
            parseInt(duration_months, 10) || 12,
            start_date || purchase_date,
            end_date,
            coverage_details || null,
            support_contact || null,
            calc.status,
            existingWty[0].id
          ]
        );
      } else {
        await db.run(
          `INSERT INTO Warranties (
            product_id, provider_name, policy_number, warranty_type,
            duration_months, start_date, end_date, coverage_details,
            support_contact, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            productId,
            provider_name,
            policy_number || null,
            warranty_type || 'Manufacturer',
            parseInt(duration_months, 10) || 12,
            start_date || purchase_date,
            end_date,
            coverage_details || null,
            support_contact || null,
            calc.status
          ]
        );
      }
    }

    await logActivity({
      userId,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: productId,
      details: `Updated product "${name}"`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Product updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a product
 */
async function deleteProduct(req, res, next) {
  try {
    const productId = parsePositiveInt(req.params.id);
    if (!productId || Number.isNaN(productId)) {
      return res.status(400).json({ success: false, message: 'Product ID must be a valid positive integer.' });
    }
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin 
      ? 'SELECT id, name FROM Products WHERE id = ?;'
      : 'SELECT id, name FROM Products WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [productId] : [productId, userId];

    const prods = await db.query(checkSql, checkParams);
    if (prods.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    const prodName = prods[0].name;

    // Delete all associated document blobs/files before removing database records
    const attachedDocs = await db.query(
      'SELECT id, storage_path, storage_type FROM Documents WHERE product_id = ?;',
      [productId]
    );
    for (const doc of attachedDocs) {
      if (doc && doc.storage_path) {
        await blobStorage.deleteFile(doc.storage_path, doc.storage_type);
      }
    }

    // Delete cascading
    await db.run('DELETE FROM Documents WHERE product_id = ?;', [productId]);
    await db.run('DELETE FROM Repairs WHERE product_id = ?;', [productId]);
    await db.run('DELETE FROM Warranties WHERE product_id = ?;', [productId]);
    await db.run('DELETE FROM Products WHERE id = ?;', [productId]);

    await logActivity({
      userId,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: productId,
      details: `Deleted product "${prodName}"`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Product "${prodName}" and all associated records deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};

