// @ts-check
'use strict';

/**
 * Reports page — user-facing view of scheduled task results.
 *
 * GET  /reports                    — Reports page (HTML)
 * GET  /api/reports/unread-count   — Unread task run count
 * POST /api/reports/mark-viewed    — Mark all runs as viewed
 * GET  /api/reports/runs           — Recent completed runs with results
 */

const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');
const { RUHI_FAVICON_LINK, INSTANCE_NAME } = require('../utils/ruhi-assets');

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

// Safe HTML escape helper
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── GET /reports — Reports page ──
router.get('/reports', requireAuth, (req, res) => {
  res.send(reportsPage(req.session.user));
});

function reportsPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${INSTANCE_NAME} | Reports</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Parkinsans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0a0a0a;
      --bg-sidebar: rgb(8,8,8);
      --bg-card: rgba(255,255,255,0.03);
      --bg-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.08);
      --border-solid: rgb(40,40,40);
      --text: #e8e8e8;
      --text-dim: rgba(255,255,255,0.45);
      --text-muted: rgb(100,100,100);
      --accent: #FFC01C;
      --accent-soft: rgba(255,192,28,0.08);
      --gold: #FFC01C;
      --green: #22c55e;
      --red: #ef4444;
      --rail-w: 48px;
    }
    body { font-family: 'Google Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    a { color: var(--gold); text-decoration: none; }

    /* Sidebar Rail */
    .sidebar-rail {
      position: fixed; left: 0; top: 0; bottom: 0; width: var(--rail-w);
      background: var(--bg-sidebar); border-right: 1px solid var(--border-solid);
      display: flex; flex-direction: column; align-items: center;
      padding: 12px 0; z-index: 100; gap: 0;
    }
    .rail-logo {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--accent); display: flex; align-items: center; justify-content: center;
      cursor: pointer; margin-bottom: 20px; flex-shrink: 0;
      font-size: 1.1rem; color: rgb(5,5,5); font-weight: 700;
    }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; align-items: center; flex: 1; }
    .rail-btn {
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: transparent; color: var(--text-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; position: relative;
    }
    .rail-btn:hover { background: var(--bg-hover); color: var(--text); }
    .rail-btn.active { color: var(--accent); background: var(--accent-soft); }
    .rail-btn svg { width: 18px; height: 18px; }
    .rail-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 4px; align-items: center; }
    .rail-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--border-solid); color: var(--text-dim);
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 600; cursor: pointer;
    }
    .report-badge {
      position: absolute; top: 4px; right: 4px; min-width: 14px; height: 14px;
      background: var(--red); color: #fff; border-radius: 7px; font-size: 9px;
      display: flex; align-items: center; justify-content: center; padding: 0 3px;
    }

    .page-wrapper {
      margin-left: var(--rail-w);
    }

    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 32px; border-bottom: 1px solid var(--border);
    }
    .header h1 { font-family: 'Parkinsans', sans-serif; font-size: 22px; font-weight: 600; }
    .header-back { color: var(--text-dim); font-size: 14px; }
    .header-back:hover { color: var(--text); }

    .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); padding: 0 32px; }
    .tab {
      padding: 12px 20px; font-size: 14px; color: var(--text-dim); cursor: pointer;
      border-bottom: 2px solid transparent; transition: all 0.15s;
    }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--gold); border-bottom-color: var(--gold); }

    .content { padding: 24px 32px; max-width: 900px; }

    .task-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 20px; margin-bottom: 12px; transition: border-color 0.15s;
    }
    .task-card:hover { border-color: rgba(255,255,255,0.2); }
    .task-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .task-name { font-weight: 600; font-size: 15px; }
    .task-meta { font-size: 12px; color: var(--text-dim); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .task-actions { display: flex; gap: 8px; }
    .task-actions button {
      background: none; border: 1px solid var(--border); color: var(--text-dim);
      padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
    }
    .task-actions button:hover { border-color: var(--text-dim); color: var(--text); }
    .task-actions button.danger:hover { border-color: var(--red); color: var(--red); }

    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
    }
    .badge-success { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-fail { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-running { background: rgba(229,168,25,0.15); color: var(--gold); }
    .badge-enabled { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-disabled { background: rgba(255,255,255,0.08); color: var(--text-dim); }

    .run-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 20px; margin-bottom: 10px;
    }
    .run-card.unread { border-left: 3px solid var(--gold); }
    .run-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .run-task-name { font-weight: 500; font-size: 14px; }
    .run-time { font-size: 12px; color: var(--text-dim); }
    .run-summary { font-size: 13px; color: var(--text-dim); line-height: 1.5; white-space: pre-wrap; }

    .empty-state {
      text-align: center; padding: 60px 20px; color: var(--text-dim);
    }
    .empty-state h3 { font-size: 18px; margin-bottom: 8px; color: var(--text); }
    .empty-state p { font-size: 14px; max-width: 400px; margin: 0 auto; }

    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .page-wrapper { margin-left: 0; }
      .header, .tabs, .content { padding-left: 16px; padding-right: 16px; }
      .task-header { flex-direction: column; align-items: flex-start; gap: 8px; }
    }
  </style>
</head>
<body>
  <!-- Sidebar Rail -->
  <nav class="sidebar-rail">
    <div class="rail-logo" title="${INSTANCE_NAME}" onclick="window.location.href='/'" style="cursor:pointer">
      \u2726
    </div>
    <div class="rail-nav">
      <button class="rail-btn" onclick="window.location.href='/'" title="Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/'" title="History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="rail-btn active" onclick="window.location.href='/reports'" title="Reports" style="position:relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span class="report-badge" id="report-badge" style="display:none"></span>
      </button>
      <button class="rail-btn" onclick="window.location.href='/vault'" title="Vault">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/mission'" title="Mission Control">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>` : ''}
    </div>

    <div class="rail-bottom">
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/admin/brain-health'" title="Brain Health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </button>` : ''}
      <div class="rail-avatar" title="${user.name || user.email}">
        ${(user.name || user.email || '?')[0].toUpperCase()}
      </div>
    </div>
  </nav>

  <div class="page-wrapper">
    <div class="header">
      <h1>Reports</h1>
      <a href="/" class="header-back">&larr; Back to Chat</a>
    </div>

    <div class="tabs">
      <div class="tab active" onclick="switchTab('results')" id="tab-results">Results</div>
      <div class="tab" onclick="switchTab('tasks')" id="tab-tasks">Active Tasks</div>
    </div>

    <div class="content" id="content">
      <div id="results-tab"></div>
      <div id="tasks-tab" style="display:none"></div>
    </div>
  </div>

<script>
  let currentTab = 'results';

  function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-results').classList.toggle('active', tab === 'results');
    document.getElementById('tab-tasks').classList.toggle('active', tab === 'tasks');
    document.getElementById('results-tab').style.display = tab === 'results' ? 'block' : 'none';
    document.getElementById('tasks-tab').style.display = tab === 'tasks' ? 'block' : 'none';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function scheduleLabel(task) {
    if (task.schedule_type === 'cron') return task.cron_expression || 'cron';
    if (task.schedule_type === 'interval') return 'Every ' + task.interval_minutes + 'm';
    if (task.schedule_type === 'once') return 'One-time';
    if (task.schedule_type === 'trigger') return 'Event-based';
    return task.schedule_type;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function renderRuns(runs) {
    var container = document.getElementById('results-tab');
    if (!runs.length) {
      container.textContent = '';
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var h3 = document.createElement('h3');
      h3.textContent = 'No results yet';
      var p = document.createElement('p');
      p.textContent = 'Ask ${INSTANCE_NAME} to schedule a task and results will appear here.';
      empty.appendChild(h3);
      empty.appendChild(p);
      container.appendChild(empty);
      return;
    }

    container.textContent = '';
    runs.forEach(function(r) {
      var summary = '';
      try {
        var result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
        summary = (result && result.summary) ? result.summary : JSON.stringify(result, null, 2).slice(0, 500);
      } catch(e) { summary = r.error || 'No details'; }

      var card = document.createElement('div');
      card.className = 'run-card' + (!r.viewed_at ? ' unread' : '');

      var header = document.createElement('div');
      header.className = 'run-header';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'run-task-name';
      nameSpan.textContent = r.task_name;

      var timeSpan = document.createElement('span');
      timeSpan.className = 'run-time';
      timeSpan.textContent = timeAgo(r.started_at) + ' ';

      var badge = document.createElement('span');
      badge.className = 'badge ' + (r.status === 'completed' ? 'badge-success' : r.status === 'failed' ? 'badge-fail' : 'badge-running');
      badge.textContent = r.status;
      timeSpan.appendChild(badge);

      header.appendChild(nameSpan);
      header.appendChild(timeSpan);

      var summaryDiv = document.createElement('div');
      summaryDiv.className = 'run-summary';
      summaryDiv.textContent = summary;

      card.appendChild(header);
      card.appendChild(summaryDiv);
      container.appendChild(card);
    });
  }

  function renderTasks(tasks) {
    var container = document.getElementById('tasks-tab');
    if (!tasks.length) {
      container.textContent = '';
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var h3 = document.createElement('h3');
      h3.textContent = 'No scheduled tasks';
      var p = document.createElement('p');
      p.textContent = 'Ask ${INSTANCE_NAME} to create a recurring task like "check my competitors every Monday".';
      empty.appendChild(h3);
      empty.appendChild(p);
      container.appendChild(empty);
      return;
    }

    container.textContent = '';
    tasks.forEach(function(t) {
      var card = document.createElement('div');
      card.className = 'task-card';

      var header = document.createElement('div');
      header.className = 'task-header';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'task-name';
      nameSpan.textContent = t.name;

      var actions = document.createElement('div');
      actions.className = 'task-actions';

      var toggleBtn = document.createElement('button');
      toggleBtn.textContent = t.enabled ? 'Pause' : 'Resume';
      toggleBtn.onclick = function() { toggleTask(t.uuid); };

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = function() { deleteTask(t.uuid); };

      actions.appendChild(toggleBtn);
      actions.appendChild(deleteBtn);

      header.appendChild(nameSpan);
      header.appendChild(actions);

      var meta = document.createElement('div');
      meta.className = 'task-meta';

      var statusBadge = document.createElement('span');
      statusBadge.className = 'badge ' + (t.enabled ? 'badge-enabled' : 'badge-disabled');
      statusBadge.textContent = t.enabled ? 'Active' : 'Paused';

      var schedSpan = document.createElement('span');
      schedSpan.textContent = scheduleLabel(t);

      var toolSpan = document.createElement('span');
      toolSpan.textContent = t.tool;

      var lastRunSpan = document.createElement('span');
      lastRunSpan.textContent = t.last_run_at ? 'Last run: ' + timeAgo(t.last_run_at) : 'Never run';

      var runCountSpan = document.createElement('span');
      runCountSpan.textContent = t.run_count + ' runs';

      meta.appendChild(statusBadge);
      meta.appendChild(schedSpan);
      meta.appendChild(toolSpan);
      meta.appendChild(lastRunSpan);
      meta.appendChild(runCountSpan);

      card.appendChild(header);
      card.appendChild(meta);

      if (t.description) {
        var desc = document.createElement('div');
        desc.style.cssText = 'font-size:13px;color:var(--text-dim);margin-top:8px';
        desc.textContent = t.description;
        card.appendChild(desc);
      }

      container.appendChild(card);
    });
  }

  async function loadRuns() {
    try {
      var res = await fetch('/api/reports/runs', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Failed to load');
      var data = await res.json();
      renderRuns(data.runs);
      // Mark all as viewed
      fetch('/api/reports/mark-viewed', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(function() {});
    } catch (err) {
      document.getElementById('results-tab').textContent = 'Failed to load results.';
    }
  }

  async function loadTasks() {
    try {
      var res = await fetch('/api/reports/tasks', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Failed to load');
      var data = await res.json();
      renderTasks(data.tasks);
    } catch (err) {
      document.getElementById('tasks-tab').textContent = 'Failed to load tasks.';
    }
  }

  async function toggleTask(uuid) {
    await fetch('/api/reports/tasks/' + encodeURIComponent(uuid) + '/toggle', { method: 'PUT', headers: { 'Content-Type': 'application/json' } });
    loadTasks();
  }

  async function deleteTask(uuid) {
    if (!confirm('Delete this task and all its run history?')) return;
    await fetch('/api/reports/tasks/' + encodeURIComponent(uuid), { method: 'DELETE' });
    loadTasks();
    loadRuns();
  }

  // Init
  loadRuns();
  loadTasks();
</script>
</body>
</html>`;
}

module.exports = router;
