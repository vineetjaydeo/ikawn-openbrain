const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getTools } = require('../tools/registry');
const { calculateNextRun } = require('../utils/schedule');
const { RUHI_FAVICON_LINK } = require('../utils/ruhi-assets');

const router = Router();

// ─── API: Mentions ─────────────────────────────────────────────────────────────

router.get('/api/mission/mentions', requireAuth, async (req, res) => {
  try {
    const [agentsResult, usersResult] = await Promise.all([
      pool.query(
        `SELECT slug, name, role FROM domain_agents WHERE enabled = true AND brand_id = 'ikawn' ORDER BY name`
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
      FROM scheduled_tasks WHERE brand_id = 'ikawn'`;
    const params = [];

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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ikawn', $10)
       RETURNING uuid, name, agent_slug, tool, schedule_type, enabled, next_run_at, created_at`,
      [name, description || null, agent_slug || 'ruhi', tool, tier || 'direct', schedule_type,
       cron_expression || null, interval_minutes || null, nextRun, req.session.user.id]
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
    const { rowCount } = await pool.query(
      `UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE uuid = $${params.length} AND brand_id = 'ikawn'`,
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
      `SELECT id FROM scheduled_tasks WHERE uuid = $1 AND brand_id = 'ikawn'`, [req.params.uuid]
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
       WHERE st.uuid = $1 AND st.brand_id = 'ikawn'
       ORDER BY tr.started_at DESC
       LIMIT 20`,
      [req.params.uuid]
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
       FROM domain_agents WHERE brand_id = 'ikawn' ORDER BY name`
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
      `UPDATE domain_agents SET enabled = $1 WHERE slug = $2 AND brand_id = 'ikawn'`,
      [enabled, req.params.slug]
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

// ─── HTML: Mission Control Page ────────────────────────────────────────────────

router.get('/mission', requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  res.send(missionPage(isAdmin));
});

// Safe HTML escape helper (server-side, for static content only)
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function missionPage(isAdmin) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>OpenBrain | Mission Control</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Parkinsans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0A0F2E;
      --bg-card: #111738;
      --bg-hover: #171E45;
      --border: #1E2550;
      --border-light: #2A3268;
      --accent: #FFC01C;
      --accent-dim: rgba(255,192,28,0.15);
      --text: #E8EAF0;
      --text-dim: #9498B0;
      --text-muted: #6B6F87;
      --success: #34D399;
      --danger: #F87171;
      --warning: #FBBF24;
      --radius: 12px;
      --radius-sm: 8px;
    }
    body {
      font-family: 'Google Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 32px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .top-nav-left { display: flex; align-items: center; gap: 16px; }
    .top-nav-left h1 {
      font-family: 'Parkinsans', sans-serif;
      font-size: 1.3rem;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent), #F59E0B);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .nav-links { display: flex; gap: 4px; }
    .nav-link {
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.15s;
      cursor: pointer;
    }
    .nav-link:hover { background: var(--bg-hover); color: var(--text); }
    .nav-link.active { background: var(--accent-dim); color: var(--accent); }
    .back-link {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.85rem;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      transition: all 0.15s;
    }
    .back-link:hover { color: var(--text); background: var(--bg-hover); }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 32px; }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .card-header h2 { font-size: 0.95rem; font-weight: 600; }
    .card-body { padding: 20px; }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; padding: 10px 14px; color: var(--text-dim); font-weight: 600; border-bottom: 1px solid var(--border); }
    td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: var(--bg-hover); }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-success { background: rgba(52,211,153,0.15); color: var(--success); }
    .badge-danger { background: rgba(248,113,113,0.15); color: var(--danger); }
    .badge-warning { background: rgba(251,191,36,0.15); color: var(--warning); }
    .badge-accent { background: var(--accent-dim); color: var(--accent); }
    .badge-dim { background: rgba(148,152,176,0.15); color: var(--text-dim); }
    .toggle { position: relative; width: 36px; height: 20px; cursor: pointer; display: inline-block; }
    .toggle input { display: none; }
    .toggle-track {
      position: absolute;
      inset: 0;
      background: var(--border);
      border-radius: 10px;
      transition: background 0.2s;
    }
    .toggle input:checked + .toggle-track { background: var(--accent); }
    .toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle input:checked ~ .toggle-thumb { transform: translateX(16px); }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .btn-primary { background: var(--accent); color: #0A0F2E; }
    .btn-primary:hover { opacity: 0.85; }
    .btn-outline { background: transparent; border: 1px solid var(--border-light); color: var(--text-dim); }
    .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
    .btn-danger { background: rgba(248,113,113,0.15); color: var(--danger); border: none; }
    .btn-danger:hover { background: rgba(248,113,113,0.25); }
    .btn-sm { padding: 4px 10px; font-size: 0.72rem; }
    .org-section { margin-bottom: 32px; }
    .org-section h3 {
      font-size: 0.85rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    .org-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .org-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: border-color 0.15s;
    }
    .org-card:hover { border-color: var(--border-light); }
    .org-card-top { display: flex; align-items: center; justify-content: space-between; }
    .org-card-info { display: flex; align-items: center; gap: 12px; }
    .org-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .org-avatar.agent { background: linear-gradient(135deg, var(--accent), #F59E0B); color: #0A0F2E; }
    .org-avatar.person { background: var(--border-light); color: var(--text); }
    .org-name { font-weight: 600; font-size: 0.9rem; }
    .org-role { font-size: 0.75rem; color: var(--text-dim); }
    .org-tools { display: flex; flex-wrap: wrap; gap: 4px; }
    .tool-chip {
      padding: 2px 8px;
      background: rgba(148,152,176,0.1);
      border-radius: 4px;
      font-size: 0.68rem;
      color: var(--text-dim);
    }
    .runs-row { display: none; }
    .runs-row.visible { display: table-row; }
    .runs-row td { padding: 0; }
    .runs-inner { padding: 12px 20px; background: var(--bg); }
    .runs-table { width: 100%; font-size: 0.75rem; border-collapse: collapse; }
    .runs-table th { color: var(--text-muted); font-size: 0.7rem; padding: 6px 10px; }
    .runs-table td { padding: 6px 10px; }
    .empty-state { text-align: center; color: var(--text-dim); padding: 48px 20px; font-size: 0.9rem; }
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.visible { display: flex; }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 90%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .modal-header h3 { font-size: 0.95rem; }
    .modal-body { padding: 20px; }
    .modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.78rem; color: var(--text-dim); margin-bottom: 4px; font-weight: 600; }
    .form-input, .form-select {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 0.85rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .form-input:focus, .form-select:focus { border-color: var(--accent); }
    .form-select option { background: var(--bg-card); color: var(--text); }
    @media (max-width: 768px) {
      .container { padding: 16px; }
      .top-nav { padding: 12px 16px; flex-wrap: wrap; gap: 8px; }
      .org-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <nav class="top-nav">
    <div class="top-nav-left">
      <h1>Mission Control</h1>
      <div class="nav-links">
        <a class="nav-link active" data-tab="tasks" onclick="switchTab('tasks', this)">Tasks</a>
        <a class="nav-link" data-tab="org" onclick="switchTab('org', this)">Organization</a>
      </div>
    </div>
    <a class="back-link" href="/">&larr; Back to Ruhi</a>
  </nav>

  <div class="container">
    <div id="tab-tasks">
      <div class="card">
        <div class="card-header">
          <h2>Scheduled Tasks</h2>
          <div style="display:flex; gap:8px; align-items:center;">
            <select class="form-select" id="filter-agent" onchange="loadTasks()" style="width:auto; padding:4px 10px; font-size:0.78rem;">
              <option value="">All agents</option>
            </select>
            ${isAdmin ? '<button class="btn btn-primary btn-sm" onclick="openCreateModal()">+ New Task</button>' : ''}
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Agent</th>
                <th>Tool</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Runs</th>
                <th>Next Run</th>
                <th>Enabled</th>
                ${isAdmin ? '<th></th>' : ''}
              </tr>
            </thead>
            <tbody id="tasks-body">
              <tr><td colspan="9" class="empty-state">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="tab-org" style="display:none;">
      <div class="org-section">
        <h3>C-Suite Agents</h3>
        <div class="org-grid" id="agents-grid">
          <div class="empty-state">Loading...</div>
        </div>
      </div>
      <div class="org-section">
        <h3>Team Members</h3>
        <div class="org-grid" id="team-grid">
          <div class="empty-state">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="create-modal" onclick="if(event.target===this)closeCreateModal()">
    <div class="modal">
      <div class="modal-header">
        <h3>New Scheduled Task</h3>
        <button class="btn btn-outline btn-sm" onclick="closeCreateModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Task Name</label>
          <input class="form-input" id="task-name" placeholder="e.g. Daily brand report">
        </div>
        <div class="form-group">
          <label>Description</label>
          <input class="form-input" id="task-desc" placeholder="Optional description">
        </div>
        <div class="form-group">
          <label>Agent</label>
          <select class="form-select" id="task-agent"></select>
        </div>
        <div class="form-group">
          <label>Tool</label>
          <select class="form-select" id="task-tool"></select>
        </div>
        <div class="form-group">
          <label>Schedule Type</label>
          <select class="form-select" id="task-sched-type" onchange="toggleScheduleFields()">
            <option value="interval">Interval</option>
            <option value="cron">Cron</option>
            <option value="event">Event Trigger</option>
          </select>
        </div>
        <div class="form-group" id="interval-group">
          <label>Interval (minutes)</label>
          <input class="form-input" id="task-interval" type="number" min="1" value="60">
        </div>
        <div class="form-group" id="cron-group" style="display:none;">
          <label>Cron Expression</label>
          <input class="form-input" id="task-cron" placeholder="0 9 * * *">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeCreateModal()">Cancel</button>
        <button class="btn btn-primary" onclick="createTask()">Create</button>
      </div>
    </div>
  </div>

<script>
  var isAdmin = ${isAdmin};
  var tasksData = [];

  // Safe escape — uses DOM textContent to prevent XSS
  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function switchTab(tab, el) {
    document.getElementById('tab-tasks').style.display = tab === 'tasks' ? '' : 'none';
    document.getElementById('tab-org').style.display = tab === 'org' ? '' : 'none';
    document.querySelectorAll('.nav-link').forEach(function(l) { l.classList.remove('active'); });
    el.classList.add('active');
    if (tab === 'org') loadOrg();
  }

  // ── Tasks ──
  async function loadTasks() {
    var agent = document.getElementById('filter-agent').value;
    var qs = agent ? '?agent_slug=' + encodeURIComponent(agent) : '';
    try {
      var res = await fetch('/api/mission/tasks' + qs);
      var data = await res.json();
      tasksData = data.tasks || [];
      renderTasks();
    } catch (err) {
      document.getElementById('tasks-body').textContent = '';
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 9;
      td.className = 'empty-state';
      td.textContent = 'Failed to load tasks';
      tr.appendChild(td);
      document.getElementById('tasks-body').appendChild(tr);
    }
  }

  function renderTasks() {
    var tbody = document.getElementById('tasks-body');
    // Clear existing rows
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (tasksData.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 9;
      td.className = 'empty-state';
      td.textContent = 'No scheduled tasks yet';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    tasksData.forEach(function(t, i) {
      var tr = document.createElement('tr');

      // Name
      var tdName = document.createElement('td');
      var strong = document.createElement('strong');
      strong.textContent = t.name;
      tdName.appendChild(strong);
      tr.appendChild(tdName);

      // Agent
      var tdAgent = document.createElement('td');
      var agentBadge = document.createElement('span');
      agentBadge.className = 'badge badge-accent';
      agentBadge.textContent = t.agent_slug;
      tdAgent.appendChild(agentBadge);
      tr.appendChild(tdAgent);

      // Tool
      var tdTool = document.createElement('td');
      tdTool.textContent = t.tool;
      tr.appendChild(tdTool);

      // Schedule
      var tdSched = document.createElement('td');
      if (t.schedule_type === 'interval') {
        tdSched.textContent = 'Every ' + t.interval_minutes + 'min';
      } else if (t.schedule_type === 'cron') {
        tdSched.textContent = t.cron_expression || 'cron';
      } else {
        tdSched.textContent = t.schedule_type;
      }
      tr.appendChild(tdSched);

      // Status
      var tdStatus = document.createElement('td');
      var statusBadge = document.createElement('span');
      if (t.last_status === 'success') {
        statusBadge.className = 'badge badge-success';
        statusBadge.textContent = 'OK';
      } else if (t.last_status === 'error') {
        statusBadge.className = 'badge badge-danger';
        statusBadge.textContent = 'Error';
      } else {
        statusBadge.className = 'badge badge-dim';
        statusBadge.textContent = t.last_status || 'Never run';
      }
      tdStatus.appendChild(statusBadge);
      if (t.consecutive_failures > 0) {
        var failBadge = document.createElement('span');
        failBadge.className = 'badge badge-danger';
        failBadge.textContent = t.consecutive_failures + ' fails';
        failBadge.style.marginLeft = '4px';
        tdStatus.appendChild(failBadge);
      }
      tr.appendChild(tdStatus);

      // Runs
      var tdRuns = document.createElement('td');
      var runsBtn = document.createElement('button');
      runsBtn.className = 'btn btn-outline btn-sm';
      runsBtn.textContent = t.run_count + ' runs';
      runsBtn.onclick = (function(idx) { return function() { toggleRuns(idx); }; })(i);
      tdRuns.appendChild(runsBtn);
      tr.appendChild(tdRuns);

      // Next run
      var tdNext = document.createElement('td');
      tdNext.style.fontSize = '0.75rem';
      tdNext.style.color = 'var(--text-dim)';
      tdNext.textContent = t.next_run_at ? new Date(t.next_run_at).toLocaleString() : '\u2014';
      tr.appendChild(tdNext);

      // Enabled toggle
      var tdEnabled = document.createElement('td');
      if (isAdmin) {
        var label = document.createElement('label');
        label.className = 'toggle';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = t.enabled;
        input.onchange = (function(uuid) { return function() { toggleTask(uuid, this.checked); }; })(t.uuid);
        var track = document.createElement('span');
        track.className = 'toggle-track';
        var thumb = document.createElement('span');
        thumb.className = 'toggle-thumb';
        label.appendChild(input);
        label.appendChild(track);
        label.appendChild(thumb);
        tdEnabled.appendChild(label);
      } else {
        tdEnabled.textContent = t.enabled ? 'On' : 'Off';
      }
      tr.appendChild(tdEnabled);

      // Delete (admin only)
      if (isAdmin) {
        var tdDel = document.createElement('td');
        var delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-sm';
        delBtn.textContent = 'Delete';
        delBtn.onclick = (function(uuid) { return function() { deleteTask(uuid); }; })(t.uuid);
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);
      }

      tbody.appendChild(tr);

      // Expandable runs row
      var runsRow = document.createElement('tr');
      runsRow.className = 'runs-row';
      runsRow.id = 'runs-' + i;
      var runsTd = document.createElement('td');
      runsTd.colSpan = 9;
      var runsInner = document.createElement('div');
      runsInner.className = 'runs-inner';
      runsInner.id = 'runs-content-' + i;
      runsInner.textContent = 'Loading runs...';
      runsTd.appendChild(runsInner);
      runsRow.appendChild(runsTd);
      tbody.appendChild(runsRow);
    });
  }

  async function toggleTask(uuid, enabled) {
    await fetch('/api/mission/tasks/' + encodeURIComponent(uuid), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled }),
    });
  }

  async function deleteTask(uuid) {
    if (!confirm('Delete this task and all its run history?')) return;
    await fetch('/api/mission/tasks/' + encodeURIComponent(uuid), { method: 'DELETE' });
    loadTasks();
  }

  async function toggleRuns(idx) {
    var row = document.getElementById('runs-' + idx);
    if (row.classList.contains('visible')) {
      row.classList.remove('visible');
      return;
    }
    row.classList.add('visible');
    var task = tasksData[idx];
    var wrap = document.getElementById('runs-content-' + idx);

    try {
      var res = await fetch('/api/mission/tasks/' + encodeURIComponent(task.uuid) + '/runs');
      var data = await res.json();
      var runs = data.runs || [];

      // Clear
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

      if (runs.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:8px;color:var(--text-dim);font-size:0.8rem;';
        empty.textContent = 'No runs yet';
        wrap.appendChild(empty);
        return;
      }

      var table = document.createElement('table');
      table.className = 'runs-table';
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      ['Started', 'Status', 'Duration', 'Cost', 'Tokens', 'Error'].forEach(function(h) {
        var th = document.createElement('th');
        th.textContent = h;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbod = document.createElement('tbody');
      runs.forEach(function(r) {
        var rtr = document.createElement('tr');

        var tdStarted = document.createElement('td');
        tdStarted.textContent = new Date(r.started_at).toLocaleString();
        rtr.appendChild(tdStarted);

        var tdStatus = document.createElement('td');
        var sb = document.createElement('span');
        sb.className = 'badge ' + (r.status === 'success' ? 'badge-success' : r.status === 'error' ? 'badge-danger' : 'badge-dim');
        sb.textContent = r.status;
        tdStatus.appendChild(sb);
        rtr.appendChild(tdStatus);

        var tdDur = document.createElement('td');
        tdDur.textContent = r.completed_at ? Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000) + 's' : '\u2014';
        rtr.appendChild(tdDur);

        var tdCost = document.createElement('td');
        tdCost.textContent = '$' + Number(r.cost_usd || 0).toFixed(4);
        rtr.appendChild(tdCost);

        var tdTokens = document.createElement('td');
        tdTokens.textContent = r.tokens_used || 0;
        rtr.appendChild(tdTokens);

        var tdErr = document.createElement('td');
        tdErr.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;';
        tdErr.textContent = r.error || '\u2014';
        rtr.appendChild(tdErr);

        tbod.appendChild(rtr);
      });
      table.appendChild(tbod);
      wrap.appendChild(table);
    } catch (err) {
      wrap.textContent = 'Failed to load runs';
      wrap.style.color = 'var(--danger)';
    }
  }

  // ── Create task ──
  function openCreateModal() { document.getElementById('create-modal').classList.add('visible'); }
  function closeCreateModal() { document.getElementById('create-modal').classList.remove('visible'); }
  function toggleScheduleFields() {
    var type = document.getElementById('task-sched-type').value;
    document.getElementById('interval-group').style.display = type === 'interval' ? '' : 'none';
    document.getElementById('cron-group').style.display = type === 'cron' ? '' : 'none';
  }

  async function createTask() {
    var body = {
      name: document.getElementById('task-name').value.trim(),
      description: document.getElementById('task-desc').value.trim() || null,
      agent_slug: document.getElementById('task-agent').value,
      tool: document.getElementById('task-tool').value,
      schedule_type: document.getElementById('task-sched-type').value,
    };
    if (!body.name || !body.tool) return alert('Name and tool are required');

    if (body.schedule_type === 'interval') {
      body.interval_minutes = parseInt(document.getElementById('task-interval').value) || 60;
    } else if (body.schedule_type === 'cron') {
      body.cron_expression = document.getElementById('task-cron').value.trim();
      if (!body.cron_expression) return alert('Cron expression is required');
    }

    var res = await fetch('/api/mission/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to create task');
    closeCreateModal();
    document.getElementById('task-name').value = '';
    document.getElementById('task-desc').value = '';
    loadTasks();
  }

  // ── Org structure ──
  async function loadOrg() {
    try {
      var [agentsRes, teamRes] = await Promise.all([
        fetch('/api/mission/agents'),
        fetch('/api/mission/team'),
      ]);
      var agentsData = await agentsRes.json();
      var teamData = await teamRes.json();

      renderAgents(agentsData.agents || []);
      renderTeam(teamData.team || []);
    } catch (err) {
      document.getElementById('agents-grid').textContent = 'Failed to load';
      document.getElementById('team-grid').textContent = 'Failed to load';
    }
  }

  function renderAgents(agents) {
    var grid = document.getElementById('agents-grid');
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    if (agents.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No agents configured';
      grid.appendChild(empty);
      return;
    }

    agents.forEach(function(a) {
      var card = document.createElement('div');
      card.className = 'org-card';

      var top = document.createElement('div');
      top.className = 'org-card-top';

      var info = document.createElement('div');
      info.className = 'org-card-info';

      var avatar = document.createElement('div');
      avatar.className = 'org-avatar agent';
      avatar.textContent = a.name[0].toUpperCase();

      var details = document.createElement('div');
      var nameEl = document.createElement('div');
      nameEl.className = 'org-name';
      nameEl.textContent = a.name;
      var roleEl = document.createElement('div');
      roleEl.className = 'org-role';
      roleEl.textContent = a.role;
      details.appendChild(nameEl);
      details.appendChild(roleEl);

      info.appendChild(avatar);
      info.appendChild(details);
      top.appendChild(info);

      var statusBadge = document.createElement('span');
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'Active';
      top.appendChild(statusBadge);

      card.appendChild(top);

      if (a.tools && a.tools.length > 0) {
        var toolsDiv = document.createElement('div');
        toolsDiv.className = 'org-tools';
        a.tools.forEach(function(t) {
          var chip = document.createElement('span');
          chip.className = 'tool-chip';
          chip.textContent = t;
          toolsDiv.appendChild(chip);
        });
        card.appendChild(toolsDiv);
      }

      grid.appendChild(card);
    });
  }

  function renderTeam(team) {
    var grid = document.getElementById('team-grid');
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    if (team.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No team members';
      grid.appendChild(empty);
      return;
    }

    team.forEach(function(u) {
      var card = document.createElement('div');
      card.className = 'org-card';

      var top = document.createElement('div');
      top.className = 'org-card-top';

      var info = document.createElement('div');
      info.className = 'org-card-info';

      var avatar = document.createElement('div');
      avatar.className = 'org-avatar person';
      avatar.textContent = u.name[0].toUpperCase();

      var details = document.createElement('div');
      var nameEl = document.createElement('div');
      nameEl.className = 'org-name';
      nameEl.textContent = u.name;
      var roleEl = document.createElement('div');
      roleEl.className = 'org-role';
      roleEl.textContent = u.role + ' \u00b7 ' + u.email;
      details.appendChild(nameEl);
      details.appendChild(roleEl);

      info.appendChild(avatar);
      info.appendChild(details);
      top.appendChild(info);
      card.appendChild(top);

      if (u.access_levels && u.access_levels.length > 0) {
        var levelsDiv = document.createElement('div');
        levelsDiv.className = 'org-tools';
        u.access_levels.forEach(function(l) {
          var chip = document.createElement('span');
          chip.className = 'tool-chip';
          chip.textContent = l;
          levelsDiv.appendChild(chip);
        });
        card.appendChild(levelsDiv);
      }

      grid.appendChild(card);
    });
  }

  // ── Init ──
  async function init() {
    try {
      var agentsRes = await fetch('/api/mission/agents');
      var agentsData = await agentsRes.json();
      var agents = agentsData.agents || [];

      var filterSelect = document.getElementById('filter-agent');
      var taskAgentSelect = document.getElementById('task-agent');
      agents.forEach(function(a) {
        var opt1 = document.createElement('option');
        opt1.value = a.slug;
        opt1.textContent = a.slug;
        filterSelect.appendChild(opt1);
        var opt2 = document.createElement('option');
        opt2.value = a.slug;
        opt2.textContent = a.slug;
        taskAgentSelect.appendChild(opt2);
      });
    } catch (_) {}

    try {
      var toolsRes = await fetch('/api/mission/tools');
      var toolsData = await toolsRes.json();
      var toolSelect = document.getElementById('task-tool');
      (toolsData.tools || []).forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name + ' (' + t.tier + ')';
        toolSelect.appendChild(opt);
      });
    } catch (_) {}

    loadTasks();
  }

  init();
</script>
</body>
</html>`;
}

module.exports = router;
