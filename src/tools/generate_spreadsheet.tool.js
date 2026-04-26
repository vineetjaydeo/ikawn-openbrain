// src/tools/generate_spreadsheet.tool.js
'use strict';

const ExcelJS = require('exceljs');
const { uploadToR2 } = require('../utils/storage');

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

const HEADER_FONT = {
  bold: true,
  size: 11,
  color: { argb: 'FF1F2937' },
};

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

function autoColumnWidth(header, rows, colIndex) {
  let maxLen = String(header).length;
  const sampleRows = rows.slice(0, 10);
  for (const row of sampleRows) {
    const val = row[colIndex];
    if (val != null) {
      maxLen = Math.max(maxLen, String(val).length);
    }
  }
  // Add padding, cap at 50
  return Math.min(maxLen + 4, 50);
}

function isNumeric(val) {
  if (val == null) return false;
  if (typeof val === 'number') return true;
  if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return true;
  return false;
}

module.exports = {
  name: 'generate_spreadsheet',
  description:
    'Generate an Excel spreadsheet (.xlsx) with formatted headers, data rows, and optional financial styling. ' +
    'BRAND VOICE: when a BRAND CONTEXT block is present in your system prompt, sheet names, column headers, and any narrative cells (executive summary, notes) must use the brand\'s voice. ' +
    'Headers should be specific and decision-grade, not generic. Do not use emojis or em-dashes. ' +
    'Returns a downloadable URL.',
  tier: 'direct',
  costTier: 'low',
  parameters: {
    title: { type: 'string', required: true, description: 'Workbook title and default first sheet name' },
    sheets: {
      type: 'array',
      required: true,
      description: 'Array of sheet objects with name, headers, rows, and optional columnWidths',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Sheet tab name' },
          headers: { type: 'array', description: 'Array of column header strings', items: { type: 'string' } },
          rows: { type: 'array', description: 'Array of row arrays, each containing cell values', items: { type: 'array' } },
          columnWidths: { type: 'array', description: 'Optional array of column widths (numbers)', items: { type: 'number' } },
        },
        required: ['headers', 'rows'],
      },
    },
    style: {
      type: 'string',
      required: false,
      description: 'Style preset: standard or financial (default: standard)',
      enum: ['standard', 'financial'],
    },
  },
  async execute(config, context) {
    const { title, sheets, style = 'standard' } = config;
    const { brandId = 'ikawn', userId } = context;

    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      return { success: false, data: null, summary: 'No sheets provided.' };
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Lucy AI';
      workbook.created = new Date();

      const isFinancial = style === 'financial';

      for (let si = 0; si < sheets.length; si++) {
        const sheet = sheets[si];
        const sheetName = sheet.name || (si === 0 ? title : `Sheet ${si + 1}`);
        const headers = sheet.headers || [];
        const rows = sheet.rows || [];
        const customWidths = sheet.columnWidths;

        const ws = workbook.addWorksheet(sheetName);

        // Set column definitions
        ws.columns = headers.map((h, i) => ({
          header: h,
          key: `col_${i}`,
          width: customWidths && customWidths[i] ? customWidths[i] : autoColumnWidth(h, rows, i),
        }));

        // Style header row
        const headerRow = ws.getRow(1);
        headerRow.eachCell((cell) => {
          cell.font = HEADER_FONT;
          cell.fill = HEADER_FILL;
          cell.border = THIN_BORDER;
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Freeze header row
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        // Add data rows
        for (let ri = 0; ri < rows.length; ri++) {
          const rowData = rows[ri];
          const excelRow = ws.addRow(rowData);

          excelRow.eachCell((cell, colNumber) => {
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle' };

            const val = cell.value;

            if (isFinancial && isNumeric(val)) {
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
              cell.numFmt = '#,##0.00';
              // Convert string numbers to actual numbers for formatting
              if (typeof val === 'string') {
                cell.value = Number(val);
              }
            }

            // Financial: bold subtotal/total rows (detect by first cell text)
            if (isFinancial && colNumber === 1) {
              const text = String(val || '').toLowerCase();
              if (text.includes('total') || text.includes('subtotal') || text.includes('sum')) {
                excelRow.font = { bold: true };
              }
            }
          });
        }
      }

      // Export to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
      const filename = `${safeTitle}_${Date.now()}.xlsx`;
      const key = `artifacts/${brandId}/${userId}/${Date.now()}_${filename}`;

      const url = await uploadToR2(
        key,
        Buffer.from(buffer),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        brandId
      );

      const totalRows = sheets.reduce((acc, s) => acc + (s.rows ? s.rows.length : 0), 0);

      return {
        success: true,
        data: { url, filename, sheetCount: sheets.length, totalRows },
        summary: `Generated "${title}" spreadsheet with ${sheets.length} sheet(s) and ${totalRows} data rows.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Spreadsheet generation failed: ${err.message}` };
    }
  },
};
