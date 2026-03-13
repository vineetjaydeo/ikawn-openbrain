// @ts-check
'use strict';

const { Router } = require('express');
const { recall } = require('../utils/recall');

const router = Router();

/**
 * GET /api/memory/recall
 * Query params:
 *   q (required) - search query
 *   brand_id - defaults to 'ikawn'
 *   types - comma-separated memory types filter
 *   source - 'both' (default), 'memories_only', 'distilled_only'
 *   limit - max results (default 10, max 50)
 *   reasoning - include reasoning (default true)
 */
router.get('/api/memory/recall', async (req, res) => {
  try {
    const { q, brand_id, types, source, limit, reasoning } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const result = await recall({
      brandId: brand_id || 'ikawn',
      query: q,
      memoryTypes: types ? types.split(',') : undefined,
      source: source || 'both',
      limit: Math.min(parseInt(limit) || 10, 50),
      includeReasoning: reasoning !== 'false',
    });

    res.json(result);
  } catch (err) {
    console.error('[Recall API] Error:', err.message);
    res.status(500).json({ error: 'Recall failed' });
  }
});

module.exports = router;
