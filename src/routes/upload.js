const express = require('express');
const router = express.Router();
const { uploadToR2, getPresignedUploadUrl } = require('../utils/storage');
const { extractText } = require('../utils/doc-parser');

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
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
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/openbrain/${key}`;

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

    const url = await uploadToR2(key, buffer, contentType);

    const result = { url, key };

    // Extract text from documents
    if (DOCUMENT_TYPES.includes(contentType)) {
      try {
        result.extracted_text = await extractText(buffer, contentType);
      } catch (err) {
        // Non-fatal — return upload result without extracted text
        console.error('Text extraction failed:', err.message);
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
