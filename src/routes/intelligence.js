// src/routes/intelligence.js
// @ts-check
'use strict';

const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { RUHI_FAVICON_LINK } = require('../utils/ruhi-assets');

const router = Router();

// GET /api/intelligence/latest — JSON API for Ruhi chat context
router.get('/api/intelligence/latest', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT data, summary, created_at FROM intelligence_snapshots
       WHERE snapshot_type = 'cohort_analysis'
       ORDER BY created_at DESC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.json({ error: 'No intelligence data yet' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Intelligence] API error:', err);
    res.status(500).json({ error: 'Failed to fetch intelligence data' });
  }
});

// GET /admin/intelligence — Dashboard page
router.get('/admin/intelligence', requireAdmin, async (req, res) => {
  try {
    // Latest cohort analysis
    const cohortResult = await pool.query(
      `SELECT data, summary, created_at FROM intelligence_snapshots
       WHERE snapshot_type = 'cohort_analysis'
       ORDER BY created_at DESC LIMIT 1`
    );

    // Recent signals (last 10)
    const signalsResult = await pool.query(
      `SELECT data, summary, created_at FROM intelligence_snapshots
       WHERE snapshot_type = 'signal'
       ORDER BY created_at DESC LIMIT 10`
    );

    // 4-week activity trend (last 4 cohort snapshots, weekly)
    const trendResult = await pool.query(
      `SELECT data->'active_7d' AS active, created_at
       FROM intelligence_snapshots
       WHERE snapshot_type = 'cohort_analysis'
       ORDER BY created_at DESC LIMIT 4`
    );

    const cohort = cohortResult.rows[0];
    const signals = signalsResult.rows;
    const trend = trendResult.rows.reverse();

    const data = cohort?.data || {};
    const funnel = data.funnel || {};
    const cohorts = data.cohorts || {};
    const scoreDist = data.score_distribution || {};
    const totalAccounts = data.total_accounts || 0;

    // Cohort colors
    const COHORT_COLORS = {
      whale: '#FFD700',
      converted: '#4CAF50',
      'power-user-not-monetized': '#FF9800',
      'commerce-connected-dormant': '#2196F3',
      churning: '#f44336',
      'credit-wall': '#E91E63',
      'new-and-exploring': '#00BCD4',
      'window-shopper': '#9E9E9E',
      uncategorized: '#607D8B',
    };

    // Signal type colors
    const SIGNAL_COLORS = { opportunity: '#4CAF50', risk: '#FF9800', info: '#2196F3' };

    // Build cohort bars HTML
    const maxCohortCount = Math.max(...Object.values(cohorts).map(c => c.count), 1);
    const cohortBars = Object.entries(cohorts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, info]) => {
        const pct = (info.count / maxCohortCount) * 100;
        const color = COHORT_COLORS[name] || '#607D8B';
        const changeStr = info.change > 0 ? `<span style="color:#4CAF50">\u2191${info.change}</span>`
          : info.change < 0 ? `<span style="color:#f44336">\u2193${Math.abs(info.change)}</span>`
          : '';
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:13px">
            <span>${name.replace(/-/g, ' ')}</span>
            <span>${info.count} ${changeStr}</span>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:12px;overflow:hidden">
            <div style="background:${color};width:${pct}%;height:100%;border-radius:4px;transition:width 0.3s"></div>
          </div>
        </div>`;
      }).join('');

    // Trend sparkline (4 CSS bars)
    const trendValues = trend.map(t => parseInt(t.active) || 0);
    const maxTrend = Math.max(...trendValues, 1);
    const trendBars = trendValues.map(v => {
      const h = Math.max((v / maxTrend) * 40, 4);
      return `<div style="background:linear-gradient(to top,#FFC01C,#F59E0B);width:20px;height:${h}px;border-radius:3px 3px 0 0;display:inline-block;margin:0 3px;vertical-align:bottom" title="${v}"></div>`;
    }).join('');

    // Signals HTML
    const signalRows = signals.map(s => {
      const d = s.data || {};
      const color = SIGNAL_COLORS[d.type] || '#2196F3';
      const ago = timeAgo(s.created_at);
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="width:10px;height:10px;border-radius:50%;background:${color};margin-top:4px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;opacity:0.6">${ago}</div>
          <div style="font-size:14px">${s.summary || d.description || 'Signal detected'}</div>
        </div>
      </div>`;
    }).join('') || '<div style="opacity:0.5;text-align:center;padding:20px">No signals yet \u2014 intelligence worker will generate them</div>';

    // Funnel HTML
    const funnelSteps = [
      { label: 'Signup', value: funnel.signup || 0 },
      { label: 'First generation', value: funnel.first_gen || 0 },
      { label: '5+ generations', value: funnel.five_gens || 0 },
      { label: 'First purchase', value: funnel.first_purchase || 0 },
      { label: 'Repeat purchase', value: funnel.repeat_purchase || 0 },
    ];
    const maxFunnel = funnelSteps[0].value || 1;
    const funnelHTML = funnelSteps.map(step => {
      const pct = Math.round((step.value / maxFunnel) * 100);
      return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
        <div style="width:130px;font-size:13px;text-align:right">${step.label}</div>
        <div style="flex:1;background:rgba(255,255,255,0.1);border-radius:4px;height:16px;overflow:hidden">
          <div style="background:linear-gradient(90deg,#FFC01C,#F59E0B);width:${pct}%;height:100%;border-radius:4px;transition:width 0.3s"></div>
        </div>
        <div style="width:70px;font-size:13px">${step.value} <span style="opacity:0.5">${pct}%</span></div>
      </div>`;
    }).join('');

    const lastUpdated = cohort ? timeAgo(cohort.created_at) : 'never';

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intelligence | Ruhi by iKawn</title>
  ${RUHI_FAVICON_LINK}
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Google Sans', sans-serif; background: #0A0F2E; color: #e0e0e0; min-height: 100vh; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 600; background: linear-gradient(90deg, #FFC01C, #F59E0B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header .meta { font-size: 13px; opacity: 0.5; }
    .nav { display: flex; gap: 12px; margin-bottom: 24px; }
    .nav a { color: #FFC01C; text-decoration: none; font-size: 13px; opacity: 0.7; }
    .nav a:hover { opacity: 1; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; }
    .card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.5; margin-bottom: 16px; }
    .big-number { font-size: 36px; font-weight: 600; color: #FFC01C; }
    .stat-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .summary { background: rgba(255,192,28,0.06); border: 1px solid rgba(255,192,28,0.15); border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
    .back-link { display: inline-block; margin-bottom: 16px; color: #FFC01C; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">\u2190 Back to chat</a>
    <div class="header">
      <h1>\u2726 Intelligence</h1>
      <div class="meta">Last updated: ${lastUpdated}</div>
    </div>
    <div class="nav">
      <a href="/admin/brain-health">Brain Health</a>
      <a href="/admin/costs">Cost Monitor</a>
      <a href="/admin/intelligence" style="opacity:1;border-bottom:1px solid #FFC01C">Intelligence</a>
    </div>

    ${cohort?.summary ? `<div class="summary">${cohort.summary}</div>` : ''}

    <div class="grid">
      <!-- Card 1: Platform Pulse -->
      <div class="card">
        <div class="card-title">Platform Pulse</div>
        <div class="big-number">${totalAccounts}</div>
        <div style="font-size:13px;opacity:0.6;margin-bottom:16px">total accounts</div>
        <div class="stat-row"><span>Active this week</span><span>${data.active_7d || 0}</span></div>
        <div class="stat-row"><span>New signups (7d)</span><span>${data.new_signups_7d || 0}</span></div>
        <div class="stat-row"><span>Conversion rate</span><span>${((data.conversion_rate || 0) * 100).toFixed(1)}%</span></div>
        <div style="margin-top:16px;display:flex;align-items:flex-end;height:44px">${trendBars || '<span style="opacity:0.3">No trend data yet</span>'}</div>
      </div>

      <!-- Card 2: Cohort Breakdown -->
      <div class="card">
        <div class="card-title">Cohorts</div>
        ${cohortBars || '<div style="opacity:0.5">No cohort data yet</div>'}
      </div>

      <!-- Card 3: Signals Feed -->
      <div class="card">
        <div class="card-title">Signals</div>
        ${signalRows}
      </div>

      <!-- Card 4: Conversion Funnel -->
      <div class="card">
        <div class="card-title">Conversion Funnel</div>
        ${funnelHTML || '<div style="opacity:0.5">No funnel data yet</div>'}
      </div>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[Intelligence] Dashboard error:', err);
    res.status(500).send('Intelligence dashboard error');
  }
});

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = router;
