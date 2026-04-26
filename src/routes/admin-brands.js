'use strict';

const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const brandContextHelpers = require('../utils/brand-context');
const pptxAnalyzer = require('../services/pptx-template-analyzer');
const storage = require('../utils/storage');
const { RUHI_FAVICON_LINK, INSTANCE_NAME } = require('../utils/ruhi-assets');

const router = Router();

router.use(requireAdmin);

const BRAND_ID_RE = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const VALID_SURFACES = ['general', 'pptx', 'document', 'spreadsheet'];

const UPDATABLE_FIELDS = [
  'display_name',
  'industry',
  'tone',
  'tone_of_voice',
  'target_audience',
  'brand_guidelines',
  'preferences',
  'connected_platforms',
  'system_prompt_override',
  'context_injection',
];

function pickUpdates(body) {
  const updates = {};
  for (const key of UPDATABLE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      updates[key] = body[key];
    }
  }
  return updates;
}

router.get('/api/admin/brands', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        bc.brand_id,
        bc.display_name,
        bc.industry,
        bc.tone,
        bc.updated_at,
        COALESCE(profile.has_profile, FALSE) AS has_profile,
        COALESCE(profile.has_logo, FALSE) AS has_logo,
        profile.heading_font,
        profile.body_font,
        COALESCE(asset.template_count, 0) AS template_count,
        COALESCE(knowledge.knowledge_count, 0) AS knowledge_count
      FROM brand_context bc
      LEFT JOIN LATERAL (
        SELECT TRUE AS has_profile,
               (jsonb_array_length(COALESCE(metadata->'profile'->'logos', '[]'::jsonb)) > 0) AS has_logo,
               metadata->'profile'->'fonts'->>'heading' AS heading_font,
               metadata->'profile'->'fonts'->>'body' AS body_font
          FROM vault_items
         WHERE vault_items.brand_id = bc.brand_id
           AND vault_items.file_type = 'brand-profile'
           AND vault_items.deleted_at IS NULL
         ORDER BY vault_items.created_at DESC
         LIMIT 1
      ) profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS template_count
          FROM vault_items
         WHERE vault_items.brand_id = bc.brand_id
           AND 'brand-asset' = ANY(vault_items.tags)
           AND vault_items.deleted_at IS NULL
      ) asset ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS knowledge_count
          FROM brand_knowledge bk
         WHERE bk.brand_id = bc.brand_id
      ) knowledge ON TRUE
      ORDER BY bc.updated_at DESC NULLS LAST, bc.brand_id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Admin brands list error:', err);
    res.status(500).json({ error: 'Failed to list brands' });
  }
});

router.get('/api/admin/brands/:brandId', async (req, res) => {
  const { brandId } = req.params;
  try {
    const ctxRes = await pool.query(
      `SELECT brand_id, display_name, industry, tone, tone_of_voice,
              target_audience, brand_guidelines, preferences,
              connected_platforms, system_prompt_override, context_injection,
              updated_at
         FROM brand_context
        WHERE brand_id = $1`,
      [brandId],
    );
    if (ctxRes.rowCount === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const vaultRes = await pool.query(
      `SELECT id, filename, file_url, file_type, mime_type, file_size,
              source, folder, tags, metadata, created_at
         FROM vault_items
        WHERE brand_id = $1
          AND deleted_at IS NULL
          AND (file_type = 'brand-profile' OR 'brand-asset' = ANY(tags))
        ORDER BY created_at DESC`,
      [brandId],
    );

    const knowledgeRes = await pool.query(
      `SELECT doc_type, content, updated_at
         FROM brand_knowledge
        WHERE brand_id = $1
        ORDER BY doc_type ASC`,
      [brandId],
    );

    res.json({
      context: ctxRes.rows[0],
      vault: vaultRes.rows,
      knowledge: knowledgeRes.rows,
    });
  } catch (err) {
    console.error('Admin brands get error:', err);
    res.status(500).json({ error: 'Failed to load brand' });
  }
});

router.post('/api/admin/brands', async (req, res) => {
  const body = req.body || {};
  const { brand_id, display_name } = body;

  if (!brand_id || typeof brand_id !== 'string') {
    return res.status(400).json({ error: 'brand_id is required' });
  }
  if (!BRAND_ID_RE.test(brand_id)) {
    return res.status(400).json({
      error: 'brand_id must be lowercase alphanumeric with hyphens (3-100 chars, no leading/trailing hyphen)',
    });
  }
  if (!display_name || typeof display_name !== 'string') {
    return res.status(400).json({ error: 'display_name is required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO brand_context
         (brand_id, display_name, industry, tone, tone_of_voice, target_audience)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING brand_id, display_name, industry, tone, tone_of_voice,
                 target_audience, brand_guidelines, preferences,
                 connected_platforms, system_prompt_override,
                 context_injection, updated_at`,
      [
        brand_id,
        display_name,
        body.industry || null,
        body.tone || null,
        body.tone_of_voice || null,
        body.target_audience || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'brand_id already exists' });
    }
    console.error('Admin brands create error:', err);
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

router.put('/api/admin/brands/:brandId', async (req, res) => {
  const updates = pickUpdates(req.body);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const setClauses = [];
  const values = [];
  Object.entries(updates).forEach(([key, value]) => {
    setClauses.push(`${key} = $${values.length + 1}`);
    values.push(value);
  });
  setClauses.push('updated_at = NOW()');
  values.push(req.params.brandId);

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE brand_context
          SET ${setClauses.join(', ')}
        WHERE brand_id = $${values.length}
        RETURNING brand_id, display_name, industry, tone, tone_of_voice,
                  target_audience, brand_guidelines, preferences,
                  connected_platforms, system_prompt_override,
                  context_injection, updated_at`,
      values,
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Admin brands update error:', err);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

router.delete('/api/admin/brands/:brandId/asset/:vaultId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE vault_items
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND brand_id = $2 AND deleted_at IS NULL`,
      [req.params.vaultId, req.params.brandId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Asset not found for brand' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin brands delete asset error:', err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

router.post('/api/admin/brands/:brandId/reanalyze', async (req, res) => {
  const { brandId } = req.params;
  const { vaultId } = req.body || {};
  try {
    const params = [brandId];
    let query = `
      SELECT id, filename, file_url, file_type, mime_type
        FROM vault_items
       WHERE brand_id = $1
         AND deleted_at IS NULL
         AND file_url IS NOT NULL
         AND ('brand-asset' = ANY(tags) OR file_type = 'brand-profile')
         AND (mime_type ILIKE '%presentation%' OR filename ILIKE '%.pptx')
    `;
    if (vaultId) {
      params.push(vaultId);
      query += ` AND id = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 1';

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'No stored .pptx found for this brand. Upload a template first.',
      });
    }

    const source = rows[0];
    const buffer = await storage.downloadFromUrl(source.file_url);
    const profile = await pptxAnalyzer.analyzeTemplate(buffer, source.filename);
    if (!profile) {
      return res.status(422).json({ error: 'Analyzer returned no profile' });
    }
    await pptxAnalyzer.saveBrandProfile(brandId, profile, source.file_url);
    res.json({
      ok: true,
      sourceVaultItemId: source.id,
      sourceUrl: source.file_url,
    });
  } catch (err) {
    console.error('Admin brands reanalyze error:', err);
    res.status(500).json({ error: err.message || 'Re-analyze failed' });
  }
});

router.get('/api/admin/brands/:brandId/preview-prompt', async (req, res) => {
  const surface = String(req.query.surface || 'general');
  if (!VALID_SURFACES.includes(surface)) {
    return res.status(400).json({
      error: `Invalid surface. Allowed: ${VALID_SURFACES.join(', ')}`,
    });
  }

  try {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM brand_context WHERE brand_id = $1',
      [req.params.brandId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const userId = req.session && req.session.user ? req.session.user.id : null;
    const profile = await brandContextHelpers.getBrandContextForUser(userId, req.params.brandId, pool);
    const block = brandContextHelpers.buildBrandContextBlock(profile, { surface });
    res.json({ surface, block, profile });
  } catch (err) {
    console.error('Admin brands preview error:', err);
    res.status(500).json({ error: 'Failed to render preview' });
  }
});

router.post('/api/admin/brands/:brandId/knowledge', async (req, res) => {
  const { doc_type, content } = req.body || {};
  if (!doc_type || typeof doc_type !== 'string') {
    return res.status(400).json({ error: 'doc_type is required' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO brand_knowledge (brand_id, doc_type, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (brand_id, doc_type)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
       RETURNING brand_id, doc_type, content, updated_at`,
      [req.params.brandId, doc_type, content],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Admin brands knowledge upsert error:', err);
    res.status(500).json({ error: 'Failed to save knowledge entry' });
  }
});

router.delete('/api/admin/brands/:brandId/knowledge/:docType', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM brand_knowledge
        WHERE brand_id = $1 AND doc_type = $2`,
      [req.params.brandId, req.params.docType],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin brands knowledge delete error:', err);
    res.status(500).json({ error: 'Failed to delete knowledge entry' });
  }
});

// ── HTML page helpers ──

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function relativeTime(value) {
  if (!value) return 'Never';
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return 'Never';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function pageShellCss() {
  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0a0a0a;
      --bg-sidebar: rgb(8,8,8);
      --bg-card: #18181b;
      --bg-input: #0a0a0a;
      --bg-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.08);
      --border-solid: #27272a;
      --border-strong: #3f3f46;
      --text: #fafafa;
      --text-dim: #a1a1aa;
      --text-muted: #71717a;
      --accent: #FFC01C;
      --accent-soft: rgba(255,192,28,0.08);
      --accent-border: rgba(255,192,28,0.25);
      --accent-hover: #d19a15;
      --green: #22c55e;
      --red: #ef4444;
      --amber: #f59e0b;
      --rail-w: 48px;
    }
    body { font-family: 'Google Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .sidebar-rail {
      position: fixed; left: 0; top: 0; bottom: 0; width: var(--rail-w);
      background: var(--bg-sidebar); border-right: 1px solid var(--border-solid);
      display: flex; flex-direction: column; align-items: center;
      padding: 12px 0; z-index: 100;
    }
    .rail-logo {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--accent); display: flex; align-items: center; justify-content: center;
      cursor: pointer; margin-bottom: 20px;
      font-size: 1.1rem; color: rgb(5,5,5); font-weight: 700;
    }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; align-items: center; flex: 1; }
    .rail-btn {
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: transparent; color: var(--text-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .rail-btn:hover { background: var(--bg-hover); color: var(--text); }
    .rail-btn.active { color: var(--accent); background: var(--accent-soft); }
    .rail-btn svg { width: 18px; height: 18px; }
    .rail-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 4px; align-items: center; }
    .rail-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--border-solid); color: var(--text-dim);
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 600;
    }

    .page-wrapper { margin-left: var(--rail-w); }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 32px; border-bottom: 1px solid var(--border);
      gap: 12px; flex-wrap: wrap;
    }
    .header h1 { font-family: 'Parkinsans', sans-serif; font-size: 1.5rem; font-weight: 600; }
    .header .subtitle { color: var(--text-dim); margin-top: 4px; font-size: 0.875rem; }
    .header-right { display: flex; gap: 10px; align-items: center; }
    .crumbs { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; }
    .crumbs a { color: var(--text-dim); }

    .content-area { padding: 28px 32px; max-width: 1100px; margin: 0 auto; }

    .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-family: inherit; font-weight: 500; transition: background 0.15s, opacity 0.15s; }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #0a0a0a; font-weight: 600; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
    .btn-outline { background: transparent; border: 1px solid var(--border-solid); color: var(--text); }
    .btn-outline:hover:not(:disabled) { background: var(--border-solid); }
    .btn-danger { background: var(--red); color: #fff; }
    .btn-danger:hover:not(:disabled) { background: #dc2626; }
    .btn-sm { padding: 5px 10px; font-size: 0.78rem; }
    .btn-ghost { background: transparent; border: none; color: var(--text-dim); padding: 4px 8px; font-size: 0.8rem; cursor: pointer; font-family: inherit; }
    .btn-ghost:hover { color: var(--text); }

    .card { background: var(--bg-card); border: 1px solid var(--border-solid); border-radius: 12px; padding: 20px; margin-bottom: 18px; }
    .card h2 { font-family: 'Parkinsans', sans-serif; font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
    .card .card-desc { color: var(--text-dim); font-size: 0.83rem; margin-bottom: 14px; }

    table.data-table { width: 100%; border-collapse: collapse; }
    table.data-table th, table.data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 0.86rem; }
    table.data-table th { color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    table.data-table tbody tr { cursor: pointer; transition: background 0.15s; }
    table.data-table tbody tr:hover { background: var(--bg-hover); }
    table.data-table td .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; background: var(--border-solid); color: var(--text-dim); }
    table.data-table td .pill.yes { background: rgba(34,197,94,0.12); color: var(--green); }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .empty-state h3 { font-size: 1.1rem; color: var(--text-dim); margin-bottom: 8px; }
    .empty-state p { font-size: 0.875rem; margin-bottom: 20px; }

    .form-grid { display: grid; gap: 14px; }
    .form-group label { display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 4px; font-weight: 500; }
    .form-group .hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; padding: 10px 12px; background: var(--bg-input);
      border: 1px solid var(--border-solid); border-radius: 8px;
      color: var(--text); font-size: 0.875rem; font-family: inherit;
    }
    .form-group textarea { min-height: 96px; resize: vertical; line-height: 1.45; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255,192,28,0.18); }
    .form-actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; }

    .feedback { font-size: 0.83rem; margin-left: 8px; }
    .feedback.ok { color: var(--green); }
    .feedback.err { color: var(--red); }

    .swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .swatch { width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--border); position: relative; }
    .swatch-label { font-size: 0.65rem; color: var(--text-muted); position: absolute; bottom: -16px; left: 0; right: 0; text-align: center; }
    .visual-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 28px; font-size: 0.83rem; color: var(--text-dim); }
    .visual-meta .label { font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; font-weight: 600; }
    .logo-preview { max-width: 160px; max-height: 80px; padding: 10px; border: 1px solid var(--border-solid); border-radius: 8px; background: #fff; }

    .asset-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .asset-row:last-child { border-bottom: none; }
    .asset-name { font-size: 0.86rem; }
    .asset-meta { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
    .asset-actions { display: flex; gap: 6px; }

    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
    .tab { padding: 8px 14px; cursor: pointer; font-size: 0.85rem; color: var(--text-muted); border-bottom: 2px solid transparent; background: none; border-left: none; border-right: none; border-top: none; font-family: inherit; }
    .tab:hover { color: var(--text-dim); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    pre.prompt-block {
      white-space: pre-wrap; font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
      font-size: 0.78rem; line-height: 1.55; max-height: 420px; overflow-y: auto;
      background: var(--bg-input); border: 1px solid var(--border-solid);
      border-radius: 8px; padding: 14px; color: var(--text-dim);
    }

    .toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 10px; font-size: 0.875rem; display: none; z-index: 200; }
    .toast-success { background: var(--green); color: #fff; }
    .toast-error { background: var(--red); color: #fff; }

    .layout-split { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
    .section-rail { position: sticky; top: 24px; align-self: start; display: flex; flex-direction: column; gap: 4px; }
    .section-rail a {
      padding: 8px 12px; font-size: 0.85rem; color: var(--text-dim);
      border-radius: 8px; border-left: 2px solid transparent;
    }
    .section-rail a:hover { background: var(--bg-hover); color: var(--text); text-decoration: none; }
    .section-rail a.active { color: var(--accent); border-left-color: var(--accent); background: var(--accent-soft); }

    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .page-wrapper { margin-left: 0; }
      .header, .content-area { padding-left: 16px; padding-right: 16px; }
      .layout-split { grid-template-columns: 1fr; }
      .section-rail { position: static; flex-direction: row; overflow-x: auto; }
    }
  `;
}

function pageShellNav(user) {
  const isAdmin = user && user.role === 'admin';
  const initial = ((user && (user.name || user.email)) || '?')[0].toUpperCase();
  return `
  <nav class="sidebar-rail">
    <div class="rail-logo" title="${escapeHtml(INSTANCE_NAME)}" onclick="window.location.href='/'">✦</div>
    <div class="rail-nav">
      <button class="rail-btn" onclick="window.location.href='/'" title="Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/vault'" title="Vault">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      </button>
      ${isAdmin ? `<button class="rail-btn active" onclick="window.location.href='/admin/brands'" title="Brands">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      </button>` : ''}
    </div>
    <div class="rail-bottom">
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/admin/brain-health'" title="Brain Health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </button>` : ''}
      <div class="rail-avatar" title="${escapeHtml((user && (user.name || user.email)) || '')}">${escapeHtml(initial)}</div>
    </div>
  </nav>`;
}

function pageHead(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(INSTANCE_NAME)} | ${escapeHtml(title)}</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Parkinsans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${pageShellCss()}</style>
</head>`;
}

// ── Page: GET /admin/brands (list) ──

router.get('/admin/brands', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        bc.brand_id,
        bc.display_name,
        bc.industry,
        bc.updated_at,
        COALESCE(profile.has_profile, FALSE) AS has_profile,
        COALESCE(profile.has_logo, FALSE) AS has_logo,
        profile.heading_font,
        profile.body_font,
        COALESCE(asset.template_count, 0) AS template_count
      FROM brand_context bc
      LEFT JOIN LATERAL (
        SELECT TRUE AS has_profile,
               (jsonb_array_length(COALESCE(metadata->'profile'->'logos', '[]'::jsonb)) > 0) AS has_logo,
               metadata->'profile'->'fonts'->>'heading' AS heading_font,
               metadata->'profile'->'fonts'->>'body' AS body_font
          FROM vault_items
         WHERE vault_items.brand_id = bc.brand_id
           AND vault_items.file_type = 'brand-profile'
           AND vault_items.deleted_at IS NULL
         ORDER BY vault_items.created_at DESC
         LIMIT 1
      ) profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS template_count
          FROM vault_items
         WHERE vault_items.brand_id = bc.brand_id
           AND 'brand-asset' = ANY(vault_items.tags)
           AND vault_items.deleted_at IS NULL
      ) asset ON TRUE
      ORDER BY bc.updated_at DESC NULLS LAST, bc.brand_id ASC
    `);
    res.type('html').send(brandsListPage(req.session.user, rows));
  } catch (err) {
    console.error('Admin brands list page error:', err);
    res.status(500).type('html').send(errorPage('Failed to load brands', err.message));
  }
});

function brandsListPage(user, brands) {
  const rowsHtml = brands.length === 0
    ? `<tr><td colspan="6"><div class="empty-state"><h3>No brands yet</h3><p>Create your first brand to start managing context, templates, and assets.</p><a class="btn btn-primary" href="/admin/brands/new" style="text-decoration:none">+ New brand</a></div></td></tr>`
    : brands.map((b) => {
      const fonts = [b.heading_font, b.body_font].filter(Boolean).join(' / ') || '—';
      return `<tr onclick="window.location.href='/admin/brands/${encodeURIComponent(b.brand_id)}'">
          <td><strong>${escapeHtml(b.brand_id)}</strong></td>
          <td>${escapeHtml(b.display_name || '—')}</td>
          <td>${escapeHtml(b.industry || '—')}</td>
          <td>${b.template_count > 0 ? `<span class="pill yes">✓ ${b.template_count}</span>` : '<span class="pill">—</span>'}</td>
          <td>${b.has_logo ? '<span class="pill yes">✓</span>' : '<span class="pill">—</span>'}</td>
          <td>${escapeHtml(fonts)}</td>
          <td>${escapeHtml(relativeTime(b.updated_at))}</td>
        </tr>`;
    }).join('');

  return `${pageHead('Brands')}
<body>
  ${pageShellNav(user)}
  <div class="page-wrapper">
    <div class="header">
      <div>
        <h1>Brands</h1>
        <p class="subtitle">Manage brand context, templates, and knowledge for every tenant.</p>
      </div>
      <div class="header-right">
        <a href="/admin" class="btn btn-outline" style="text-decoration:none">Admin</a>
        <a href="/admin/brands/new" class="btn btn-primary" style="text-decoration:none">+ New brand</a>
      </div>
    </div>
    <div class="content-area">
      <div class="card" style="padding:0; overflow:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Brand ID</th>
              <th>Display name</th>
              <th>Industry</th>
              <th>Template</th>
              <th>Logo</th>
              <th>Fonts</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Page: GET /admin/brands/new ──

router.get('/admin/brands/new', (req, res) => {
  res.type('html').send(brandNewPage(req.session.user));
});

function brandNewPage(user) {
  return `${pageHead('New brand')}
<body>
  ${pageShellNav(user)}
  <div class="page-wrapper">
    <div class="header">
      <div>
        <div class="crumbs"><a href="/admin/brands">Brands</a> / New</div>
        <h1>New brand</h1>
        <p class="subtitle">Create a brand context. You can upload templates and add knowledge after.</p>
      </div>
      <div class="header-right">
        <a href="/admin/brands" class="btn btn-outline" style="text-decoration:none">Cancel</a>
      </div>
    </div>
    <div class="content-area" style="max-width:680px">
      <div class="card">
        <h2>Identity</h2>
        <p class="card-desc">All fields except brand ID and display name are optional and editable later.</p>
        <form id="new-brand-form" class="form-grid" autocomplete="off">
          <div class="form-group">
            <label for="display_name">Display name</label>
            <input type="text" id="display_name" name="display_name" required maxlength="200" placeholder="MaxFashion">
          </div>
          <div class="form-group">
            <label for="brand_id">Brand ID (slug)</label>
            <input type="text" id="brand_id" name="brand_id" required pattern="^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$" placeholder="maxfashion">
            <div class="hint">Lowercase alphanumeric and hyphens. 3-100 chars. No leading/trailing hyphen. Pattern: <code>^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$</code></div>
          </div>
          <div class="form-group">
            <label for="industry">Industry</label>
            <input type="text" id="industry" name="industry" maxlength="120" placeholder="Fashion retail">
          </div>
          <div class="form-group">
            <label for="tone">Tone</label>
            <input type="text" id="tone" name="tone" maxlength="120" placeholder="Confident, modern, premium">
          </div>
          <div class="form-group">
            <label for="target_audience">Target audience</label>
            <input type="text" id="target_audience" name="target_audience" maxlength="240" placeholder="Urban shoppers, 22-45">
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="submit-btn">Create brand</button>
            <span class="feedback" id="feedback" role="status"></span>
          </div>
        </form>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var form = document.getElementById('new-brand-form');
      var slug = document.getElementById('brand_id');
      var name = document.getElementById('display_name');
      var btn = document.getElementById('submit-btn');
      var feedback = document.getElementById('feedback');
      var slugTouched = false;

      slug.addEventListener('input', function() { slugTouched = true; });
      name.addEventListener('input', function() {
        if (slugTouched) return;
        var s = name.value.toLowerCase()
          .replace(/[^a-z0-9\\s-]/g, '')
          .trim()
          .replace(/\\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        slug.value = s;
      });

      function setFeedback(msg, kind) {
        feedback.textContent = msg || '';
        feedback.className = 'feedback' + (kind ? ' ' + kind : '');
      }

      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        setFeedback('', '');
        var payload = {
          brand_id: slug.value.trim(),
          display_name: name.value.trim(),
          industry: document.getElementById('industry').value.trim() || null,
          tone: document.getElementById('tone').value.trim() || null,
          target_audience: document.getElementById('target_audience').value.trim() || null,
        };
        if (!/^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/.test(payload.brand_id)) {
          setFeedback('Slug does not match pattern.', 'err');
          return;
        }
        if (!payload.display_name) {
          setFeedback('Display name is required.', 'err');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          var res = await fetch('/api/admin/brands', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          var data = await res.json().catch(function() { return {}; });
          if (res.status === 409) {
            setFeedback('Slug already exists. Pick a different brand ID.', 'err');
            return;
          }
          if (!res.ok) {
            setFeedback((data && data.error) || ('Request failed (' + res.status + ').'), 'err');
            return;
          }
          window.location.href = '/admin/brands/' + encodeURIComponent(data.brand_id);
        } catch (err) {
          setFeedback('Network error: ' + err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create brand';
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ── Page: GET /admin/brands/:brandId ──

router.get('/admin/brands/:brandId', async (req, res) => {
  const { brandId } = req.params;
  try {
    const ctxRes = await pool.query(
      `SELECT brand_id, display_name, industry, tone, tone_of_voice,
              target_audience, brand_guidelines, preferences,
              connected_platforms, system_prompt_override, context_injection,
              updated_at
         FROM brand_context
        WHERE brand_id = $1`,
      [brandId],
    );
    if (ctxRes.rowCount === 0) {
      return res.status(404).type('html').send(errorPage('Brand not found', `No brand with id <code>${escapeHtml(brandId)}</code>.`));
    }

    const vaultRes = await pool.query(
      `SELECT id, filename, file_url, file_type, mime_type, file_size,
              tags, metadata, created_at
         FROM vault_items
        WHERE brand_id = $1
          AND deleted_at IS NULL
          AND (file_type = 'brand-profile' OR 'brand-asset' = ANY(tags))
        ORDER BY created_at DESC`,
      [brandId],
    );
    const knowledgeRes = await pool.query(
      `SELECT doc_type, content, updated_at
         FROM brand_knowledge
        WHERE brand_id = $1
        ORDER BY doc_type ASC`,
      [brandId],
    );

    const profileRow = vaultRes.rows.find((r) => r.file_type === 'brand-profile');
    const assets = vaultRes.rows.filter((r) => Array.isArray(r.tags) && r.tags.includes('brand-asset'));
    res.type('html').send(brandDetailPage(req.session.user, ctxRes.rows[0], profileRow, assets, knowledgeRes.rows));
  } catch (err) {
    console.error('Admin brands detail page error:', err);
    res.status(500).type('html').send(errorPage('Failed to load brand', err.message));
  }
});

function brandDetailPage(user, ctx, profileRow, assets, knowledge) {
  const profileMeta = (profileRow && profileRow.metadata && profileRow.metadata.profile) || null;
  const colors = (profileMeta && Array.isArray(profileMeta.colors)) ? profileMeta.colors : [];
  const fonts = (profileMeta && profileMeta.fonts) || {};
  const logos = (profileMeta && Array.isArray(profileMeta.logos)) ? profileMeta.logos : [];
  const logoUrl = logos.length > 0 ? (typeof logos[0] === 'string' ? logos[0] : logos[0].url) : null;

  const swatchesHtml = colors.length === 0
    ? '<div style="color:var(--text-muted); font-size:0.83rem">No colors detected. Re-analyze a template to extract.</div>'
    : `<div class="swatches">${colors.slice(0, 12).map((c) => {
      const hex = typeof c === 'string' ? c : (c && c.hex) || '';
      return `<div class="swatch" style="background:${escapeHtml(hex)}" title="${escapeHtml(hex)}"></div>`;
    }).join('')}</div>`;

  const assetsHtml = assets.length === 0
    ? '<div style="color:var(--text-muted); font-size:0.85rem; padding:14px 0">No assets uploaded yet. Upload a .pptx, image, or document above.</div>'
    : assets.map((a) => `
        <div class="asset-row" data-vault-id="${escapeHtml(a.id)}">
          <div>
            <div class="asset-name">${escapeHtml(a.filename || '(unnamed)')}</div>
            <div class="asset-meta">${escapeHtml(a.mime_type || '')} · ${escapeHtml(relativeTime(a.created_at))}</div>
          </div>
          <button class="btn btn-outline btn-sm" data-action="reanalyze">Re-analyze</button>
          <button class="btn btn-danger btn-sm" data-action="delete">Delete</button>
        </div>`).join('');

  const knowledgeHtml = knowledge.length === 0
    ? '<div style="color:var(--text-muted); font-size:0.85rem; padding:8px 0">No knowledge entries yet.</div>'
    : knowledge.map((k) => `
        <div class="asset-row" data-doc-type="${escapeHtml(k.doc_type)}">
          <div>
            <div class="asset-name"><strong>${escapeHtml(k.doc_type)}</strong></div>
            <div class="asset-meta">${escapeHtml(relativeTime(k.updated_at))} · ${escapeHtml((k.content || '').slice(0, 80))}${(k.content || '').length > 80 ? '…' : ''}</div>
          </div>
          <span></span>
          <button class="btn btn-danger btn-sm" data-action="delete-knowledge">Delete</button>
        </div>`).join('');

  const guidelinesJson = ctx.brand_guidelines ? JSON.stringify(ctx.brand_guidelines, null, 2) : '';

  const analyzedFromMeta = profileRow
    ? `Analyzed ${escapeHtml(relativeTime(profileRow.created_at))} from vault item <code>${escapeHtml(profileRow.id)}</code>`
    : 'Not analyzed yet.';

  const initialBrandJson = JSON.stringify({ brand_id: ctx.brand_id });

  return `${pageHead('Brand: ' + (ctx.display_name || ctx.brand_id))}
<body>
  ${pageShellNav(user)}
  <div class="page-wrapper">
    <div class="header">
      <div>
        <div class="crumbs"><a href="/admin/brands">Brands</a> / ${escapeHtml(ctx.brand_id)}</div>
        <h1>${escapeHtml(ctx.display_name || ctx.brand_id)}</h1>
        <p class="subtitle">${escapeHtml(ctx.industry || 'No industry set')} · updated ${escapeHtml(relativeTime(ctx.updated_at))}</p>
      </div>
      <div class="header-right">
        <a href="/admin/brands" class="btn btn-outline" style="text-decoration:none">All brands</a>
      </div>
    </div>

    <div class="content-area">
      <div class="layout-split">
        <aside class="section-rail">
          <a href="#identity" class="active" data-section="identity">Identity</a>
          <a href="#visual" data-section="visual">Visual</a>
          <a href="#assets" data-section="assets">Templates &amp; Assets</a>
          <a href="#prompt" data-section="prompt">System prompt</a>
        </aside>

        <main>
          <!-- (a) Identity -->
          <section class="card" id="identity">
            <h2>Identity</h2>
            <p class="card-desc">Editable brand context. Saved fields are sent on every chat request.</p>
            <form id="identity-form" class="form-grid">
              <div class="form-group">
                <label for="display_name">Display name</label>
                <input type="text" id="display_name" maxlength="200" value="${escapeHtml(ctx.display_name || '')}">
              </div>
              <div class="form-group">
                <label for="industry">Industry</label>
                <input type="text" id="industry" maxlength="120" value="${escapeHtml(ctx.industry || '')}">
              </div>
              <div class="form-group">
                <label for="tone">Tone</label>
                <input type="text" id="tone" maxlength="120" value="${escapeHtml(ctx.tone || '')}">
              </div>
              <div class="form-group">
                <label for="tone_of_voice">Tone of voice</label>
                <textarea id="tone_of_voice" rows="3">${escapeHtml(ctx.tone_of_voice || '')}</textarea>
              </div>
              <div class="form-group">
                <label for="target_audience">Target audience</label>
                <input type="text" id="target_audience" maxlength="240" value="${escapeHtml(ctx.target_audience || '')}">
              </div>
              <div class="form-group">
                <label for="brand_guidelines">Brand guidelines (JSON)</label>
                <textarea id="brand_guidelines" rows="6" placeholder='{"do":[],"dont":[]}'>${escapeHtml(guidelinesJson)}</textarea>
                <div class="hint">Must be valid JSON. Leave empty to clear.</div>
              </div>
              <div class="form-group">
                <label for="system_prompt_override">System prompt override</label>
                <textarea id="system_prompt_override" rows="4">${escapeHtml(ctx.system_prompt_override || '')}</textarea>
                <div class="hint">Replaces the default brand prompt block. Leave empty to use defaults.</div>
              </div>
              <div class="form-group">
                <label for="context_injection">Context injection</label>
                <textarea id="context_injection" rows="3">${escapeHtml(ctx.context_injection || '')}</textarea>
                <div class="hint">Appended to every system prompt for this brand.</div>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="identity-save">Save changes</button>
                <span class="feedback" id="identity-feedback" role="status"></span>
              </div>
            </form>
          </section>

          <!-- (b) Visual -->
          <section class="card" id="visual">
            <h2>Visual</h2>
            <p class="card-desc">Auto-extracted from the most recent .pptx template. Re-analyze after uploading a new file.</p>
            ${swatchesHtml}
            <div class="visual-meta">
              <div>
                <div class="label">Heading font</div>
                <div>${escapeHtml(fonts.heading || '—')}</div>
              </div>
              <div>
                <div class="label">Body font</div>
                <div>${escapeHtml(fonts.body || '—')}</div>
              </div>
              <div>
                <div class="label">Logo</div>
                ${logoUrl ? `<img class="logo-preview" src="${escapeHtml(logoUrl)}" alt="Brand logo">` : '<div style="color:var(--text-muted)">—</div>'}
              </div>
              <div>
                <div class="label">Source</div>
                <div style="font-size:0.78rem">${analyzedFromMeta}</div>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" id="reanalyze-latest-btn">Re-analyze latest template</button>
              <span class="feedback" id="reanalyze-feedback" role="status"></span>
            </div>
          </section>

          <!-- (c) Templates & Assets -->
          <section class="card" id="assets">
            <h2>Templates &amp; Assets</h2>
            <p class="card-desc">Upload .pptx templates, logos, or any reference file. Re-analyze a .pptx to refresh visual identity.</p>
            <form id="upload-form" class="form-grid" enctype="multipart/form-data">
              <div class="form-group">
                <label for="upload-file">Add asset</label>
                <input type="file" id="upload-file" name="file" accept=".pptx,.pdf,.png,.jpg,.jpeg,.svg,.webp">
                <div class="hint">Stored in Vault and tagged <code>brand-asset</code>.</div>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="upload-btn">Upload</button>
                <span class="feedback" id="upload-feedback" role="status"></span>
              </div>
            </form>

            <div style="margin-top:8px">
              ${assetsHtml}
            </div>

            <h2 style="margin-top:24px">Knowledge</h2>
            <p class="card-desc">Long-form text per <code>doc_type</code>. Saved as <code>brand_knowledge</code> rows. Saving an existing doc_type overwrites it.</p>
            <form id="knowledge-form" class="form-grid">
              <div class="form-group">
                <label for="knowledge-doc-type">Doc type</label>
                <select id="knowledge-doc-type">
                  <option value="brand_voice">brand_voice</option>
                  <option value="positioning">positioning</option>
                  <option value="product_catalog">product_catalog</option>
                  <option value="founder_notes">founder_notes</option>
                  <option value="customer_personas">customer_personas</option>
                  <option value="competitive_landscape">competitive_landscape</option>
                  <option value="campaign_examples">campaign_examples</option>
                  <option value="other">other</option>
                </select>
              </div>
              <div class="form-group">
                <label for="knowledge-content">Content</label>
                <textarea id="knowledge-content" rows="6" placeholder="Paste guidelines, voice, FAQs, or any reference text..."></textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="knowledge-save">Save knowledge</button>
                <span class="feedback" id="knowledge-feedback" role="status"></span>
              </div>
            </form>
            <div id="knowledge-list" style="margin-top:8px">${knowledgeHtml}</div>
          </section>

          <!-- (d) System Prompt Preview -->
          <section class="card" id="prompt">
            <h2>System prompt preview</h2>
            <p class="card-desc">Live render of the brand context block injected into chat prompts per surface.</p>
            <div class="tabs" id="prompt-tabs">
              <button type="button" class="tab active" data-surface="general">General</button>
              <button type="button" class="tab" data-surface="pptx">PPTX</button>
              <button type="button" class="tab" data-surface="document">Document</button>
              <button type="button" class="tab" data-surface="spreadsheet">Spreadsheet</button>
            </div>
            <div class="form-actions" style="margin-bottom:10px">
              <button type="button" class="btn btn-outline btn-sm" id="prompt-copy">Copy</button>
              <span class="feedback" id="prompt-feedback" role="status"></span>
            </div>
            <pre class="prompt-block" id="prompt-block">Loading...</pre>
          </section>
        </main>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    (function() {
      var BRAND = ${initialBrandJson};
      var brandId = BRAND.brand_id;

      function setFeedback(id, msg, kind) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || '';
        el.className = 'feedback' + (kind ? ' ' + kind : '');
      }
      function toast(msg, kind) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast toast-' + (kind === 'err' ? 'error' : 'success');
        t.style.display = 'block';
        setTimeout(function() { t.style.display = 'none'; }, 2600);
      }
      async function jsonFetch(url, opts) {
        var res = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
        var data = null;
        try { data = await res.json(); } catch (_) { data = null; }
        if (!res.ok) {
          var msg = (data && data.error) || ('Request failed (' + res.status + ')');
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      }

      // --- Identity save ---
      var identityForm = document.getElementById('identity-form');
      identityForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = document.getElementById('identity-save');
        setFeedback('identity-feedback', '', '');

        var rawGuidelines = document.getElementById('brand_guidelines').value.trim();
        var guidelines = null;
        if (rawGuidelines) {
          try {
            guidelines = JSON.parse(rawGuidelines);
          } catch (err) {
            setFeedback('identity-feedback', 'Brand guidelines must be valid JSON.', 'err');
            return;
          }
        }
        var payload = {
          display_name: document.getElementById('display_name').value.trim() || null,
          industry: document.getElementById('industry').value.trim() || null,
          tone: document.getElementById('tone').value.trim() || null,
          tone_of_voice: document.getElementById('tone_of_voice').value.trim() || null,
          target_audience: document.getElementById('target_audience').value.trim() || null,
          brand_guidelines: guidelines,
          system_prompt_override: document.getElementById('system_prompt_override').value.trim() || null,
          context_injection: document.getElementById('context_injection').value.trim() || null,
        };
        btn.disabled = true;
        var prev = btn.textContent;
        btn.textContent = 'Saving...';
        try {
          await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          setFeedback('identity-feedback', 'Saved.', 'ok');
          toast('Identity updated', 'ok');
        } catch (err) {
          setFeedback('identity-feedback', err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = prev;
        }
      });

      // --- Re-analyze latest ---
      document.getElementById('reanalyze-latest-btn').addEventListener('click', async function() {
        var btn = this;
        setFeedback('reanalyze-feedback', '', '');
        btn.disabled = true;
        var prev = btn.textContent;
        btn.textContent = 'Analyzing...';
        try {
          await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/reanalyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          setFeedback('reanalyze-feedback', 'Analyzed. Reloading...', 'ok');
          setTimeout(function() { window.location.reload(); }, 600);
        } catch (err) {
          setFeedback('reanalyze-feedback', err.message, 'err');
          btn.disabled = false;
          btn.textContent = prev;
        }
      });

      // --- Asset row actions (delegated) ---
      document.querySelectorAll('#assets .asset-row[data-vault-id]').forEach(function(row) {
        row.addEventListener('click', async function(e) {
          var btn = e.target.closest('button[data-action]');
          if (!btn) return;
          var action = btn.getAttribute('data-action');
          var vaultId = row.getAttribute('data-vault-id');
          var prev = btn.textContent;
          btn.disabled = true;
          try {
            if (action === 'reanalyze') {
              btn.textContent = 'Analyzing...';
              await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/reanalyze', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ vaultId: vaultId }),
              });
              toast('Re-analyzed', 'ok');
              setTimeout(function() { window.location.reload(); }, 500);
            } else if (action === 'delete') {
              if (!window.confirm('Delete this asset?')) { btn.disabled = false; return; }
              btn.textContent = 'Deleting...';
              await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/asset/' + encodeURIComponent(vaultId), { method: 'DELETE' });
              row.remove();
              toast('Asset deleted', 'ok');
            }
          } catch (err) {
            toast(err.message, 'err');
            btn.disabled = false;
            btn.textContent = prev;
          }
        });
      });

      // --- Upload ---
      var uploadForm = document.getElementById('upload-form');
      uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        setFeedback('upload-feedback', '', '');
        var fileInput = document.getElementById('upload-file');
        if (!fileInput.files.length) {
          setFeedback('upload-feedback', 'Pick a file first.', 'err');
          return;
        }
        var btn = document.getElementById('upload-btn');
        btn.disabled = true;
        var prev = btn.textContent;
        btn.textContent = 'Uploading...';
        try {
          var fd = new FormData();
          fd.append('file', fileInput.files[0]);
          fd.append('brand_id', brandId);
          fd.append('tag', 'brand-asset');
          var res = await fetch('/api/upload/brand-asset', { method: 'POST', credentials: 'include', body: fd });
          var data = null;
          try { data = await res.json(); } catch (_) { data = null; }
          if (!res.ok) {
            throw new Error((data && data.error) || ('Upload failed (' + res.status + ')'));
          }
          setFeedback('upload-feedback', 'Uploaded. Reloading...', 'ok');
          setTimeout(function() { window.location.reload(); }, 600);
        } catch (err) {
          setFeedback('upload-feedback', err.message, 'err');
          btn.disabled = false;
          btn.textContent = prev;
        }
      });

      // --- Knowledge save ---
      var knowledgeForm = document.getElementById('knowledge-form');
      knowledgeForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        setFeedback('knowledge-feedback', '', '');
        var docType = document.getElementById('knowledge-doc-type').value;
        var content = document.getElementById('knowledge-content').value.trim();
        if (!content) {
          setFeedback('knowledge-feedback', 'Content cannot be empty.', 'err');
          return;
        }
        var btn = document.getElementById('knowledge-save');
        btn.disabled = true;
        var prev = btn.textContent;
        btn.textContent = 'Saving...';
        try {
          await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/knowledge', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ doc_type: docType, content: content }),
          });
          setFeedback('knowledge-feedback', 'Saved. Reloading...', 'ok');
          setTimeout(function() { window.location.reload(); }, 500);
        } catch (err) {
          setFeedback('knowledge-feedback', err.message, 'err');
          btn.disabled = false;
          btn.textContent = prev;
        }
      });

      // --- Knowledge delete (delegated) ---
      document.querySelectorAll('#knowledge-list .asset-row[data-doc-type]').forEach(function(row) {
        row.addEventListener('click', async function(e) {
          var btn = e.target.closest('button[data-action="delete-knowledge"]');
          if (!btn) return;
          var docType = row.getAttribute('data-doc-type');
          if (!window.confirm('Delete knowledge entry "' + docType + '"?')) return;
          var prev = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Deleting...';
          try {
            await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/knowledge/' + encodeURIComponent(docType), { method: 'DELETE' });
            row.remove();
            toast('Knowledge deleted', 'ok');
          } catch (err) {
            toast(err.message, 'err');
            btn.disabled = false;
            btn.textContent = prev;
          }
        });
      });

      // --- Prompt preview ---
      var currentSurface = 'general';
      async function loadPrompt(surface) {
        currentSurface = surface;
        document.querySelectorAll('#prompt-tabs .tab').forEach(function(t) {
          t.classList.toggle('active', t.getAttribute('data-surface') === surface);
        });
        var block = document.getElementById('prompt-block');
        block.textContent = 'Loading...';
        setFeedback('prompt-feedback', '', '');
        try {
          var data = await jsonFetch('/api/admin/brands/' + encodeURIComponent(brandId) + '/preview-prompt?surface=' + encodeURIComponent(surface));
          block.textContent = (data && data.block) || '(empty)';
        } catch (err) {
          block.textContent = '';
          setFeedback('prompt-feedback', err.message, 'err');
        }
      }
      document.querySelectorAll('#prompt-tabs .tab').forEach(function(tab) {
        tab.addEventListener('click', function() { loadPrompt(tab.getAttribute('data-surface')); });
      });
      document.getElementById('prompt-copy').addEventListener('click', async function() {
        var text = document.getElementById('prompt-block').textContent || '';
        if (!text) { setFeedback('prompt-feedback', 'Nothing to copy.', 'err'); return; }
        try {
          await navigator.clipboard.writeText(text);
          setFeedback('prompt-feedback', 'Copied.', 'ok');
        } catch (err) {
          setFeedback('prompt-feedback', 'Copy failed: ' + err.message, 'err');
        }
      });
      loadPrompt(currentSurface);

      // --- Section rail active state ---
      var rail = document.querySelectorAll('.section-rail a');
      window.addEventListener('scroll', function() {
        var scrollY = window.scrollY + 120;
        var current = 'identity';
        rail.forEach(function(link) {
          var id = link.getAttribute('data-section');
          var sec = document.getElementById(id);
          if (sec && sec.offsetTop <= scrollY) current = id;
        });
        rail.forEach(function(link) {
          link.classList.toggle('active', link.getAttribute('data-section') === current);
        });
      }, { passive: true });
    })();
  </script>
</body>
</html>`;
}

function errorPage(title, message) {
  return `${pageHead(title)}
<body>
  <div class="page-wrapper" style="margin-left:0">
    <div class="content-area" style="max-width:560px">
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <p class="card-desc">${message || ''}</p>
        <a href="/admin/brands" class="btn btn-outline" style="text-decoration:none">Back to brands</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = router;
