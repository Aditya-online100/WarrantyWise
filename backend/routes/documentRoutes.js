const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticateToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(authenticateToken);

router.get('/', documentController.getDocuments);
router.get('/storage', documentController.listStorageObjects);
router.post('/upload', upload.single('file'), documentController.uploadDocument);
router.get('/:id/download', documentController.downloadDocument);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;

