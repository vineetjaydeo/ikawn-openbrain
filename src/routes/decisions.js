const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

router.post('/decisions', async (req, res) => {
  try {
    const { decision, context, project, signed_off_by, access_level, hashtags } = req.body;
    if (!decision) {
      return res.status(400).json({ error: 'decision is required' });
    }

    // Generate embedding from decision + context
    const embeddingText = context ? `${decision} ${context}` : decision;
    const embedding = await getEmbedding(embeddingText);

    // Insert into memories
    const memoryResult = await pool.query(
      `INSERT INTO memories (content, embedding, source, memory_type, project, author, signed_off_by, access_level, hashtags)
       VALUES ($1, $2, 'decision', 'decision', $3, $4, $5, $6, $7) RETURNING id`,
      [
        context ? `${decision}\n\nContext: ${context}` : decision,
        embedding,
        project || null,
        signed_off_by || 'vineet',
        signed_off_by || null,
        access_level || 'management',
        hashtags || null,
      ]
    );

    // Insert into ob_decisions
    const decisionResult = await pool.query(
      `INSERT INTO ob_decisions (decision, context, decided_by, signed_off_by, project, access_level, hashtags, memory_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        decision,
        context || null,
        signed_off_by || 'vineet',
        signed_off_by || null,
        project || null,
        access_level || 'management',
        hashtags || null,
        memoryResult.rows[0].id,
      ]
    );

    res.status(201).json(decisionResult.rows[0]);
  } catch (err) {
    console.error('Decision log error:', err);
    res.status(500).json({ error: 'Failed to log decision' });
  }
});

router.get('/decisions', async (req, res) => {
  try {
    const { project, signed_off_by, from, to, limit } = req.query;
    let query = 'SELECT * FROM ob_decisions WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (project) {
      query += ` AND project = $${paramIdx++}`;
      params.push(project);
    }
    if (signed_off_by) {
      query += ` AND signed_off_by = $${paramIdx++}`;
      params.push(signed_off_by);
    }
    if (from) {
      query += ` AND decided_at >= $${paramIdx++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND decided_at <= $${paramIdx++}`;
      params.push(to);
    }

    query += ` ORDER BY decided_at DESC LIMIT $${paramIdx++}`;
    params.push(Math.min(parseInt(limit) || 20, 100));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get decisions error:', err);
    res.status(500).json({ error: 'Failed to get decisions' });
  }
});

module.exports = router;
