'use strict';

const crypto = require('crypto');

// ── HTML Validation (ported from open-codesign packages/core/src/tools/done.ts) ──

const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr',
]);

function findUnclosedTags(html) {
  const errors = [];
  const stack = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\s*[^>]*\/?>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const full = match[0];
    const tagName = match[1].toLowerCase();
    if (VOID_ELEMENTS.has(tagName) || full.endsWith('/>')) continue;
    if (full.startsWith('</')) {
      if (stack.length > 0 && stack[stack.length - 1] === tagName) {
        stack.pop();
      } else {
        errors.push(`Unexpected closing tag </${tagName}>`);
      }
    } else {
      stack.push(tagName);
    }
  }
  for (const tag of stack) {
    errors.push(`Unclosed tag <${tag}>`);
  }
  return errors;
}

function findDuplicateIds(html) {
  const errors = [];
  const idRegex = /\bid=["']([^"']+)["']/gi;
  const seen = new Map();
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    const id = match[1];
    if (seen.has(id)) {
      errors.push(`Duplicate id="${id}"`);
    } else {
      seen.set(id, true);
    }
  }
  return errors;
}

function findMissingAlt(html) {
  const errors = [];
  const imgRegex = /<img\s[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    if (!/\balt\s*=/i.test(match[0])) {
      errors.push('Image missing alt attribute');
    }
  }
  return errors;
}

function validateHtml(html) {
  return [
    ...findUnclosedTags(html),
    ...findDuplicateIds(html),
    ...findMissingAlt(html),
  ];
}

// ── Tool Definition ──

module.exports = {
  name: 'generate_html',
  description: 'Generate a complete, self-contained HTML page. The HTML must include all styles inline (or via CDN links) and be fully functional as a standalone file. Use this for landing pages, dashboards, prototypes, data visualizations, and interactive demos.',
  tier: 'direct',
  costTier: 'medium',

  parameters: {
    html: {
      type: 'string',
      required: true,
      description: 'Complete HTML document including <!DOCTYPE html>, <html>, <head>, and <body>. All CSS must be inline or via CDN. All JS must be inline or via CDN. The page must be fully self-contained.',
    },
    title: {
      type: 'string',
      required: true,
      description: 'Page title (used for filename and display)',
    },
    summary: {
      type: 'string',
      required: false,
      description: 'Brief description of what was built',
    },
  },

  async execute(config, context) {
    const { html, title, summary } = config;
    const { brandId = 'ikawn', userId, conversationId, pool } = context;

    if (!html || !title) {
      return { success: false, data: null, summary: 'Missing required fields: html and title' };
    }

    // Validate HTML
    const validationErrors = validateHtml(html);
    if (validationErrors.length > 0) {
      return {
        success: false,
        data: null,
        summary: `HTML validation failed:\n${validationErrors.map(e => `- ${e}`).join('\n')}\n\nPlease fix these issues and try again.`,
      };
    }

    try {
      const { uploadToR2 } = require('../utils/storage');

      // Generate filename
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      const date = new Date().toISOString().slice(0, 10);
      const hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 8);
      const filename = `${slug}-${date}-${hash}.html`;

      // Upload to R2
      const key = `artifacts/${brandId}/${userId || 'system'}/${filename}`;
      const buffer = Buffer.from(html, 'utf-8');
      const url = await uploadToR2(key, buffer, 'text/html', brandId);

      // Store in vault
      if (pool && userId) {
        pool.query(
          `INSERT INTO vault_items
           (brand_id, user_id, filename, file_url, file_type, mime_type, source, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'html', 'text/html', 'generate_html', $5, NOW(), NOW())
           ON CONFLICT (file_url) WHERE deleted_at IS NULL DO NOTHING`,
          [brandId, userId, filename, url, JSON.stringify({ title, summary: summary || null, size: buffer.length })]
        ).catch(err => console.warn('[generate_html] Vault insert failed:', err.message));
      }

      const sizeKb = (buffer.length / 1024).toFixed(1);

      return {
        success: true,
        data: { url, filename, title, size: `${sizeKb} KB` },
        summary: summary
          ? `${summary}\n\nYour page is ready: ${url}`
          : `Generated "${title}" (${sizeKb} KB). View it here: ${url}`,
      };
    } catch (err) {
      console.error('[generate_html] Failed:', err.message);
      return { success: false, data: null, summary: `HTML generation failed: ${err.message}` };
    }
  },
};
