const pdfParse = require('pdf-parse');

const MAX_LENGTH = 15000;

const TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
];

/**
 * Extract text content from a document buffer.
 * @param {Buffer} buffer - The file buffer
 * @param {string} mimeType - The MIME type of the file
 * @returns {Promise<string|null>} Extracted text or null for unsupported types
 */
async function extractText(buffer, mimeType) {
  let text;

  if (mimeType === 'application/pdf') {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (TEXT_TYPES.includes(mimeType)) {
    text = buffer.toString('utf-8');
  } else {
    return null;
  }

  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH);
  }

  return text;
}

module.exports = { extractText };
