/**
 * Dual-Write Layer for OpenBrain
 *
 * Transparent write-through layer that sends writes to Supabase (primary)
 * and Fly PG (secondary). Reads go to Supabase only.
 *
 * Feature flag: DUAL_WRITE_ENABLED env var
 * Lucy only — deploys to ikawn-openbrain, never ruhi-os-brain
 */

const { Pool } = require('pg');

const WRITE_PREFIXES = ['INSERT', 'UPDATE', 'DELETE'];
const WRITE_KEYWORDS = ['ON CONFLICT', 'DO $$', 'DO UPDATE', 'DO NOTHING'];

class DualWritePool {
  /**
   * @param {string} primaryUrl   - SUPABASE_POOLED_URL (primary, must succeed)
   * @param {string} secondaryUrl - DATABASE_URL (Fly PG, best-effort mirror)
   */
  constructor(primaryUrl, secondaryUrl) {
    this.primary = new Pool({
      connectionString: primaryUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.secondary = new Pool({
      connectionString: secondaryUrl,
      ssl: !secondaryUrl.includes('sslmode=disable')
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Track connection health
    this.primaryHealthy = true;
    this.secondaryHealthy = true;

    this.primary.on('error', (err) => {
      console.error('[DualWrite] Primary pool error:', err.message);
      this.primaryHealthy = false;
    });

    this.secondary.on('error', (err) => {
      console.error('[DualWrite] Secondary pool error:', err.message);
      this.secondaryHealthy = false;
    });
  }

  /**
   * Detect if a SQL statement is a write operation.
   * Checks prefix (INSERT, UPDATE, DELETE) and keywords (ON CONFLICT, DO $$).
   */
  isWrite(sql) {
    const trimmed = sql.trim().toUpperCase();

    // Check if it starts with a write verb
    for (const prefix of WRITE_PREFIXES) {
      if (trimmed.startsWith(prefix)) return true;
    }

    // Check for write keywords anywhere (covers CTEs like WITH ... INSERT)
    for (const keyword of WRITE_KEYWORDS) {
      if (trimmed.includes(keyword)) return true;
    }

    // WITH ... INSERT/UPDATE/DELETE (CTE wrapping a write)
    if (trimmed.startsWith('WITH') && /\b(INSERT|UPDATE|DELETE)\b/.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Extract table name from SQL for logging (best effort).
   */
  _extractTable(sql) {
    const trimmed = sql.trim();
    // INSERT INTO table_name
    const insertMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)/i);
    if (insertMatch) return insertMatch[1];
    // UPDATE table_name
    const updateMatch = trimmed.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) return updateMatch[1];
    // DELETE FROM table_name
    const deleteMatch = trimmed.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch) return deleteMatch[1];
    return 'unknown';
  }

  /**
   * Extract operation type from SQL for logging.
   */
  _extractOp(sql) {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('WITH')) return 'CTE-WRITE';
    return 'WRITE';
  }

  /**
   * Main query method — drop-in replacement for pool.query().
   * Supports both pool.query(text, params) and pool.query(config) signatures.
   */
  async query(text, params) {
    // Handle config object form: pool.query({ text, values })
    let sql, queryParams;
    if (typeof text === 'object' && text !== null) {
      sql = text.text || text.query || '';
      queryParams = text.values || params;
      // Pass through as config object to pools
    } else {
      sql = text;
      queryParams = params;
    }

    if (this.isWrite(sql)) {
      return this._handleWrite(text, params, sql);
    } else {
      return this._handleRead(text, params);
    }
  }

  /**
   * Write path: Supabase first (must succeed), then Fly PG (best-effort).
   */
  async _handleWrite(text, params, sql) {
    // Primary (Supabase) — must succeed or we reject entirely
    const result = await this.primary.query(text, params);

    // Mirror to secondary (Fly PG) — best effort, log failures
    const table = this._extractTable(sql);
    const op = this._extractOp(sql);
    try {
      await this.secondary.query(text, params);
    } catch (err) {
      console.error(
        `[DualWrite] Secondary write failed | table=${table} op=${op} | ${err.message} | SQL: ${sql.substring(0, 100)}`
      );
    }

    return result;
  }

  /**
   * Read path: Supabase only.
   */
  async _handleRead(text, params) {
    return this.primary.query(text, params);
  }

  /**
   * Expose connect() for callers that need a client (e.g., transactions).
   * Connects to primary (Supabase). Secondary writes won't be mirrored
   * in transaction mode — this is acceptable for schema init which
   * bypasses dual-write anyway.
   */
  async connect() {
    return this.primary.connect();
  }

  /**
   * Gracefully close both pools.
   */
  async end() {
    const results = await Promise.allSettled([
      this.primary.end(),
      this.secondary.end(),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[DualWrite] Pool close error:', r.reason?.message);
      }
    }
  }

  /**
   * Pass through event listeners to primary pool (for compatibility).
   */
  on(event, listener) {
    this.primary.on(event, listener);
    return this;
  }
}

/**
 * Create a DualWritePool if both URLs are available.
 * Returns null if SUPABASE_POOLED_URL is not set.
 */
function createDualWritePool() {
  const supabaseUrl = process.env.SUPABASE_POOLED_URL;
  const flyPgUrl = process.env.DATABASE_URL;

  if (!supabaseUrl) {
    console.log('[DualWrite] SUPABASE_POOLED_URL not set — dual-write disabled');
    return null;
  }

  if (!flyPgUrl) {
    console.log('[DualWrite] DATABASE_URL not set — dual-write disabled');
    return null;
  }

  console.log('[DualWrite] Initializing dual-write pool (primary=Supabase, secondary=FlyPG)');
  return new DualWritePool(supabaseUrl, flyPgUrl);
}

module.exports = { DualWritePool, createDualWritePool };
