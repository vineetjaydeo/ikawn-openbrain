'use strict';

/**
 * Trust Ledger — Task 4.6
 *
 * Logs trust events (success/failure/regression/false_positive) per domain,
 * and provides helpers for computing consecutive success streaks.
 */

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

// ── Domain mapping ──

const TOOL_DOMAIN_MAP = Object.freeze({
  deploy_staging:      'staging_deploys',
  deploy_production:   'production_deploys',
  deploy_openbrain:    'production_deploys',
  code_write:          'code_changes',
  code_edit:           'code_changes',
  bash_exec:           'code_changes',
  notify:              'client_facing',
  gmail_send:          'client_facing',
  gmail_draft:         'client_facing',
  fly_status:          'monitoring',
  system_status:       'monitoring',
});

/**
 * Maps a tool name to its trust domain.
 * @param {string} toolName
 * @returns {string} domain name
 */
function getDomainForTool(toolName) {
  return TOOL_DOMAIN_MAP[toolName] || 'general';
}

/**
 * Auto-determines outcome from a tool result envelope.
 * @param {object} toolResult - envelope with .ok
 * @returns {'success'|'failure'}
 */
function determineOutcome(toolResult) {
  return toolResult && toolResult.ok === true ? 'success' : 'failure';
}

/**
 * Insert a trust event into the ledger.
 *
 * @param {object} event
 * @param {string} event.brandId
 * @param {string} event.domain
 * @param {string} event.actionType
 * @param {'success'|'failure'|'regression'|'false_positive'} event.outcome
 * @param {string} [event.sessionId]
 * @param {string} [event.toolName]
 * @param {string} [event.detail]
 * @returns {Promise<object>} inserted row
 */
async function logTrustEvent(event) {
  const pool = getPool();
  const { rows: [row] } = await pool.query(
    `INSERT INTO trust_ledger (brand_id, domain, action_type, outcome, session_id, tool_name, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      event.brandId || 'ikawn',
      event.domain,
      event.actionType,
      event.outcome,
      event.sessionId || null,
      event.toolName || null,
      event.detail || null,
    ]
  );
  return row;
}

/**
 * Count consecutive successes from most recent backward for a (brand, domain).
 *
 * @param {string} brandId
 * @param {string} domain
 * @returns {Promise<number>}
 */
async function getConsecutiveSuccesses(brandId, domain) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT outcome FROM trust_ledger
     WHERE brand_id = $1 AND domain = $2
     ORDER BY created_at DESC LIMIT 100`,
    [brandId, domain]
  );

  let count = 0;
  for (const row of rows) {
    if (row.outcome !== 'success') break;
    count++;
  }
  return count;
}

module.exports = {
  logTrustEvent,
  getDomainForTool,
  determineOutcome,
  getConsecutiveSuccesses,
  _setPool,
};
