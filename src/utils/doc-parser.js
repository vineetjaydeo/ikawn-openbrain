const pdfParse = require('pdf-parse');
const path = require('path');

const MAX_LENGTH = 15000;

const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
];

/** Map file extensions to MIME types for when contentType is missing */
const EXT_TO_MIME = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'text/xml',
  '.json': 'application/json',
  '.svg': 'text/xml',
  '.odt': 'text/plain', // best-effort: raw XML inside, some text extractable
};

/**
 * Guess MIME type from a filename when contentType is unavailable.
 * @param {string} filename
 * @returns {string|null}
 */
function guessMimeFromFilename(filename) {
  if (!filename) return null;
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] || null;
}

/**
 * Strip HTML tags for basic text extraction from HTML content.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text content from a document buffer.
 * @param {Buffer} buffer - The file buffer
 * @param {string} mimeType - The MIME type of the file
 * @param {string} [filename] - Original filename (used as MIME fallback)
 * @returns {Promise<string|null>} Extracted text or null for unsupported types
 */
async function extractText(buffer, mimeType, filename) {
  const resolvedMime = mimeType || guessMimeFromFilename(filename);
  if (!resolvedMime) return null;

  let text;

  if (resolvedMime === 'application/pdf') {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (resolvedMime === 'text/html') {
    text = stripHtml(buffer.toString('utf-8'));
  } else if (TEXT_MIME_TYPES.includes(resolvedMime)) {
    text = buffer.toString('utf-8');
  } else {
    return null;
  }

  if (!text || !text.trim()) return null;

  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH) + '\n\n[... truncated at 15,000 characters]';
  }

  return text;
}

/** MIME types that extractText can handle */
const SUPPORTED_MIME_TYPES = ['application/pdf', ...TEXT_MIME_TYPES];

module.exports = { extractText, guessMimeFromFilename, SUPPORTED_MIME_TYPES };
