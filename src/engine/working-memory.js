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

module.exports = {
  loadMemory, getMemory, setMemory, getAllMemory,
  flushMemory, flushIfStale, evictMemory,
  _setPool, _clearCache,
  MAX_MEMORY_BYTES, FLUSH_INTERVAL_MS,
};
