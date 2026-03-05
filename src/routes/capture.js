const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { suggestHashtags } = require('../utils/hashtags');

const router = Router();

// Extract #hashtags from content
function extractHashtags(content) {
  const matches = content.match(/#[a-zA-Z0-9_]+/g);
  return matches ? [...new Set(matches.map(t => t.toLowerCase()))] : [];
}

router.post('/capture', async (req, res) => {
  try {
    const {
      content, source, tags,
      memory_type, access_level, group_id,
      conversation_id, project, hashtags,
      author, signed_off_by
    } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }

    const embedding = await getEmbedding(content);

    // Merge explicit hashtags with auto-extracted ones from content
    const extracted = extractHashtags(content);
    const explicit = Array.isArray(hashtags) ? hashtags : [];
    let allHashtags = [...new Set([...explicit, ...extracted])];

    // Auto-suggest hashtags if none provided
    if (allHashtags.length === 0) {
      const suggested = await suggestHashtags(content);
      allHashtags = suggested;
    }

    const result = await pool.query(
      `INSERT INTO memories (content, embedding, source, tags, memory_type, access_level, group_id, conversation_id, project, hashtags, author, signed_off_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, content, source, tags, memory_type, access_level, project, hashtags, author, created_at`,
      [
        content,
        embedding,
        source || 'manual',
        tags || null,
        memory_type || 'note',
        access_level || 'private',
        group_id || null,
        conversation_id || null,
        project || null,
        allHashtags.length > 0 ? allHashtags : null,
        author || 'vineet',
        signed_off_by || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Capture error:', err);
    res.status(500).json({ error: 'Failed to capture thought' });
  }
});

module.exports = router;
