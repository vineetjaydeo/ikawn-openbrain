const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getTools } = require('../tools/registry');
const { calculateNextRun } = require('../utils/schedule');

const router = Router();

// ─── API: Mentions ─────────────────────────────────────────────────────────────

router.get('/api/mission/mentions', requireAuth, async (req, res) => {
  try {
    const [agentsResult, usersResult] = await Promise.all([
      pool.query(
        `SELECT slug, name, role FROM agent_definitions WHERE enabled = true AND brand_id = $1 ORDER BY name`,
        [req.brand_id]
      ),
      pool.query(
        `SELECT name, email, role FROM ob_users ORDER BY name`
      ),
    ]);

    const mentions = [
      ...agentsResult.rows.map(a => ({
        type: 'agent',
        slug: a.slug,
        name: a.name,
        role: a.role,
      })),
      ...usersResult.rows.map(u => ({
        type: 'person', slug: u.name.toLowerCase(), name: u.name, role: u.role,
      })),
    ];

    res.json(mentions);
  } catch (err) {
    console.error('GET /api/mission/mentions error:', err);
    res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// ─── API: Scheduled Tasks ──────────────────────────────────────────────────────

router.get('/api/mission/tasks', requireAuth, async (req, res) => {
  try {
    const { agent_slug, enabled } = req.query;
    let sql = `SELECT uuid, name, description, agent_slug, tool, tier, schedule_type,
      cron_expression, interval_minutes, enabled, next_run_at, last_run_at,
      last_status, last_error, run_count, consecutive_failures, requires_approval,
      created_at, updated_at
      FROM scheduled_tasks WHERE brand_id = $1`;
    const params = [req.brand_id];

    if (agent_slug) {
      params.push(agent_slug);
      sql += ` AND agent_slug = $${params.length}`;
    }
    if (enabled === 'true' || enabled === 'false') {
      params.push(enabled === 'true');
      sql += ` AND enabled = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    console.error('GET /api/mission/tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/api/mission/tasks', requireAdmin, async (req, res) => {
  try {
    const { name, description, agent_slug, tool, tier, schedule_type, cron_expression, interval_minutes } = req.body;

    if (!name || !tool || !schedule_type) {
      return res.status(400).json({ error: 'name, tool, and schedule_type are required' });
    }

    // Validate tool exists
    const toolMap = getTools();
    if (!toolMap.has(tool)) {
      return res.status(400).json({ error: `Tool '${tool}' not found in registry` });
    }

    const taskDef = { schedule_type, cron_expression: cron_expression || null, interval_minutes: interval_minutes || null };
    const nextRun = calculateNextRun(taskDef);

    const { rows } = await pool.query(
      `INSERT INTO scheduled_tasks (name, description, agent_slug, tool, tier, schedule_type, cron_expression, interval_minutes, next_run_at, brand_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING uuid, name, agent_slug, tool, schedule_type, enabled, next_run_at, created_at`,
      [name, description || null, agent_slug || 'ruhi', tool, tier || 'direct', schedule_type,
       cron_expression || null, interval_minutes || null, nextRun, req.brand_id, req.session.user.id]
    );

    res.json({ task: rows[0] });
  } catch (err) {
    console.error('POST /api/mission/tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/api/mission/tasks/:uuid', requireAdmin, async (req, res) => {
  try {
    const { enabled, name, description } = req.body;
    const updates = [];
    const params = [];

    if (typeof enabled === 'boolean') {
      params.push(enabled);
      updates.push(`enabled = $${params.length}`);
    }
    if (name) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${params.length}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    updates.push('updated_at = NOW()');
    params.push(req.params.uuid);
    params.push(req.brand_id);
    const { rowCount } = await pool.query(
      `UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE uuid = $${params.length - 1} AND brand_id = $${params.length}`,
      params
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/mission/tasks error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/api/mission/tasks/:uuid', requireAdmin, async (req, res) => {
  try {
    // Delete runs first, then task
    const taskResult = await pool.query(
      `SELECT id FROM scheduled_tasks WHERE uuid = $1 AND brand_id = $2`, [req.params.uuid, req.brand_id]
    );
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const taskId = taskResult.rows[0].id;
    await pool.query('DELETE FROM task_runs WHERE task_id = $1', [taskId]);
    await pool.query('DELETE FROM scheduled_tasks WHERE id = $1', [taskId]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/mission/tasks error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

router.get('/api/mission/tasks/:uuid/runs', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.id, tr.agent_slug, tr.started_at, tr.completed_at, tr.status, tr.tier,
              tr.error, tr.cost_usd, tr.tokens_used
       FROM task_runs tr
       JOIN scheduled_tasks st ON st.id = tr.task_id
       WHERE st.uuid = $1 AND st.brand_id = $2
       ORDER BY tr.started_at DESC
       LIMIT 20`,
      [req.params.uuid, req.brand_id]
    );
    res.json({ runs: rows });
  } catch (err) {
    console.error('GET /api/mission/tasks/:uuid/runs error:', err);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// ─── API: Agents & Team ────────────────────────────────────────────────────────

router.get('/api/mission/agents', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, role, tools, memory_tags, enabled, created_at
       FROM agent_definitions WHERE brand_id = $1 ORDER BY name`,
      [req.brand_id]
    );
    res.json({ agents: rows });
  } catch (err) {
    console.error('GET /api/mission/agents error:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

router.put('/api/mission/agents/:slug', requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });

    const { rowCount } = await pool.query(
      `UPDATE agent_definitions SET enabled = $1 WHERE slug = $2 AND brand_id = $3`,
      [enabled, req.params.slug, req.brand_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/mission/agents error:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.get('/api/mission/team', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, access_levels, created_at FROM ob_users ORDER BY name`
    );
    res.json({ team: rows });
  } catch (err) {
    console.error('GET /api/mission/team error:', err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

router.get('/api/mission/tools', requireAuth, async (req, res) => {
  try {
    const toolMap = getTools();
    const list = [];
    for (const [name, tool] of toolMap) {
      list.push({ name, description: tool.description, tier: tool.tier || 'direct' });
    }
    res.json({ tools: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// ─── API: User Tasks ──────────────────────────────────────────────────────────

router.get('/api/mission/user-tasks', requireAuth, async (req, res) => {
  try {
    const { status, assigned_to } = req.query;
    let sql = `SELECT ut.uuid, ut.title, ut.description, ut.status, ut.priority,
      ut.created_by_name, ut.source, ut.created_at, ut.updated_at,
      u.name as assigned_to_name, u.email as assigned_to_email
      FROM user_tasks ut
      LEFT JOIN users u ON u.id = ut.assigned_to
      WHERE ut.brand_id = $1`;
    const params = [req.brand_id];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND ut.status = $${params.length}`;
    }
    if (assigned_to) {
      params.push(parseInt(assigned_to));
      sql += ` AND ut.assigned_to = $${params.length}`;
    }

    sql += ' ORDER BY ut.created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    console.error('GET /api/mission/user-tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch user tasks' });
  }
});

router.put('/api/mission/user-tasks/:uuid', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required' });
    }
    const { rowCount } = await pool.query(
      `UPDATE user_tasks SET status = $1, updated_at = NOW() WHERE uuid = $2 AND brand_id = $3`,
      [status, req.params.uuid, req.brand_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/mission/user-tasks error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;
