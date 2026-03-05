const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const embedding = await getEmbedding(q);
    const searchLimit = Math.min(parseInt(limit) || 10, 50);

    const result = await pool.query(
      `SELECT id, content, source, tags, created_at, cosine_similarity(embedding, $1) AS similarity
       FROM memories
       WHERE embedding IS NOT NULL
       ORDER BY cosine_similarity(embedding, $1) DESC
       LIMIT $2`,
      [embedding, searchLimit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
