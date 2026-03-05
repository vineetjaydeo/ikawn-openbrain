const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM memories');
    const sourcesResult = await pool.query(
      'SELECT source, COUNT(*) AS count FROM memories GROUP BY source ORDER BY count DESC'
    );
    const recentResult = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM memories
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    res.json({
      total: parseInt(countResult.rows[0].total),
      by_source: sourcesResult.rows,
      last_30_days: recentResult.rows,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
