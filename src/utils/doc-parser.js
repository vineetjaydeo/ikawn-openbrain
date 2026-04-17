const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const officeparser = require('officeparser');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LENGTH = 50000;

const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
];

const OFFICEPARSER_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'application/vnd.ms-outlook',
  'application/vnd.apple.keynote',
  'application/vnd.apple.pages',
  'application/vnd.apple.numbers',
];

const OFFICEPARSER_EXT_MAP = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/rtf': '.rtf',
  'application/vnd.ms-outlook': '.msg',
  'application/vnd.apple.keynote': '.key',
  'application/vnd.apple.pages': '.pages',
  'application/vnd.apple.numbers': '.numbers',
};

const XLSX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
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
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.msg': 'application/vnd.ms-outlook',
  '.key': 'application/vnd.apple.keynote',
  '.pages': 'application/vnd.apple.pages',
  '.numbers': 'application/vnd.apple.numbers',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
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
 * Lightweight CSV parser that handles quoted fields with commas.
 * @param {string} text - Raw CSV text
 * @returns {{ headers: string[], rows: string[][] }}
 */
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      lines.push(current);
      current = '';
      if (ch === '\r') i++; // skip \n in \r\n
    } else if (ch === '\r' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  function splitRow(line) {
    const fields = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push(splitRow(lines[i]));
  }

  return { headers, rows };
}

/**
 * Format CSV data into structured text for LLM consumption.
 * @param {string} rawText - Raw CSV text
 * @returns {{ text: string, metadata: { type: string, rowCount: number, columns: string[] } }}
 */
function formatCSV(rawText) {
  const { headers, rows } = parseCSV(rawText);
  if (headers.length === 0) return { text: rawText, metadata: null };

  const parts = ['[CSV Data]'];
  parts.push(`Columns: ${headers.join(', ')}`);

  for (let i = 0; i < rows.length; i++) {
    parts.push(`Row ${i + 1}: ${rows[i].join(', ')}`);
  }

  if (rows.length > 0) {
    parts.push(`\n(${rows.length} rows total)`);
  }

  return {
    text: parts.join('\n'),
    metadata: { type: 'dataset', rowCount: rows.length, columns: headers },
  };
}

/**
 * Extract structured text from an XLSX buffer using ExcelJS.
 * @param {Buffer} buffer
 * @returns {Promise<{ text: string, metadata: { type: string, rowCount: number, columns: string[], sheets: string[] } }>}
 */
async function formatXLSX(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const parts = [];
  const allColumns = [];
  const sheetNames = [];
  let totalRows = 0;

  workbook.eachSheet((sheet) => {
    sheetNames.push(sheet.name);
    const sheetParts = [`[Sheet: ${sheet.name}]`];

    // Extract headers from first row
    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      headers[colNum - 1] = cell.text || `Column${colNum}`;
    });

    if (headers.length === 0) return;

    // Fill gaps in sparse headers
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) headers[i] = `Column${i + 1}`;
    }

    allColumns.push(...headers);
    sheetParts.push(`Columns: ${headers.join(', ')}`);

    let rowCount = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header row
      rowCount++;

      const values = [];
      for (let c = 0; c < headers.length; c++) {
        const cell = row.getCell(c + 1);
        values.push(cell.text || '');
      }
      sheetParts.push(`Row ${rowCount}: ${values.join(', ')}`);
    });

    totalRows += rowCount;
    if (rowCount > 0) {
      sheetParts.push(`\n(${rowCount} rows total)`);
    }

    parts.push(sheetParts.join('\n'));
  });

  const text = parts.join('\n\n');
  const uniqueColumns = [...new Set(allColumns)];

  return {
    text: text || '[Empty spreadsheet]',
    metadata: {
      type: 'dataset',
      rowCount: totalRows,
      columns: uniqueColumns,
      sheets: sheetNames,
    },
  };
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
  let metadata = null;

  if (resolvedMime === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result.text;
  } else if (resolvedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (OFFICEPARSER_MIME_TYPES.includes(resolvedMime)) {
    const ext = OFFICEPARSER_EXT_MAP[resolvedMime] || '.bin';
    const tmpPath = path.join(os.tmpdir(), `doc-${Date.now()}${ext}`);
    fs.writeFileSync(tmpPath, buffer);
    try {
      const ast = await officeparser.parseOffice(tmpPath);
      text = (ast && typeof ast.toText === 'function') ? ast.toText() : (typeof ast === 'string' ? ast : '');
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  } else if (XLSX_MIME_TYPES.includes(resolvedMime)) {
    const xlsxResult = await formatXLSX(buffer);
    text = xlsxResult.text;
    metadata = xlsxResult.metadata;
  } else if (resolvedMime === 'text/csv') {
    const rawText = buffer.toString('utf-8');
    const csvResult = formatCSV(rawText);
    text = csvResult.text;
    metadata = csvResult.metadata;
  } else if (resolvedMime === 'text/html') {
    text = stripHtml(buffer.toString('utf-8'));
  } else if (TEXT_MIME_TYPES.includes(resolvedMime)) {
    text = buffer.toString('utf-8');
  } else {
    return null;
  }

  if (!text || !text.trim()) return null;

  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH) + `\n\n[... truncated at ${MAX_LENGTH.toLocaleString()} characters]`;
  }

  return text;
}

/**
 * Extract text and structured metadata from a document buffer.
 * Returns { text, metadata } where metadata is non-null for tabular data (CSV/XLSX).
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} [filename]
 * @returns {Promise<{ text: string, metadata: object|null }|null>}
 */
async function extractStructured(buffer, mimeType, filename) {
  const resolvedMime = mimeType || guessMimeFromFilename(filename);
  if (!resolvedMime) return null;

  let text;
  let metadata = null;

  if (XLSX_MIME_TYPES.includes(resolvedMime)) {
    const xlsxResult = await formatXLSX(buffer);
    text = xlsxResult.text;
    metadata = xlsxResult.metadata;
  } else if (resolvedMime === 'text/csv') {
    const rawText = buffer.toString('utf-8');
    const csvResult = formatCSV(rawText);
    text = csvResult.text;
    metadata = csvResult.metadata;
  } else {
    // Fall back to plain text extraction for non-tabular types
    text = await extractText(buffer, mimeType, filename);
    if (!text) return null;
    return { text, metadata: null };
  }

  if (!text || !text.trim()) return null;

  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH) + `\n\n[... truncated at ${MAX_LENGTH.toLocaleString()} characters]`;
  }

  return { text, metadata };
}

/** MIME types that extractText can handle */
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ...XLSX_MIME_TYPES,
  ...TEXT_MIME_TYPES,
];

/** Check if a MIME type represents tabular data */
function isTabularMime(mimeType) {
  return mimeType === 'text/csv' || XLSX_MIME_TYPES.includes(mimeType);
}

module.exports = { extractText, extractStructured, guessMimeFromFilename, isTabularMime, SUPPORTED_MIME_TYPES };
