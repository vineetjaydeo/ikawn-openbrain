const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const [countResult, sourcesResult, typesResult, projectsResult, hashtagResult, ingestionResult, recentResult, weekResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM memories WHERE (archived IS NULL OR archived = false)'),
      pool.query('SELECT source, COUNT(*) AS count FROM memories WHERE (archived IS NULL OR archived = false) GROUP BY source ORDER BY count DESC'),
      pool.query('SELECT memory_type, COUNT(*) AS count FROM memories WHERE (archived IS NULL OR archived = false) GROUP BY memory_type ORDER BY count DESC'),
      pool.query('SELECT project, COUNT(*) AS count FROM memories WHERE project IS NOT NULL AND (archived IS NULL OR archived = false) GROUP BY project ORDER BY count DESC'),
      pool.query(`SELECT unnest(hashtags) AS tag, COUNT(*) AS count FROM memories WHERE hashtags IS NOT NULL AND (archived IS NULL OR archived = false) GROUP BY tag ORDER BY count DESC LIMIT 30`),
      pool.query('SELECT source, MAX(ran_at) AS last_run, status FROM ob_ingestion_log GROUP BY source, status ORDER BY last_run DESC'),
      pool.query(`SELECT DATE(created_at) AS date, COUNT(*) AS count FROM memories WHERE created_at > NOW() - INTERVAL '30 days' AND (archived IS NULL OR archived = false) GROUP BY DATE(created_at) ORDER BY date DESC`),
      pool.query(`SELECT COUNT(*) AS count FROM memories WHERE created_at > NOW() - INTERVAL '7 days' AND (archived IS NULL OR archived = false)`),
    ]);

    res.json({
      total: parseInt(countResult.rows[0].total),
      by_source: sourcesResult.rows,
      by_type: typesResult.rows,
      by_project: projectsResult.rows,
      active_hashtags: hashtagResult.rows,
      ingestion_log: ingestionResult.rows,
      last_30_days: recentResult.rows,
      added_this_week: parseInt(weekResult.rows[0].count),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
