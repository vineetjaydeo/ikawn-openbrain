const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await pool.query(
      `SELECT id, content, source, tags, created_at FROM memories ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Recent error:', err);
    res.status(500).json({ error: 'Failed to fetch recent entries' });
  }
});

module.exports = router;
