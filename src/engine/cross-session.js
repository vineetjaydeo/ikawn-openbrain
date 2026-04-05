'use strict';

/**
 * Cross-session continuity — loads context from previous completed sessions
 * for the same user+brand+channel to provide continuity across conversations.
 * Best-effort: errors are swallowed by the caller.
 */

let _pool = null;

function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}

function _setPool(p) { _pool = p; }

const MAX_CONTEXT_CHARS = 1000;

/**
 * Load context from the last 3 completed sessions for this user+brand+channel.
 *
 * @param {Object} params - { brandId, userId, channel }
 * @returns {Promise<string|null>} Formatted context string or null if no previous sessions
 */
async function loadPreviousSessionContext(params) {
  const { brandId, userId, channel } = params || {};
  if (!brandId || !userId) return null;

  const pool = getPool();

  const sql = `
    SELECT id, working_memory, summary, agent_slug, created_at, completed_at
    FROM sessions
    WHERE brand_id = $1 AND user_id = $2 AND channel = $3 AND status = 'completed'
    ORDER BY created_at DESC LIMIT 3
  `;
  const values = [brandId, userId, channel || 'web'];

  const { rows } = await pool.query(sql, values);

  if (!rows || rows.length === 0) return null;

  const lines = ['Previous session context:'];

  for (const row of rows) {
    const date = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : 'unknown';
    const parts = [];

    // Parse working_memory (could be JSON string or object)
    let wm = row.working_memory;
    if (typeof wm === 'string') {
      try { wm = JSON.parse(wm); } catch { wm = null; }
    }

    if (wm && typeof wm === 'object') {
      if (wm.current_plan) {
        parts.push(`Plan: "${_truncateField(wm.current_plan, 80)}"`);
      }
      if (Array.isArray(wm.decisions_made) && wm.decisions_made.length > 0) {
        const decisions = JSON.stringify(wm.decisions_made.slice(0, 3));
        parts.push(`Decisions: ${_truncateField(decisions, 100)}`);
      }
      if (Array.isArray(wm.pending_actions) && wm.pending_actions.length > 0) {
        const pending = JSON.stringify(wm.pending_actions.slice(0, 3));
        parts.push(`Pending: ${_truncateField(pending, 100)}`);
      }
    }

    if (row.summary) {
      parts.push(`Summary: "${_truncateField(row.summary, 80)}"`);
    }

    if (row.agent_slug) {
      parts.push(`Agent: ${row.agent_slug}`);
    }

    const detail = parts.length > 0 ? parts.join('. ') : 'No structured data';
    lines.push(`- Session [${date}]: ${detail}`);
  }

  let formatted = lines.join('\n');
  if (formatted.length > MAX_CONTEXT_CHARS) {
    formatted = formatted.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
  }

  return formatted;
}

/**
 * Truncate a string to maxLen, appending '...' if needed.
 */
function _truncateField(str, maxLen) {
  if (typeof str !== 'string') str = String(str);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

module.exports = { loadPreviousSessionContext, _setPool };
