const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

router.get('/search', async (req, res) => {
  try {
    const { q, type, project, hashtag, access_level, author, from, to, limit } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const embedding = await getEmbedding(q);
    const searchLimit = Math.min(parseInt(limit) || 10, 50);

    let query = `SELECT id, content, source, tags, memory_type, project, hashtags, author, access_level, created_at, cosine_similarity(embedding, $1) AS similarity
       FROM memories
       WHERE embedding IS NOT NULL AND (archived IS NULL OR archived = false)`;

    const params = [embedding];
    let paramIdx = 2;

    if (type) {
      query += ` AND memory_type = $${paramIdx++}`;
      params.push(type);
    }
    if (project) {
      query += ` AND project = $${paramIdx++}`;
      params.push(project);
    }
    if (hashtag) {
      query += ` AND $${paramIdx++} = ANY(hashtags)`;
      params.push(hashtag);
    }
    if (access_level) {
      query += ` AND access_level = $${paramIdx++}`;
      params.push(access_level);
    }
    if (author) {
      query += ` AND author = $${paramIdx++}`;
      params.push(author);
    }
    if (from) {
      query += ` AND created_at >= $${paramIdx++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND created_at <= $${paramIdx++}`;
      params.push(to);
    }

    query += ` ORDER BY cosine_similarity(embedding, $1) DESC LIMIT $${paramIdx++}`;
    params.push(searchLimit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
