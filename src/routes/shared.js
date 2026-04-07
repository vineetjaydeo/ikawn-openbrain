const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// Public shared conversation — returns JSON data (no auth required)
router.get('/shared/:token', async (req, res) => {
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.params.token)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { rows: convRows } = await pool.query(
      'SELECT * FROM conversations WHERE share_token = $1',
      [req.params.token]
    );
    if (!convRows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { rows: messages } = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [convRows[0].id]
    );

    const { rows: userRows } = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [convRows[0].user_id]
    );
    const authorName = userRows.length ? (userRows[0].name || userRows[0].email) : 'Unknown';

    const title = convRows[0].title || 'Shared Conversation';
    const date = new Date(convRows[0].created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    res.json({
      title,
      date,
      author: authorName,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content || '',
        time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      })),
    });
  } catch (err) {
    console.error('GET /shared/:token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
