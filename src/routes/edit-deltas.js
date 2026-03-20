const { Router } = require('express');
const { pool } = require('../db');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

// POST /edit-delta — capture edit delta
router.post('/edit-delta', requireAuthOrApiKey, async (req, res) => {
  try {
    const {
      brand_id, agent_name, generation_id, session_id,
      delta_type, original_prompt, revised_prompt,
      original_output, edited_output, selected_urls, rejected_urls,
      model_used, user_signal
    } = req.body;

    if (!agent_name || !delta_type) {
      return res.status(400).json({ error: 'agent_name and delta_type are required' });
    }

    const result = await pool.query(`
      INSERT INTO edit_deltas (
        brand_id, agent_name, generation_id, session_id,
        delta_type, original_prompt, revised_prompt,
        original_output, edited_output, selected_urls, rejected_urls,
        model_used, user_signal
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, delta_type, agent_name, created_at
    `, [
      req.brand_id || brand_id || 'ikawn',
      agent_name, generation_id || null, session_id || null,
      delta_type, original_prompt || null, revised_prompt || null,
      original_output || null, edited_output || null,
      selected_urls || [], rejected_urls || [],
      model_used || null, user_signal || 'implicit'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[EditDelta] Capture error:', err);
    res.status(500).json({ error: 'Failed to capture edit delta' });
  }
});

// GET /edit-deltas — list deltas by brand/agent
router.get('/edit-deltas', requireAuthOrApiKey, async (req, res) => {
  try {
    const { agent, type, limit } = req.query;
    const searchLimit = Math.min(parseInt(limit) || 50, 200);

    let query = 'SELECT * FROM edit_deltas WHERE deleted_at IS NULL AND brand_id = $1';
    const params = [req.brand_id];
    let paramIdx = 2;
    if (agent) {
      query += ` AND agent_name = $${paramIdx++}`;
      params.push(agent);
    }
    if (type) {
      query += ` AND delta_type = $${paramIdx++}`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx++}`;
    params.push(searchLimit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[EditDelta] List error:', err);
    res.status(500).json({ error: 'Failed to list edit deltas' });
  }
});

module.exports = router;
