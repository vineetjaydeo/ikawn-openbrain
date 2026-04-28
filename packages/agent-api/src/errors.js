const TOOL_ERROR_KINDS = new Set([
  'validation',
  'output_invalid',
  'timeout',
  'runtime',
  'denied',
  'not_found',
  'isolation_violation',
  'connector_unavailable',
  'async_timeout',
]);

function ToolError({ kind, message, detail }) {
  if (!TOOL_ERROR_KINDS.has(kind)) {
    throw new Error(`unknown ToolError kind: ${kind}`);
  }
  return { ok: false, kind, message, detail };
}

class BrandIsolationError extends Error {
  constructor(message, { brand, reason }) {
    super(message);
    this.name = 'BrandIsolationError';
    this.brand = brand;
    this.reason = reason;
  }
}

class BudgetExceededError extends Error {
  constructor(message, { budget, estimated }) {
    super(message);
    this.name = 'BudgetExceededError';
    this.budget = budget;
    this.estimated = estimated;
  }
}

module.exports = {
  ToolError,
  BrandIsolationError,
  BudgetExceededError,
  TOOL_ERROR_KINDS,
};
