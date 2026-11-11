const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../services/db');
const { logActivity } = require('../services/activityLogService');

/**
 * Register a new user
 */
async function register(req, res, next) {
  try {
    const { full_name, email, password, phone } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.query('SELECT id FROM Users WHERE LOWER(email) = ?;', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    // Hash password with bcrypt salt rounds = 10
    const passwordHash = await bcrypt.hash(password, 10);

    // Default first registered user to Admin if database is empty, otherwise User
    const allUsers = await db.query('SELECT COUNT(*) AS total FROM Users;');
    const role = allUsers[0].total === 0 ? 'Admin' : 'User';

    const insertResult = await db.run(
      `INSERT INTO Users (full_name, email, password_hash, role, phone)
       VALUES (?, ?, ?, ?, ?);`,
      [full_name.trim(), cleanEmail, passwordHash, role, phone || null]
    );

    const newUserId = insertResult.lastInsertRowid;

    // Issue JWT token
    const token = jwt.sign(
      { id: newUserId, email: cleanEmail, role: role, full_name: full_name.trim() },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    await logActivity({
      userId: newUserId,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: newUserId,
      details: `User registered with email ${cleanEmail}`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to WarrantyWise.',
      token,
      user: {
        id: newUserId,
        full_name: full_name.trim(),
        email: cleanEmail,
        role: role,
        phone: phone || null
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticate existing user
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const users = await db.query(
      'SELECT id, full_name, email, password_hash, role, phone FROM Users WHERE LOWER(email) = ?;',
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please verify your credentials.'
      });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      await logActivity({
        userId: user.id,
        action: 'FAILED_LOGIN_ATTEMPT',
        entityType: 'User',
        entityId: user.id,
        details: 'Incorrect password entered',
        ipAddress: req.ip
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please verify your credentials.'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    await logActivity({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: 'User successfully logged in',
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get profile of currently logged-in user
 */
async function getMe(req, res, next) {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update personal profile
 */
async function updateProfile(req, res, next) {
  try {
    const { full_name, phone } = req.body;

    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters long.'
      });
    }

    await db.run(
      'UPDATE Users SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
      [full_name.trim(), phone || null, req.user.id]
    );

    await logActivity({
      userId: req.user.id,
      action: 'PROFILE_UPDATED',
      entityType: 'User',
      entityId: req.user.id,
      details: 'Updated profile details'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        ...req.user,
        full_name: full_name.trim(),
        phone: phone || null
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Change account password
 */
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    const users = await db.query('SELECT password_hash FROM Users WHERE id = ?;', [req.user.id]);
    const match = await bcrypt.compare(current_password, users[0].password_hash);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Current password provided is incorrect.'
      });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await db.run(
      'UPDATE Users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
      [newHash, req.user.id]
    );

    await logActivity({
      userId: req.user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: req.user.id,
      details: 'User successfully changed account password'
    });

    res.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword
};

