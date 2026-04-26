'use strict';

const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const brandContextHelpers = require('../utils/brand-context');
const pptxAnalyzer = require('../services/pptx-template-analyzer');
const storage = require('../utils/storage');

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

module.exports = router;
