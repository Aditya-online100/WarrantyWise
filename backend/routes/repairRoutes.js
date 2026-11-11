const express = require('express');
const router = express.Router();
const repairController = require('../controllers/repairController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validateRepair } = require('../middleware/validationMiddleware');

router.use(authenticateToken);

router.get('/', repairController.getRepairs);
router.post('/', validateRepair, repairController.createRepair);
router.put('/:id', validateRepair, repairController.updateRepair);
router.delete('/:id', repairController.deleteRepair);

module.exports = router;

