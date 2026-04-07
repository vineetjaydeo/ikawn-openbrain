// @ts-check
'use strict';

/**
 * Reports API — user-facing endpoints for scheduled task results.
 *
 * GET  /api/reports/unread-count   — Unread task run count
 * POST /api/reports/mark-viewed    — Mark all runs as viewed
 * GET  /api/reports/runs           — Recent completed runs with results
 * GET  /api/reports/tasks          — User's scheduled tasks
 * PUT  /api/reports/tasks/:uuid/toggle — Toggle task enabled/disabled
 * DELETE /api/reports/tasks/:uuid  — Delete task and its runs
 */

const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = Router();

// ── API: Unread count ──
router.get('/api/reports/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM task_runs tr
       JOIN scheduled_tasks st ON st.id = tr.task_id
       WHERE st.user_id = $1 AND tr.status = 'completed' AND tr.viewed_at IS NULL`,
      [userId]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    console.error('[Reports] Unread count error:', err.message);
    res.json({ count: 0 });
  }
});

// ── API: Mark all as viewed ──
router.post('/api/reports/mark-viewed', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await pool.query(
      `UPDATE task_runs SET viewed_at = NOW()
       FROM scheduled_tasks st
       WHERE task_runs.task_id = st.id AND st.user_id = $1 AND task_runs.viewed_at IS NULL`,
      [userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Reports] Mark viewed error:', err.message);
    res.status(500).json({ error: 'Failed to mark as viewed' });
  }
});

// ── API: Recent runs with results ──
router.get('/api/reports/runs', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { rows } = await pool.query(
      `SELECT tr.id, tr.started_at, tr.completed_at, tr.status, tr.result, tr.error,
              tr.cost_usd, tr.tokens_used, tr.viewed_at,
              st.uuid as task_uuid, st.name as task_name, st.tool, st.agent_slug,
              st.schedule_type, st.interval_minutes, st.cron_expression, st.enabled
       FROM task_runs tr
       JOIN scheduled_tasks st ON st.id = tr.task_id
       WHERE st.user_id = $1
       ORDER BY tr.started_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    res.json({ runs: rows });
  } catch (err) {
    console.error('[Reports] Runs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// ── API: User's tasks ──
router.get('/api/reports/tasks', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rows } = await pool.query(
      `SELECT uuid, name, description, agent_slug, tool, tier, schedule_type,
              cron_expression, interval_minutes, enabled, next_run_at, last_run_at,
              last_status, run_count, created_at
       FROM scheduled_tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error('[Reports] Tasks error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── API: Toggle task enabled/disabled ──
router.put('/api/reports/tasks/:uuid/toggle', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { rowCount, rows } = await pool.query(
      `UPDATE scheduled_tasks SET enabled = NOT enabled, updated_at = NOW()
       WHERE uuid = $1 AND user_id = $2
       RETURNING uuid, enabled`,
      [req.params.uuid, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true, enabled: rows[0].enabled });
  } catch (err) {
    console.error('[Reports] Toggle error:', err.message);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

// ── API: Delete task ──
router.delete('/api/reports/tasks/:uuid', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const taskResult = await pool.query(
      `SELECT id FROM scheduled_tasks WHERE uuid = $1 AND user_id = $2`,
      [req.params.uuid, userId]
    );
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const taskId = taskResult.rows[0].id;
    await pool.query('DELETE FROM task_runs WHERE task_id = $1', [taskId]);
    await pool.query('DELETE FROM scheduled_tasks WHERE id = $1', [taskId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Reports] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
