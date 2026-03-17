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
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours (was 1h — overkill for <100 users)
  statementTimeoutMs: 10000,
  snapshotRetentionDays: 90,
  alertCooldownMs: 12 * 60 * 60 * 1000, // 12h cooldown between alerts (was 4h)
  maxAlertsPerDay: 1, // max 1 alert per day (was 3)
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
  if (alertsSentToday >= INTELLIGENCE_CONFIG.maxAlertsPerDay) return false;
  // Risk alerts get a shorter cooldown (4h) but never bypass entirely
  const cooldown = isRisk ? INTELLIGENCE_CONFIG.alertCooldownMs : INTELLIGENCE_CONFIG.alertCooldownMs;
  if (Date.now() - lastAlertTime < cooldown) return false;
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

    // Step 9: Telegram alerts DISABLED until user base is large enough to generate meaningful changes.
    // Snapshots still saved to DB and visible on ruhi.ikawn.in/admin/intelligence.
    // To re-enable: uncomment and set INTELLIGENCE_ALERTS_ENABLED=true in Fly secrets.
    // const alertsEnabled = process.env.INTELLIGENCE_ALERTS_ENABLED === 'true';
    console.log('[Intelligence] Telegram alerts disabled — view insights at ruhi.ikawn.in/admin/intelligence');

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
