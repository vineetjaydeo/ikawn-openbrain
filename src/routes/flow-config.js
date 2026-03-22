'use strict';

const { Router } = require('express');
const { pool } = require('../db');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

// GET /api/flow-config/:flowId — AP flows fetch runtime config before executing
router.get('/api/flow-config/:flowId', requireAuthOrApiKey, async (req, res) => {
  try {
    const { flowId } = req.params;
    const { rows } = await pool.query(
      'SELECT flow_id, display_name, config, updated_by, updated_at FROM flow_configs WHERE flow_id = $1',
      [flowId]
    );
    if (rows.length === 0) {
      return res.json({ flow_id: flowId, config: {}, updated_by: null, updated_at: null });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[flow-config] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flow-config/:flowId — Lucy/Ruhi update config to change flow behavior
router.post('/api/flow-config/:flowId', requireAuthOrApiKey, async (req, res) => {
  try {
    const { flowId } = req.params;
    const { config, display_name, reason } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config (object) is required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO flow_configs (flow_id, display_name, config, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (flow_id) DO UPDATE SET
         config = $3,
         display_name = COALESCE($2, flow_configs.display_name),
         updated_by = $4,
         updated_at = NOW()
       RETURNING flow_id, display_name, config, updated_by, updated_at`,
      [flowId, display_name || null, JSON.stringify(config), reason || 'api']
    );
    console.log('[flow-config] Updated config for flow', flowId, 'by', reason || 'api');
    res.json(rows[0]);
  } catch (err) {
    console.error('[flow-config] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
