'use strict';

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  convertInchesToTwip,
} = require('docx');
const { uploadToR2 } = require('../utils/storage');

/**
 * Parse inline markdown into TextRun objects.
 * Supports **bold** and *italic*.
 */
function parseInlineToRuns(text, baseOptions = {}) {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, ...baseOptions }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, ...baseOptions }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], ...baseOptions }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, ...baseOptions }));
  }

  return runs;
}

/**
 * Parse markdown content into an array of docx Paragraph objects.
 */
function parseContentToParagraphs(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const paragraphs = [];
  let currentParagraphLines = [];

  function flushParagraph() {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.join(' ');
      paragraphs.push(
        new Paragraph({
          children: parseInlineToRuns(text, { size: 22, font: 'Calibri' }),
          spacing: { after: 120 },
        })
      );
      currentParagraphLines = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingLevel =
        level === 1 ? HeadingLevel.HEADING_1 :
        level === 2 ? HeadingLevel.HEADING_2 :
        HeadingLevel.HEADING_3;

      paragraphs.push(
        new Paragraph({
          text: headingMatch[2].trim(),
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      const depth = Math.min(Math.floor(bulletMatch[1].length / 2), 2);
      paragraphs.push(
        new Paragraph({
          children: parseInlineToRuns(bulletMatch[2].trim(), { size: 22, font: 'Calibri' }),
          bullet: { level: depth },
          spacing: { after: 60 },
        })
      );
      continue;
    }

    const numberedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      const depth = Math.min(Math.floor(numberedMatch[1].length / 2), 2);
      paragraphs.push(
        new Paragraph({
          children: parseInlineToRuns(numberedMatch[3].trim(), { size: 22, font: 'Calibri' }),
          numbering: { reference: 'default-numbering', level: depth },
          spacing: { after: 60 },
        })
      );
      continue;
    }

    currentParagraphLines.push(line.trim());
  }

  flushParagraph();
  return paragraphs;
}

/**
 * Build the full DOCX document.
 */
function buildDocument(title, content, sections, style) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const styleLabel = style.charAt(0).toUpperCase() + style.slice(1);

  const titlePageParagraphs = [
    new Paragraph({ spacing: { before: 4000 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 52,
          font: 'Calibri',
          color: '1a1a1a',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: styleLabel,
          size: 24,
          font: 'Calibri',
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: dateStr,
          size: 20,
          font: 'Calibri',
          color: '999999',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '', break: 1 })],
    }),
  ];

  const contentParagraphs = [];

  // Table of contents if 3+ sections
  if (sections.length >= 3) {
    contentParagraphs.push(
      new Paragraph({
        text: 'Table of Contents',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
      })
    );
    for (let i = 0; i < sections.length; i++) {
      contentParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${i + 1}. ${sections[i].heading || 'Section ' + (i + 1)}`,
              size: 22,
              font: 'Calibri',
            }),
          ],
          spacing: { after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
        })
      );
    }
    contentParagraphs.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // Sections
  if (sections.length > 0) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      contentParagraphs.push(
        new Paragraph({
          text: section.heading || `Section ${i + 1}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 160 },
        })
      );
      if (section.body) {
        contentParagraphs.push(...parseContentToParagraphs(section.body));
      }
    }
  }

  // Free-form content
  if (content) {
    contentParagraphs.push(...parseContentToParagraphs(content));
  }

  const doc = new Document({
    creator: 'Lucy by iKawn',
    title: title,
    description: `${styleLabel} generated by Lucy`,
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.5),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(1),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: '%3.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(1.5),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: [...titlePageParagraphs, ...contentParagraphs],
      },
    ],
  });

  return doc;
}

module.exports = {
  name: 'generate_document',
  description:
    'Generate a professional DOCX (Word) document from structured content. ' +
    'Use this when a user asks for a Word document, editable report, or downloadable document in DOCX format. ' +
    'BRAND VOICE: when a BRAND CONTEXT block is present in your system prompt, write all prose as the brand\'s in-house writer. ' +
    'Match the specified tone, address the stated audience, open with the conclusion, then evidence. Avoid filler. Do not use emojis or em-dashes.',
  tier: 'direct',
  parameters: {
    title: { type: 'string', required: true, description: 'Document title' },
    content: { type: 'string', required: false, description: 'Markdown-formatted content body' },
    sections: {
      type: 'array',
      required: false,
      description: 'Array of {heading, body} objects for structured documents. Each section becomes a headed block.',
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

      const doc = buildDocument(title, content, sections, style);
      const buffer = await Packer.toBuffer(doc);

      const timestamp = Date.now();
      const safeTitle = title
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);
      const filename = `${safeTitle}.docx`;
      const key = `artifacts/${brandId}/${userId}/${timestamp}_${filename}`;

      const url = await uploadToR2(
        key,
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        brandId
      );
      const sizeKB = Math.round(buffer.length / 1024);

      return {
        success: true,
        data: { url, filename, size: `${sizeKB} KB` },
        summary: `Generated DOCX: ${title} (${sizeKB} KB). Download: ${url}`,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Error generating DOCX: ${err.message}`,
      };
    }
  },
};
