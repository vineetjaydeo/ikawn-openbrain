'use strict';

const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

// ── Lazy pool accessor (testable via _setPool) ────────────────────────

let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

// ── Validation ────────────────────────────────────────────────────────

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;
const ALLOWED_PREFIXES = /^\s*(SELECT|WITH|EXPLAIN)\b/i;

/**
 * Strip string literals so keywords inside quotes don't trigger false positives.
 * Replaces 'anything' and "anything" with empty strings.
 */
function stripStringLiterals(sql) {
  return sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
}

/**
 * Validate that a query is read-only.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { valid: false, reason: 'Query must be a non-empty string' };
  }

  const trimmed = query.trim();

  // Check for allowed prefix
  if (!ALLOWED_PREFIXES.test(trimmed)) {
    return { valid: false, reason: 'Query must start with SELECT, WITH, or EXPLAIN' };
  }

  // Check for multi-statement injection (semicolon followed by non-whitespace)
  // Allow trailing semicolon but reject multiple statements
  const withoutStrings = stripStringLiterals(trimmed);
  const statements = withoutStrings.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    return { valid: false, reason: 'Multi-statement queries are not allowed' };
  }

  // Check for forbidden write keywords in the stripped query
  if (FORBIDDEN_KEYWORDS.test(withoutStrings)) {
    return { valid: false, reason: 'Query contains forbidden write operation' };
  }

  return { valid: true };
}

// ── Tool Definition ───────────────────────────────────────────────────

const MAX_ROWS = 100;

module.exports = {
  name: 'db_query_readonly',
  description: 'Execute read-only SQL queries on the OpenBrain database for debugging, analytics, and system inspection.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL SELECT query to execute' },
    },
    required: ['query'],
  },
  permissionTier: 'auto',
  category: 'analyze',
  timeout: 30000,
  retryPolicy: DEFAULT_RETRY_POLICIES.analyze,

  async execute(input) {
    const start = Date.now();
    const toolMeta = { tool: 'db_query_readonly' };

    // Validate
    const validation = validateQuery(input.query);
    if (!validation.valid) {
      return createEnvelope(false, null, validation.reason, {
        ...toolMeta,
        duration_ms: Date.now() - start,
      });
    }

    let client;
    try {
      client = await getPool().connect();

      // Set statement timeout to prevent long-running queries
      await client.query("SET statement_timeout = '30s'");

      const result = await client.query(input.query);

      const truncated = result.rows.length > MAX_ROWS;
      const rows = truncated ? result.rows.slice(0, MAX_ROWS) : result.rows;

      return createEnvelope(
        true,
        {
          rows,
          rowCount: result.rowCount,
          fields: result.fields ? result.fields.map(f => f.name) : [],
        },
        null,
        {
          ...toolMeta,
          duration_ms: Date.now() - start,
          truncated,
        },
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        ...toolMeta,
        duration_ms: Date.now() - start,
      });
    } finally {
      if (client) client.release();
    }
  },

  // Exposed for testing
  _setPool,
  validateQuery,
};
