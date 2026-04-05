'use strict';

const PERMISSION_TIERS = Object.freeze(['auto', 'confirm', 'review']);
const CATEGORIES = Object.freeze(['observe', 'analyze', 'create', 'execute', 'ship', 'communicate']);
const PROTECTED_TABLES = Object.freeze(['trust_ledger', 'trust_scores', 'agent_definitions', 'approval_requests']);

const DEFAULT_RETRY_POLICIES = Object.freeze({
  observe:      { maxRetries: 2, backoff: [1000, 3000], timeoutMs: 30000 },
  analyze:      { maxRetries: 2, backoff: [1000, 3000], timeoutMs: 60000 },
  create:       { maxRetries: 1, backoff: [2000], timeoutMs: 60000 },
  execute:      { maxRetries: 1, backoff: [2000], timeoutMs: 120000 },
  ship:         { maxRetries: 0, backoff: [], timeoutMs: 300000 },
  communicate:  { maxRetries: 1, backoff: [2000], timeoutMs: 30000 },
});

/**
 * Creates a standardized return envelope for tool execution results.
 */
function createEnvelope(ok, data, error, metadata) {
  return {
    ok: Boolean(ok),
    data: data ?? null,
    error: error ?? null,
    metadata: {
      tool: metadata?.tool ?? null,
      duration_ms: metadata?.duration_ms ?? 0,
      attempt: metadata?.attempt ?? 1,
      truncated: metadata?.truncated ?? false,
      cost_usd: metadata?.cost_usd ?? 0,
      effectiveTier: metadata?.effectiveTier ?? null,
    },
  };
}

/**
 * Validates that a tool object conforms to the v2 tool interface.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
function validateTool(tool) {
  const errors = [];

  if (!tool || typeof tool !== 'object') {
    return { valid: false, errors: ['Tool must be a non-null object'] };
  }

  // Required string fields
  if (typeof tool.name !== 'string' || !tool.name) {
    errors.push('name must be a non-empty string');
  }
  if (typeof tool.description !== 'string' || !tool.description) {
    errors.push('description must be a non-empty string');
  }

  // permissionTier
  if (!PERMISSION_TIERS.includes(tool.permissionTier)) {
    errors.push(`permissionTier must be one of: ${PERMISSION_TIERS.join(', ')}`);
  }

  // category
  if (!CATEGORIES.includes(tool.category)) {
    errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  }

  // inputSchema
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object' || tool.inputSchema.type !== 'object') {
    errors.push('inputSchema must be an object with type: \'object\'');
  }

  // timeout
  if (typeof tool.timeout !== 'number' || tool.timeout <= 0) {
    errors.push('timeout must be a positive number');
  }

  // retryPolicy
  if (!tool.retryPolicy || typeof tool.retryPolicy !== 'object') {
    errors.push('retryPolicy must be an object');
  } else {
    if (typeof tool.retryPolicy.maxRetries !== 'number' || tool.retryPolicy.maxRetries < 0) {
      errors.push('retryPolicy.maxRetries must be a non-negative number');
    }
    if (!Array.isArray(tool.retryPolicy.backoff)) {
      errors.push('retryPolicy.backoff must be an array');
    }
    if (typeof tool.retryPolicy.timeoutMs !== 'number' || tool.retryPolicy.timeoutMs <= 0) {
      errors.push('retryPolicy.timeoutMs must be a positive number');
    }
  }

  // execute must be an async function
  if (typeof tool.execute !== 'function') {
    errors.push('execute must be a function');
  } else if (tool.execute.constructor.name !== 'AsyncFunction') {
    errors.push('execute must be an async function');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = {
  validateTool,
  createEnvelope,
  PERMISSION_TIERS,
  CATEGORIES,
  PROTECTED_TABLES,
  DEFAULT_RETRY_POLICIES,
};
