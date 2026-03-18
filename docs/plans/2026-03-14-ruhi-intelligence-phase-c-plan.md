# Ruhi Intelligence Phase C — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cohort intelligence layer that pulls data from ikawn-v3, distills behavioral patterns, surfaces proactive alerts via Telegram, and displays insights on a dashboard + in Ruhi chat.

**Architecture:** Intelligence worker (60-min interval) reads ikawn-v3 Postgres via read-only connection, runs deterministic cohort assignment + engagement scoring, passes aggregated stats to gpt-4.1-mini for natural language summary + signal detection, stores anonymized snapshots in OpenBrain, alerts via direct Telegram Bot API.

**Tech Stack:** Node.js/Express (OpenBrain), PostgreSQL (both DBs), OpenAI gpt-4.1-mini (via existing callReflectionLLM), Telegram Bot API (direct fetch), server-rendered HTML dashboard.

**Spec:** `docs/plans/2026-03-14-ruhi-intelligence-phase-c-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/utils/telegram.js` (NEW) | Shared Telegram Bot API utility — `sendTelegramMessage(text, opts)`. Used by intelligence alerts now, governance notifications later. |
| `src/workers/intelligence-worker.js` (NEW) | Main worker: connects to ikawn-v3 DB, pulls user/generation/commerce/credit data, runs cohort assignment + scoring, calls LLM for summary, stores snapshots, triggers alerts. |
| `src/routes/intelligence.js` (NEW) | Dashboard page (`GET /admin/intelligence`) + JSON API (`GET /api/intelligence/latest`). Server-rendered HTML, same pattern as `admin-costs.js`. |
| `src/utils/llm.js` (MODIFY) | Add `intelligence_distillation` entry to `MODEL_ROUTING`. One line. |
| `src/utils/worker-guards.js` (MODIFY) | Add `gpt-4.1-mini` to `COST_PER_CALL` map if missing. |
| `src/db.js` (MODIFY) | Add `intelligence_snapshots` table + indexes to `initSchema()`. Add ikawn-v3 read-only pool export. |
| `src/index.js` (MODIFY) | Import + mount intelligence routes, import + start intelligence worker. |
| `src/routes/ruhi-chat.js` (MODIFY) | Inject latest intelligence snapshot into system prompt before Ruhi responds. |

---

## Task 1: Shared Telegram Utility

**Files:**
- Create: `src/utils/telegram.js`

- [ ] **Step 1: Create the Telegram utility module**

```javascript
// src/utils/telegram.js
// @ts-check
'use strict';

/**
 * Send a message via Telegram Bot API.
 * Shared utility for intelligence alerts and governance notifications.
 *
 * @param {string} text - Message text (HTML parse mode)
 * @param {Object} [opts]
 * @param {string} [opts.chatId] - Override default chat ID
 * @param {Object} [opts.reply_markup] - Inline keyboard or other markup
 * @returns {Promise<boolean>} true if sent successfully
 */
async function sendTelegramMessage(text, opts = {}) {
  const token = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.INTELLIGENCE_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Not configured — skipping message');
    return false;
  }

  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (opts.reply_markup) {
      body.reply_markup = JSON.stringify(opts.reply_markup);
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Telegram] API error:', res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Telegram] Send failed:', err.message);
    return false;
  }
}

module.exports = { sendTelegramMessage };
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const t = require('./src/utils/telegram'); console.log('OK:', typeof t.sendTelegramMessage)"`
Expected: `OK: function`

- [ ] **Step 3: Commit**

```bash
git add src/utils/telegram.js
git commit -m "feat: add shared Telegram Bot API utility for intelligence alerts"
```

---

## Task 2: Add MODEL_ROUTING + COST_PER_CALL entries

**Files:**
- Modify: `src/utils/llm.js:7-16` (MODEL_ROUTING)
- Modify: `src/utils/worker-guards.js:35-40` (COST_PER_CALL)

- [ ] **Step 1: Add intelligence_distillation to MODEL_ROUTING in llm.js**

Add after line 13 (after `research_distillation`):

```javascript
  intelligence_distillation: { provider: 'openai', model: 'gpt-4.1-mini' },
```

- [ ] **Step 2: Add gpt-4.1-mini to COST_PER_CALL in worker-guards.js**

Add to the `COST_PER_CALL` object:

```javascript
  'gpt-4.1-mini': 0.001,
```

- [ ] **Step 3: Verify both modules load**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const l = require('./src/utils/llm'); console.log('routing:', l.MODEL_ROUTING.intelligence_distillation)"`
Expected: `routing: { provider: 'openai', model: 'gpt-4.1-mini' }`

- [ ] **Step 4: Commit**

```bash
git add src/utils/llm.js src/utils/worker-guards.js
git commit -m "feat: add intelligence_distillation model routing + cost entry"
```

---

## Task 3: Database Schema — intelligence_snapshots + ikawn-v3 Pool

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Add intelligence_snapshots table to initSchema()**

Add before the final `console.log('Database schema initialized (v6)');` line in `db.js`:

```javascript
    // ── OpenBrain v7: Intelligence Layer — Cohort Intelligence ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS intelligence_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_type VARCHAR(50) NOT NULL,
        period VARCHAR(20) NOT NULL,
        data JSONB NOT NULL,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_type_period ON intelligence_snapshots(snapshot_type, period);
      CREATE INDEX IF NOT EXISTS idx_snapshots_created ON intelligence_snapshots(created_at DESC);
    `);
```

- [ ] **Step 2: Add ikawn-v3 read-only connection pool**

Add after the existing `pool` declaration (around line 10 of db.js), and export it:

```javascript
// ikawn-v3 read-only connection (for intelligence worker)
const ikawnOsPool = process.env.IKAWN_OS_DATABASE_URL
  ? new Pool({
      connectionString: process.env.IKAWN_OS_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: !process.env.IKAWN_OS_DATABASE_URL.includes('sslmode=disable')
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;
```

Update the `module.exports` at the bottom:

```javascript
module.exports = { pool, ikawnOsPool, initSchema };
```

- [ ] **Step 3: Update version log**

Change `console.log('Database schema initialized (v6)');` to `console.log('Database schema initialized (v7)');`

- [ ] **Step 4: Verify schema init works locally**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const { pool, ikawnOsPool, initSchema } = require('./src/db'); console.log('pool OK:', !!pool); console.log('ikawnOsPool:', ikawnOsPool === null ? 'null (no IKAWN_OS_DATABASE_URL)' : 'configured')"`
Expected: `pool OK: true` and `ikawnOsPool: null (no IKAWN_OS_DATABASE_URL)`

- [ ] **Step 5: Commit**

```bash
git add src/db.js
git commit -m "feat: add intelligence_snapshots table + ikawn-v3 read-only pool"
```

---

## Task 4: Intelligence Worker

**Files:**
- Create: `src/workers/intelligence-worker.js`

This is the core of Phase C. The worker:
1. Connects to ikawn-v3 Postgres (read-only)
2. Pulls 4 queries (users, generations, commerce, credits)
3. Joins data in memory, assigns cohorts, calculates engagement scores
4. Calls LLM for natural language summary + signal detection
5. Stores snapshots if data changed
6. Sends Telegram alerts for notable signals

- [ ] **Step 1: Create the intelligence worker file**

```javascript
// src/workers/intelligence-worker.js
// @ts-check
'use strict';

const crypto = require('crypto');
const { pool, ikawnOsPool } = require('../db');
const { callReflectionLLM, parseJSONSafe } = require('../utils/llm');
const { createWorkerGuard } = require('../utils/worker-guards');
const { sendTelegramMessage } = require('../utils/telegram');

const guard = createWorkerGuard('intelligence');

const INTELLIGENCE_CONFIG = {
  intervalMs: 60 * 60 * 1000,
  statementTimeoutMs: 10000,
  snapshotRetentionDays: 90,
  alertCooldownMs: 4 * 60 * 60 * 1000,
  maxAlertsPerDay: parseInt(process.env.MAX_INTELLIGENCE_ALERTS_PER_DAY || '3', 10),
};

const TOTAL_AGENTS = 6; // genie, remix, prism, lazarus, muse, campaign

// ── Cohort definitions ──
const COHORT_RULES = [
  { name: 'whale', test: (u) => u.purchaseCount >= 2 || u.totalSpentInr > 1000 },
  { name: 'converted', test: (u) => u.purchaseCount >= 1 && !(u.purchaseCount >= 2 || u.totalSpentInr > 1000) },
  { name: 'power-user-not-monetized', test: (u) => u.totalGenerations >= 10 && u.purchaseCount === 0 },
  { name: 'commerce-connected-dormant', test: (u) => u.hasCommerce && u.generations7d === 0 },
  { name: 'churning', test: (u) => u.totalGenerations >= 5 && u.daysSinceLastActivity > 7 },
  { name: 'credit-wall', test: (u) => u.credits === 0 && u.totalGenerations > 0 && u.purchaseCount === 0 },
  { name: 'new-and-exploring', test: (u) => u.daysSinceSignup < 7 && u.totalGenerations < 5 },
  { name: 'window-shopper', test: (u) => u.daysSinceSignup >= 7 && u.totalGenerations === 0 },
];

// ── Alert throttle state ──
let lastAlertTime = 0;
let alertsSentToday = 0;
let alertDayStart = '';

function resetAlertThrottle() {
  const today = new Date().toISOString().slice(0, 10);
  if (alertDayStart !== today) {
    alertsSentToday = 0;
    alertDayStart = today;
  }
}

function canSendAlert(isRisk = false) {
  resetAlertThrottle();
  if (isRisk) return true; // risk alerts bypass throttle
  if (alertsSentToday >= INTELLIGENCE_CONFIG.maxAlertsPerDay) return false;
  if (Date.now() - lastAlertTime < INTELLIGENCE_CONFIG.alertCooldownMs) return false;
  return true;
}

function markAlertSent() {
  lastAlertTime = Date.now();
  alertsSentToday++;
}

// ── Anonymization ──
function anonymizeId(userId) {
  const salt = process.env.ANON_SALT || 'default-dev-salt';
  return 'anon_' + crypto.createHash('sha256')
    .update(String(userId) + salt)
    .digest('hex')
    .slice(0, 10);
}

// ── Engagement scoring ──
function calculateEngagementScore(user) {
  // Recency: exponential decay, half-life 7 days, max 30 points
  const recencyDecay = Math.exp(-0.693 * (user.daysSinceLastActivity / 7));
  const recency = recencyDecay * 30;

  // Frequency: generations in last 7 days, max 25 points
  const frequency = Math.min(user.generations7d / 10, 1.0) * 25;

  // Breadth: how many agents used, max 15 points
  const breadth = (user.agentsUsed / TOTAL_AGENTS) * 15;

  // Commerce: connected = 15, not = 0
  const commerce = user.hasCommerce ? 15 : 0;

  // Monetization: purchased = 15, not = 0
  const monetization = user.purchaseCount > 0 ? 15 : 0;

  return Math.min(100, Math.round(recency + frequency + breadth + commerce + monetization));
}

// ── Assign cohort ──
function assignCohort(user) {
  for (const rule of COHORT_RULES) {
    if (rule.test(user)) return rule.name;
  }
  return 'uncategorized';
}

// ── Data pull queries ──
const QUERIES = {
  users: `
    SELECT id, user_type, credits, created_at,
      (SELECT MAX(created_at) FROM generations WHERE user_id = u.id AND status = 'complete') AS last_generation_at
    FROM users u
    WHERE deleted_at IS NULL AND suspended_at IS NULL
  `,
  generations: `
    SELECT
      user_id,
      COUNT(*) AS total_generations,
      COUNT(DISTINCT agent) AS agents_used,
      array_agg(DISTINCT agent) AS agent_list,
      SUM(credit_cost) AS total_credits_spent,
      MAX(created_at) AS last_generated_at,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS generations_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS generations_24h
    FROM generations
    WHERE status = 'complete'
    GROUP BY user_id
  `,
  commerce: `
    SELECT
      user_id, platform, status, last_synced_at,
      (SELECT COUNT(*) FROM commerce_products cp WHERE cp.connection_id = cc.id) AS product_count
    FROM commerce_connections cc
    WHERE status != 'disconnected'
  `,
  credits: `
    SELECT
      user_id,
      COUNT(*) AS purchase_count,
      SUM(amount) AS total_spent_inr,
      MAX(created_at) AS last_purchase_at
    FROM credit_transactions
    WHERE source = 'purchase'
    GROUP BY user_id
  `,
};

// ── Main worker ──
async function runIntelligence() {
  if (!ikawnOsPool) {
    console.log('[Intelligence] IKAWN_OS_DATABASE_URL not set — skipping');
    return;
  }

  const check = guard.canRun();
  if (!check.allowed) {
    console.log(check.reason);
    return;
  }

  guard.startRun();
  let success = true;

  try {
    // Step 1: Pull data from ikawn-v3
    const client = await ikawnOsPool.connect();
    let users, generations, commerce, credits;
    try {
      await client.query(`SET statement_timeout = ${INTELLIGENCE_CONFIG.statementTimeoutMs}`);
      [users, generations, commerce, credits] = await Promise.all([
        client.query(QUERIES.users),
        client.query(QUERIES.generations),
        client.query(QUERIES.commerce),
        client.query(QUERIES.credits),
      ]);
    } finally {
      client.release();
    }

    console.log(`[Intelligence] Pulled: ${users.rows.length} users, ${generations.rows.length} gen groups, ${commerce.rows.length} commerce, ${credits.rows.length} credit groups`);

    // Step 2: Build lookup maps
    const genMap = new Map();
    for (const row of generations.rows) {
      genMap.set(row.user_id, row);
    }
    const commerceMap = new Map();
    for (const row of commerce.rows) {
      commerceMap.set(row.user_id, row);
    }
    const creditMap = new Map();
    for (const row of credits.rows) {
      creditMap.set(row.user_id, row);
    }

    // Step 3: Join + compute per-user metrics
    const now = Date.now();
    const enrichedUsers = users.rows.map(u => {
      const gen = genMap.get(u.id) || {};
      const com = commerceMap.get(u.id);
      const cred = creditMap.get(u.id) || {};

      const lastActivity = gen.last_generated_at || u.last_generation_at || u.created_at;
      const daysSinceLastActivity = Math.floor((now - new Date(lastActivity).getTime()) / 86400000);
      const daysSinceSignup = Math.floor((now - new Date(u.created_at).getTime()) / 86400000);

      const profile = {
        anonId: anonymizeId(u.id),
        userType: u.user_type || 'free',
        credits: u.credits || 0,
        daysSinceSignup,
        daysSinceLastActivity,
        totalGenerations: parseInt(gen.total_generations || '0', 10),
        agentsUsed: parseInt(gen.agents_used || '0', 10),
        agentList: gen.agent_list || [],
        totalCreditsSpent: parseInt(gen.total_credits_spent || '0', 10),
        generations7d: parseInt(gen.generations_7d || '0', 10),
        generations24h: parseInt(gen.generations_24h || '0', 10),
        hasCommerce: !!com,
        commerceProductCount: com ? parseInt(com.product_count || '0', 10) : 0,
        purchaseCount: parseInt(cred.purchase_count || '0', 10),
        totalSpentInr: parseInt(cred.total_spent_inr || '0', 10),
      };

      profile.cohort = assignCohort(profile);
      profile.engagementScore = calculateEngagementScore(profile);

      return profile;
    });

    // Step 4: Aggregate cohort stats
    const cohorts = {};
    const scoreDistribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    const agentsPopularity = {};
    let totalActive7d = 0;
    let newSignups7d = 0;

    for (const u of enrichedUsers) {
      // Cohort counts
      if (!cohorts[u.cohort]) cohorts[u.cohort] = { count: 0, totalScore: 0, ids: [] };
      cohorts[u.cohort].count++;
      cohorts[u.cohort].totalScore += u.engagementScore;
      cohorts[u.cohort].ids.push(u.anonId);

      // Score distribution
      if (u.engagementScore <= 20) scoreDistribution['0-20']++;
      else if (u.engagementScore <= 40) scoreDistribution['21-40']++;
      else if (u.engagementScore <= 60) scoreDistribution['41-60']++;
      else if (u.engagementScore <= 80) scoreDistribution['61-80']++;
      else scoreDistribution['81-100']++;

      // Agent popularity
      for (const agent of u.agentList) {
        agentsPopularity[agent] = (agentsPopularity[agent] || 0) + u.totalGenerations;
      }

      // Activity counts
      if (u.generations7d > 0 || u.daysSinceLastActivity <= 7) totalActive7d++;
      if (u.daysSinceSignup < 7) newSignups7d++;
    }

    // Compute avg scores per cohort
    const cohortSummary = {};
    for (const [name, data] of Object.entries(cohorts)) {
      cohortSummary[name] = {
        count: data.count,
        avg_score: Math.round(data.totalScore / data.count),
      };
    }

    // Conversion funnel
    const totalUsers = enrichedUsers.length;
    const withFirstGen = enrichedUsers.filter(u => u.totalGenerations > 0).length;
    const with5Gens = enrichedUsers.filter(u => u.totalGenerations >= 5).length;
    const withPurchase = enrichedUsers.filter(u => u.purchaseCount > 0).length;
    const withRepeatPurchase = enrichedUsers.filter(u => u.purchaseCount >= 2).length;

    const snapshotData = {
      total_accounts: totalUsers,
      active_7d: totalActive7d,
      new_signups_7d: newSignups7d,
      cohorts: cohortSummary,
      score_distribution: scoreDistribution,
      conversion_rate: totalUsers > 0 ? +(withPurchase / totalUsers).toFixed(3) : 0,
      agents_popularity: agentsPopularity,
      funnel: {
        signup: totalUsers,
        first_gen: withFirstGen,
        five_gens: with5Gens,
        first_purchase: withPurchase,
        repeat_purchase: withRepeatPurchase,
      },
    };

    // Step 5: Compare with previous snapshot — skip if unchanged
    const prevSnapshot = await pool.query(
      `SELECT data FROM intelligence_snapshots WHERE snapshot_type = 'cohort_analysis' ORDER BY created_at DESC LIMIT 1`
    );
    const prevData = prevSnapshot.rows[0]?.data;
    const dataChanged = !prevData || JSON.stringify(prevData.cohorts) !== JSON.stringify(snapshotData.cohorts)
      || prevData.total_accounts !== snapshotData.total_accounts
      || prevData.active_7d !== snapshotData.active_7d;

    if (!dataChanged) {
      console.log('[Intelligence] No changes detected — skipping snapshot');
      return;
    }

    // Step 6: LLM distillation for summary + signals
    if (!guard.trackLLMCall('gpt-4.1-mini')) return;

    const prevCohorts = prevData?.cohorts || {};
    // Add change indicators
    for (const [name, data] of Object.entries(cohortSummary)) {
      const prev = prevCohorts[name]?.count || 0;
      data.change = data.count - prev;
    }

    const llmSystemPrompt = `You are Ruhi's intelligence analyst. Analyze platform cohort data and produce insights.
Output strict JSON with these fields:
- summary: 2-3 sentence natural language overview of platform health
- signals: array of { type: "opportunity"|"risk"|"info", signal: string (snake_case id), description: string (1 sentence), affected_count: number }
- recommendations: array of strings (1 sentence each, max 3)

Focus on actionable insights. Do NOT include PII. Be concise.`;

    const llmUserPrompt = `Current platform data (${new Date().toISOString().slice(0, 10)}):

Total accounts: ${snapshotData.total_accounts}
Active this week: ${snapshotData.active_7d}
New signups (7d): ${snapshotData.new_signups_7d}
Conversion rate: ${(snapshotData.conversion_rate * 100).toFixed(1)}%

Cohorts (with change vs previous):
${Object.entries(cohortSummary).map(([name, d]) => `  ${name}: ${d.count} users (avg score: ${d.avg_score}, change: ${d.change >= 0 ? '+' : ''}${d.change})`).join('\n')}

Score distribution: ${JSON.stringify(scoreDistribution)}

Funnel:
  Signup: ${snapshotData.funnel.signup}
  First generation: ${snapshotData.funnel.first_gen} (${totalUsers > 0 ? Math.round(snapshotData.funnel.first_gen / totalUsers * 100) : 0}%)
  5+ generations: ${snapshotData.funnel.five_gens} (${totalUsers > 0 ? Math.round(snapshotData.funnel.five_gens / totalUsers * 100) : 0}%)
  First purchase: ${snapshotData.funnel.first_purchase} (${totalUsers > 0 ? Math.round(snapshotData.funnel.first_purchase / totalUsers * 100) : 0}%)
  Repeat purchase: ${snapshotData.funnel.repeat_purchase} (${totalUsers > 0 ? Math.round(snapshotData.funnel.repeat_purchase / totalUsers * 100) : 0}%)

Agent popularity: ${JSON.stringify(agentsPopularity)}`;

    const llmRaw = await callReflectionLLM('intelligence_distillation', llmSystemPrompt, llmUserPrompt);
    const llmResult = parseJSONSafe(llmRaw);

    const summary = llmResult?.summary || 'Intelligence analysis completed.';
    const signals = llmResult?.signals || [];
    const recommendations = llmResult?.recommendations || [];

    // Step 7: Store cohort_analysis snapshot
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO intelligence_snapshots (snapshot_type, period, data, summary) VALUES ($1, $2, $3, $4)`,
      ['cohort_analysis', today, JSON.stringify({ ...snapshotData, recommendations }), summary]
    );

    // Step 8: Store individual signals
    for (const sig of signals) {
      await pool.query(
        `INSERT INTO intelligence_snapshots (snapshot_type, period, data, summary) VALUES ($1, $2, $3, $4)`,
        ['signal', today, JSON.stringify(sig), sig.description]
      );
    }

    console.log(`[Intelligence] Snapshot saved: ${enrichedUsers.length} users, ${Object.keys(cohortSummary).length} cohorts, ${signals.length} signals`);

    // Step 9: Send Telegram alerts for notable signals
    const alertSignals = signals.filter(s => s.type === 'risk' || s.type === 'opportunity');
    if (alertSignals.length > 0) {
      const isRisk = alertSignals.some(s => s.type === 'risk');
      if (canSendAlert(isRisk)) {
        const alertLines = alertSignals.map(s => {
          const icon = s.type === 'risk' ? '🟠' : '🟢';
          return `${icon} ${s.description}`;
        });

        const alertText = `🧠 <b>Ruhi Intelligence</b>\n\n${alertLines.join('\n')}\n\n${summary}\n\n<i>Drill deeper: ruhi.ikawn.in</i>`;
        const sent = await sendTelegramMessage(alertText);
        if (sent) {
          markAlertSent();
          // Track alert
          await pool.query(
            `INSERT INTO intelligence_snapshots (snapshot_type, period, data) VALUES ($1, $2, $3)`,
            ['alert_sent', today, JSON.stringify({ signal_count: alertSignals.length, signals: alertSignals.map(s => s.signal) })]
          );
        }
      }
    }

    // Step 10: Cleanup old snapshots
    await pool.query(
      `DELETE FROM intelligence_snapshots WHERE created_at < NOW() - $1::interval`,
      [`${INTELLIGENCE_CONFIG.snapshotRetentionDays} days`]
    );

  } catch (err) {
    success = false;
    console.error('[Intelligence] Run failed:', err.message);
  } finally {
    guard.endRun(success);
  }
}

function startIntelligenceWorker() {
  console.log(`[Intelligence] Worker started (interval: ${INTELLIGENCE_CONFIG.intervalMs / 60000}min)`);
  // Run first pass after 30 seconds (let DB init complete)
  setTimeout(() => {
    runIntelligence().catch(err => console.error('[Intelligence] Initial run error:', err.message));
  }, 30000);
  // Then on interval
  setInterval(() => {
    runIntelligence().catch(err => console.error('[Intelligence] Run error:', err.message));
  }, INTELLIGENCE_CONFIG.intervalMs);
}

module.exports = { startIntelligenceWorker, runIntelligence };
```

- [ ] **Step 2: Verify the worker module loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const w = require('./src/workers/intelligence-worker'); console.log('OK:', typeof w.startIntelligenceWorker)"`
Expected: `OK: function`

- [ ] **Step 3: Commit**

```bash
git add src/workers/intelligence-worker.js
git commit -m "feat: add intelligence worker — cohort analysis, scoring, signals, alerts"
```

---

## Task 5: Intelligence Dashboard + API

**Files:**
- Create: `src/routes/intelligence.js`

The dashboard follows the same server-rendered HTML pattern as `admin-costs.js` and `brain-health.js`. Deep indigo theme, CSS-only bars, no charting library.

- [ ] **Step 1: Create the intelligence routes file**

```javascript
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
        const changeStr = info.change > 0 ? `<span style="color:#4CAF50">↑${info.change}</span>`
          : info.change < 0 ? `<span style="color:#f44336">↓${Math.abs(info.change)}</span>`
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
    }).join('') || '<div style="opacity:0.5;text-align:center;padding:20px">No signals yet — intelligence worker will generate them</div>';

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
    <a href="/" class="back-link">← Back to chat</a>
    <div class="header">
      <h1>✦ Intelligence</h1>
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
```

- [ ] **Step 2: Verify the route module loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const r = require('./src/routes/intelligence'); console.log('OK:', typeof r.stack !== 'undefined' ? 'router' : typeof r)"`
Expected: `OK: router`

- [ ] **Step 3: Commit**

```bash
git add src/routes/intelligence.js
git commit -m "feat: add intelligence dashboard + JSON API endpoint"
```

---

## Task 6: Wire Everything Into index.js

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add imports at the top of index.js**

Add after the `distillation-worker` require (line 37):

```javascript
const { startIntelligenceWorker } = require('./workers/intelligence-worker');
```

Add after the `brandsApiRoute` require (line 32):

```javascript
const intelligenceRoute = require('./routes/intelligence');
```

- [ ] **Step 2: Mount intelligence routes**

Add after `app.use(adminApiKeysRoute);` (line 129):

```javascript
app.use(intelligenceRoute);
```

- [ ] **Step 3: Start the intelligence worker**

Add after `startDistillationWorker();` (line 157):

```javascript
      startIntelligenceWorker();
```

- [ ] **Step 4: Verify the app boots without errors**

Run: `cd /Users/vineet/ikawn-openbrain && timeout 5 node src/index.js 2>&1 || true`
Expected: Should see `OpenBrain running on port 3000` and `[Intelligence] Worker started` in output (may fail on DB connection — that's OK for this check).

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "feat: wire intelligence routes + worker into app startup"
```

---

## Task 7: Inject Intelligence Into Ruhi Chat

**Files:**
- Modify: `src/routes/ruhi-chat.js`

- [ ] **Step 1: Add intelligence context injection**

In `ruhi-chat.js`, after the memory search (line 82-89, after `memoryContext` is built) and before `buildSystemPrompt` (line 102), add:

```javascript
    // Inject latest intelligence snapshot into context
    let intelContext = '';
    try {
      const latestIntel = await pool.query(
        `SELECT summary, data FROM intelligence_snapshots
         WHERE snapshot_type = 'cohort_analysis'
         ORDER BY created_at DESC LIMIT 1`
      );
      if (latestIntel.rows[0]) {
        intelContext = `\n\nCURRENT PLATFORM INTELLIGENCE:\n${latestIntel.rows[0].summary}\n\nCohort data: ${JSON.stringify(latestIntel.rows[0].data)}`;
      }
    } catch (intelErr) {
      console.warn('[RuhiChat] Intelligence injection failed:', intelErr.message);
    }
```

Then modify the `systemPrompt` line to include `intelContext`:

Change line 102 from:
```javascript
    const systemPrompt = buildSystemPrompt(userName, userRole, memoryContext);
```
To:
```javascript
    const systemPrompt = buildSystemPrompt(userName, userRole, memoryContext + intelContext);
```

- [ ] **Step 2: Verify the module still loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const r = require('./src/routes/ruhi-chat'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/routes/ruhi-chat.js
git commit -m "feat: inject intelligence snapshot into Ruhi chat system prompt"
```

---

## Task 8: Set Fly Secrets + Deploy

**Files:** None (infrastructure only)

- [ ] **Step 1: Get ikawn-v3 database connection string**

Run: `~/.fly/bin/flyctl postgres config show --app ikawn-os-db 2>/dev/null || echo "Check Fly dashboard for connection string"`

The connection string format: `postgres://openbrain_reader:PASSWORD@ikawn-os-db.flycast:5432/ikawn_os?sslmode=disable`

Note: You need to first create the `openbrain_reader` role on the ikawn-v3 Postgres. Connect to it:

```bash
~/.fly/bin/flyctl postgres connect --app ikawn-os-db --database ikawn_os
```

Then run:
```sql
CREATE ROLE openbrain_reader WITH LOGIN PASSWORD 'GENERATE_SECURE_PASSWORD';
GRANT CONNECT ON DATABASE ikawn_os TO openbrain_reader;
GRANT USAGE ON SCHEMA public TO openbrain_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO openbrain_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO openbrain_reader;
```

- [ ] **Step 2: Create Telegram bot via @BotFather**

Message @BotFather on Telegram:
- `/newbot` → name it "Ruhi Intelligence" → username `ruhi_intel_bot` (or similar)
- Copy the bot token
- Get V's chat ID (message @userinfobot or check existing config)

- [ ] **Step 3: Set Fly secrets**

```bash
~/.fly/bin/flyctl secrets set \
  IKAWN_OS_DATABASE_URL="postgres://openbrain_reader:PASSWORD@ikawn-os-db.flycast:5432/ikawn_os?sslmode=disable" \
  ANON_SALT="$(openssl rand -hex 16)" \
  INTELLIGENCE_TELEGRAM_BOT_TOKEN="BOT_TOKEN_HERE" \
  INTELLIGENCE_TELEGRAM_CHAT_ID="CHAT_ID_HERE" \
  --app ikawn-openbrain
```

- [ ] **Step 4: Deploy**

```bash
cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false
```

- [ ] **Step 5: Verify deployment**

```bash
# Check logs for worker startup
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | grep -i intelligence

# Check dashboard loads
curl -s -o /dev/null -w "%{http_code}" https://ruhi.ikawn.in/admin/intelligence
# Expected: 302 (redirect to login) — means route is mounted

# Check API
curl -s https://ruhi.ikawn.in/api/intelligence/latest -H "Cookie: VALID_SESSION" | head -c 200
```

- [ ] **Step 6: Commit any deployment adjustments**

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Wait for first intelligence run (30s after deploy)**

Check logs:
```bash
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | grep '\[Intelligence\]'
```

Expected: `[Intelligence] Pulled: X users, Y gen groups...` followed by `[Intelligence] Snapshot saved...`

- [ ] **Step 2: Verify dashboard shows real data**

Open `https://ruhi.ikawn.in/admin/intelligence` in browser (logged in as admin).
Verify all 4 cards render with actual data from ikawn-v3.

- [ ] **Step 3: Verify Ruhi chat has intelligence context**

Open `https://ruhi.ikawn.in` → start a new conversation → ask "what's happening across my users?"
Ruhi should reference cohort data, engagement patterns, and conversion rates.

- [ ] **Step 4: Verify Telegram alert (if signals were generated)**

Check Telegram for a message from the new bot.
If no signals, manually trigger by checking logs for `[Intelligence] No changes detected` — first run should always produce signals.

- [ ] **Step 5: Verify anonymization**

```bash
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain
```

```sql
-- Check that no PII exists in snapshots
SELECT id, snapshot_type, data::text FROM intelligence_snapshots ORDER BY created_at DESC LIMIT 5;
-- Verify: no emails, no real user IDs, only anon_ prefixed IDs
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Ruhi Intelligence Phase C — cohort analysis, dashboard, alerts [complete]"
```
