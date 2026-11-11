const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// All admin routes require authenticated Admin role
router.use(authenticateToken, requireRole('Admin'));

router.get('/users', adminController.getAllUsers);
router.put('/users/:id/role', adminController.updateUserRole);
router.get('/stats', adminController.getSystemStats);
router.get('/activity-logs', adminController.getActivityLogs);

module.exports = router;

