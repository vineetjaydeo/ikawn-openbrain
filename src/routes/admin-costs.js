const { Router } = require('express');
const { requireAdmin } = require('../auth');

const router = Router();

// In-memory cache (15 minutes)
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL = 15 * 60 * 1000;

async function fetchOpenAICosts() {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) return { error: 'OPENAI_ADMIN_KEY not configured' };

  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  const headers = { Authorization: `Bearer ${adminKey}` };

  try {
    const [costsRes, completionsRes, embeddingsRes, imagesRes] = await Promise.all([
      fetch(`https://api.openai.com/v1/organization/costs?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${sevenDaysAgo}&bucket_width=1d&group_by=model`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/embeddings?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/images?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
    ]);

    if (!costsRes.ok) {
      const errBody = await costsRes.text();
      console.error('[AdminCosts] OpenAI API error:', costsRes.status, errBody);
      return { error: `OpenAI API returned ${costsRes.status}` };
    }

    const [costs, completions, embeddings, images] = await Promise.all([
      costsRes.json(),
      completionsRes.ok ? completionsRes.json() : { data: [] },
      embeddingsRes.ok ? embeddingsRes.json() : { data: [] },
      imagesRes.ok ? imagesRes.json() : { data: [] },
    ]);

    // Build daily spend from costs response
    const dailySpend = {};
    for (const bucket of (costs.data || [])) {
      const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
      const usd = (bucket.results || []).reduce((sum, r) => sum + Number(r.amount?.value || 0), 0);
      dailySpend[date] = (dailySpend[date] || 0) + usd;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todaySpend = dailySpend[today] || 0;

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      last7Days.push({ date: d, spend_usd: +(dailySpend[d] || 0).toFixed(4) });
    }

    // Aggregate completions by model
    const modelMap = {};
    for (const bucket of (completions.data || [])) {
      for (const result of (bucket.results || [])) {
        const model = result.model || result.snapshot_id || 'unknown';
        if (!modelMap[model]) modelMap[model] = { model, input_tokens: 0, output_tokens: 0, requests: 0 };
        modelMap[model].input_tokens += result.input_tokens || 0;
        modelMap[model].output_tokens += result.output_tokens || 0;
        modelMap[model].requests += result.num_model_requests || 0;
      }
    }
    const byModel = Object.values(modelMap);

    // Aggregate embeddings
    let embTokens = 0, embRequests = 0;
    for (const bucket of (embeddings.data || [])) {
      for (const result of (bucket.results || [])) {
        embTokens += result.input_tokens || 0;
        embRequests += result.num_model_requests || 0;
      }
    }

    // Aggregate images
    let imgCount = 0, imgRequests = 0;
    for (const bucket of (images.data || [])) {
      for (const result of (bucket.results || [])) {
        imgCount += result.num_images || 0;
        imgRequests += result.num_model_requests || 0;
      }
    }

    return {
      today: { spend_usd: +todaySpend.toFixed(4), date: today },
      last_7_days: last7Days,
      by_model: byModel,
      embeddings: { tokens: embTokens, requests: embRequests },
      images: { count: imgCount, requests: imgRequests },
      cached_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AdminCosts] Fetch error:', err);
    return { error: err.message };
  }
}

// GET /admin/costs -- JSON API
router.get('/admin/costs', requireAdmin, async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (!forceRefresh && cachedData && (now - cachedAt) < CACHE_TTL) {
    return res.json(cachedData);
  }

  const data = await fetchOpenAICosts();
  if (!data.error) {
    cachedData = data;
    cachedAt = now;
  }
  res.json(data);
});

// GET /admin/brain-health -- HTML dashboard page
router.get('/admin/brain-health', requireAdmin, async (req, res) => {
  res.send(brainHealthPage());
});

function brainHealthPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ruhi - Brain Health</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { font-family: inherit; background: #0a0a0a; color: #fafafa; padding: 28px; max-width: 960px; margin: 0 auto; }
    a { color: #e5a819; text-decoration: none; }
    a:hover { text-decoration: none; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 4px; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; font-size: 0.875rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header-right { display: flex; gap: 12px; align-items: center; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
    .card h3 { font-size: 0.8rem; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 12px; }
    .card-full { grid-column: 1 / -1; }
    .big-number { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; }
    .big-number.warning { color: #ef4444; }
    .big-number.ok { color: #22c55e; }
    .spend-date { font-size: 0.8rem; color: #a1a1aa; margin-top: 4px; }
    .bars { display: flex; align-items: flex-end; gap: 8px; height: 120px; padding-top: 8px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
    .bar { width: 100%; background: #e5a819; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
    .bar-label { font-size: 0.65rem; color: #a1a1aa; }
    .bar-value { font-size: 0.65rem; color: #fafafa; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #27272a; }
    th { color: #a1a1aa; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    td { font-size: 0.85rem; }
    td.num { font-variant-numeric: tabular-nums; text-align: right; }
    th.num { text-align: right; }
    .status-bar { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #a1a1aa; margin-top: 16px; }
    .btn { padding: 6px 14px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-family: inherit; font-weight: 500; }
    .btn-outline { background: transparent; border: 1px solid #27272a; color: #fafafa; }
    .btn-outline:hover { background: #27272a; }
    .warning-banner { background: #ef444420; border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; color: #fca5a5; font-size: 0.875rem; display: none; }
    .warning-banner strong { color: #ef4444; }
    .not-configured { color: #a1a1aa; font-style: italic; padding: 40px; text-align: center; }
    .loading { color: #a1a1aa; padding: 40px; text-align: center; }
    .section-title { font-size: 1.1rem; font-weight: 600; margin: 32px 0 16px; padding-top: 16px; border-top: 1px solid #27272a; }
    .metric-row { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .metric { background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 16px; flex: 1; min-width: 140px; }
    .metric-label { font-size: 0.7rem; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 6px; }
    .metric-value { font-size: 1.5rem; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="/" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #27272a;border-radius:8px;color:#fafafa;font-size:1.1rem;text-decoration:none;" title="Back to chat">&larr;</a>
      <div>
        <h1>Brain Health</h1>
        <p class="subtitle">OpenAI cost monitoring &amp; system health</p>
      </div>
    </div>
    <div class="header-right">
      <a href="/admin" class="btn-outline" style="padding:6px 14px;border:1px solid #27272a;border-radius:8px;color:#fafafa;font-size:0.8rem;text-decoration:none;display:inline-block;">Admin</a>
    </div>
  </div>

  <div class="warning-banner" id="warning-banner">
    <strong>Warning:</strong> Today's spend exceeds $5.00
  </div>

  <div id="cost-section">
    <div class="loading" id="cost-loading">Loading cost data...</div>
    <div id="cost-content" style="display:none">
      <div class="grid">
        <div class="card">
          <h3>Today's Spend</h3>
          <div class="big-number" id="today-spend"></div>
          <div class="spend-date" id="today-date"></div>
        </div>
        <div class="card">
          <h3>Last 7 Days</h3>
          <div class="bars" id="bars-chart"></div>
        </div>
      </div>
      <div class="card card-full" style="margin-bottom: 16px;">
        <h3>Completions by Model (7 days)</h3>
        <table>
          <thead><tr><th>Model</th><th class="num">Requests</th><th class="num">Input Tokens</th><th class="num">Output Tokens</th></tr></thead>
          <tbody id="model-table"></tbody>
        </table>
      </div>
      <div class="grid">
        <div class="card">
          <h3>Embeddings (7 days)</h3>
          <div id="emb-tokens" style="font-size:1.3rem;font-weight:600"></div>
          <div id="emb-requests" style="font-size:0.8rem;color:#a1a1aa;margin-top:4px"></div>
        </div>
        <div class="card">
          <h3>Images (7 days)</h3>
          <div id="img-count" style="font-size:1.3rem;font-weight:600"></div>
          <div id="img-requests" style="font-size:0.8rem;color:#a1a1aa;margin-top:4px"></div>
        </div>
      </div>
      <div class="status-bar">
        <span id="cached-at">Last updated: --</span>
        <button class="btn btn-outline" onclick="loadCosts(true)">Refresh</button>
      </div>
    </div>
  </div>

  <h2 class="section-title">System Health</h2>
  <div id="health-section">
    <div class="loading" id="health-loading">Loading health data...</div>
    <div id="health-content" style="display:none">
      <div class="metric-row" id="health-metrics"></div>
      <div class="card card-full" style="margin-top: 16px;">
        <h3>Embedding Queue</h3>
        <table>
          <thead><tr><th>Status</th><th class="num">Count</th></tr></thead>
          <tbody id="embedding-table"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // HTML-escape to prevent XSS from any external data
    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.textContent;
    }
    function fmt(n) { return Number(n).toLocaleString(); }
    function fmtUsd(n) { return '$' + Number(n).toFixed(2); }

    function renderBars(container, days) {
      container.textContent = '';
      const maxSpend = Math.max(...days.map(d => d.spend_usd), 0.01);
      days.forEach(d => {
        const col = document.createElement('div');
        col.className = 'bar-col';

        const val = document.createElement('div');
        val.className = 'bar-value';
        val.textContent = fmtUsd(d.spend_usd);
        col.appendChild(val);

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = Math.max((d.spend_usd / maxSpend) * 100, 2) + '%';
        col.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = d.date.slice(5);
        col.appendChild(label);

        container.appendChild(col);
      });
    }

    function renderModelTable(tbody, models) {
      tbody.textContent = '';
      if (models.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.style.color = '#a1a1aa';
        td.textContent = 'No completions data';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      models.sort((a, b) => b.requests - a.requests).forEach(m => {
        const tr = document.createElement('tr');
        const cells = [esc(m.model), fmt(m.requests), fmt(m.input_tokens), fmt(m.output_tokens)];
        cells.forEach((text, i) => {
          const td = document.createElement('td');
          td.textContent = text;
          if (i > 0) td.className = 'num';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderHealthMetrics(container, mod) {
      container.textContent = '';
      const metrics = [
        { label: 'Total Memories', value: fmt(mod.total || 0), color: '' },
        { label: 'Unscored', value: fmt(mod.unscored || 0), color: '' },
        { label: 'Flagged', value: fmt(mod.flagged || 0), color: '#f59e0b' },
        { label: 'Severe', value: fmt(mod.severe || 0), color: '#ef4444' },
      ];
      metrics.forEach(m => {
        const div = document.createElement('div');
        div.className = 'metric';
        const lbl = document.createElement('div');
        lbl.className = 'metric-label';
        lbl.textContent = m.label;
        const val = document.createElement('div');
        val.className = 'metric-value';
        val.textContent = m.value;
        if (m.color) val.style.color = m.color;
        div.appendChild(lbl);
        div.appendChild(val);
        container.appendChild(div);
      });
    }

    function renderEmbeddingTable(tbody, rows) {
      tbody.textContent = '';
      if (!rows || rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.style.color = '#a1a1aa';
        td.textContent = 'No data';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = r.embedding_status;
        const td2 = document.createElement('td');
        td2.className = 'num';
        td2.textContent = fmt(parseInt(r.count));
        tr.appendChild(td1);
        tr.appendChild(td2);
        tbody.appendChild(tr);
      });
    }

    async function loadCosts(refresh) {
      const url = '/admin/costs' + (refresh ? '?refresh=true' : '');
      try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          const el = document.getElementById('cost-loading');
          el.textContent = data.error;
          el.className = 'not-configured';
          return;
        }

        document.getElementById('cost-loading').style.display = 'none';
        document.getElementById('cost-content').style.display = 'block';

        const todayEl = document.getElementById('today-spend');
        todayEl.textContent = fmtUsd(data.today.spend_usd);
        todayEl.className = 'big-number ' + (data.today.spend_usd > 5 ? 'warning' : 'ok');
        document.getElementById('today-date').textContent = data.today.date;

        document.getElementById('warning-banner').style.display = data.today.spend_usd > 5 ? 'block' : 'none';

        renderBars(document.getElementById('bars-chart'), data.last_7_days);
        renderModelTable(document.getElementById('model-table'), data.by_model);

        document.getElementById('emb-tokens').textContent = fmt(data.embeddings.tokens) + ' tokens';
        document.getElementById('emb-requests').textContent = fmt(data.embeddings.requests) + ' requests';
        document.getElementById('img-count').textContent = fmt(data.images.count) + ' images';
        document.getElementById('img-requests').textContent = fmt(data.images.requests) + ' requests';

        if (data.cached_at) {
          const ago = Math.round((Date.now() - new Date(data.cached_at).getTime()) / 60000);
          document.getElementById('cached-at').textContent = ago < 1 ? 'Just updated' : 'Updated ' + ago + ' min ago';
        }
      } catch (err) {
        document.getElementById('cost-loading').textContent = 'Failed to load: ' + err.message;
      }
    }

    async function loadHealth() {
      try {
        const res = await fetch('/brain-health');
        const data = await res.json();

        document.getElementById('health-loading').style.display = 'none';
        document.getElementById('health-content').style.display = 'block';

        renderHealthMetrics(document.getElementById('health-metrics'), data.moderation || {});
        renderEmbeddingTable(document.getElementById('embedding-table'), data.embedding_queue);
      } catch (err) {
        document.getElementById('health-loading').textContent = 'Failed: ' + err.message;
      }
    }

    loadCosts(false);
    loadHealth();
  </script>
</body>
</html>`;
}

module.exports = router;
