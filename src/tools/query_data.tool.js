// src/tools/query_data.tool.js
'use strict';

const alasql = require('alasql');
const { pool } = require('../db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a string into a safe SQL identifier (letters, digits, underscores).
 */
function sanitize(name) {
  return name
    .replace(/\.[^.]+$/, '')          // strip file extension
    .replace(/[^a-zA-Z0-9_]/g, '_')  // non-alphanumeric to underscore
    .replace(/^(\d)/, '_$1')          // cannot start with digit
    .replace(/_+/g, '_')             // collapse runs of underscores
    .toLowerCase()
    .slice(0, 64);
}

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse CSV text (header + data rows) into an array of objects.
 * Auto-detects numeric values.
 */
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return; // skip empty headers
      let val = (values[i] || '').trim();
      // Auto-detect numbers (strip formatting commas first)
      const stripped = val.replace(/,/g, '');
      const num = Number(stripped);
      obj[h] = (stripped !== '' && !isNaN(num) && val !== '') ? num : val;
    });
    return obj;
  });
}

/**
 * Parse the structured content format produced by doc-parser.js / upload.js:
 *
 *   [Sheet: Sales Data]
 *   Columns: Date, Product, Revenue, Units
 *   Row 1: 2026-01-01, Widget A, 45000, 120
 *   Row 2: ...
 *
 * Returns { sheetName, rows[] } or null if format does not match.
 */
function parseStructuredContent(content) {
  if (!content || typeof content !== 'string') return null;

  const sheets = [];
  let currentSheet = null;
  let headers = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Sheet header: [Sheet: Name]
    const sheetMatch = line.match(/^\[Sheet:\s*(.+?)\]$/);
    if (sheetMatch) {
      if (currentSheet && currentSheet.rows.length > 0) {
        sheets.push(currentSheet);
      }
      currentSheet = { sheetName: sheetMatch[1].trim(), rows: [] };
      headers = null;
      continue;
    }

    // Column header line
    const colMatch = line.match(/^Columns?:\s*(.+)$/i);
    if (colMatch) {
      headers = colMatch[1].split(',').map(h => h.trim());
      continue;
    }

    // Row line: Row N: val, val, val
    const rowMatch = line.match(/^Row\s+\d+:\s*(.+)$/i);
    if (rowMatch && headers) {
      const values = rowMatch[1].split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const val = (values[i] || '').trim();
        const stripped = val.replace(/,/g, '');
        const num = Number(stripped);
        obj[h] = (stripped !== '' && !isNaN(num) && val !== '') ? num : val;
      });
      if (currentSheet) {
        currentSheet.rows.push(obj);
      }
    }
  }

  if (currentSheet && currentSheet.rows.length > 0) {
    sheets.push(currentSheet);
  }

  return sheets.length > 0 ? sheets : null;
}

/**
 * Load a set of rows into an alasql in-memory table, namespaced by brandId.
 */
function loadTable(brandId, tableName, rows) {
  const fullName = `${brandId}_${sanitize(tableName)}`;
  // Create or replace table
  if (alasql.tables[fullName]) {
    delete alasql.tables[fullName];
  }
  alasql(`CREATE TABLE [${fullName}]`);
  alasql.tables[fullName].data = rows;
  return fullName;
}

/**
 * Format query results into a readable text table.
 */
function formatResults(result) {
  if (!Array.isArray(result) || result.length === 0) {
    return { columns: [], display: 'Query returned 0 rows.' };
  }

  const columns = Object.keys(result[0]);
  const displayRows = result.slice(0, 100);
  const header = columns.join(' | ');
  const separator = columns.map(() => '---').join(' | ');
  const body = displayRows.map(r =>
    columns.map(c => {
      const v = r[c];
      return v === null || v === undefined ? '' : String(v);
    }).join(' | ')
  ).join('\n');

  let display = `${header}\n${separator}\n${body}`;
  if (result.length > 100) {
    display += `\n... (${result.length - 100} more rows not shown)`;
  }

  return { columns, display };
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

module.exports = {
  name: 'query_data',
  description:
    'Run SQL queries against uploaded datasets (CSV, XLSX files). Use this to analyze spreadsheet data: filter rows, calculate aggregates (SUM, AVG, COUNT), group by columns, join multiple datasets, find top/bottom values, compute percentages. The data from recently uploaded files is automatically available as tables.',
  tier: 'direct',
  costTier: 'low',
  parameters: {
    query: {
      type: 'string',
      required: true,
      description:
        'SQL query to run. Tables are named by filename (sanitized, prefixed with brand id). Use SHOW TABLES to list available tables. Use SELECT * FROM [tablename] LIMIT 5 to preview. Supports standard SQL: WHERE, GROUP BY, ORDER BY, HAVING, JOIN, subqueries.',
    },
    data: {
      type: 'string',
      required: false,
      description:
        'If no table exists yet, pass CSV text directly here to create a temporary table. Format: header row followed by data rows, comma-separated.',
    },
    table_name: {
      type: 'string',
      required: false,
      description: 'Name for the table when loading data from the data parameter.',
    },
  },

  async execute(config, context) {
    const brandId = sanitize(context.brandId || 'ikawn');
    const prefix = `${brandId}_`;

    // ------------------------------------------------------------------
    // Step 1: If inline data provided, load it into a table
    // ------------------------------------------------------------------
    if (config.data && typeof config.data === 'string' && config.data.trim()) {
      const rows = parseCSV(config.data);
      if (rows.length === 0) {
        return {
          success: false,
          data: null,
          summary: 'Could not parse any rows from the provided data. Ensure the first line contains column headers and subsequent lines contain data.',
        };
      }
      const tName = config.table_name || 'data';
      const fullName = loadTable(brandId, tName, rows);
      if (!config.query || config.query.trim().toUpperCase() === 'SHOW TABLES') {
        // If no real query, just confirm the load
        return {
          success: true,
          data: { table: fullName, rowCount: rows.length, columns: Object.keys(rows[0]) },
          summary: `Loaded ${rows.length} rows into table [${fullName}]. Columns: ${Object.keys(rows[0]).join(', ')}. You can now query it with SELECT * FROM [${fullName}] LIMIT 5.`,
        };
      }
    }

    // ------------------------------------------------------------------
    // Step 2: Auto-load recent datasets from memory if no brand tables exist
    // ------------------------------------------------------------------
    const brandTables = Object.keys(alasql.tables).filter(t => t.startsWith(prefix));
    if (brandTables.length === 0) {
      try {
        const datasets = await pool.query(
          `SELECT content, metadata FROM memories
           WHERE brand_id = $1 AND memory_type = 'dataset'
           AND created_at > NOW() - INTERVAL '24 hours'
           ORDER BY created_at DESC LIMIT 10`,
          [context.brandId || 'ikawn']
        );

        for (const ds of datasets.rows) {
          const filename = (ds.metadata && ds.metadata.filename) || 'upload';
          const content = ds.content || '';

          // Try structured format first
          const sheets = parseStructuredContent(content);
          if (sheets) {
            for (const sheet of sheets) {
              loadTable(brandId, sheet.sheetName || filename, sheet.rows);
            }
            continue;
          }

          // Fall back to CSV parsing
          const rows = parseCSV(content);
          if (rows.length > 0) {
            loadTable(brandId, filename, rows);
          }
        }
      } catch (err) {
        // Non-fatal: we may still have inline data or previously loaded tables
        console.warn('[query_data] Failed to load datasets from memory:', err.message);
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Handle SHOW TABLES
    // ------------------------------------------------------------------
    if (config.query && config.query.trim().toUpperCase() === 'SHOW TABLES') {
      const tables = Object.keys(alasql.tables).filter(t => t.startsWith(prefix));
      if (tables.length === 0) {
        return {
          success: true,
          data: { tables: [] },
          summary: 'No tables loaded. Upload a CSV/XLSX file or pass data inline using the data parameter.',
        };
      }
      const info = tables.map(t => {
        const rows = (alasql.tables[t].data || []).length;
        const cols = rows > 0 ? Object.keys(alasql.tables[t].data[0]) : [];
        return `  [${t}]: ${rows} rows, columns: ${cols.join(', ')}`;
      });
      return {
        success: true,
        data: { tables },
        summary: `Available tables:\n${info.join('\n')}`,
      };
    }

    // ------------------------------------------------------------------
    // Step 4: Validate we have a query
    // ------------------------------------------------------------------
    if (!config.query || !config.query.trim()) {
      return {
        success: false,
        data: null,
        summary: 'Missing required parameter: query. Provide a SQL query to run.',
      };
    }

    // ------------------------------------------------------------------
    // Step 5: Execute the SQL query
    // ------------------------------------------------------------------
    try {
      const result = alasql(config.query);

      if (Array.isArray(result) && result.length > 0) {
        const { columns, display } = formatResults(result);
        return {
          success: true,
          data: { rows: result.slice(0, 100), columns, totalRows: result.length },
          summary: `Query returned ${result.length} row${result.length === 1 ? '' : 's'}.\n\n${display}`,
        };
      }

      if (Array.isArray(result) && result.length === 0) {
        return {
          success: true,
          data: { rows: [], columns: [], totalRows: 0 },
          summary: 'Query returned 0 rows.',
        };
      }

      // Non-SELECT statements (CREATE, INSERT, etc.) return a count or similar
      return {
        success: true,
        data: { result },
        summary: `Query executed successfully. Result: ${JSON.stringify(result)}`,
      };
    } catch (err) {
      // Provide helpful error message
      const availableTables = Object.keys(alasql.tables).filter(t => t.startsWith(prefix));
      let hint = '';
      if (availableTables.length > 0) {
        hint = ` Available tables: ${availableTables.join(', ')}.`;
      } else {
        hint = ' No tables are loaded. Upload a file or pass CSV data via the data parameter.';
      }
      return {
        success: false,
        data: null,
        summary: `SQL error: ${err.message}.${hint} Check table names and column names.`,
      };
    }
  },
};
