'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../auth');
const { createDesignTools } = require('../engine/design-tools');
const { composeDesignSystemPrompt } = require('../engine/design-prompts');
const { executeReasoningLoop } = require('../engine/reasoning-loop');

const router = express.Router();

// ── Active generation cancel tokens ──
const activeGenerations = new Map(); // generationId -> { cancelled: bool }

// ─────────────────────────────────────────────
// CRUD: Designs
// ─────────────────────────────────────────────

// GET /api/designs — list user's non-deleted designs
router.get('/api/designs', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await pool.query(
      `SELECT id, user_id, brand_id, name, thumbnail_text, deleted_at, created_at, updated_at
       FROM designs
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[DesignAPI] list designs error:', err.message);
    res.status(500).json({ error: 'Failed to list designs' });
  }
});

// POST /api/designs — create new design
router.post('/api/designs', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name } = req.body || {};
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO designs (id, user_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, brand_id, name, thumbnail_text, deleted_at, created_at, updated_at`,
      [id, userId, name || 'Untitled Design']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] create design error:', err.message);
    res.status(500).json({ error: 'Failed to create design' });
  }
});

// PATCH /api/designs/:id — rename design
router.patch('/api/designs/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `UPDATE designs SET name = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, user_id, brand_id, name, thumbnail_text, deleted_at, created_at, updated_at`,
      [name, req.params.id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Design not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] rename design error:', err.message);
    res.status(500).json({ error: 'Failed to rename design' });
  }
});

// DELETE /api/designs/:id — soft delete
router.delete('/api/designs/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rowCount } = await pool.query(
      `UPDATE designs SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Design not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DesignAPI] delete design error:', err.message);
    res.status(500).json({ error: 'Failed to delete design' });
  }
});

// POST /api/designs/:id/duplicate — duplicate design + snapshots
router.post('/api/designs/:id/duplicate', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.session.user.id;
    await client.query('BEGIN');

    // Verify ownership
    const { rows: origRows } = await client.query(
      `SELECT id, name FROM designs
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, userId]
    );
    if (origRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Design not found' });
    }

    const newId = randomUUID();
    const newName = `${origRows[0].name} (copy)`;

    // Duplicate design
    await client.query(
      `INSERT INTO designs (id, user_id, brand_id, name, thumbnail_text)
       SELECT $1, user_id, brand_id, $2, thumbnail_text
       FROM designs WHERE id = $3`,
      [newId, newName, req.params.id]
    );

    // Duplicate snapshots
    await client.query(
      `INSERT INTO design_snapshots (id, design_id, parent_id, type, prompt, artifact_type, artifact_source, message, created_at)
       SELECT gen_random_uuid()::text, $1, NULL, type, prompt, artifact_type, artifact_source, message, created_at
       FROM design_snapshots WHERE design_id = $2
       ORDER BY created_at`,
      [newId, req.params.id]
    );

    await client.query('COMMIT');

    const { rows } = await client.query(
      `SELECT id, user_id, brand_id, name, thumbnail_text, deleted_at, created_at, updated_at
       FROM designs WHERE id = $1`,
      [newId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[DesignAPI] duplicate design error:', err.message);
    res.status(500).json({ error: 'Failed to duplicate design' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// CRUD: Snapshots
// ─────────────────────────────────────────────

// GET /api/designs/:designId/snapshots — list snapshots
router.get('/api/designs/:designId/snapshots', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    // Verify ownership
    const { rows: proj } = await pool.query(
      `SELECT id FROM designs
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.designId, userId]
    );
    if (proj.length === 0) return res.status(404).json({ error: 'Design not found' });

    const { rows } = await pool.query(
      `SELECT id, design_id, parent_id, type, prompt, artifact_type, artifact_source, message, created_at
       FROM design_snapshots
       WHERE design_id = $1
       ORDER BY created_at DESC`,
      [req.params.designId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[DesignAPI] list snapshots error:', err.message);
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// POST /api/designs/:designId/snapshots — create snapshot
router.post('/api/designs/:designId/snapshots', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type, prompt, artifact_type, artifact_source, message } = req.body || {};

    // Verify ownership
    const { rows: proj } = await pool.query(
      `SELECT id FROM designs
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.designId, userId]
    );
    if (proj.length === 0) return res.status(404).json({ error: 'Design not found' });

    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO design_snapshots (id, design_id, type, prompt, artifact_type, artifact_source, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, design_id, parent_id, type, prompt, artifact_type, artifact_source, message, created_at`,
      [id, req.params.designId, type || 'edit', prompt || null, artifact_type || 'html', artifact_source || null, message || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] create snapshot error:', err.message);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// ─────────────────────────────────────────────
// CRUD: Chat messages
// ─────────────────────────────────────────────

// GET /api/designs/:designId/chat — list chat messages
router.get('/api/designs/:designId/chat', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    // Verify ownership
    const { rows: proj } = await pool.query(
      `SELECT id FROM designs
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.designId, userId]
    );
    if (proj.length === 0) return res.status(404).json({ error: 'Design not found' });

    const { rows } = await pool.query(
      `SELECT seq, design_id, kind, payload, snapshot_id, created_at
       FROM design_chat
       WHERE design_id = $1
       ORDER BY seq ASC`,
      [req.params.designId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[DesignAPI] list chat error:', err.message);
    res.status(500).json({ error: 'Failed to list chat messages' });
  }
});

// POST /api/designs/:designId/chat — append chat message
router.post('/api/designs/:designId/chat', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { kind, payload, snapshot_id } = req.body || {};
    if (!kind) {
      return res.status(400).json({ error: 'kind is required' });
    }

    // Verify ownership
    const { rows: proj } = await pool.query(
      `SELECT id FROM designs
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.designId, userId]
    );
    if (proj.length === 0) return res.status(404).json({ error: 'Design not found' });

    const { rows } = await pool.query(
      `INSERT INTO design_chat (design_id, kind, payload, snapshot_id)
       VALUES ($1, $2, $3, $4)
       RETURNING seq, design_id, kind, payload, snapshot_id, created_at`,
      [req.params.designId, kind, JSON.stringify(payload || {}), snapshot_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] append chat error:', err.message);
    res.status(500).json({ error: 'Failed to append chat message' });
  }
});

// ─────────────────────────────────────────────
// Generation SSE
// ─────────────────────────────────────────────

// Helper: send SSE event
function sendSSE(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
}

// POST /api/design/generate — SSE stream for design generation
router.post('/api/design/generate', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { prompt, designId, currentFiles, chatHistory, history } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // ── SSE setup ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const generationId = randomUUID();
  const cancelToken = { cancelled: false };
  activeGenerations.set(generationId, cancelToken);

  sendSSE(res, 'generation_start', { generationId });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    cancelToken.cancelled = true;
    clearInterval(heartbeat);
    activeGenerations.delete(generationId);
  });

  try {
    // ── Build design tools with SSE callbacks ──
    const { toolSchemas, executors, getFs } = createDesignTools({
      onFsUpdate: (path, content) => {
        sendSSE(res, 'fs_updated', { path, content });
      },
      onTodosUpdate: (todos) => {
        sendSSE(res, 'todos_updated', { todos });
      },
    });

    // ── Seed virtual FS with current files if provided ──
    if (currentFiles && typeof currentFiles === 'object') {
      for (const [path, content] of Object.entries(currentFiles)) {
        executors.str_replace_based_edit_tool({ command: 'create', path, file_text: content });
      }
    }

    // ── Build system prompt ──
    const systemPrompt = composeDesignSystemPrompt({ agentic: true });

    // ── Build messages array ──
    const messages = [];

    // Include prior chat history for context if available (support both field names)
    const chatHist = chatHistory || history;
    if (chatHist && Array.isArray(chatHist)) {
      for (const msg of chatHist.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // If there are existing files, mention them
    if (currentFiles && Object.keys(currentFiles).length > 0) {
      const fileList = Object.keys(currentFiles).join(', ');
      messages.push({
        role: 'user',
        content: `[System: The virtual filesystem already contains: ${fileList}. Use view to read them if needed before making changes.]`,
      });
    }

    // The actual user prompt
    messages.push({ role: 'user', content: prompt });

    // ── executeToolFn: dispatches to our design tool executors ──
    async function executeToolFn(toolName, toolInput) {
      if (cancelToken.cancelled) {
        return 'Generation cancelled by user.';
      }

      const executor = executors[toolName];
      if (!executor) {
        return `Unknown tool: ${toolName}`;
      }

      sendSSE(res, 'tool_call_start', { tool: toolName, input: toolInput });

      const result = executor(toolInput);

      sendSSE(res, 'tool_call_result', {
        tool: toolName,
        result: result.result || result.error || 'done',
        success: !result.error,
      });

      // Return the result string for the reasoning loop
      if (result.error) return result.error;
      return result.result || JSON.stringify(result);
    }

    // ── onEvent: forward reasoning loop events to SSE ──
    function onEvent(event) {
      if (cancelToken.cancelled || res.writableEnded) return;

      switch (event.type) {
        case 'text_delta':
          sendSSE(res, 'text_delta', { text: event.text });
          break;
        case 'tool_start':
          sendSSE(res, 'tool_call_start', { tool: event.name, detail: event.detail });
          break;
        case 'tool_result':
          break;
        case 'done':
          break;
        case 'thinking':
          break;
      }
    }

    // ── Run the reasoning loop ──
    const result = await executeReasoningLoop({
      sessionId: designId || generationId,
      modelTier: 'balanced',
      tools: toolSchemas,
      systemPrompt,
      messages,
      executeToolFn,
      maxIterations: 12,
      onEvent,
      timeoutMs: 120000,
      userId,
    });

    // ── On completion: save snapshot if we have files ──
    const finalFs = getFs();
    if (designId && Object.keys(finalFs).length > 0) {
      try {
        const snapshotId = randomUUID();
        await pool.query(
          `INSERT INTO design_snapshots (id, design_id, type, artifact_type, artifact_source, message)
           VALUES ($1, $2, 'edit', 'html', $3, 'Auto-save')`,
          [snapshotId, designId, finalFs['index.html'] || JSON.stringify(finalFs)]
        );

        // Update thumbnail_text on the design
        if (finalFs['index.html']) {
          await pool.query(
            `UPDATE designs SET thumbnail_text = $1, updated_at = NOW()
             WHERE id = $2`,
            [finalFs['index.html'].slice(0, 500), designId]
          );
        }
      } catch (dbErr) {
        console.error('[DesignAPI] snapshot save error:', dbErr.message);
      }
    }

    // ── Emit generation_end ──
    sendSSE(res, 'generation_end', {
      generationId,
      files: finalFs,
      response: result.response,
      totalCostUsd: result.totalCostUsd,
      turnCount: result.turnCount,
      toolCallCount: result.toolCallCount,
      timedOut: result.timedOut || false,
    });
  } catch (err) {
    console.error('[DesignAPI] generation error:', err.message);
    sendSSE(res, 'error', { message: err.message, generationId });
  } finally {
    clearInterval(heartbeat);
    activeGenerations.delete(generationId);
    if (!res.writableEnded) res.end();
  }
});

// POST /api/design/generate/:id/cancel — cancel active generation
router.post('/api/design/generate/:id/cancel', requireAuth, (req, res) => {
  const token = activeGenerations.get(req.params.id);
  if (!token) {
    return res.status(404).json({ error: 'Generation not found or already completed' });
  }
  token.cancelled = true;
  activeGenerations.delete(req.params.id);
  res.json({ ok: true, generationId: req.params.id });
});

module.exports = router;
