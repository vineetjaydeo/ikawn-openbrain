const { Router } = require('express');
const { pool } = require('../db');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

// GET /brain-health — brand ratings + moderation overview (ikawn-only)
router.get('/brain-health', requireAuthOrApiKey, async (req, res) => {
  try {
    // Embedding queue depth
    const embeddingQueue = await pool.query(
      `SELECT embedding_status, COUNT(*) as count FROM memories WHERE deleted_at IS NULL GROUP BY embedding_status`
    );

    // Moderation summary
    const moderationSummary = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE moderation_score IS NULL) as unscored,
        COUNT(*) FILTER (WHERE moderation_score > 0.7) as flagged,
        COUNT(*) FILTER (WHERE moderation_score > 0.9) as severe,
        COUNT(*) as total
      FROM memories WHERE deleted_at IS NULL
    `);

    // Brand ratings
    const ratings = await pool.query(
      `SELECT * FROM brand_ratings ORDER BY rated_at DESC LIMIT 20`
    );

    // Recent mothership promotions
    const mothershipStats = await pool.query(`
      SELECT data_type, COUNT(*) as count, MAX(promoted_at) as last_promoted
      FROM mothership_log
      GROUP BY data_type
    `);

    // Total memories by brand
    const memoriesByBrand = await pool.query(`
      SELECT brand_id, COUNT(*) as count
      FROM memories WHERE deleted_at IS NULL
      GROUP BY brand_id ORDER BY count DESC
    `);

    res.json({
      embedding_queue: embeddingQueue.rows,
      moderation: moderationSummary.rows[0],
      brand_ratings: ratings.rows,
      mothership: mothershipStats.rows,
      memories_by_brand: memoriesByBrand.rows
    });
  } catch (err) {
    console.error('[BrainHealth] Error:', err);
    res.status(500).json({ error: 'Failed to fetch brain health data' });
  }
});

// GET /mothership/stats — anonymised aggregate metrics (ikawn-only)
router.get('/mothership/stats', requireAuthOrApiKey, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        data_type,
        COUNT(*) as total_signals,
        AVG(signal_strength) as avg_signal_strength,
        MIN(promoted_at) as earliest,
        MAX(promoted_at) as latest
      FROM mothership_log
      GROUP BY data_type
    `);

    const byDemographic = await pool.query(`
      SELECT
        demographic_tags->>'industry' as industry,
        demographic_tags->>'tier' as tier,
        COUNT(*) as count
      FROM mothership_log
      GROUP BY demographic_tags->>'industry', demographic_tags->>'tier'
    `);

    res.json({
      overview: stats.rows,
      by_demographic: byDemographic.rows
    });
  } catch (err) {
    console.error('[Mothership] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch mothership stats' });
  }
});

module.exports = router;
