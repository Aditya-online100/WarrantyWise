const multer = require('multer');

// Memory storage for direct streaming to Azure Blob or local disk
const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
];

function fileFilter(req, file, cb) {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type (${file.mimetype}). Only PDF, JPEG, PNG, and WebP are allowed.`), false);
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 Megabytes max limit
  },
  fileFilter: fileFilter
});

module.exports = upload;

