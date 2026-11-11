const db = require('../services/db');
const { logActivity } = require('../services/activityLogService');

/**
 * Get all users across system (Admin only)
 */
async function getAllUsers(req, res, next) {
  try {
    const users = await db.query(
      `SELECT 
        u.id, u.full_name, u.email, u.role, u.phone, u.created_at,
        COUNT(p.id) AS total_products
      FROM Users u
      LEFT JOIN Products p ON u.id = p.user_id
      GROUP BY u.id, u.full_name, u.email, u.role, u.phone, u.created_at
      ORDER BY u.created_at DESC;`
    );

    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update user role (e.g. promote to Admin or demote to User)
 */
async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['User', 'Admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be "User" or "Admin".' });
    }

    if (parseInt(id, 10) === req.user.id && role !== 'Admin') {
      return res.status(400).json({ success: false, message: 'You cannot demote yourself from Admin status.' });
    }

    await db.run('UPDATE Users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [role, id]);

    await logActivity({
      userId: req.user.id,
      action: 'ADMIN_ROLE_UPDATED',
      entityType: 'User',
      entityId: id,
      details: `Updated user #${id} role to "${role}"`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `User role successfully updated to "${role}".`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get system-wide metrics and stats for Admin Dashboard
 */
async function getSystemStats(req, res, next) {
  try {
    const userCount = await db.query('SELECT COUNT(*) AS total FROM Users;');
    const productCount = await db.query('SELECT COUNT(*) AS total FROM Products;');
    const warrantyCount = await db.query('SELECT COUNT(*) AS total FROM Warranties;');
    const repairCount = await db.query('SELECT COUNT(*) AS total, COALESCE(SUM(cost), 0) AS total_spend FROM Repairs;');
    const documentCount = await db.query('SELECT COUNT(*) AS total FROM Documents;');

    res.json({
      success: true,
      data: {
        total_users: userCount[0].total,
        total_products: productCount[0].total,
        total_warranties: warrantyCount[0].total,
        total_repairs: repairCount[0].total,
        total_repair_spend: repairCount[0].total_spend,
        total_documents: documentCount[0].total,
        database_engine: db.getDbMode()
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Builds dialect-specific SQL for ActivityLogs retrieval (TOP for Azure SQL T-SQL, LIMIT for SQLite).
 */
function buildActivityLogsSql(dbMode) {
  if (dbMode === 'AZURE_SQL') {
    return `SELECT TOP (?)
        l.id, l.user_id, l.action, l.entity_type, l.entity_id,
        l.details, l.ip_address, l.created_at,
        u.full_name AS user_name, u.email AS user_email
      FROM ActivityLogs l
      LEFT JOIN Users u ON l.user_id = u.id
      ORDER BY l.created_at DESC;`;
  }

  return `SELECT 
        l.id, l.user_id, l.action, l.entity_type, l.entity_id,
        l.details, l.ip_address, l.created_at,
        u.full_name AS user_name, u.email AS user_email
      FROM ActivityLogs l
      LEFT JOIN Users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT ?;`;
}

/**
 * Get platform activity logs (Admin audit trail)
 */
async function getActivityLogs(req, res, next) {
  try {
    const { limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const sql = buildActivityLogsSql(db.getDbMode());

    const logs = await db.query(sql, [safeLimit]);

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllUsers,
  updateUserRole,
  getSystemStats,
  getActivityLogs,
  buildActivityLogsSql
};

