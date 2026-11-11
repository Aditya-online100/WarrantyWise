const db = require('../services/db');
const { logActivity } = require('../services/activityLogService');

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
 * Get all warranties for current user with product details
 */
async function getWarranties(req, res, next) {
  try {
    const userId = req.user.id;
    const { status, q } = req.query;

    let sql = `
      SELECT 
        w.id, w.product_id, w.provider_name, w.policy_number, w.warranty_type,
        w.duration_months, w.start_date, w.end_date, w.coverage_details,
        w.support_contact, w.status AS stored_status,
        p.name AS product_name, p.brand, p.model_number, p.serial_number,
        p.purchase_date, p.purchase_price, p.currency,
        c.name AS category_name, c.icon AS category_icon
      FROM Warranties w
      INNER JOIN Products p ON w.product_id = p.id
      INNER JOIN Categories c ON p.category_id = c.id
      WHERE p.user_id = ?
    `;
    const params = [userId];

    if (q && q.trim().length > 0) {
      const term = `%${q.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(p.name) LIKE ? OR 
        LOWER(p.brand) LIKE ? OR 
        LOWER(w.provider_name) LIKE ? OR 
        LOWER(COALESCE(w.policy_number, '')) LIKE ?
      )`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY w.end_date ASC;';

    const rows = await db.query(sql, params);

    const warranties = rows.map(w => {
      const calc = computeWarrantyStatus(w.end_date);
      return {
        ...w,
        status: calc.status,
        days_remaining: calc.daysRemaining
      };
    });

    const filtered = status
      ? warranties.filter(w => w.status.toLowerCase() === status.toLowerCase())
      : warranties;

    res.json({
      success: true,
      count: filtered.length,
      data: filtered
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update warranty record
 */
async function updateWarranty(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    // Verify ownership via product
    const checkSql = isAdmin
      ? 'SELECT w.id, w.product_id, p.name AS product_name FROM Warranties w INNER JOIN Products p ON w.product_id = p.id WHERE w.id = ?;'
      : 'SELECT w.id, w.product_id, p.name AS product_name FROM Warranties w INNER JOIN Products p ON w.product_id = p.id WHERE w.id = ? AND p.user_id = ?;';
    const checkParams = isAdmin ? [id] : [id, userId];

    const check = await db.query(checkSql, checkParams);
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Warranty record not found or access denied.' });
    }

    const {
      provider_name,
      policy_number,
      warranty_type,
      duration_months,
      start_date,
      end_date,
      coverage_details,
      support_contact
    } = req.body;

    const calc = computeWarrantyStatus(end_date);

    await db.run(
      `UPDATE Warranties SET
        provider_name = ?, policy_number = ?, warranty_type = ?,
        duration_months = ?, start_date = ?, end_date = ?,
        coverage_details = ?, support_contact = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [
        provider_name ? provider_name.trim() : 'Manufacturer Warranty',
        policy_number || null,
        warranty_type || 'Manufacturer',
        parseInt(duration_months, 10) || 12,
        start_date,
        end_date,
        coverage_details || null,
        support_contact || null,
        calc.status,
        id
      ]
    );

    await logActivity({
      userId,
      action: 'WARRANTY_UPDATED',
      entityType: 'Warranty',
      entityId: id,
      details: `Updated warranty terms for "${check[0].product_name}"`
    });

    res.json({
      success: true,
      message: 'Warranty details updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWarranties,
  updateWarranty
};

