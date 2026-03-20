const { Router } = require('express');
const { pool } = require('../db');
const { requireAuthOrApiKey } = require('../auth');
const { captureEditDelta } = require('../utils/capture');

const router = Router();

// GET /generations — list generations
router.get('/generations', requireAuthOrApiKey, async (req, res) => {
  try {
    const { agent, status, limit } = req.query;
    const searchLimit = Math.min(parseInt(limit) || 50, 200);

    let query = 'SELECT * FROM generations WHERE deleted_at IS NULL AND brand_id = $1';
    const params = [req.brand_id];
    let paramIdx = 2;
    if (agent) {
      query += ` AND agent_name = $${paramIdx++}`;
      params.push(agent);
    }
    if (status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx++}`;
    params.push(searchLimit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Generations] List error:', err);
    res.status(500).json({ error: 'Failed to list generations' });
  }
});

// GET /generations/:id — single generation
router.get('/generations/:id', requireAuthOrApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM generations WHERE id = $1 AND deleted_at IS NULL AND brand_id = $2',
      [req.params.id, req.brand_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Generation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Generations] Get error:', err);
    res.status(500).json({ error: 'Failed to get generation' });
  }
});

// POST /api/generations/:id/selection — record user selection
router.post('/api/generations/:id/selection', requireAuthOrApiKey, async (req, res) => {
  try {
    const { selected_urls, all_urls } = req.body;

    if (!selected_urls || !all_urls) {
      return res.status(400).json({ error: 'selected_urls and all_urls are required' });
    }

    const rejected_urls = all_urls.filter(u => !selected_urls.includes(u));

    // Update generation status
    await pool.query(`
      UPDATE generations SET
        status = 'completed',
        callback_received = true
      WHERE ikawn_generation_id = $1 OR id::text = $1
    `, [req.params.id]);

    // Get generation info for the delta
    const gen = await pool.query(
      'SELECT brand_id, agent_name FROM generations WHERE ikawn_generation_id = $1 OR id::text = $1',
      [req.params.id]
    );

    // Capture the selection delta
    await captureEditDelta({
      brand_id: gen.rows.length > 0 ? gen.rows[0].brand_id : 'ikawn',
      agent_name: gen.rows.length > 0 ? gen.rows[0].agent_name : 'unknown',
      generation_id: req.params.id,
      delta_type: 'selection',
      selected_urls,
      rejected_urls,
      user_signal: 'implicit'
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Generations] Selection error:', err);
    res.status(500).json({ error: 'Failed to record selection' });
  }
});

module.exports = router;
