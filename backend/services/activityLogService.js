const db = require('./db');

/**
 * Log an audit or user activity into ActivityLogs
 */
async function logActivity({ userId, action, entityType, entityId = null, details = '', ipAddress = '' }) {
  try {
    await db.run(
      `INSERT INTO ActivityLogs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [userId || null, action, entityType, entityId, details, ipAddress]
    );
  } catch (err) {
    console.warn(`[ActivityLog] Failed to log activity "${action}": ${err.message}`);
  }
}

module.exports = {
  logActivity
};

