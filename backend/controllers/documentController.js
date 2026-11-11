const db = require('../services/db');
const blobStorage = require('../services/blobStorage');
const { logActivity } = require('../services/activityLogService');

/**
 * Get all documents for user, optionally filtered by productId
 */
async function getDocuments(req, res, next) {
  try {
    const userId = req.user.id;
    const { product_id, document_type } = req.query;

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

    if (product_id) {
      sql += ' AND d.product_id = ?';
      params.push(parseInt(product_id, 10));
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

    const { product_id, repair_id, document_type } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Product ID is required to link document.' });
    }

    // Verify product ownership
    const prodCheck = await db.query(
      'SELECT id, name FROM Products WHERE id = ? AND user_id = ?;',
      [product_id, userId]
    );

    if (prodCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    // Upload to Azure Blob Storage or Local Disk
    const uploadResult = await blobStorage.uploadFile(file, userId);

    const docType = document_type || 'Invoice';

    const insertResult = await db.run(
      `INSERT INTO Documents (
        product_id, user_id, repair_id, document_type,
        file_name, original_name, file_size, mime_type,
        storage_path, storage_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        parseInt(product_id, 10),
        userId,
        repair_id ? parseInt(repair_id, 10) : null,
        docType,
        uploadResult.fileName,
        file.originalname,
        file.size,
        file.mimetype,
        uploadResult.storagePath,
        uploadResult.storageType
      ]
    );

    const newDocId = insertResult.lastInsertRowid;

    await logActivity({
      userId,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: newDocId,
      details: `Uploaded ${docType} "${file.originalname}" (${uploadResult.storageType})`,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      data: {
        id: newDocId,
        product_id,
        document_type: docType,
        original_name: file.originalname,
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
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT * FROM Documents WHERE id = ?;'
      : 'SELECT * FROM Documents WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [id] : [id, userId];

    const docs = await db.query(checkSql, checkParams);
    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }

    const doc = docs[0];
    const fileData = await blobStorage.getFileStream(doc.storage_path, doc.storage_type);

    res.setHeader('Content-Type', doc.mime_type || fileData.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_name)}"`);
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
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'Admin';

    const checkSql = isAdmin
      ? 'SELECT * FROM Documents WHERE id = ?;'
      : 'SELECT * FROM Documents WHERE id = ? AND user_id = ?;';
    const checkParams = isAdmin ? [id] : [id, userId];

    const docs = await db.query(checkSql, checkParams);
    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
    }

    const doc = docs[0];

    // Remove from physical/cloud storage
    await blobStorage.deleteFile(doc.storage_path, doc.storage_type);

    // Remove from DB
    await db.run('DELETE FROM Documents WHERE id = ?;', [id]);

    await logActivity({
      userId,
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: id,
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
    const targetUserId = isAdmin && req.query.user_id
      ? parseInt(req.query.user_id, 10)
      : (isAdmin ? null : req.user.id);

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
  getDocuments,
  listStorageObjects,
  uploadDocument,
  downloadDocument,
  deleteDocument
};

