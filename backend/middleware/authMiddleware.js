const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../services/db');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : req.query.token; // allow query token for direct file downloads

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Fetch current user from database to verify account status
    const users = await db.query(
      'SELECT id, full_name, email, role, phone FROM Users WHERE id = ?;',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. User no longer exists.'
      });
    }

    req.user = users[0];
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
}

module.exports = {
  authenticateToken
};

