const { Router } = require('express');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const router = Router();

router.post('/decisions', async (req, res) => {
  try {
    const { decision, context, project, signed_off_by, access_level, hashtags } = req.body;
    if (!decision) {
      return res.status(400).json({ error: 'decision is required' });
    }

    // Insert into memories via captureMessage — embedding handled async by worker
    const decisionContent = context ? `${decision}\n\nContext: ${context}` : decision;
    const memoryId = await captureMessage({
      brand_id: req.brand_id,
      channel: 'decision',
      direction: 'outbound',
      content: decisionContent,
      access_level: access_level || 'management',
      metadata: { project: project || null },
    });

    // Insert into ob_decisions
    const decisionResult = await pool.query(
      `INSERT INTO ob_decisions (decision, context, decided_by, signed_off_by, project, access_level, hashtags, memory_id, brand_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        decision,
        context || null,
        signed_off_by || 'vineet',
        signed_off_by || null,
        project || null,
        access_level || 'management',
        hashtags || null,
        memoryId,
        req.brand_id,
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
    let query = 'SELECT * FROM ob_decisions WHERE brand_id = $1';
    const params = [req.brand_id];
    let paramIdx = 2;

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
