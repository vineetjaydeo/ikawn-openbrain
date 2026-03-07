const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/recent', async (req, res) => {
  try {
    const { limit, type, project } = req.query;
    const recentLimit = Math.min(parseInt(limit) || 20, 100);

    let query = 'SELECT id, content, source, tags, memory_type, project, hashtags, author, access_level, brand_id, created_at FROM memories WHERE (archived IS NULL OR archived = false) AND deleted_at IS NULL';
    const params = [];
    let paramIdx = 1;

    if (req.query.brand_id) {
      query += ` AND brand_id = $${paramIdx++}`;
      params.push(req.query.brand_id);
    }
    if (type) {
      query += ` AND memory_type = $${paramIdx++}`;
      params.push(type);
    }
    if (project) {
      query += ` AND project = $${paramIdx++}`;
      params.push(project);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx++}`;
    params.push(recentLimit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Recent error:', err);
    res.status(500).json({ error: 'Failed to fetch recent entries' });
  }
});

module.exports = router;
