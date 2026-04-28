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
  description: 'Generate a complete, self-contained, BRAND-AWARE HTML report or page. ALWAYS use this when the user asks for a "report", "investor brief", "one-pager", "memo", "summary document", landing page, dashboard, prototype, or visualization. The HTML must include all styles inline, must use the active brand\'s color palette and typography (passed via injected brand context), and must be fully functional as a standalone file. Do NOT use this for casual replies, greetings, or short factual questions — those stay as plain text in chat.',
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
    const { html: rawHtml, title, summary } = config;
    const { brandId = 'ikawn', userId, conversationId, pool } = context;

    if (!rawHtml || !title) {
      return { success: false, data: null, summary: 'Missing required fields: html and title' };
    }

    // Load brand context (palette, fonts) for guaranteed branding
    let brandPalette = null;
    let brandDisplayName = brandId;
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT display_name, preferences FROM brand_context WHERE brand_id = $1 LIMIT 1`,
          [brandId]
        );
        if (rows.length > 0) {
          brandDisplayName = rows[0].display_name || brandId;
          const prefs = rows[0].preferences || {};
          brandPalette = {
            primary:    prefs.colors && prefs.colors.primary    ? prefs.colors.primary    : null,
            secondary:  prefs.colors && prefs.colors.secondary  ? prefs.colors.secondary  : null,
            background: prefs.colors && prefs.colors.background ? prefs.colors.background : '#FFFFFF',
            heading:    prefs.fonts  && prefs.fonts.heading     ? prefs.fonts.heading     : 'Inter',
            body:       prefs.fonts  && prefs.fonts.body        ? prefs.fonts.body        : 'Inter',
          };
        }
      } catch (err) {
        console.warn('[generate_html] Brand context load failed:', err.message);
      }
    }

    // Inject brand CSS variables into <head> if palette present and HTML has not already styled itself with brand vars
    let html = rawHtml;
    if (brandPalette && brandPalette.primary && /<head[^>]*>/i.test(html) && !/--brand-primary/i.test(html)) {
      const brandStyle = `<style>:root{--brand-primary:${brandPalette.primary};--brand-secondary:${brandPalette.secondary || brandPalette.primary};--brand-bg:${brandPalette.background};--brand-heading:'${brandPalette.heading}',sans-serif;--brand-body:'${brandPalette.body}',sans-serif;}body{font-family:var(--brand-body);background:var(--brand-bg);}h1,h2,h3,h4{font-family:var(--brand-heading);color:var(--brand-primary);}a{color:var(--brand-primary);}</style>`;
      html = html.replace(/<head[^>]*>/i, function(m) { return m + brandStyle; });
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
        data: { url, filename, title, size: `${sizeKb} KB`, brandId, brandDisplayName, palette: brandPalette },
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
