// src/tools/generate_pptx.tool.js
'use strict';

const PptxGenJS = require('pptxgenjs');
const crypto = require('crypto');
const { uploadToR2 } = require('../utils/storage');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');

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

// ── Async background worker ──────────────────────────────────────────────────

async function buildAndUploadPptx(config, context, taskId, placeholderMessageId) {
  const hb = setInterval(async () => {
    try { await pool.query('UPDATE ob_background_tasks SET last_heartbeat_at = NOW() WHERE id = $1', [taskId]); } catch(e) {}
  }, 5000);

  try {
    const title = (config.title || '').trim();
    const slides = Array.isArray(config.slides) ? config.slides : [];
    const themeName = THEMES[config.theme] ? config.theme : 'corporate';
    const theme = THEMES[themeName];

    // Mark task as running
    await pool.query('UPDATE ob_background_tasks SET status = $1, last_heartbeat_at = NOW() WHERE id = $2', ['running', taskId]);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Lucy AI';
    pptx.title = title;

    const totalSlides = slides.length + 1; // +1 for the cover

    // Cover slide (always first)
    addTitleSlide(pptx, title, null, theme, 1, totalSlides);

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

      // Progress updates every 5 slides
      if (i % 5 === 0) {
        pool.query('UPDATE ob_background_tasks SET progress = $1, last_heartbeat_at = NOW() WHERE id = $2',
          [JSON.stringify({ step: `Building slide ${i + 1}/${slides.length}`, pct: Math.round((i / slides.length) * 80) }), taskId]).catch(() => {});
      }
    }

    // Export to buffer
    const buffer = await pptx.write({ outputType: 'nodebuffer' });

    // Idempotent R2 key
    const safeName = sanitizeFilename(title);
    const filename = `${safeName}.pptx`;
    const r2Key = `pptx/${taskId}.pptx`;

    // Update progress: uploading
    await pool.query('UPDATE ob_background_tasks SET progress = $1, last_heartbeat_at = NOW() WHERE id = $2',
      [JSON.stringify({ step: 'Uploading presentation...', pct: 90 }), taskId]);

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
        slideCount: slides.length
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
        summary: `Presentation "${config.title}" is being generated in the background. You will be notified when it is ready.`
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
