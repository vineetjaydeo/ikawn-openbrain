const { Router } = require('express');
const crypto = require('crypto');
const { requireAdmin } = require('../auth');
const { pool } = require('../db');
const { RUHI_FAVICON_LINK, INSTANCE_NAME } = require('../utils/ruhi-assets');

const { requireAuth } = require('../auth');

const router = Router();

// API endpoints use requireAdmin (returns JSON errors)
// HTML page uses requireAuth + requireAdmin (redirects to /login)

// ── API Endpoints ──

// List all API keys (never returns the actual key)
router.get('/admin/api/api-keys', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT k.id, k.key_prefix, k.name, k.created_at, k.expires_at, k.revoked_at, k.last_used_at, k.org_id, k.brand_id,
             u.email as created_by_email,
             (SELECT COUNT(*)::int FROM api_key_usage WHERE api_key_id = k.id) as usage_count
      FROM api_keys k
      LEFT JOIN users u ON u.id = k.created_by
      ORDER BY k.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('List API keys error:', err);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Generate a new API key
router.post('/admin/api/api-keys', requireAdmin, async (req, res) => {
  try {
    const { name, expires_in, org_id, brand_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate 32 random bytes → hex, prefix with ob_
    const rawKey = crypto.randomBytes(32).toString('hex');
    const fullKey = `ob_${rawKey}`;
    const keyPrefix = `ob_${rawKey.slice(0, 8)}...`;
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');

    // Calculate expiry
    let expiresAt = null;
    if (expires_in === '30d') expiresAt = new Date(Date.now() + 30 * 86400000);
    else if (expires_in === '90d') expiresAt = new Date(Date.now() + 90 * 86400000);
    else if (expires_in === '1y') expiresAt = new Date(Date.now() + 365 * 86400000);
    // else: null = never expires

    const result = await pool.query(
      `INSERT INTO api_keys (key_hash, key_prefix, name, created_by, expires_at, org_id, brand_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, key_prefix, name, created_at, expires_at, org_id, brand_id`,
      [keyHash, keyPrefix, name.trim(), req.session?.user?.id || null, expiresAt, org_id || null, brand_id || 'ikawn']
    );

    // Return the full key ONCE — it can never be retrieved again
    res.status(201).json({
      ...result.rows[0],
      key: fullKey,
    });
  } catch (err) {
    console.error('Generate API key error:', err);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// Revoke an API key
router.post('/admin/api/api-keys/:id/revoke', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id, name`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found or already revoked' });
    }
    res.json({ ok: true, name: result.rows[0].name });
  } catch (err) {
    console.error('Revoke API key error:', err);
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

// Get usage logs for a specific key
router.get('/admin/api/api-keys/:id/usage', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT endpoint, method, status_code, ip_address, created_at
       FROM api_key_usage
       WHERE api_key_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('API key usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

// Get aggregate usage stats for a key
router.get('/admin/api/api-keys/:id/stats', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        COUNT(*)::int as total_requests,
        COUNT(DISTINCT endpoint) as unique_endpoints,
        COUNT(DISTINCT ip_address) as unique_ips,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int as requests_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int as requests_7d
      FROM api_key_usage
      WHERE api_key_id = $1
    `, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('API key stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── HTML Page ──

router.get('/admin/api-keys', requireAuth, requireAdmin, (req, res) => {
  res.send(apiKeysPage(req.session.user));
});

function apiKeysPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${INSTANCE_NAME} | API Keys</title>
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
    body { font-family: 'Google Sans', sans-serif; background: var(--bg); color: #fafafa; min-height: 100vh; }
    a { color: #e5a819; text-decoration: none; }

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

    .page-wrapper {
      margin-left: var(--rail-w);
    }

    .content-area { padding: 28px; max-width: 960px; margin: 0 auto; }
    h1 { font-family: 'Parkinsans', sans-serif; font-size: 1.5rem; font-weight: 600; margin-bottom: 4px; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; font-size: 0.875rem; }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 32px; border-bottom: 1px solid var(--border); }
    .header-right { display: flex; gap: 12px; align-items: center; }

    .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-family: inherit; font-weight: 500; }
    .btn-primary { background: #e5a819; color: #0a0a0a; font-weight: 600; }
    .btn-primary:hover { background: #d19a15; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
    .btn-outline { background: transparent; border: 1px solid #27272a; color: #fafafa; }
    .btn-outline:hover { background: #27272a; }
    .btn-ghost { background: transparent; border: none; color: #a1a1aa; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; font-family: inherit; }
    .btn-ghost:hover { color: #fafafa; }

    /* Key cards */
    .keys-list { display: flex; flex-direction: column; gap: 12px; }
    .key-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 18px 20px; transition: border-color 0.15s; }
    .key-card:hover { border-color: #3f3f46; }
    .key-card.revoked { opacity: 0.5; }
    .key-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .key-name { font-size: 1rem; font-weight: 600; display: inline; }
    .key-prefix { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.8rem; color: #a1a1aa; background: #0a0a0a; padding: 3px 8px; border-radius: 6px; border: 1px solid #27272a; }
    .key-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.78rem; color: #71717a; }
    .key-actions { display: flex; gap: 6px; align-items: center; }

    .badge { padding: 3px 10px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; display: inline-block; margin-left: 8px; }
    .badge-active { background: #22c55e18; color: #22c55e; }
    .badge-revoked { background: #ef444418; color: #ef4444; }
    .badge-expired { background: #f59e0b18; color: #f59e0b; }

    .empty-state { text-align: center; padding: 60px 20px; color: #71717a; }
    .empty-state h3 { font-size: 1.1rem; color: #a1a1aa; margin-bottom: 8px; }
    .empty-state p { font-size: 0.875rem; margin-bottom: 20px; }

    /* Usage panel */
    .usage-panel { margin-top: 12px; padding-top: 14px; border-top: 1px solid #27272a; display: none; }
    .usage-panel.open { display: block; }
    .usage-stats { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .usage-stat { background: #0a0a0a; border: 1px solid #27272a; border-radius: 8px; padding: 10px 14px; min-width: 100px; }
    .usage-stat-label { font-size: 0.65rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 2px; }
    .usage-stat-value { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .usage-log { max-height: 260px; overflow-y: auto; }
    .usage-log table { width: 100%; border-collapse: collapse; }
    .usage-log th, .usage-log td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #1f1f23; font-size: 0.78rem; }
    .usage-log th { color: #71717a; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; position: sticky; top: 0; background: #18181b; }
    .usage-log td { color: #d4d4d8; }
    .usage-log td.method { font-weight: 600; }
    .usage-log::-webkit-scrollbar { width: 4px; }
    .usage-log::-webkit-scrollbar-track { background: transparent; }
    .usage-log::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }

    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); justify-content: center; align-items: center; z-index: 100; }
    .modal-overlay.active { display: flex; }
    .modal { background: #18181b; border: 1px solid #27272a; border-radius: 14px; padding: 28px; width: 100%; max-width: 440px; }
    .modal h2 { font-size: 1.15rem; margin-bottom: 6px; font-weight: 600; }
    .modal .modal-desc { color: #a1a1aa; font-size: 0.85rem; margin-bottom: 20px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.8rem; color: #a1a1aa; margin-bottom: 4px; font-weight: 500; }
    .form-group input, .form-group select { width: 100%; padding: 10px 12px; background: #0a0a0a; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 0.875rem; font-family: inherit; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #e5a819; box-shadow: 0 0 0 3px #e5a81920; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }

    /* Key reveal */
    .key-reveal { background: #0a0a0a; border: 1px solid #e5a81940; border-radius: 10px; padding: 16px; margin: 16px 0; }
    .key-reveal-label { font-size: 0.75rem; color: #e5a819; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .key-reveal-value { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.82rem; color: #fafafa; word-break: break-all; line-height: 1.5; background: #18181b; padding: 10px 12px; border-radius: 6px; border: 1px solid #27272a; user-select: all; }
    .key-reveal-warning { font-size: 0.78rem; color: #f59e0b; margin-top: 10px; }
    .copy-btn { margin-top: 10px; width: 100%; }

    /* Toast */
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 10px; font-size: 0.875rem; font-family: inherit; display: none; z-index: 200; }
    .toast-success { background: #22c55e; color: #fff; }
    .toast-error { background: #ef4444; color: #fff; }

    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .page-wrapper { margin-left: 0; }
      .header, .content-area { padding-left: 16px; padding-right: 16px; }
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
      <button class="rail-btn" onclick="window.location.href='/reports'" title="Reports" style="position:relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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
    <div>
      <h1>API Keys</h1>
      <p class="subtitle">Manage API access to OpenBrain</p>
    </div>
    <div class="header-right">
      <a href="/admin" class="btn btn-outline" style="text-decoration:none;">Admin</a>
      <a href="/admin/brain-health" class="btn btn-outline" style="text-decoration:none;">Brain Health</a>
      <button class="btn btn-primary" onclick="showCreateModal()">Generate Key</button>
    </div>
  </div>

  <div class="content-area">
  <div class="keys-list" id="keys-list">
    <div class="empty-state" id="loading-state">Loading API keys...</div>
  </div>

  </div><!-- /content-area -->
  </div><!-- /page-wrapper -->

  <!-- Create Key Modal -->
  <div class="modal-overlay" id="create-modal">
    <div class="modal">
      <h2>Generate API Key</h2>
      <p class="modal-desc">The key will only be shown once. Store it securely.</p>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="f-name" placeholder="e.g. OpenClaw Production, Local Dev">
      </div>
      <div class="form-group">
        <label>Expiry</label>
        <select id="f-expiry">
          <option value="never">Never expires</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select>
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeCreateModal()">Cancel</button>
        <button class="btn btn-primary" id="create-btn" onclick="createKey()">Generate</button>
      </div>
    </div>
  </div>

  <!-- Key Reveal Modal -->
  <div class="modal-overlay" id="reveal-modal">
    <div class="modal">
      <h2>Key Generated</h2>
      <p class="modal-desc" id="reveal-name"></p>
      <div class="key-reveal">
        <div class="key-reveal-label">Your API Key</div>
        <div class="key-reveal-value" id="reveal-key"></div>
        <div class="key-reveal-warning">&#9888; This key will not be shown again. Copy it now.</div>
        <button class="btn btn-primary copy-btn" onclick="copyKey()">Copy to Clipboard</button>
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeRevealModal()">Done</button>
      </div>
    </div>
  </div>

  <!-- Revoke Confirmation Modal -->
  <div class="modal-overlay" id="revoke-modal">
    <div class="modal">
      <h2>Revoke API Key</h2>
      <p class="modal-desc">This will immediately disable the key. Any systems using it will lose access. This cannot be undone.</p>
      <p class="modal-desc" id="revoke-name" style="font-weight:600;color:#fafafa;margin-bottom:8px;"></p>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeRevokeModal()">Cancel</button>
        <button class="btn btn-danger" id="revoke-btn" onclick="confirmRevoke()">Revoke Key</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let keys = [];
    let revokingId = null;
    let revealedKey = '';

    function fmt(n) { return Number(n).toLocaleString(); }

    function getStatus(k) {
      if (k.revoked_at) return 'revoked';
      if (k.expires_at && new Date(k.expires_at) < new Date()) return 'expired';
      return 'active';
    }

    function timeAgo(date) {
      if (!date) return 'Never';
      const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
      if (s < 60) return 'Just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 604800) return Math.floor(s / 86400) + 'd ago';
      return new Date(date).toLocaleDateString();
    }

    function formatDate(date) {
      if (!date) return 'Never';
      return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Safe DOM element creator
    function el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'className') e.className = v;
          else if (k === 'textContent') e.textContent = v;
          else if (k === 'onclick') e.onclick = v;
          else if (k.startsWith('data-')) e.setAttribute(k, v);
          else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
          else e.setAttribute(k, v);
        }
      }
      if (children) {
        if (typeof children === 'string') e.textContent = children;
        else if (Array.isArray(children)) children.forEach(c => { if (c) e.appendChild(c); });
        else e.appendChild(children);
      }
      return e;
    }

    function text(str) { return document.createTextNode(str); }

    async function loadKeys() {
      try {
        const res = await fetch('/admin/api/api-keys');
        keys = await res.json();
        renderKeys();
      } catch (err) {
        const container = document.getElementById('keys-list');
        container.textContent = '';
        const wrapper = el('div', { className: 'empty-state' }, [
          el('h3', {}, 'Failed to load'),
          el('p', {}, err.message)
        ]);
        container.appendChild(wrapper);
      }
    }

    function renderKeys() {
      const container = document.getElementById('keys-list');
      container.textContent = '';

      if (keys.length === 0) {
        const wrapper = el('div', { className: 'empty-state' }, [
          el('h3', {}, 'No API keys yet'),
          el('p', {}, 'Generate your first key to start authenticating API requests.'),
          el('button', { className: 'btn btn-primary', onclick: showCreateModal }, 'Generate Key')
        ]);
        container.appendChild(wrapper);
        return;
      }

      keys.forEach(function(k) {
        const status = getStatus(k);
        const badgeClass = status === 'active' ? 'badge-active' : status === 'revoked' ? 'badge-revoked' : 'badge-expired';

        // Name + badge
        var nameDiv = el('div', {});
        var nameRow = el('div', {});
        nameRow.appendChild(el('span', { className: 'key-name' }, k.name));
        nameRow.appendChild(el('span', { className: 'badge ' + badgeClass }, status));
        nameDiv.appendChild(nameRow);
        var prefixRow = el('div', { style: { marginTop: '6px' } });
        prefixRow.appendChild(el('span', { className: 'key-prefix' }, k.key_prefix));
        nameDiv.appendChild(prefixRow);

        // Actions
        var actionsDiv = el('div', { className: 'key-actions' });
        var usageBtn = el('button', { className: 'btn-ghost', 'data-id': String(k.id), onclick: function() { toggleUsage(k.id); } }, 'Usage');
        actionsDiv.appendChild(usageBtn);
        if (status === 'active') {
          var revokeBtn = el('button', { className: 'btn btn-sm btn-danger', onclick: (function(id, name) { return function() { showRevokeModal(id, name); }; })(k.id, k.name) }, 'Revoke');
          actionsDiv.appendChild(revokeBtn);
        }

        // Top row
        var topDiv = el('div', { className: 'key-top' }, [nameDiv, actionsDiv]);

        // Meta
        var metaDiv = el('div', { className: 'key-meta' }, [
          el('span', {}, 'Created ' + formatDate(k.created_at)),
          el('span', {}, 'Expires ' + (k.expires_at ? formatDate(k.expires_at) : 'Never')),
          el('span', {}, 'Last used ' + timeAgo(k.last_used_at)),
          el('span', {}, fmt(k.usage_count) + ' requests')
        ]);

        // Usage panel
        var usagePanel = el('div', { className: 'usage-panel', id: 'usage-' + k.id });

        // Card
        var card = el('div', { className: 'key-card' + (status !== 'active' ? ' revoked' : ''), id: 'key-' + k.id }, [topDiv, metaDiv, usagePanel]);
        container.appendChild(card);
      });
    }

    function buildUsageStats(stats) {
      var items = [
        { label: 'Total', value: fmt(stats.total_requests) },
        { label: 'Last 24h', value: fmt(stats.requests_24h) },
        { label: 'Last 7d', value: fmt(stats.requests_7d) },
        { label: 'Unique IPs', value: fmt(stats.unique_ips) },
        { label: 'Endpoints', value: fmt(stats.unique_endpoints) }
      ];
      var container = el('div', { className: 'usage-stats' });
      items.forEach(function(item) {
        container.appendChild(el('div', { className: 'usage-stat' }, [
          el('div', { className: 'usage-stat-label' }, item.label),
          el('div', { className: 'usage-stat-value' }, item.value)
        ]));
      });
      return container;
    }

    function buildUsageLog(logs) {
      if (logs.length === 0) {
        return el('div', { style: { color: '#71717a', fontSize: '0.8rem', padding: '8px 0' } }, 'No usage recorded yet.');
      }
      var table = el('table');
      var thead = el('thead');
      var headRow = el('tr', {}, [
        el('th', {}, 'Time'), el('th', {}, 'Method'), el('th', {}, 'Endpoint'), el('th', {}, 'IP')
      ]);
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = el('tbody');
      logs.forEach(function(l) {
        var row = el('tr', {}, [
          el('td', {}, timeAgo(l.created_at)),
          el('td', { className: 'method' }, l.method),
          el('td', {}, l.endpoint),
          el('td', {}, l.ip_address || '-')
        ]);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      var wrapper = el('div', { className: 'usage-log' });
      wrapper.appendChild(table);
      return wrapper;
    }

    async function toggleUsage(id) {
      var panel = document.getElementById('usage-' + id);
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        return;
      }
      panel.textContent = '';
      panel.appendChild(el('div', { style: { color: '#71717a', fontSize: '0.8rem', padding: '8px 0' } }, 'Loading usage...'));
      panel.classList.add('open');

      try {
        var responses = await Promise.all([
          fetch('/admin/api/api-keys/' + id + '/stats'),
          fetch('/admin/api/api-keys/' + id + '/usage?limit=50')
        ]);
        var stats = await responses[0].json();
        var logs = await responses[1].json();

        panel.textContent = '';
        panel.appendChild(buildUsageStats(stats));
        panel.appendChild(buildUsageLog(logs));
      } catch (err) {
        panel.textContent = '';
        panel.appendChild(el('div', { style: { color: '#ef4444', fontSize: '0.8rem', padding: '8px 0' } }, 'Failed: ' + err.message));
      }
    }

    function showCreateModal() {
      document.getElementById('f-name').value = '';
      document.getElementById('f-expiry').value = 'never';
      document.getElementById('create-btn').disabled = false;
      document.getElementById('create-modal').classList.add('active');
      document.getElementById('f-name').focus();
    }
    function closeCreateModal() { document.getElementById('create-modal').classList.remove('active'); }

    async function createKey() {
      var name = document.getElementById('f-name').value.trim();
      var expires_in = document.getElementById('f-expiry').value;
      if (!name) { toast('Name is required', 'error'); return; }

      document.getElementById('create-btn').disabled = true;
      try {
        var res = await fetch('/admin/api/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, expires_in: expires_in === 'never' ? null : expires_in })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        closeCreateModal();
        revealedKey = data.key;
        document.getElementById('reveal-name').textContent = data.name;
        document.getElementById('reveal-key').textContent = data.key;
        document.getElementById('reveal-modal').classList.add('active');
        loadKeys();
      } catch (err) {
        toast(err.message, 'error');
        document.getElementById('create-btn').disabled = false;
      }
    }

    function copyKey() {
      navigator.clipboard.writeText(revealedKey).then(function() {
        toast('Copied to clipboard', 'success');
      }).catch(function() {
        var elKey = document.getElementById('reveal-key');
        var range = document.createRange();
        range.selectNodeContents(elKey);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        toast('Select and copy manually', 'error');
      });
    }

    function closeRevealModal() {
      document.getElementById('reveal-modal').classList.remove('active');
      revealedKey = '';
    }

    function showRevokeModal(id, name) {
      revokingId = id;
      document.getElementById('revoke-name').textContent = name;
      document.getElementById('revoke-btn').disabled = false;
      document.getElementById('revoke-modal').classList.add('active');
    }
    function closeRevokeModal() { document.getElementById('revoke-modal').classList.remove('active'); revokingId = null; }

    async function confirmRevoke() {
      if (!revokingId) return;
      document.getElementById('revoke-btn').disabled = true;
      try {
        var res = await fetch('/admin/api/api-keys/' + revokingId + '/revoke', { method: 'POST' });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast('Key revoked: ' + data.name, 'success');
        closeRevokeModal();
        loadKeys();
      } catch (err) {
        toast(err.message, 'error');
        document.getElementById('revoke-btn').disabled = false;
      }
    }

    function toast(msg, type) {
      var toastEl = document.getElementById('toast');
      toastEl.textContent = msg;
      toastEl.className = 'toast toast-' + type;
      toastEl.style.display = 'block';
      setTimeout(function() { toastEl.style.display = 'none'; }, 3000);
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeCreateModal();
        closeRevealModal();
        closeRevokeModal();
      }
    });

    loadKeys();
  </script>
</body>
</html>`;
}

module.exports = router;
