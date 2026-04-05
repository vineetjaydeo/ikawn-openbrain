const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

router.get('/search', async (req, res) => {
  try {
    const { q, type, project, hashtag, access_level, author, from, to, limit, user_id } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const searchLimit = Math.min(parseInt(limit) || 10, 50);

    // Try vector search first
    let embedding = null;
    try {
      embedding = await getEmbedding(q);
    } catch (err) {
      console.error('Embedding failed, falling back to text search:', err.message);
    }

    let query;
    const params = [];
    let paramIdx = 1;

    if (embedding) {
      // pgvector HNSW: native cosine distance for indexed search
      const vectorStr = `[${embedding.join(',')}]`;
      query = `SELECT id, content, source, tags, memory_type, project, hashtags, author, access_level, brand_id, created_at,
                      1 - (embedding <=> $1::vector) AS similarity
               FROM memories
               WHERE embedding IS NOT NULL AND (archived IS NULL OR archived = false) AND deleted_at IS NULL`;
      params.push(vectorStr);
      paramIdx = 2;
    } else {
      // Fallback to ILIKE text search when embedding unavailable
      query = `SELECT id, content, source, tags, memory_type, project, hashtags, author, access_level, brand_id, created_at,
                      0.5 AS similarity
               FROM memories
               WHERE content ILIKE '%' || $1 || '%' AND (archived IS NULL OR archived = false) AND deleted_at IS NULL`;
      params.push(q);
      paramIdx = 2;
    }

    // Brand filter — always enforced via middleware
    query += ` AND brand_id = $${paramIdx++}`;
    params.push(req.brand_id);

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
    // User isolation: prefer session user, fall back to query param
    const effectiveUserId = req.session?.user?.id || (user_id ? parseInt(user_id) : null);
    if (effectiveUserId) {
      // Show this user's memories + shared (non-private or null user_id)
      query += ` AND (user_id = $${paramIdx++} OR access_level NOT IN ('private') OR user_id IS NULL)`;
      params.push(effectiveUserId);
    }
    if (from) {
      query += ` AND created_at >= $${paramIdx++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND created_at <= $${paramIdx++}`;
      params.push(to);
    }

    if (embedding) {
      query += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIdx++}`;
    } else {
      query += ` ORDER BY created_at DESC LIMIT $${paramIdx++}`;
    }
    params.push(searchLimit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
