'use strict';

/**
 * Trust Scorer — Task 4.7
 *
 * Evaluates trust domains for promotion/demotion based on consecutive successes
 * logged in the trust ledger. Enforces hard rules (client_facing NEVER auto).
 */

const { getConsecutiveSuccesses } = require('./trust-ledger');

// Lazy pool accessor
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

// Lazy alert sender — defaults to Telegram, injectable for tests
let _sendAlert = null;
function getSendAlert() {
  if (!_sendAlert) _sendAlert = require('../utils/telegram').sendTelegramMessage;
  return _sendAlert;
}
function _setSendAlert(fn) { _sendAlert = fn; }

// ── Failure type weights for nuanced demotion ──
const FAILURE_WEIGHTS = Object.freeze({
  EDGE_CASE: 0.5,
  CONFIGURATION: 0.7,
  NEGLIGENCE: 1.0,
  EXTERNAL: 0.3,
  UNKNOWN: 0.8,
});

// ── Promotion thresholds ──
const THRESHOLDS = Object.freeze({
  monitoring:          20,
  bug_fixes:           10,
  staging_deploys:     15,
  production_deploys:  25,
  code_changes:        30,
  cost_decisions:      30,
  general:             20,
  client_facing:       Infinity, // NEVER auto-promote
});

/**
 * Get current trust level for a (brand, domain).
 * Returns 'confirm' as default for unknown domains.
 * HARD RULE: client_facing always returns 'review'.
 *
 * @param {string} brandId
 * @param {string} domain
 * @returns {Promise<string>} 'auto' | 'confirm' | 'review'
 */
async function getTrustLevel(brandId, domain) {
  // HARD RULE: client_facing NEVER gets auto
  if (domain === 'client_facing') return 'review';

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT current_tier FROM trust_scores WHERE brand_id = $1 AND domain = $2`,
    [brandId, domain]
  );

  if (rows.length === 0) return 'confirm';
  return rows[0].current_tier;
}

/**
 * Evaluate all domains for a brand — the weekly job.
 *
 * For each domain with ledger entries:
 * - Get consecutive successes
 * - Promote to 'auto' if threshold met and not already auto
 * - Demote to 'confirm' if auto and there's a recent failure
 * - client_facing: cap at 'review', never 'auto'
 *
 * @param {string} brandId
 * @returns {Promise<object[]>} summary of changes
 */
async function evaluateAllDomains(brandId) {
  const pool = getPool();
  const changes = [];

  // 1. Get all unique domains from trust_ledger
  const { rows: domains } = await pool.query(
    `SELECT DISTINCT domain FROM trust_ledger WHERE brand_id = $1`,
    [brandId]
  );

  for (const { domain } of domains) {
    const consecutive = await getConsecutiveSuccesses(brandId, domain);
    const threshold = THRESHOLDS[domain] ?? THRESHOLDS.general;

    // Get or create trust_scores row
    const { rows: existing } = await pool.query(
      `SELECT * FROM trust_scores WHERE brand_id = $1 AND domain = $2`,
      [brandId, domain]
    );

    let currentTier = existing.length > 0 ? existing[0].current_tier : 'confirm';

    // HARD RULE: client_facing never goes to 'auto'
    if (domain === 'client_facing') {
      // Ensure it's at most 'review'
      const newTier = consecutive >= threshold ? 'review' : currentTier;
      // If no row exists, create one
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO trust_scores (brand_id, domain, current_tier, consecutive_successes, last_evaluated)
           VALUES ($1, $2, $3, $4, NOW())`,
          [brandId, domain, 'review', consecutive]
        );
      } else {
        await pool.query(
          `UPDATE trust_scores SET consecutive_successes = $1, last_evaluated = NOW(), updated_at = NOW()
           WHERE brand_id = $2 AND domain = $3`,
          [consecutive, brandId, domain]
        );
      }
      continue;
    }

    // Check for promotion
    if (consecutive >= threshold && currentTier !== 'auto') {
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO trust_scores (brand_id, domain, current_tier, consecutive_successes, last_evaluated, last_promoted)
           VALUES ($1, $2, 'auto', $3, NOW(), NOW())`,
          [brandId, domain, consecutive]
        );
      } else {
        await pool.query(
          `UPDATE trust_scores SET current_tier = 'auto', consecutive_successes = $1,
           last_evaluated = NOW(), last_promoted = NOW(), updated_at = NOW()
           WHERE brand_id = $2 AND domain = $3`,
          [consecutive, brandId, domain]
        );
      }
      changes.push({ domain, from: currentTier, to: 'auto', reason: 'promotion' });
      continue;
    }

    // Check for demotion: auto tier with a failure since last evaluation
    if (currentTier === 'auto' && existing.length > 0) {
      const lastEval = existing[0].last_evaluated;
      let hasFailure = false;

      if (lastEval) {
        const { rows: failures } = await pool.query(
          `SELECT COUNT(*)::int as count FROM trust_ledger
           WHERE brand_id = $1 AND domain = $2 AND outcome = 'failure' AND created_at > $3`,
          [brandId, domain, lastEval]
        );
        hasFailure = failures[0].count > 0;
      } else {
        // No last_evaluated — check if most recent is failure
        hasFailure = consecutive === 0;
      }

      if (hasFailure) {
        await pool.query(
          `UPDATE trust_scores SET current_tier = 'confirm', consecutive_successes = $1,
           last_evaluated = NOW(), last_demoted = NOW(), updated_at = NOW()
           WHERE brand_id = $2 AND domain = $3`,
          [consecutive, brandId, domain]
        );
        changes.push({ domain, from: 'auto', to: 'confirm', reason: 'demotion' });
        continue;
      }
    }

    // No change — just update evaluation timestamp
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO trust_scores (brand_id, domain, current_tier, consecutive_successes, last_evaluated)
         VALUES ($1, $2, $3, $4, NOW())`,
        [brandId, domain, 'confirm', consecutive]
      );
    } else {
      await pool.query(
        `UPDATE trust_scores SET consecutive_successes = $1, last_evaluated = NOW(), updated_at = NOW()
         WHERE brand_id = $2 AND domain = $3`,
        [consecutive, brandId, domain]
      );
    }
  }

  return changes;
}

/**
 * Immediate demotion check — called on each failure.
 * If the domain is currently 'auto', apply weighted penalty based on failure type.
 * Base demotion = -0.2 score drop, multiplied by failure type weight.
 * Score floors at 0.4. If score drops below 0.6, demote to 'confirm'.
 *
 * @param {string} brandId
 * @param {string} domain
 * @param {string} [failureType='UNKNOWN'] - One of FAILURE_WEIGHTS keys
 * @returns {Promise<{demoted: boolean, penalty?: number, newScore?: number}>}
 */
async function checkImmediateDemotion(brandId, domain, failureType = 'UNKNOWN') {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT current_tier, score FROM trust_scores WHERE brand_id = $1 AND domain = $2`,
    [brandId, domain]
  );

  if (rows.length === 0 || rows[0].current_tier !== 'auto') {
    return { demoted: false };
  }

  // Calculate weighted penalty
  const weight = FAILURE_WEIGHTS[failureType] ?? FAILURE_WEIGHTS.UNKNOWN;
  const penalty = -0.2 * weight;
  const currentScore = rows[0].score ?? 1.0;
  const newScore = Math.max(0.4, currentScore + penalty);

  // Demote if score drops below threshold
  const shouldDemote = newScore < 0.6;

  if (shouldDemote) {
    await pool.query(
      `UPDATE trust_scores SET current_tier = 'confirm', score = $3, last_demoted = NOW(), updated_at = NOW()
       WHERE brand_id = $1 AND domain = $2`,
      [brandId, domain, newScore]
    );

    // Send alert
    try {
      const sendAlert = getSendAlert();
      await sendAlert(
        `⚠️ <b>Trust Demotion</b>\n\n` +
        `Domain: <code>${domain}</code>\n` +
        `Brand: <code>${brandId}</code>\n` +
        `Failure type: <code>${failureType}</code>\n` +
        `Penalty: ${penalty.toFixed(3)} (weight: ${weight})\n` +
        `Score: ${currentScore.toFixed(2)} → ${newScore.toFixed(2)}\n` +
        `Action: auto → confirm`
      );
    } catch (_) {
      // Best-effort alerting
    }
  } else {
    // Just update the score, don't demote
    await pool.query(
      `UPDATE trust_scores SET score = $3, updated_at = NOW()
       WHERE brand_id = $1 AND domain = $2`,
      [brandId, domain, newScore]
    );
  }

  return { demoted: shouldDemote, penalty, newScore };
}

module.exports = {
  evaluateAllDomains,
  checkImmediateDemotion,
  getTrustLevel,
  THRESHOLDS,
  FAILURE_WEIGHTS,
  _setPool,
  _setSendAlert,
};
