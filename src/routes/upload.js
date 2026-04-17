const express = require('express');
const router = express.Router();
const { uploadToR2, getPresignedUploadUrl } = require('../utils/storage');
const { extractText, extractStructured, isTabularMime } = require('../utils/doc-parser');
const { captureMessage } = require('../utils/capture');
const { pool } = require('../db');

function normalizeFileType(mime, filename) {
  if (!mime && !filename) return 'other';
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('presentationml') || m.includes('powerpoint')) return 'pptx';
  if (m.includes('wordprocessingml') || m.includes('msword')) return 'docx';
  if (m.includes('spreadsheetml') || m.includes('excel')) return 'xlsx';
  if (m === 'text/csv') return 'csv';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('text/')) return 'text';
  const ext = (filename || '').split('.').pop().toLowerCase();
  const extMap = { pdf: 'pdf', pptx: 'pptx', ppt: 'pptx', docx: 'docx', doc: 'docx', xlsx: 'xlsx', xls: 'xlsx', csv: 'csv', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', txt: 'text', md: 'text' };
  return extMap[ext] || 'other';
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

const MAX_FILES_PER_UPLOAD = 5;

const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'application/vnd.ms-outlook',
  'application/vnd.apple.keynote',
  'application/vnd.apple.pages',
  'application/vnd.apple.numbers',
];

function sanitizeFilename(filename) {
  return filename
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildKey(userId, filename) {
  const sanitized = sanitizeFilename(filename);
  return `uploads/${userId}/${Date.now()}_${sanitized}`;
}

// Get a presigned URL for direct client-to-R2 upload
router.post('/api/upload/presign', async (req, res, next) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const key = buildKey(req.session.user.id, filename);
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600, req.brand_id);
    const brandPrefix = `openbrain/${req.brand_id || 'ikawn'}/`;
    const publicUrl = `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/${brandPrefix}${key}`;

    res.json({ uploadUrl, publicUrl, key });
  } catch (err) {
    next(err);
  }
});

// Server-side upload for smaller files (base64 encoded)
router.post('/api/upload/direct', async (req, res, next) => {
  try {
    const { data, filename, contentType } = req.body;

    if (!data || !filename || !contentType) {
      return res.status(400).json({ error: 'data, filename, and contentType are required' });
    }

    // Check size (base64 string length * 0.75 approximates decoded byte size)
    const estimatedBytes = data.length * 0.75;
    if (estimatedBytes > MAX_UPLOAD_SIZE) {
      return res.status(413).json({ error: 'File exceeds 10MB limit' });
    }

    const buffer = Buffer.from(data, 'base64');
    const key = buildKey(req.session.user.id, filename);

    const url = await uploadToR2(key, buffer, contentType, req.brand_id);

    // Auto-capture to vault
    pool.query(
      `INSERT INTO vault_items (brand_id, user_id, filename, file_url, file_key, file_type, mime_type, file_size, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'upload')
       ON CONFLICT (file_url) WHERE deleted_at IS NULL DO NOTHING`,
      [req.brand_id, req.session.user.id, filename, url, key, normalizeFileType(contentType, filename), contentType, buffer.length]
    ).catch(err => console.warn('[Vault] Upload capture failed:', err.message));

    const result = { url, key };

    // Extract text from documents
    if (DOCUMENT_TYPES.includes(contentType)) {
      try {
        const tabular = isTabularMime(contentType);
        if (tabular) {
          const structured = await extractStructured(buffer, contentType, filename);
          if (structured) {
            result.extracted_text = structured.text;
            result.structured_metadata = structured.metadata;
          }
        } else {
          result.extracted_text = await extractText(buffer, contentType, filename);
        }
      } catch (err) {
        // Non-fatal — return upload result without extracted text
        console.error('Text extraction failed:', err.message);
      }
    }

    // Auto-capture extracted document text to memory (fire-and-forget)
    if (result.extracted_text && result.extracted_text.length > 50) {
      const tabular = isTabularMime(contentType);
      const memoryCapture = {
        brand_id: req.brand_id || 'ikawn',
        user_id: req.session?.user?.id,
        channel: 'file_upload',
        direction: 'inbound',
        content: `[Uploaded ${tabular ? 'dataset' : 'file'}: ${filename}]\n\n${result.extracted_text.substring(0, 50000)}`,
        source_ref: `upload-${key}`,
        access_level: 'private',
        memory_type: tabular ? 'dataset' : 'document',
      };

      if (tabular && result.structured_metadata) {
        memoryCapture.metadata = {
          type: 'dataset',
          filename,
          rowCount: result.structured_metadata.rowCount,
          columns: result.structured_metadata.columns,
          sheets: result.structured_metadata.sheets || null,
          key,
        };
      }

      captureMessage(memoryCapture);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
