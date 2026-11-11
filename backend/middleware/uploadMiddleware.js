const path = require('path');
const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes max limit

// Memory storage for direct streaming to Azure Blob or local disk
const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
];

const allowedExtensions = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.png',
  '.webp',
  '.gif'
]);

const blockedExtensions = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.msi', '.dll', '.sys',
  '.scr', '.com', '.pif', '.jar', '.hta', '.cpl', '.msc', '.js', '.mjs',
  '.cjs', '.vbs', '.vbe', '.wsf', '.wsh', '.php', '.phtml', '.asp', '.aspx',
  '.jsp', '.jspx', '.cgi', '.pl', '.py', '.rb', '.html', '.htm', '.xhtml',
  '.svg', '.lnk', '.reg', '.inf', '.app', '.dmg', '.pkg', '.deb', '.rpm'
]);

function badUploadError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function fileFilter(req, file, cb) {
  const normalizedName = path.posix
    .basename(String(file.originalname || '').replace(/\\/g, '/').replace(/\0/g, ''))
    .trim()
    .replace(/\.+$/, '');

  const dotSegments = normalizedName.toLowerCase().split('.').slice(1);
  for (const seg of dotSegments) {
    if (!seg) continue;
    const candidateExt = `.${seg.trim()}`;
    if (blockedExtensions.has(candidateExt)) {
      return cb(
        badUploadError(`Blocked file extension (${candidateExt}). Executable or script files are not allowed.`),
        false
      );
    }
  }

  const ext = path.posix.extname(normalizedName).toLowerCase();
  const mime = String(file.mimetype || '').trim().toLowerCase();

  if (!allowedMimeTypes.includes(mime)) {
    return cb(
      badUploadError(`Unsupported file type (${file.mimetype}). Only PDF, JPEG, PNG, GIF, and WebP are allowed.`),
      false
    );
  }

  if (!ext || !allowedExtensions.has(ext)) {
    return cb(
      badUploadError(`Unsupported file extension (${ext || 'none'}). Only PDF, JPG, JPEG, PNG, GIF, and WebP files are allowed.`),
      false
    );
  }

  if (ext === '.pdf' && mime !== 'application/pdf') {
    return cb(
      badUploadError(`File extension (${ext}) does not match declared MIME type (${file.mimetype}).`),
      false
    );
  }

  if (ext !== '.pdf' && mime === 'application/pdf') {
    return cb(
      badUploadError(`File extension (${ext}) does not match declared PDF MIME type (${file.mimetype}).`),
      false
    );
  }

  return cb(null, true);
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter: fileFilter
});

upload.MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
upload.allowedMimeTypes = allowedMimeTypes;
upload.allowedExtensions = allowedExtensions;
upload.blockedExtensions = blockedExtensions;

module.exports = upload;

