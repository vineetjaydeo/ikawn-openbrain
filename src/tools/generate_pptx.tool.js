// src/tools/generate_pptx.tool.js
'use strict';

const PptxGenJS = require('pptxgenjs');
const { uploadToR2 } = require('../utils/storage');

// ── Theme definitions ──────────────────────────────────────────────────────────

const THEMES = {
  corporate: {
    bg: 'FFFFFF',
    title: '0A0F2E',
    body: '2D2D3F',
    accent: 'FFC01C',
    subtle: '6B7280',
    divider: 'E5E7EB',
  },
  dark: {
    bg: '0A0F2E',
    title: 'FFFFFF',
    body: 'D1D5DB',
    accent: 'FFC01C',
    subtle: '9CA3AF',
    divider: '1E2747',
  },
  light: {
    bg: 'FFFFFF',
    title: '1F2937',
    body: '4B5563',
    accent: '3B82F6',
    subtle: '9CA3AF',
    divider: 'E5E7EB',
  },
};

// ── Margins and sizing constants (inches) ──────────────────────────────────────

const MARGIN = 0.5;
const SLIDE_W = 10; // 16:9 at 10x5.625
const SLIDE_H = 5.625;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_H = SLIDE_H - MARGIN * 2;

// ── Content parsing ────────────────────────────────────────────────────────────

/**
 * Parse content string into structured text segments.
 * Lines starting with "- " become bullet points; everything else is body text.
 */
function parseContent(content) {
  if (!content) return [];
  const lines = content.split('\n').filter(l => l.trim());
  const segments = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      segments.push({ type: 'bullet', text: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith('* ')) {
      segments.push({ type: 'bullet', text: trimmed.slice(2).trim() });
    } else {
      segments.push({ type: 'body', text: trimmed });
    }
  }

  return segments;
}

/**
 * Convert parsed segments into pptxgenjs text objects for a text body.
 */
function segmentsToTextObjects(segments, theme) {
  const items = [];

  for (const seg of segments) {
    if (seg.type === 'bullet') {
      items.push({
        text: seg.text,
        options: {
          fontSize: 14,
          color: theme.body,
          bullet: { code: '2022', color: theme.accent },
          paraSpaceBefore: 4,
          paraSpaceAfter: 2,
          lineSpacingMultiple: 1.3,
        },
      });
    } else {
      items.push({
        text: seg.text,
        options: {
          fontSize: 14,
          color: theme.body,
          paraSpaceBefore: 4,
          paraSpaceAfter: 4,
          lineSpacingMultiple: 1.4,
        },
      });
    }
  }

  return items;
}

// ── Slide builders ─────────────────────────────────────────────────────────────

function addTitleSlide(pptx, title, subtitle, theme, slideNum, totalSlides) {
  const slide = pptx.addSlide();
  slide.background = { fill: theme.bg };

  // Main title -- centered vertically, slightly above center
  slide.addText(title || '', {
    x: MARGIN,
    y: 1.4,
    w: CONTENT_W,
    h: 1.2,
    fontSize: 28,
    fontFace: 'Arial',
    bold: true,
    color: theme.title,
    align: 'center',
    valign: 'middle',
  });

  // Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN + 1.5,
      y: 2.8,
      w: CONTENT_W - 3,
      h: 0.8,
      fontSize: 18,
      fontFace: 'Arial',
      color: theme.subtle,
      align: 'center',
      valign: 'top',
    });
  }

  // Gold accent bar at bottom
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN + 3,
    y: 4.2,
    w: CONTENT_W - 6,
    h: 0.06,
    fill: { color: theme.accent },
  });

  addSlideNumber(slide, slideNum, totalSlides, theme);
  return slide;
}

function addContentSlide(pptx, slideData, theme, slideNum, totalSlides) {
  const slide = pptx.addSlide();
  slide.background = { fill: theme.bg };

  // Slide title
  if (slideData.title) {
    slide.addText(slideData.title, {
      x: MARGIN,
      y: MARGIN,
      w: CONTENT_W,
      h: 0.6,
      fontSize: 24,
      fontFace: 'Arial',
      bold: true,
      color: theme.title,
      valign: 'top',
    });

    // Thin accent underline beneath title
    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN,
      y: MARGIN + 0.65,
      w: 1.5,
      h: 0.04,
      fill: { color: theme.accent },
    });
  }

  // Content body
  const segments = parseContent(slideData.content);
  if (segments.length > 0) {
    const textObjects = segmentsToTextObjects(segments, theme);
    slide.addText(textObjects, {
      x: MARGIN,
      y: MARGIN + 0.9,
      w: CONTENT_W,
      h: CONTENT_H - 1.0,
      valign: 'top',
      shrinkText: true,
    });
  }

  // Speaker notes
  if (slideData.notes) {
    slide.addNotes(slideData.notes);
  }

  addSlideNumber(slide, slideNum, totalSlides, theme);
  return slide;
}

function addTwoColumnSlide(pptx, slideData, theme, slideNum, totalSlides) {
  const slide = pptx.addSlide();
  slide.background = { fill: theme.bg };

  // Slide title
  if (slideData.title) {
    slide.addText(slideData.title, {
      x: MARGIN,
      y: MARGIN,
      w: CONTENT_W,
      h: 0.6,
      fontSize: 24,
      fontFace: 'Arial',
      bold: true,
      color: theme.title,
      valign: 'top',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN,
      y: MARGIN + 0.65,
      w: 1.5,
      h: 0.04,
      fill: { color: theme.accent },
    });
  }

  // Split content on ||| delimiter
  const parts = (slideData.content || '').split('|||');
  const leftContent = (parts[0] || '').trim();
  const rightContent = (parts[1] || '').trim();

  const colW = (CONTENT_W - 0.4) / 2; // 0.4 gutter
  const colY = MARGIN + 0.9;
  const colH = CONTENT_H - 1.0;

  // Left column
  const leftSegments = parseContent(leftContent);
  if (leftSegments.length > 0) {
    slide.addText(segmentsToTextObjects(leftSegments, theme), {
      x: MARGIN,
      y: colY,
      w: colW,
      h: colH,
      valign: 'top',
      shrinkText: true,
    });
  }

  // Column divider line
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN + colW + 0.18,
    y: colY,
    w: 0.02,
    h: colH * 0.7,
    fill: { color: theme.divider },
  });

  // Right column
  const rightSegments = parseContent(rightContent);
  if (rightSegments.length > 0) {
    slide.addText(segmentsToTextObjects(rightSegments, theme), {
      x: MARGIN + colW + 0.4,
      y: colY,
      w: colW,
      h: colH,
      valign: 'top',
      shrinkText: true,
    });
  }

  if (slideData.notes) {
    slide.addNotes(slideData.notes);
  }

  addSlideNumber(slide, slideNum, totalSlides, theme);
  return slide;
}

function addSectionBreakSlide(pptx, slideData, theme, slideNum, totalSlides) {
  const slide = pptx.addSlide();
  slide.background = { fill: theme.bg };

  // Large centered section title
  slide.addText(slideData.title || slideData.content || '', {
    x: MARGIN,
    y: 1.5,
    w: CONTENT_W,
    h: 1.5,
    fontSize: 32,
    fontFace: 'Arial',
    bold: true,
    color: theme.title,
    align: 'center',
    valign: 'middle',
  });

  // Accent bar centered beneath
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN + 3.5,
    y: 3.2,
    w: CONTENT_W - 7,
    h: 0.06,
    fill: { color: theme.accent },
  });

  // Optional subtitle-like content beneath the bar
  if (slideData.content && slideData.title) {
    const segments = parseContent(slideData.content);
    if (segments.length > 0) {
      const plainText = segments.map(s => s.text).join('\n');
      slide.addText(plainText, {
        x: MARGIN + 1.5,
        y: 3.5,
        w: CONTENT_W - 3,
        h: 0.8,
        fontSize: 16,
        fontFace: 'Arial',
        color: theme.subtle,
        align: 'center',
        valign: 'top',
      });
    }
  }

  if (slideData.notes) {
    slide.addNotes(slideData.notes);
  }

  addSlideNumber(slide, slideNum, totalSlides, theme);
  return slide;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function addSlideNumber(slide, slideNum, totalSlides, theme) {
  slide.addText(`${slideNum} / ${totalSlides}`, {
    x: SLIDE_W - 1.3,
    y: SLIDE_H - 0.45,
    w: 0.9,
    h: 0.3,
    fontSize: 9,
    color: theme.subtle,
    fontFace: 'Arial',
    align: 'right',
    valign: 'bottom',
  });
}

function sanitizeFilename(title) {
  return (title || 'presentation')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .toLowerCase();
}

// ── Tool export ────────────────────────────────────────────────────────────────

module.exports = {
  name: 'generate_pptx',
  description:
    'Generate a professional PowerPoint (PPTX) presentation from structured slide data. ' +
    'Supports title slides, content slides with bullet points, two-column layouts, and section breaks. ' +
    'Returns a download URL for the generated file.',
  tier: 'direct',
  costTier: 'medium',
  parameters: {
    title: {
      type: 'string',
      required: true,
      description: 'Presentation title (used on the cover slide)',
    },
    slides: {
      type: 'array',
      required: true,
      description:
        'Array of slide objects. Each slide has: title (string), content (string, lines starting with "- " become bullets), ' +
        'type (optional: "title", "content", "two-column", "section-break"; default "content"), ' +
        'notes (optional: speaker notes). For two-column slides, separate left/right content with "|||".',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Slide title' },
          content: { type: 'string', description: 'Slide body. Lines starting with "- " become bullets. For two-column, separate with "|||".' },
          type: { type: 'string', enum: ['title', 'content', 'two-column', 'section-break'], description: 'Slide layout type. Default: content' },
          notes: { type: 'string', description: 'Speaker notes (optional)' },
        },
        required: ['title', 'content'],
      },
    },
    theme: {
      type: 'string',
      required: false,
      description: 'Presentation theme: "corporate" (white bg, navy text, gold accents), "dark" (navy bg, white text, gold accents), or "light" (white bg, gray text, blue accents). Default: "corporate".',
      enum: ['corporate', 'dark', 'light'],
    },
  },

  async execute(config, context) {
    const { brandId, userId } = context;
    const title = (config.title || '').trim();
    const slides = Array.isArray(config.slides) ? config.slides : [];
    const themeName = THEMES[config.theme] ? config.theme : 'corporate';
    const theme = THEMES[themeName];

    // Validate inputs
    if (!title) {
      return { success: false, data: null, summary: 'Presentation title is required.' };
    }
    if (slides.length === 0) {
      return { success: false, data: null, summary: 'At least one slide is required.' };
    }
    if (slides.length > 50) {
      return { success: false, data: null, summary: 'Maximum 50 slides allowed per presentation.' };
    }

    try {
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      pptx.author = 'Lucy AI';
      pptx.title = title;

      const totalSlides = slides.length + 1; // +1 for the cover

      // Cover slide (always first)
      const firstSlideContent = slides[0]?.content || '';
      addTitleSlide(pptx, title, firstSlideContent ? null : null, theme, 1, totalSlides);

      // Content slides
      for (let i = 0; i < slides.length; i++) {
        const slideData = slides[i];
        const slideType = (slideData.type || 'content').toLowerCase();
        const slideNum = i + 2; // cover is 1

        switch (slideType) {
          case 'title':
            addTitleSlide(pptx, slideData.title || '', slideData.content || '', theme, slideNum, totalSlides);
            break;
          case 'two-column':
            addTwoColumnSlide(pptx, slideData, theme, slideNum, totalSlides);
            break;
          case 'section-break':
            addSectionBreakSlide(pptx, slideData, theme, slideNum, totalSlides);
            break;
          case 'content':
          default:
            addContentSlide(pptx, slideData, theme, slideNum, totalSlides);
            break;
        }
      }

      // Export to buffer
      const buffer = await pptx.write({ outputType: 'nodebuffer' });

      // Upload to R2
      const safeName = sanitizeFilename(title);
      const filename = `${safeName}.pptx`;
      const key = `artifacts/${brandId || 'ikawn'}/${userId || 'unknown'}/${Date.now()}_${filename}`;
      const url = await uploadToR2(
        key,
        buffer,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        brandId
      );

      const slideCount = totalSlides;

      return {
        success: true,
        data: { url, filename, slideCount },
        summary: `Generated presentation: "${title}" (${slideCount} slides). Download: ${url}`,
      };
    } catch (err) {
      console.error('[generate_pptx] Failed:', err);
      return {
        success: false,
        data: null,
        summary: `Failed to generate presentation: ${err.message}`,
      };
    }
  },
};
