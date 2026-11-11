const db = require('../services/db');
const { logActivity } = require('../services/activityLogService');

/**
 * Get all repair records for current user with product details
 */
async function getRepairs(req, res, next) {
  try {
    const userId = req.user.id;
    const { product_id, status, q } = req.query;

    let sql = `
      SELECT 
        r.id, r.product_id, r.user_id, r.repair_date, r.service_center,
        r.issue_description, r.cost, r.status, r.technician_notes,
        r.completion_date, r.created_at,
        p.name AS product_name, p.brand AS product_brand, p.serial_number,
        c.name AS category_name, c.icon AS category_icon
      FROM Repairs r
      INNER JOIN Products p ON r.product_id = p.id
      INNER JOIN Categories c ON p.category_id = c.id
      WHERE r.user_id = ?
    `;
    const params = [userId];

    if (product_id) {
      sql += ' AND r.product_id = ?';
      params.push(parseInt(product_id, 10));
    }

    if (status) {
      sql += ' AND LOWER(r.status) = LOWER(?)';
      params.push(status);
    }

    if (q && q.trim().length > 0) {
      const term = `%${q.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(p.name) LIKE ? OR 
        LOWER(r.service_center) LIKE ? OR 
        LOWER(r.issue_description) LIKE ?
      )`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY r.repair_date DESC;';

    const repairs = await db.query(sql, params);

    // Compute total expenditure
    const totalExpenditure = repairs.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    res.json({
      success: true,
      count: repairs.length,
      total_expenditure: totalExpenditure,
      data: repairs
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new repair entry
 */
async function createRepair(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      product_id,
      repair_date,
      service_center,
      issue_description,
      cost,
      status,
      technician_notes,
      completion_date
    } = req.body;

    // Verify user owns the product
    const prodCheck = await db.query(
      'SELECT id, name FROM Products WHERE id = ? AND user_id = ?;',
      [product_id, userId]
    );

    if (prodCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    const costNum =
      cost === undefined || cost === null || (typeof cost === 'string' && cost.trim() === '')
        ? 0.0
        : parseFloat(cost) || 0.0;
    const repairStatus = status || 'Completed';

    const insertResult = await db.run(
      `INSERT INTO Repairs (
        product_id, user_id, repair_date, service_center,
        issue_description, cost, status, technician_notes, completion_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        parseInt(product_id, 10),
        userId,
        repair_date,
        service_center.trim(),
        issue_description.trim(),
        costNum,
        repairStatus,
        technician_notes ? technician_notes.trim() : null,
        completion_date || (repairStatus === 'Completed' ? repair_date : null)
      ]
    );

    const newRepairId = insertResult.lastInsertRowid;

    await logActivity({
      userId,
      action: 'REPAIR_LOGGED',
      entityType: 'Repair',
      entityId: newRepairId,
      details: `Logged repair for "${prodCheck[0].name}" at "${service_center}" ($${costNum})`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Repair record logged successfully.',
      data: {
        id: newRepairId,
        product_id,
        service_center,
        cost: costNum,
        status: repairStatus
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing repair entry
 */
async function updateRepair(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT id, product_id FROM Repairs WHERE id = ?;'
      : 'SELECT id, product_id FROM Repairs WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [id] : [id, userId];

    const check = await db.query(checkSql, checkParams);
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair record not found or access denied.' });
    }

    const {
      repair_date,
      service_center,
      issue_description,
      cost,
      status,
      technician_notes,
      completion_date
    } = req.body;

    const normalizedCost =
      cost === undefined || cost === null || (typeof cost === 'string' && cost.trim() === '')
        ? 0.0
        : parseFloat(cost) || 0.0;

    await db.run(
      `UPDATE Repairs SET
        repair_date = ?, service_center = ?, issue_description = ?,
        cost = ?, status = ?, technician_notes = ?, completion_date = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [
        repair_date,
        service_center.trim(),
        issue_description.trim(),
        normalizedCost,
        status || 'Completed',
        technician_notes || null,
        completion_date || null,
        id
      ]
    );

    await logActivity({
      userId,
      action: 'REPAIR_UPDATED',
      entityType: 'Repair',
      entityId: id,
      details: `Updated repair record #${id}`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Repair record updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a repair record
 */
async function deleteRepair(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT id FROM Repairs WHERE id = ?;'
      : 'SELECT id FROM Repairs WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [id] : [id, userId];

    const check = await db.query(checkSql, checkParams);
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair record not found or access denied.' });
    }

    // Unlink any documents referencing this repair
    await db.run('UPDATE Documents SET repair_id = NULL WHERE repair_id = ?;', [id]);
    await db.run('DELETE FROM Repairs WHERE id = ?;', [id]);

    await logActivity({
      userId,
      action: 'REPAIR_DELETED',
      entityType: 'Repair',
      entityId: id,
      details: `Deleted repair record #${id}`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Repair record deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRepairs,
  createRepair,
  updateRepair,
  deleteRepair
};

