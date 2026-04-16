'use strict';

const PDFDocument = require('pdfkit');
const { uploadToR2 } = require('../utils/storage');

const MARGIN = 50;
const TITLE_SIZE = 24;
const HEADING_SIZE = 16;
const BODY_SIZE = 11;
const PAGE_NUMBER_SIZE = 9;

/**
 * Parse inline markdown (bold, italic) and return an array of text segments.
 * Each segment: { text, bold, italic }
 */
function parseInlineMarkdown(text) {
  const segments = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: false });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: false, italic: true });
    } else if (match[4]) {
      segments.push({ text: match[4], bold: false, italic: false });
    }
  }
  return segments.length ? segments : [{ text, bold: false, italic: false }];
}

/**
 * Write inline-formatted text to the PDF at the current position.
 */
function writeFormattedLine(doc, text, options = {}) {
  const { fontSize = BODY_SIZE, indent = 0 } = options;
  const segments = parseInlineMarkdown(text);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let font = 'Helvetica';
    if (seg.bold && seg.italic) font = 'Helvetica-BoldOblique';
    else if (seg.bold) font = 'Helvetica-Bold';
    else if (seg.italic) font = 'Helvetica-Oblique';

    doc.font(font).fontSize(fontSize);

    const isLast = i === segments.length - 1;
    if (i === 0 && indent > 0) {
      doc.text(seg.text, MARGIN + indent, undefined, { continued: !isLast });
    } else {
      doc.text(seg.text, { continued: !isLast });
    }
  }
}

/**
 * Ensure enough vertical space on the page; add a new page if needed.
 */
function ensureSpace(doc, needed) {
  const bottom = doc.page.height - MARGIN - 20;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

/**
 * Add page numbers to all pages (call after content is complete).
 */
function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(PAGE_NUMBER_SIZE).fillColor('#888888');
    const pageNum = i + 1;
    const total = range.count;
    doc.text(
      `${pageNum} / ${total}`,
      MARGIN,
      doc.page.height - MARGIN + 5,
      { align: 'center', width: doc.page.width - MARGIN * 2 }
    );
    doc.fillColor('#000000');
  }
}

/**
 * Render a title page.
 */
function renderTitlePage(doc, title, style) {
  const pageHeight = doc.page.height;
  const pageWidth = doc.page.width;
  const titleY = pageHeight * 0.35;

  doc.font('Helvetica-Bold').fontSize(TITLE_SIZE).fillColor('#1a1a1a');
  doc.text(title, MARGIN, titleY, {
    align: 'center',
    width: pageWidth - MARGIN * 2,
  });

  const styleLabel = style.charAt(0).toUpperCase() + style.slice(1);
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(12).fillColor('#666666');
  doc.text(styleLabel, MARGIN, undefined, {
    align: 'center',
    width: pageWidth - MARGIN * 2,
  });

  doc.moveDown(0.5);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.font('Helvetica').fontSize(10).fillColor('#999999');
  doc.text(dateStr, MARGIN, undefined, {
    align: 'center',
    width: pageWidth - MARGIN * 2,
  });

  doc.fillColor('#000000');
  doc.addPage();
}

/**
 * Parse content string into structured blocks.
 * Supports: ## headings, - bullets, 1. numbered lists, blank lines, paragraphs.
 */
function parseContentBlocks(content) {
  if (!content) return [];
  const lines = content.split('\n');
  const blocks = [];
  let currentParagraph = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      blocks.push({ type: 'paragraph', text: currentParagraph.join(' ') });
      currentParagraph = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      blocks.push({ type: 'spacer' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      const depth = Math.floor(bulletMatch[1].length / 2);
      blocks.push({ type: 'bullet', text: bulletMatch[2].trim(), depth });
      continue;
    }

    const numberedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      const depth = Math.floor(numberedMatch[1].length / 2);
      blocks.push({ type: 'numbered', number: numberedMatch[2], text: numberedMatch[3].trim(), depth });
      continue;
    }

    currentParagraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

/**
 * Render parsed blocks to the PDF document.
 */
function renderBlocks(doc, blocks) {
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        ensureSpace(doc, 40);
        doc.moveDown(0.5);
        const size = block.level === 1 ? HEADING_SIZE + 4 : block.level === 2 ? HEADING_SIZE : HEADING_SIZE - 2;
        doc.font('Helvetica-Bold').fontSize(size).fillColor('#1a1a1a');
        doc.text(block.text, MARGIN);
        doc.moveDown(0.3);
        doc.fillColor('#000000');
        break;
      }
      case 'paragraph': {
        ensureSpace(doc, 20);
        writeFormattedLine(doc, block.text, { fontSize: BODY_SIZE });
        doc.moveDown(0.3);
        break;
      }
      case 'bullet': {
        ensureSpace(doc, 16);
        const indent = 15 + block.depth * 15;
        const bullet = block.depth === 0 ? '\u2022' : '-';
        doc.font('Helvetica').fontSize(BODY_SIZE);
        doc.text(bullet, MARGIN + indent - 12, undefined, { continued: true });
        doc.text(' ');
        writeFormattedLine(doc, block.text, { fontSize: BODY_SIZE, indent });
        doc.moveDown(0.15);
        break;
      }
      case 'numbered': {
        ensureSpace(doc, 16);
        const indent = 15 + block.depth * 15;
        doc.font('Helvetica').fontSize(BODY_SIZE);
        doc.text(`${block.number}.`, MARGIN + indent - 15, undefined, { continued: true, width: 15, align: 'right' });
        doc.text(' ');
        writeFormattedLine(doc, block.text, { fontSize: BODY_SIZE, indent });
        doc.moveDown(0.15);
        break;
      }
      case 'spacer': {
        doc.moveDown(0.4);
        break;
      }
    }
  }
}

module.exports = {
  name: 'generate_pdf',
  description: 'Generate a professional PDF document from structured content. Use this when a user asks for a PDF report, memo, analysis, or any downloadable document.',
  tier: 'direct',
  parameters: {
    title: { type: 'string', required: true, description: 'Document title' },
    content: { type: 'string', required: false, description: 'Markdown-formatted content body' },
    sections: {
      type: 'array',
      required: false,
      description: 'Array of {heading, body} objects for structured reports. Each section becomes a headed block.',
    },
    style: {
      type: 'string',
      required: false,
      description: 'Document style: report, memo, or analysis. Defaults to report.',
    },
  },

  async execute(config, context) {
    const { brandId, userId } = context;

    try {
      const title = config.title;
      const content = config.content || '';
      const sections = config.sections || [];
      const style = config.style || 'report';

      if (!content && sections.length === 0) {
        return {
          success: false,
          data: null,
          summary: 'Error: Either content or sections must be provided.',
        };
      }

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: title,
          Author: 'Lucy',
          Creator: 'Lucy by iKawn',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));

      const pdfReady = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      renderTitlePage(doc, title, style);

      if (sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          if (i > 0) {
            ensureSpace(doc, 50);
            doc.moveDown(0.8);
          }

          ensureSpace(doc, 40);
          doc.font('Helvetica-Bold').fontSize(HEADING_SIZE).fillColor('#1a1a1a');
          doc.text(section.heading || `Section ${i + 1}`, MARGIN);
          doc.moveDown(0.3);
          doc.fillColor('#000000');

          if (section.body) {
            const blocks = parseContentBlocks(section.body);
            renderBlocks(doc, blocks);
          }
        }
      }

      if (content) {
        if (sections.length > 0) {
          doc.moveDown(1);
        }
        const blocks = parseContentBlocks(content);
        renderBlocks(doc, blocks);
      }

      addPageNumbers(doc);
      doc.end();
      const buffer = await pdfReady;

      const timestamp = Date.now();
      const safeTitle = title
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);
      const filename = `${safeTitle}.pdf`;
      const key = `artifacts/${brandId}/${userId}/${timestamp}_${filename}`;

      const url = await uploadToR2(key, buffer, 'application/pdf', brandId);
      const sizeKB = Math.round(buffer.length / 1024);

      return {
        success: true,
        data: { url, filename, size: `${sizeKB} KB` },
        summary: `Generated PDF: ${title} (${sizeKB} KB). Download: ${url}`,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Error generating PDF: ${err.message}`,
      };
    }
  },
};
