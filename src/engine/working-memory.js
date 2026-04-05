'use strict';

// In-memory cache: sessionId → { data: Object, dirty: boolean, lastFlush: Date }
const _cache = new Map();
const MAX_MEMORY_BYTES = 102400; // 100KB per session
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Lazy pool accessor
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

/**
 * Load working memory from DB into cache (called on session resume).
 */
async function loadMemory(sessionId) {
  const { rows } = await getPool().query(
    'SELECT working_memory FROM sessions WHERE id = $1', [sessionId]
  );
  const data = rows[0]?.working_memory || {};
  _cache.set(sessionId, { data, dirty: false, lastFlush: new Date() });
  return data;
}

/**
 * Get a single key from working memory.
 * Returns from cache if available, loads from DB if not.
 */
async function getMemory(sessionId, key) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  return _cache.get(sessionId).data[key] ?? null;
}

/**
 * Set a key-value pair in working memory.
 * Validates size limit (100KB).
 */
async function setMemory(sessionId, key, value) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);

  // Test size before writing
  const testData = { ...entry.data, [key]: value };
  const size = Buffer.byteLength(JSON.stringify(testData), 'utf8');
  if (size > MAX_MEMORY_BYTES) {
    throw new Error(`Working memory would exceed 100KB limit (${size} bytes)`);
  }

  entry.data[key] = value;
  entry.dirty = true;
}

/**
 * Get all working memory for a session.
 */
async function getAllMemory(sessionId) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  return { ..._cache.get(sessionId).data };
}

/**
 * Flush working memory to DB immediately.
 */
async function flushMemory(sessionId) {
  const entry = _cache.get(sessionId);
  if (!entry) return;

  await getPool().query(
    'UPDATE sessions SET working_memory = $2, updated_at = NOW() WHERE id = $1',
    [sessionId, JSON.stringify(entry.data)]
  );
  entry.dirty = false;
  entry.lastFlush = new Date();
}

/**
 * Flush if dirty and enough time has passed (for long sessions).
 */
async function flushIfStale(sessionId) {
  const entry = _cache.get(sessionId);
  if (!entry || !entry.dirty) return false;
  if (Date.now() - entry.lastFlush.getTime() < FLUSH_INTERVAL_MS) return false;
  await flushMemory(sessionId);
  return true;
}

/**
 * Remove session from cache (called on session complete/fail).
 * Flushes to DB first if dirty.
 */
async function evictMemory(sessionId) {
  const entry = _cache.get(sessionId);
  if (entry && entry.dirty) await flushMemory(sessionId);
  _cache.delete(sessionId);
}

/**
 * Clear all cache entries (for testing).
 */
function _clearCache() { _cache.clear(); }

// ── Structured working memory helpers (Task 5.7) ──

/**
 * Ensure structured fields exist in working memory.
 * @param {Object} data - The working memory data object (mutated in place)
 */
function _ensureStructuredFields(data) {
  if (!Array.isArray(data.decisions_made)) data.decisions_made = [];
  if (!Array.isArray(data.files_modified)) data.files_modified = [];
  if (!Array.isArray(data.key_findings)) data.key_findings = [];
  if (!Array.isArray(data.pending_actions)) data.pending_actions = [];
  if (data.current_plan === undefined) data.current_plan = null;
  if (data.custom === undefined) data.custom = {};
}

/**
 * Append a decision to decisions_made array.
 */
async function addDecision(sessionId, decision) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  entry.data.decisions_made.push(decision);
  entry.dirty = true;
}

/**
 * Append a file path to files_modified array (deduplicates).
 */
async function addFileModified(sessionId, filePath) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  if (!entry.data.files_modified.includes(filePath)) {
    entry.data.files_modified.push(filePath);
    entry.dirty = true;
  }
}

/**
 * Append a finding to key_findings array.
 */
async function addFinding(sessionId, finding) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  entry.data.key_findings.push(finding);
  entry.dirty = true;
}

/**
 * Set (overwrite) the current plan.
 */
async function setPlan(sessionId, plan) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  entry.data.current_plan = plan;
  entry.dirty = true;
}

/**
 * Append an action to pending_actions array.
 */
async function addPendingAction(sessionId, action) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  entry.data.pending_actions.push(action);
  entry.dirty = true;
}

/**
 * Remove an action from pending_actions array.
 */
async function removePendingAction(sessionId, action) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const entry = _cache.get(sessionId);
  _ensureStructuredFields(entry.data);
  const idx = entry.data.pending_actions.indexOf(action);
  if (idx !== -1) {
    entry.data.pending_actions.splice(idx, 1);
    entry.dirty = true;
  }
}

/**
 * Returns a formatted summary of all structured working memory fields.
 */
async function getStructuredSummary(sessionId) {
  if (!_cache.has(sessionId)) await loadMemory(sessionId);
  const data = { ..._cache.get(sessionId).data };
  _ensureStructuredFields(data);

  const lines = [];

  if (data.current_plan) {
    lines.push(`## Current Plan\n${data.current_plan}`);
  }

  if (data.decisions_made.length > 0) {
    lines.push(`## Decisions Made\n${data.decisions_made.map((d, i) => `${i + 1}. ${d}`).join('\n')}`);
  }

  if (data.files_modified.length > 0) {
    lines.push(`## Files Modified\n${data.files_modified.map(f => `- ${f}`).join('\n')}`);
  }

  if (data.key_findings.length > 0) {
    lines.push(`## Key Findings\n${data.key_findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
  }

  if (data.pending_actions.length > 0) {
    lines.push(`## Pending Actions\n${data.pending_actions.map(a => `- ${a}`).join('\n')}`);
  }

  return lines.join('\n\n');
}

module.exports = {
  loadMemory, getMemory, setMemory, getAllMemory,
  flushMemory, flushIfStale, evictMemory,
  addDecision, addFileModified, addFinding, setPlan,
  addPendingAction, removePendingAction, getStructuredSummary,
  _setPool, _clearCache,
  MAX_MEMORY_BYTES, FLUSH_INTERVAL_MS,
};
