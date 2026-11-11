const express = require('express');
const router = express.Router();
const warrantyController = require('../controllers/warrantyController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/', warrantyController.getWarranties);
router.put('/:id', warrantyController.updateWarranty);

module.exports = router;

