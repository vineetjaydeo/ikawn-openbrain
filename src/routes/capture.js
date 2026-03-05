const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

router.post('/capture', async (req, res) => {
  try {
    const { content, source, tags } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }

    const embedding = await getEmbedding(content);

    const result = await pool.query(
      `INSERT INTO memories (content, embedding, source, tags) VALUES ($1, $2, $3, $4) RETURNING id, content, source, tags, created_at`,
      [content, embedding, source || 'manual', tags || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Capture error:', err);
    res.status(500).json({ error: 'Failed to capture thought' });
  }
});

module.exports = router;
