// src/tools/generate_pptx.tool.js
'use strict';

const PptxGenJS = require('pptxgenjs');
const crypto = require('crypto');
const { uploadToR2 } = require('../utils/storage');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');
const { getBrandProfile } = require('../services/pptx-template-analyzer');
const { getSlideIconDataUri, listIconNames } = require('../utils/slide-icons');

// Optional: pptx-embed-fonts for custom font embedding
let withPPTXEmbedFonts;
try { withPPTXEmbedFonts = require('pptx-embed-fonts/pptxgenjs').withPPTXEmbedFonts; } catch(e) { /* optional */ }

// ── Concurrency gate: max 2 concurrent PPTX builds per process ───────────────
function createLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => { if (queue.length > 0 && active < concurrency) queue.shift()(); };
  return (fn) => new Promise((resolve, reject) => {
    const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; next(); }); };
    active < concurrency ? run() : queue.push(run);
  });
}
const pptxLimit = createLimit(2);

// ── Theme definitions ──────────────────────────────────────────────────────────

const THEMES = {
  corporate: {
    bg: 'FFFFFF',
    title: '0A0F2E',
    body: '2D2D3F',
    accent: 'FFC01C',
    subtle: '6B7280',
    divider: 'E5E7EB',
    slideNum: '9CA3AF',
    headingFont: 'Arial',
    bodyFont: 'Arial',
    logo: null,
  },
  dark: {
    bg: '0A0F2E',
    title: 'FFFFFF',
    body: 'D1D5DB',
    accent: 'FFC01C',
    subtle: '9CA3AF',
    divider: '1E2747',
    slideNum: '6B7280',
    headingFont: 'Arial',
    bodyFont: 'Arial',
    logo: null,
  },
  light: {
    bg: 'FFFFFF',
    title: '1F2937',
    body: '4B5563',
    accent: '3B82F6',
    subtle: '9CA3AF',
    divider: 'E5E7EB',
    slideNum: '9CA3AF',
    headingFont: 'Arial',
    bodyFont: 'Arial',
    logo: null,
  },
};

/**
 * Build a theme object from a brand profile.
 * Falls back to 'corporate' for any missing values.
 */
function buildBrandTheme(brandProfile) {
  const fallback = THEMES.corporate;
  const colors = brandProfile.colors || {};
  const fonts = brandProfile.fonts || {};
  const logo = brandProfile.logos && brandProfile.logos.length > 0 ? brandProfile.logos[0] : null;

  // Derive bg/title/body from brand colors with intelligent defaults
  const primary = stripHash(colors.primary) || fallback.accent;
  const secondary = stripHash(colors.secondary) || fallback.title;
  const accent = stripHash(colors.accent) || primary;
  const bg = stripHash(colors.background) || fallback.bg;
  const text = stripHash(colors.text) || fallback.title;

  return {
    bg,
    title: text,
    body: lightenColor(text, 20) || fallback.body,
    accent,
    subtle: fallback.subtle,
    divider: fallback.divider,
    slideNum: fallback.slideNum,
    headingFont: fonts.heading || fallback.headingFont,
    bodyFont: fonts.body || fallback.bodyFont,
    logo: logo ? { url: logo.url, w: logo.width || 1.0, h: logo.height || 0.4 } : null,
  };
}

function stripHash(color) {
  if (!color) return null;
  return color.replace(/^#/, '');
}

/**
 * Attempt to lighten a hex color by a percentage (simple approach).
 */
function lightenColor(hex, percent) {
  if (!hex || hex.length < 6) return null;
  try {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const nr = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
    const ng = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
    const nb = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
    return nr.toString(16).padStart(2, '0') + ng.toString(16).padStart(2, '0') + nb.toString(16).padStart(2, '0');
  } catch (e) {
    return null;
  }
}

// ── Margins and sizing constants (inches) ──────────────────────────────────────

const MARGIN = 0.5;
const SLIDE_W = 10; // 16:9 at 10x5.625
const SLIDE_H = 5.625;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_H = SLIDE_H - MARGIN * 2;

// ── Slide Masters ─────────────────────────────────────────────────────────────

/**
 * Define slide masters on the pptx instance based on the active theme.
 */
function defineSlideMasters(pptx, theme) {
  const logoObjects = theme.logo
    ? [{ image: { path: theme.logo.url, x: 8.5, y: 0.3, w: theme.logo.w, h: theme.logo.h } }]
    : [];

  // Title Master -- centered title, logo top-right, accent bar bottom
  pptx.defineSlideMaster({
    title: 'TITLE_MASTER',
    background: { color: theme.bg },
    objects: [
      ...logoObjects,
      // Bottom accent bar
      { rect: { x: 0, y: 5.2, w: 10, h: 0.05, fill: { color: theme.accent } } },
    ],
    slideNumber: { x: '95%', y: '95%', color: theme.slideNum, fontSize: 9 },
  });

  // Content Master -- title bar top, logo corner, content area
  pptx.defineSlideMaster({
    title: 'CONTENT_MASTER',
    background: { color: theme.bg },
    objects: [
      ...logoObjects,
      // Top accent line
      { rect: { x: 0, y: 0, w: 10, h: 0.03, fill: { color: theme.accent } } },
    ],
    slideNumber: { x: '95%', y: '95%', color: theme.slideNum, fontSize: 9 },
  });

  // Two-Column Master -- split layout
  pptx.defineSlideMaster({
    title: 'TWO_COLUMN_MASTER',
    background: { color: theme.bg },
    objects: [
      ...logoObjects,
      // Top accent line
      { rect: { x: 0, y: 0, w: 10, h: 0.03, fill: { color: theme.accent } } },
    ],
    slideNumber: { x: '95%', y: '95%', color: theme.slideNum, fontSize: 9 },
  });

  // Section Break Master -- full-color background, centered text
  pptx.defineSlideMaster({
    title: 'SECTION_MASTER',
    background: { color: theme.accent },
    objects: [],
    slideNumber: { x: '95%', y: '95%', color: theme.bg, fontSize: 9 },
  });
}

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
          fontSize: 15,
          fontFace: theme.bodyFont,
          color: theme.body,
          bullet: { code: '2022', color: theme.accent },
          paraSpaceBefore: 6,
          paraSpaceAfter: 3,
          lineSpacingMultiple: 1.35,
        },
      });
    } else {
      items.push({
        text: seg.text,
        options: {
          fontSize: 15,
          fontFace: theme.bodyFont,
          color: theme.body,
          paraSpaceBefore: 4,
          paraSpaceAfter: 6,
          lineSpacingMultiple: 1.45,
        },
      });
    }
  }

  return items;
}

// ── Icon helper ────────────────────────────────────────────────────────────────

/**
 * Add an icon next to the slide title if specified.
 * Returns the x-offset adjustment for the title text.
 */
function addIconToSlide(slide, iconName, theme, x, y) {
  if (!iconName) return 0;
  const iconDataUri = getSlideIconDataUri(iconName, theme.accent);
  if (!iconDataUri) return 0;

  slide.addImage({
    data: iconDataUri,
    x,
    y,
    w: 0.35,
    h: 0.35,
  });

  return 0.45; // offset for title text
}

// ── Slide builders ─────────────────────────────────────────────────────────────

function addTitleSlide(pptx, title, subtitle, theme, slideNum, totalSlides, iconName) {
  const slide = pptx.addSlide({ masterName: 'TITLE_MASTER' });

  // Icon centered above title
  if (iconName) {
    const iconDataUri = getSlideIconDataUri(iconName, theme.accent);
    if (iconDataUri) {
      slide.addImage({
        data: iconDataUri,
        x: (SLIDE_W - 0.5) / 2,
        y: 1.0,
        w: 0.5,
        h: 0.5,
      });
    }
  }

  const titleY = iconName ? 1.6 : 1.4;

  // Main title -- centered vertically, slightly above center
  slide.addText(title || '', {
    x: MARGIN,
    y: titleY,
    w: CONTENT_W,
    h: 1.2,
    fontSize: 32,
    fontFace: theme.headingFont,
    bold: true,
    color: theme.title,
    align: 'center',
    valign: 'middle',
  });

  // Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN + 1.5,
      y: titleY + 1.4,
      w: CONTENT_W - 3,
      h: 0.8,
      fontSize: 18,
      fontFace: theme.bodyFont,
      color: theme.subtle,
      align: 'center',
      valign: 'top',
    });
  }

  // Accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN + 3,
    y: iconName ? 4.4 : 4.2,
    w: CONTENT_W - 6,
    h: 0.06,
    fill: { color: theme.accent },
  });

  addSlideNumber(slide, slideNum, totalSlides, theme);
  return slide;
}

function addContentSlide(pptx, slideData, theme, slideNum, totalSlides) {
  const slide = pptx.addSlide({ masterName: 'CONTENT_MASTER' });

  let titleXOffset = 0;

  // Slide title with optional icon
  if (slideData.title) {
    titleXOffset = addIconToSlide(slide, slideData.icon, theme, MARGIN, MARGIN + 0.05);

    slide.addText(slideData.title, {
      x: MARGIN + titleXOffset,
      y: MARGIN,
      w: CONTENT_W - titleXOffset,
      h: 0.6,
      fontSize: 28,
      fontFace: theme.headingFont,
      bold: true,
      color: theme.title,
      valign: 'top',
    });

    // Thin accent underline beneath title
    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN + titleXOffset,
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
  const slide = pptx.addSlide({ masterName: 'TWO_COLUMN_MASTER' });

  let titleXOffset = 0;

  // Slide title with optional icon
  if (slideData.title) {
    titleXOffset = addIconToSlide(slide, slideData.icon, theme, MARGIN, MARGIN + 0.05);

    slide.addText(slideData.title, {
      x: MARGIN + titleXOffset,
      y: MARGIN,
      w: CONTENT_W - titleXOffset,
      h: 0.6,
      fontSize: 28,
      fontFace: theme.headingFont,
      bold: true,
      color: theme.title,
      valign: 'top',
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN + titleXOffset,
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
  const slide = pptx.addSlide({ masterName: 'SECTION_MASTER' });

  // For section breaks, text is light on accent background
  const sectionTextColor = theme.bg;
  const sectionSubtleColor = lightenColor(theme.bg, 30) || theme.bg;

  // Icon centered above title
  if (slideData.icon) {
    const iconDataUri = getSlideIconDataUri(slideData.icon, theme.bg);
    if (iconDataUri) {
      slide.addImage({
        data: iconDataUri,
        x: (SLIDE_W - 0.5) / 2,
        y: 1.1,
        w: 0.5,
        h: 0.5,
      });
    }
  }

  const titleY = slideData.icon ? 1.8 : 1.5;

  // Large centered section title
  slide.addText(slideData.title || slideData.content || '', {
    x: MARGIN,
    y: titleY,
    w: CONTENT_W,
    h: 1.5,
    fontSize: 32,
    fontFace: theme.headingFont,
    bold: true,
    color: sectionTextColor,
    align: 'center',
    valign: 'middle',
  });

  // Accent bar centered beneath (using bg color for contrast)
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN + 3.5,
    y: titleY + 1.6,
    w: CONTENT_W - 7,
    h: 0.06,
    fill: { color: sectionTextColor },
  });

  // Optional subtitle-like content beneath the bar
  if (slideData.content && slideData.title) {
    const segments = parseContent(slideData.content);
    if (segments.length > 0) {
      const plainText = segments.map(s => s.text).join('\n');
      slide.addText(plainText, {
        x: MARGIN + 1.5,
        y: titleY + 1.9,
        w: CONTENT_W - 3,
        h: 0.8,
        fontSize: 16,
        fontFace: theme.bodyFont,
        color: sectionSubtleColor,
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
    color: theme.slideNum || theme.subtle,
    fontFace: theme.bodyFont,
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

// ── Async background worker ──────────────────────────────────────────────────

async function buildAndUploadPptx(config, context, taskId, placeholderMessageId) {
  const hb = setInterval(async () => {
    try { await pool.query('UPDATE ob_background_tasks SET last_heartbeat_at = NOW() WHERE id = $1', [taskId]); } catch(e) {}
  }, 5000);

  try {
    const title = (config.title || '').trim();
    const slides = Array.isArray(config.slides) ? config.slides : [];
    let themeName = config.theme || 'corporate';
    let theme;

    // Mark task as running
    await pool.query('UPDATE ob_background_tasks SET status = $1, last_heartbeat_at = NOW() WHERE id = $2', ['running', taskId]);

    // ── Resolve theme ────────────────────────────────────────────────────────
    if (themeName === 'brand') {
      let brandProfile = null;
      try {
        brandProfile = await getBrandProfile(context.brandId);
      } catch (e) {
        console.warn('[generate_pptx] Failed to fetch brand profile, falling back to corporate:', e.message);
      }

      if (brandProfile) {
        theme = buildBrandTheme(brandProfile);
      } else {
        // Fall back to corporate if no brand profile exists
        theme = THEMES.corporate;
        themeName = 'corporate';
      }
    } else {
      theme = THEMES[themeName] || THEMES.corporate;
    }

    const pptx = new PptxGenJS();

    // Apply font embedding if available
    if (withPPTXEmbedFonts) {
      try { withPPTXEmbedFonts(pptx); } catch(e) { /* non-critical */ }
    }

    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Lucy AI';
    pptx.title = title;

    // Define slide masters based on the resolved theme
    defineSlideMasters(pptx, theme);

    const totalSlides = slides.length + 1; // +1 for the cover

    // Cover slide (always first)
    addTitleSlide(pptx, title, null, theme, 1, totalSlides, null);

    // Content slides
    for (let i = 0; i < slides.length; i++) {
      const slideData = slides[i];
      const slideType = (slideData.type || 'content').toLowerCase();
      const slideNum = i + 2; // cover is 1

      switch (slideType) {
        case 'title':
          addTitleSlide(pptx, slideData.title || '', slideData.content || '', theme, slideNum, totalSlides, slideData.icon);
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

      // Progress update every slide
      pool.query('UPDATE ob_background_tasks SET progress = $1, last_heartbeat_at = NOW() WHERE id = $2',
        [JSON.stringify({ current_slide: i + 1, total_slides: slides.length, phase: 'building' }), taskId]).catch(() => {});
    }

    // Export to buffer
    const buffer = await pptx.write({ outputType: 'nodebuffer' });

    // Human-readable R2 key and filename
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50).toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${title} - ${dateStr}.pptx`;
    const r2Key = `pptx/${sanitizedTitle}_${dateStr}_${String(taskId).slice(0, 8)}.pptx`;

    // Update progress: uploading
    await pool.query('UPDATE ob_background_tasks SET progress = $1, last_heartbeat_at = NOW() WHERE id = $2',
      [JSON.stringify({ current_slide: slides.length, total_slides: slides.length, phase: 'uploading' }), taskId]);

    // Upload to R2 with one retry
    let url;
    try {
      url = await uploadToR2(
        r2Key,
        buffer,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        context.brandId
      );
    } catch (uploadErr) {
      // Wait 2s and retry once
      await new Promise(r => setTimeout(r, 2000));
      url = await uploadToR2(
        r2Key,
        buffer,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        context.brandId
      );
    }

    // Vault capture
    pool.query(`INSERT INTO vault_items (brand_id, user_id, filename, file_url, file_type, mime_type, source, task_id, created_at, updated_at)
  VALUES ($1, $2, $3, $4, 'presentation', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'generate_pptx', $5, NOW(), NOW())
  ON CONFLICT (task_id) WHERE task_id IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET file_url = EXCLUDED.file_url, updated_at = NOW()`,
      [context.brandId || 'ikawn', context.userId, filename, url, taskId]).catch(() => {});

    // Update placeholder message in-place
    if (placeholderMessageId) {
      await pool.query(
        `UPDATE memories SET content = $1, metadata = metadata || $2::jsonb WHERE id = $3`,
        [
          `Presentation "${config.title}" is ready (${slides.length} slides). [Download](${url})`,
          JSON.stringify({ type: 'artifact_complete', url, filename, slideCount: slides.length, taskId }),
          placeholderMessageId
        ]
      ).catch(() => {});
    }

    // Mark task complete
    await pool.query(
      'UPDATE ob_background_tasks SET status = $1, result = $2, completed_at = NOW(), last_heartbeat_at = NOW() WHERE id = $3',
      ['completed', JSON.stringify({
        summary: `Presentation "${config.title}" generated (${slides.length} slides)`,
        artifacts: [{ type: 'presentation', url, filename }],
        url, filename, slideCount: slides.length
      }), taskId]
    );

    // Telegram notification (fire-and-forget)
    sendTelegramMessage(
      `<b>Task Complete</b>: Presentation "${config.title}" (${slides.length} slides)\n<a href="${url}">Download</a>`
    ).catch(() => {});
  } catch (err) {
    console.error(`[generate_pptx] Background task ${taskId} failed:`, err);
    await pool.query(
      'UPDATE ob_background_tasks SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
      ['failed', err.message, taskId]
    ).catch(() => {});
    if (placeholderMessageId) {
      await pool.query(
        `UPDATE memories SET content = $1, metadata = metadata || $2::jsonb WHERE id = $3`,
        [`Failed to generate presentation: ${err.message}`, JSON.stringify({ type: 'artifact_failed', error: err.message, taskId }), placeholderMessageId]
      ).catch(() => {});
    }

    // Telegram failure notification (fire-and-forget)
    sendTelegramMessage(
      `<b>Task Failed</b>: Presentation "${config.title}"\nError: ${err.message}`
    ).catch(() => {});
  } finally {
    clearInterval(hb);
  }
}

// ── Tool export ────────────────────────────────────────────────────────────────

module.exports = {
  name: 'generate_pptx',
  description:
    'Generate a professional PowerPoint (PPTX) presentation from structured slide data. ' +
    'Supports title slides, content slides with bullet points, two-column layouts, and section breaks. ' +
    'Use theme "brand" to automatically apply the brand\'s colors, fonts, and logo. ' +
    'Each slide can optionally include an icon name for visual emphasis. ' +
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
        'icon (optional: icon name for visual emphasis -- e.g. "chart-bar", "target", "rocket", "lightbulb", "users", "shield"), ' +
        'notes (optional: speaker notes). For two-column slides, separate left/right content with "|||".',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Slide title' },
          content: { type: 'string', description: 'Slide body. Lines starting with "- " become bullets. For two-column, separate with "|||".' },
          type: { type: 'string', enum: ['title', 'content', 'two-column', 'section-break'], description: 'Slide layout type. Default: content' },
          icon: {
            type: 'string',
            description: 'Optional icon name to display next to the title. Available: ' + listIconNames().join(', '),
            enum: listIconNames(),
          },
          notes: { type: 'string', description: 'Speaker notes (optional)' },
        },
        required: ['title', 'content'],
      },
    },
    theme: {
      type: 'string',
      required: false,
      description: 'Presentation theme: "corporate" (white bg, navy text, gold accents), "dark" (navy bg, white text, gold accents), "light" (white bg, gray text, blue accents), or "brand" (uses brand profile colors, fonts, and logo). Default: "corporate".',
      enum: ['corporate', 'dark', 'light', 'brand'],
    },
  },

  retryTask: (task) => {
    try {
      const config = JSON.parse(task.context);
      pptxLimit(() => buildAndUploadPptx(config, {
        brandId: task.brand_id, userId: task.user_id, conversationId: task.conversation_id
      }, task.id, task.placeholder_message_id))
        .catch(err => console.error(`[generate_pptx] Retry failed for task #${task.id}:`, err));
    } catch (err) {
      console.error(`[generate_pptx] Failed to parse context for retry task #${task.id}:`, err);
    }
  },

  async execute(config, context) {
    const title = (config.title || '').trim();
    const slides = Array.isArray(config.slides) ? config.slides : [];

    // Validate inputs (sync errors)
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
      // Deduplication check
      const contextHash = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
      const existing = await pool.query(
        `SELECT id FROM ob_background_tasks WHERE user_id = $1 AND task_type = 'pptx_generation'
         AND status IN ('pending', 'running') AND context_hash = $2 AND created_at > NOW() - INTERVAL '30 seconds'`,
        [context.userId, contextHash]
      );
      if (existing.rows.length > 0) {
        return {
          success: true,
          data: { taskId: existing.rows[0].id, status: 'pending', taskType: 'pptx_generation' },
          summary: `Presentation is already being generated (task #${existing.rows[0].id}).`
        };
      }

      // Insert placeholder message
      const msgResult = await captureMessage({
        brand_id: context.brandId || 'ikawn',
        session_id: context.conversationId || context.sessionId,
        channel: 'chat',
        direction: 'outbound',
        content: `Generating presentation "${config.title}"...`,
        metadata: { type: 'artifact_pending', taskId: null },
        source_ref: null,
        user_id: context.userId,
        memory_type: 'task_result'
      });
      const placeholderMessageId = msgResult || null;

      // Insert task
      const taskResult = await pool.query(
        `INSERT INTO ob_background_tasks (brand_id, user_id, conversation_id, task_type, task_description, context, context_hash, placeholder_message_id, status)
         VALUES ($1, $2, $3, 'pptx_generation', $4, $5, $6, $7, 'pending') RETURNING id`,
        [context.brandId || 'ikawn', context.userId, context.conversationId || context.sessionId,
         `Generate presentation: ${config.title}`, JSON.stringify(config), contextHash, placeholderMessageId]
      );
      const taskId = taskResult.rows[0].id;

      // Update placeholder with taskId
      if (placeholderMessageId) {
        pool.query('UPDATE memories SET metadata = metadata || $1::jsonb WHERE id = $2',
          [JSON.stringify({ taskId }), placeholderMessageId]).catch(() => {});
      }

      // Fire async worker (no await)
      pptxLimit(() => buildAndUploadPptx(config, context, taskId, placeholderMessageId))
        .catch(err => console.error(`[generate_pptx] Unhandled error in async worker for task ${taskId}:`, err));

      // Return immediately
      return {
        success: true,
        data: { taskId, status: 'pending', taskType: 'pptx_generation', description: `Generating presentation: ${config.title}` },
        summary: `Presentation "${config.title}" has been queued for generation. The user can already see a live progress card in the UI — do NOT repeat the status or say "building presentation." Instead, briefly confirm what you're creating (topic, slide count) and mention they'll be able to download it when ready.`
      };
    } catch (err) {
      console.error('[generate_pptx] Failed to enqueue task:', err);
      return {
        success: false,
        data: null,
        summary: `Failed to start presentation generation: ${err.message}`,
      };
    }
  },
};
