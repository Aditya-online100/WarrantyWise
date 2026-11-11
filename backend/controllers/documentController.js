const path = require('path');
const db = require('../services/db');
const blobStorage = require('../services/blobStorage');
const { logActivity } = require('../services/activityLogService');

const ALLOWED_DOCUMENT_TYPES = [
  'Invoice',
  'Warranty Card',
  'Repair Receipt',
  'User Manual',
  'Other'
];

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

function parsePositiveInt(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val > 0 ? val : NaN;
  }
  const trimmed = String(val).trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return NaN;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : NaN;
}

/**
 * Get all documents for user, optionally filtered by product_id / repair_id
 */
async function getDocuments(req, res, next) {
  try {
    const userId = req.user.id;
    const { product_id, repair_id, document_type } = req.query;

    let sql = `
      SELECT 
        d.id, d.product_id, d.user_id, d.repair_id, d.document_type,
        d.file_name, d.original_name, d.file_size, d.mime_type,
        d.storage_type, d.upload_date,
        p.name AS product_name, p.brand AS product_brand,
        c.name AS category_name
      FROM Documents d
      INNER JOIN Products p ON d.product_id = p.id
      INNER JOIN Categories c ON p.category_id = c.id
      WHERE d.user_id = ?
    `;
    const params = [userId];

    if (product_id !== undefined && String(product_id).trim() !== '') {
      const parsedFilterProductId = parsePositiveInt(product_id);
      if (!parsedFilterProductId || Number.isNaN(parsedFilterProductId)) {
        return res.status(400).json({ success: false, message: 'Product ID filter must be a valid positive integer.' });
      }
      sql += ' AND d.product_id = ?';
      params.push(parsedFilterProductId);
    }

    if (repair_id !== undefined && String(repair_id).trim() !== '') {
      const parsedFilterRepairId = parsePositiveInt(repair_id);
      if (!parsedFilterRepairId || Number.isNaN(parsedFilterRepairId)) {
        return res.status(400).json({ success: false, message: 'Repair ID filter must be a valid positive integer.' });
      }
      sql += ' AND d.repair_id = ?';
      params.push(parsedFilterRepairId);
    }

    if (document_type) {
      sql += ' AND LOWER(d.document_type) = LOWER(?)';
      params.push(document_type);
    }

    sql += ' ORDER BY d.upload_date DESC;';

    const documents = await db.query(sql, params);

    res.json({
      success: true,
      count: documents.length,
      data: documents
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Upload a new document (Invoice, Warranty Card, Receipt)
 */
async function uploadDocument(req, res, next) {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    const bufferSize = Buffer.isBuffer(file.buffer) ? file.buffer.length : file.size;
    if (!file.size || file.size <= 0 || !bufferSize || bufferSize <= 0) {
      return res.status(400).json({ success: false, message: 'Uploaded file cannot be empty (0 bytes).' });
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES || bufferSize > MAX_UPLOAD_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: 'File size exceeds maximum allowed limit of 10 MB.' });
    }

    const { product_id, repair_id, document_type } = req.body;
    const parsedProductId = parsePositiveInt(product_id);
    if (!parsedProductId || Number.isNaN(parsedProductId)) {
      return res.status(400).json({ success: false, message: 'A valid integer Product ID is required to link document.' });
    }

    const parsedRepairId = parsePositiveInt(repair_id);
    if (Number.isNaN(parsedRepairId)) {
      return res.status(400).json({ success: false, message: 'Repair ID must be a valid positive integer.' });
    }

    const docType = document_type ? String(document_type).trim() : 'Invoice';
    if (!ALLOWED_DOCUMENT_TYPES.includes(docType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid document type "${docType}". Allowed values: ${ALLOWED_DOCUMENT_TYPES.join(', ')}.`
      });
    }

    // Verify product ownership before storing any file
    const prodCheck = await db.query(
      'SELECT id, name FROM Products WHERE id = ? AND user_id = ?;',
      [parsedProductId, userId]
    );

    if (prodCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    // Verify repair ownership and that repair_id belongs to this same product
    if (parsedRepairId) {
      const repairRows = await db.query(
        'SELECT id, product_id FROM Repairs WHERE id = ? AND user_id = ?;',
        [parsedRepairId, userId]
      );
      if (repairRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Associated repair record not found or access denied.'
        });
      }
      if (Number(repairRows[0].product_id) !== parsedProductId) {
        return res.status(400).json({
          success: false,
          message: 'Associated repair record does not belong to the specified product.'
        });
      }
    }

    // Upload to Azure Blob Storage (private container) or Local Disk
    const uploadResult = await blobStorage.uploadFile(file, userId);

    const safeOriginalName = path.basename(String(file.originalname || 'document'));
    let insertResult;
    try {
      insertResult = await db.run(
        `INSERT INTO Documents (
          product_id, user_id, repair_id, document_type,
          file_name, original_name, file_size, mime_type,
          storage_path, storage_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          parsedProductId,
          userId,
          parsedRepairId || null,
          docType,
          uploadResult.fileName,
          safeOriginalName,
          file.size,
          file.mimetype,
          uploadResult.storagePath,
          uploadResult.storageType
        ]
      );
      if (!insertResult || !insertResult.lastInsertRowid) {
        throw new Error('Failed to persist document database record.');
      }
    } catch (dbErr) {
      // Prevent orphaned blobs/files if database insert fails
      await blobStorage.deleteFile(uploadResult.storagePath, uploadResult.storageType).catch((cleanupErr) => {
        console.error(`[Storage] Rollback cleanup failed for orphaned file ${uploadResult.storagePath}: ${cleanupErr.message}`);
      });
      throw dbErr;
    }

    const newDocId = insertResult.lastInsertRowid;

    await logActivity({
      userId,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: newDocId,
      details: `Uploaded ${docType} "${safeOriginalName}" (${uploadResult.storageType})`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      data: {
        id: newDocId,
        product_id: parsedProductId,
        repair_id: parsedRepairId || null,
        document_type: docType,
        original_name: safeOriginalName,
        file_size: file.size,
        storage_type: uploadResult.storageType
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download a document securely
 */
async function downloadDocument(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.id);
    if (!docId || Number.isNaN(docId)) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT * FROM Documents WHERE id = ?;'
      : 'SELECT * FROM Documents WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [docId] : [docId, userId];

    const docs = await db.query(checkSql, checkParams);
    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }

    const doc = docs[0];
    const fileData = await blobStorage.getFileStream(doc.storage_path, doc.storage_type);
    const asciiFallback = String(doc.original_name || 'document')
      .replace(/["\\\r\n]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_');

    res.setHeader('Content-Type', doc.mime_type || fileData.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name || 'document')}`
    );
    if (fileData.contentLength) {
      res.setHeader('Content-Length', fileData.contentLength);
    }

    fileData.stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        next(streamErr);
      } else {
        res.destroy(streamErr);
      }
    });
    fileData.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a document
 */
async function deleteDocument(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.id);
    if (!docId || Number.isNaN(docId)) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT * FROM Documents WHERE id = ?;'
      : 'SELECT * FROM Documents WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [docId] : [docId, userId];

    const docs = await db.query(checkSql, checkParams);
    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }

    const doc = docs[0];

    // Remove from physical/cloud storage before deleting DB row
    if (doc.storage_path) {
      await blobStorage.deleteFile(doc.storage_path, doc.storage_type);
    }

    // Remove from DB
    await db.run('DELETE FROM Documents WHERE id = ?;', [docId]);

    await logActivity({
      userId,
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: docId,
      details: `Deleted document "${doc.original_name}"`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Document "${doc.original_name}" deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List stored objects directly from Azure Blob Storage / Local Disk scoped to current user (or all for Admin)
 */
async function listStorageObjects(req, res, next) {
  try {
    const isAdmin = req.user.role === 'Admin';
    let targetUserId = isAdmin ? null : req.user.id;
    if (isAdmin && req.query.user_id !== undefined && String(req.query.user_id).trim() !== '') {
      const parsedUserId = parsePositiveInt(req.query.user_id);
      if (!parsedUserId || Number.isNaN(parsedUserId)) {
        return res.status(400).json({ success: false, message: 'User ID filter must be a valid positive integer.' });
      }
      targetUserId = parsedUserId;
    }

    const files = await blobStorage.listFiles({ userId: targetUserId });

    res.json({
      success: true,
      storage_mode: blobStorage.getStorageMode(),
      container: blobStorage.getContainerName(),
      count: files.length,
      data: files
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ALLOWED_DOCUMENT_TYPES,
  getDocuments,
  listStorageObjects,
  uploadDocument,
  downloadDocument,
  deleteDocument
};

