'use strict';

/**
 * Brand Chat API — ikawn-v3 proxy endpoint
 *
 * ikawn-v3 calls these endpoints with API key + brand context headers.
 * Chat logic is NOT duplicated — it calls handleChatSend from chat-api.js.
 *
 * Auth: X-Api-Key (IKAWN_API_KEY) + X-Brand-Id + X-User-Id + X-User-Name
 */

const { Router } = require('express');
const { pool } = require('../db');
const chatApi = require('./chat-api');

const router = Router();

// ── Middleware: validate ikawn OS API key, synthesize session from headers ──

function requireBrandApiAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.IKAWN_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const brandId = req.headers['x-brand-id'];
  const userId = req.headers['x-user-id'];
  const userName = req.headers['x-user-name'];

  if (!brandId || !userId) {
    return res.status(400).json({ error: 'X-Brand-Id and X-User-Id headers required' });
  }

  // Synthesize session so chat-api handlers work unchanged
  req.session = req.session || {};
  req.session.user = {
    id: parseInt(userId),
    name: userName ? decodeURIComponent(userName) : 'User',
    role: 'user',
  };
  // brand_id is already set by requireBrand middleware (from X-Brand-Id header)
  // but set explicitly as safety net
  req.brand_id = brandId;

  next();
}

// Apply auth to all /api/brand/chat* and /api/brand/conversations* routes
router.use('/api/brand/chat', requireBrandApiAuth);
router.use('/api/brand/conversations', requireBrandApiAuth);

// ── POST /api/brand/chat — SSE streaming chat (reuses chat-api pipeline) ──

router.post('/api/brand/chat', async (req, res) => {
  // Map brand API body fields to chat-api expected format
  if (req.body.message && !req.body.content) {
    req.body.content = req.body.message;
  }

  // Auto-create conversation if none provided
  if (!req.body.conversation_id) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO conversations (user_id, title, brand_id) VALUES ($1, $2, $3) RETURNING uuid',
        [req.session.user.id, 'New conversation', req.brand_id]
      );
      req.body.conversation_id = rows[0].uuid;
    } catch (err) {
      console.error('[BrandChat] Auto-create conversation failed:', err);
      return res.status(500).json({ error: 'Failed to create conversation' });
    }
  }

  return chatApi.handleChatSend(req, res);
});

// ── GET /api/brand/conversations — List conversations ──

router.get('/api/brand/conversations', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT uuid AS id, title, updated_at FROM conversations WHERE user_id = $1 AND brand_id = $2 ORDER BY updated_at DESC LIMIT 50',
      [req.session.user.id, req.brand_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/brand/conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/brand/conversations — Create conversation ──

router.post('/api/brand/conversations', async (req, res) => {
  try {
    const title = req.body.title || 'New conversation';
    const { rows } = await pool.query(
      'INSERT INTO conversations (user_id, title, brand_id) VALUES ($1, $2, $3) RETURNING uuid AS id, title, created_at, updated_at',
      [req.session.user.id, title, req.brand_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/brand/conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/brand/conversations/:id — Get conversation with messages ──

router.get('/api/brand/conversations/:id', async (req, res) => {
  try {
    const { rows: convRows } = await pool.query(
      'SELECT * FROM conversations WHERE uuid = $1 AND brand_id = $2',
      [req.params.id, req.brand_id]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Not found' });
    if (convRows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { rows: messages } = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [convRows[0].id]
    );
    res.json({ ...convRows[0], id: convRows[0].uuid, messages });
  } catch (err) {
    console.error('GET /api/brand/conversations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/brand/conversations/:id — Delete conversation ──

router.delete('/api/brand/conversations/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id FROM conversations WHERE uuid = $1 AND brand_id = $2',
      [req.params.id, req.brand_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [rows[0].id]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [rows[0].id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/brand/conversations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
