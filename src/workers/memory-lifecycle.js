'use strict';

const { pool: defaultPool } = require('../db');

let _pool = defaultPool;

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Override pool for testing.
 */
function _setPool(p) { _pool = p; }

/**
 * Delete expired episodic memories.
 * Returns { deletedCount }.
 */
async function cleanExpiredMemories() {
  const { rows, rowCount } = await _pool.query(
    `DELETE FROM episodic_memories WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`
  );

  const deletedCount = rowCount || rows.length;
  if (deletedCount > 0) {
    console.log(`[MemoryLifecycle] Cleaned ${deletedCount} expired episodic memories`);
  }
  return { deletedCount };
}

/**
 * Calculate expiry timestamp for a new episodic memory.
 * Looks up brand-specific retention if available, otherwise uses 90-day default.
 */
async function setExpiryOnInsert(brandId) {
  let retentionDays = DEFAULT_RETENTION_DAYS;

  if (brandId) {
    try {
      const { rows } = await _pool.query(
        `SELECT data_retention_days FROM brands WHERE id = $1`,
        [brandId]
      );
      if (rows.length > 0 && rows[0].data_retention_days != null) {
        retentionDays = rows[0].data_retention_days;
      }
    } catch (_err) {
      // brands table or column may not exist yet — use default
    }
  }

  return new Date(Date.now() + retentionDays * 86400000);
}

/**
 * Get expiry stats for a brand's episodic memories.
 */
async function getExpiryStats(brandId) {
  const { rows } = await _pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE expires_at IS NULL) AS permanent,
      COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) AS active,
      COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) AS expired
    FROM episodic_memories WHERE brand_id = $1`,
    [brandId]
  );

  return {
    permanent: parseInt(rows[0].permanent, 10),
    active: parseInt(rows[0].active, 10),
    expired: parseInt(rows[0].expired, 10),
  };
}

module.exports = {
  cleanExpiredMemories,
  setExpiryOnInsert,
  getExpiryStats,
  _setPool,
};
