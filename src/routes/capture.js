const { Router } = require('express');
const { pool } = require('../db');
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
      author, signed_off_by, source_ref,
      brand_id
    } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }

    // Idempotent upsert via source_ref — NO synchronous embedding
    if (source_ref) {
      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [source_ref]);
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE memories SET content = $1, embedding_status = 'pending', updated_at = NOW() WHERE source_ref = $2
           RETURNING id, content, source, tags, memory_type, access_level, project, hashtags, author, brand_id, created_at`,
          [content, source_ref]
        );
        return res.status(200).json(result.rows[0]);
      }
    }

    // Merge explicit hashtags with auto-extracted ones from content
    const extracted = extractHashtags(content);
    const explicit = Array.isArray(hashtags) ? hashtags : [];
    let allHashtags = [...new Set([...explicit, ...extracted])];

    // Auto-suggest hashtags if none provided
    if (allHashtags.length === 0) {
      const suggested = await suggestHashtags(content);
      allHashtags = suggested;
    }

    // Insert with embedding_status = 'pending' — async worker handles embedding
    const result = await pool.query(
      `INSERT INTO memories (content, source, tags, memory_type, access_level, group_id, conversation_id, project, hashtags, author, signed_off_by, source_ref, brand_id, embedding_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING id, content, source, tags, memory_type, access_level, project, hashtags, author, brand_id, created_at`,
      [
        content,
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
        source_ref || null,
        req.brand_id || brand_id || 'ikawn',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Capture error:', err);
    res.status(500).json({ error: 'Failed to capture thought' });
  }
});

module.exports = router;
