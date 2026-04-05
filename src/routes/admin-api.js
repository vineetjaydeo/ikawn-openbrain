const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { requireAdmin, requireAuthOrApiKey } = require('../auth');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { SYNC_DEDUP_THRESHOLD } = require('../utils/similarity');

const router = Router();

// ── Cross-Brain Sync endpoint (API key auth, not admin) ──
router.post('/api/sync/receive', requireAuthOrApiKey, async (req, res) => {
  const { memories } = req.body;
  if (!Array.isArray(memories) || memories.length === 0) {
    return res.status(400).json({ error: 'memories array required' });
  }

  const CONFIDENCE_FACTOR = 0.8; // Reduce confidence for synced knowledge
  const SIMILARITY_THRESHOLD = SYNC_DEDUP_THRESHOLD;
  let accepted = 0;
  let skipped = 0;

  for (const mem of memories) {
    if (!mem.content || !mem.memory_type) {
      skipped++;
      continue;
    }

    const adjustedConfidence = Math.round((mem.confidence || 0.5) * CONFIDENCE_FACTOR * 100) / 100;
    const sourceRef = mem.source_ref || `lucy-sync-${new Date().toISOString().slice(0, 10)}`;

    try {
      // Generate embedding for similarity check
      let embedding;
      try {
        embedding = await getEmbedding(mem.content);
      } catch {
        // Insert without embedding, let worker pick it up
        await pool.query(`
          INSERT INTO distilled_memory (
            brand_id, user_id, memory_type, content, confidence,
            source_event_ids, reasoning, embedding_status
          ) VALUES ('ikawn', NULL, $1, $2, $3, $4, $5, 'pending')
        `, [mem.memory_type, mem.content, adjustedConfidence, [sourceRef], mem.reasoning || '']);
        accepted++;
        continue;
      }

      // Check for similar existing memories
      const vectorStr = `[${embedding.join(',')}]`;
      const { rows: similar } = await pool.query(`
        SELECT id, 1 - (embedding <=> $1::vector) AS similarity
        FROM distilled_memory
        WHERE memory_type = $2
          AND superseded_by IS NULL
          AND embedding IS NOT NULL
          AND user_id IS NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 1
      `, [vectorStr, mem.memory_type]);

      if (similar.length > 0 && similar[0].similarity > SIMILARITY_THRESHOLD) {
        skipped++; // Already know this
        continue;
      }

      await pool.query(`
        INSERT INTO distilled_memory (
          brand_id, user_id, memory_type, content, confidence,
          source_event_ids, reasoning, embedding, embedding_status
        ) VALUES ('ikawn', NULL, $1, $2, $3, $4, $5, $6::vector, 'done')
      `, [
        mem.memory_type, mem.content, adjustedConfidence,
        [sourceRef], mem.reasoning || '', vectorStr,
      ]);
      accepted++;
    } catch (err) {
      console.error('[SyncReceive] Failed to process memory:', err.message);
      skipped++;
    }
  }

  res.json({ accepted, skipped, total: memories.length });
});

// All admin routes below require admin role
router.use(requireAdmin);

// List all users
router.get('/admin/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, role, status, created_at, last_login FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Add a new user
router.post('/admin/api/users', async (req, res) => {
  try {
    const { email, name, role, password } = req.body;
    if (!email || !email.endsWith('@ikawn.com')) {
      return res.status(400).json({ error: 'Email must be @ikawn.com' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password required (min 6 characters)' });
    }
    const userRole = role === 'admin' ? 'admin' : 'user';
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, role, status, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, status, created_at',
      [email, name || null, userRole, 'active', hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    console.error('Admin add user error:', err);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Update a user
router.put('/admin/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, status } = req.body;

    // Prevent admin from demoting themselves
    if (parseInt(id) === req.session.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }

    const result = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, email, name, role, status, created_at, last_login`,
      [name || null, role || null, status || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset a user's password (admin)
router.put('/admin/api/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email',
      [hash, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true, email: result.rows[0].email });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── Intelligence Layer: Worker monitoring + distillation ──

// Worker status — GET /admin/api/workers
router.get('/admin/api/workers', (req, res) => {
  const { getAllWorkerStatus } = require('../utils/worker-guards');
  res.json(getAllWorkerStatus());
});

// Manual distillation trigger — POST /admin/api/distill
router.post('/admin/api/distill', async (req, res) => {
  const { runDistillation } = require('../workers/distillation-worker');
  try {
    await runDistillation();
    res.json({ success: true, message: 'Distillation run complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View distilled memories — GET /admin/api/distilled
router.get('/admin/api/distilled', async (req, res) => {
  const { brand_id, type, limit } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT id, brand_id, memory_type, content, confidence, reasoning,
             source_event_ids, superseded_by, last_used, last_updated, created_at
      FROM distilled_memory
      WHERE ($1::text IS NULL OR brand_id = $1)
        AND ($2::text IS NULL OR memory_type = $2)
        AND superseded_by IS NULL
      ORDER BY confidence DESC, last_updated DESC
      LIMIT $3
    `, [brand_id || null, type || null, Math.min(parseInt(limit) || 50, 200)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View unprocessed events — GET /admin/api/events/pending
router.get('/admin/api/events/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT event_type, count(*)::int as count
      FROM memory_events
      WHERE processed_at IS NULL
      GROUP BY event_type
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
