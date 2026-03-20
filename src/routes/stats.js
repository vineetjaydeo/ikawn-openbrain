const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const brandId = req.brand_id;
    const brandClause = ' AND brand_id = $1';
    const brandParams = [brandId];
    const baseWhere = `(archived IS NULL OR archived = false) AND deleted_at IS NULL${brandClause}`;

    const [countResult, sourcesResult, typesResult, projectsResult, hashtagResult, ingestionResult, recentResult, weekResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM memories WHERE ${baseWhere}`, brandParams),
      pool.query(`SELECT source, COUNT(*) AS count FROM memories WHERE ${baseWhere} GROUP BY source ORDER BY count DESC`, brandParams),
      pool.query(`SELECT memory_type, COUNT(*) AS count FROM memories WHERE ${baseWhere} GROUP BY memory_type ORDER BY count DESC`, brandParams),
      pool.query(`SELECT project, COUNT(*) AS count FROM memories WHERE ${baseWhere} AND project IS NOT NULL GROUP BY project ORDER BY count DESC`, brandParams),
      pool.query(`SELECT unnest(hashtags) AS tag, COUNT(*) AS count FROM memories WHERE ${baseWhere} AND hashtags IS NOT NULL GROUP BY tag ORDER BY count DESC LIMIT 30`, brandParams),
      pool.query('SELECT source, MAX(ran_at) AS last_run, status FROM ob_ingestion_log GROUP BY source, status ORDER BY last_run DESC'),
      pool.query(`SELECT DATE(created_at) AS date, COUNT(*) AS count FROM memories WHERE ${baseWhere} AND created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date DESC`, brandParams),
      pool.query(`SELECT COUNT(*) AS count FROM memories WHERE ${baseWhere} AND created_at > NOW() - INTERVAL '7 days'`, brandParams),
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
