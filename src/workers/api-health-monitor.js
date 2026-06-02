const { pool } = require('../db');
const { sendTelegramMessage } = require('../utils/telegram');

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const RE_ALERT_DEBOUNCE_MS = 60 * 60 * 1000;
const FAIL_DELTA_THRESHOLD = 3;
const SPEND_THRESHOLD_24H_USD = parseFloat(process.env.BUDGET_ALARM_24H_USD || '50');

const lastAlertAt = new Map();
let lastFailedEmbeddingCount = null;

function shouldAlert(key) {
  const last = lastAlertAt.get(key) || 0;
  if (Date.now() - last < RE_ALERT_DEBOUNCE_MS) return false;
  lastAlertAt.set(key, Date.now());
  return true;
}

async function checkEmbeddingHealth() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM memories WHERE embedding_status = 'failed'`
  );
  const current = rows[0]?.c || 0;
  if (lastFailedEmbeddingCount !== null) {
    const delta = current - lastFailedEmbeddingCount;
    if (delta >= FAIL_DELTA_THRESHOLD && shouldAlert('embedding')) {
      await sendTelegramMessage(
        `OpenBrain alert: ${delta} new embedding failures in last 15 min (total failed: ${current}). Check Google AI / provider status.`
      );
    }
  }
  lastFailedEmbeddingCount = current;
}

async function checkSpend24h() {
  const { rows } = await pool.query(`
    SELECT model, SUM(cost_usd)::float AS spend
    FROM cost_events
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY model
    ORDER BY spend DESC
  `);
  const total = rows.reduce((s, r) => s + (r.spend || 0), 0);
  if (total >= SPEND_THRESHOLD_24H_USD && shouldAlert('spend-24h')) {
    const breakdown = rows
      .slice(0, 5)
      .map((r) => `  ${r.model || 'unknown'}: $${(r.spend || 0).toFixed(2)}`)
      .join('\n');
    await sendTelegramMessage(
      `OpenBrain alert: 24h API spend $${total.toFixed(2)} crossed threshold $${SPEND_THRESHOLD_24H_USD}.\n${breakdown}`
    );
  }
}

async function runApiHealthCheck() {
  try {
    await Promise.all([checkEmbeddingHealth(), checkSpend24h()]);
  } catch (err) {
    console.error('[ApiHealthMonitor] check failed:', err.message);
  }
}

let interval = null;

function startApiHealthMonitor() {
  runApiHealthCheck();
  interval = setInterval(runApiHealthCheck, FIFTEEN_MIN_MS);
  console.log('[ApiHealthMonitor] started (15-min interval)');
}

function stopApiHealthMonitor() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

module.exports = { startApiHealthMonitor, stopApiHealthMonitor, runApiHealthCheck };
