'use strict';

const {
  validateTool,
  createEnvelope,
  PERMISSION_TIERS,
  CATEGORIES,
  PROTECTED_TABLES,
  DEFAULT_RETRY_POLICIES,
} = require('../../src/engine/tool-interface');

function makeValidTool(overrides = {}) {
  return {
    name: 'test_tool',
    description: 'A test tool for validation',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    permissionTier: 'auto',
    category: 'observe',
    timeout: 30000,
    retryPolicy: { maxRetries: 2, backoff: [1000, 3000], timeoutMs: 30000 },
    execute: async (input, context) => ({ ok: true, data: null, error: null, metadata: {} }),
    ...overrides,
  };
}

describe('tool-interface', () => {
  describe('validateTool', () => {
    it('accepts a valid tool', () => {
      const result = validateTool(makeValidTool());
      expect(result).toEqual({ valid: true });
    });

    it('rejects null/non-object', () => {
      expect(validateTool(null).valid).toBe(false);
      expect(validateTool('string').valid).toBe(false);
    });

    it('rejects missing name', () => {
      const result = validateTool(makeValidTool({ name: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name must be a non-empty string');
    });

    it('rejects missing description', () => {
      const result = validateTool(makeValidTool({ description: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must be a non-empty string');
    });

    it('rejects missing permissionTier', () => {
      const result = validateTool(makeValidTool({ permissionTier: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('permissionTier'))).toBe(true);
    });

    it('rejects missing category', () => {
      const result = validateTool(makeValidTool({ category: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('category'))).toBe(true);
    });

    it('rejects missing timeout', () => {
      const result = validateTool(makeValidTool({ timeout: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeout must be a positive number');
    });

    it('rejects missing execute', () => {
      const result = validateTool(makeValidTool({ execute: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('execute must be a function');
    });

    it('rejects missing retryPolicy', () => {
      const result = validateTool(makeValidTool({ retryPolicy: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('retryPolicy must be an object');
    });

    it('rejects bad permissionTier', () => {
      const result = validateTool(makeValidTool({ permissionTier: 'admin' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('permissionTier'))).toBe(true);
    });

    it('rejects bad category', () => {
      const result = validateTool(makeValidTool({ category: 'destroy' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('category'))).toBe(true);
    });

    it('rejects non-async execute', () => {
      const result = validateTool(makeValidTool({ execute: () => {} }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('execute must be an async function');
    });

    it('rejects inputSchema without type object', () => {
      const result = validateTool(makeValidTool({ inputSchema: { type: 'string' } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('inputSchema'))).toBe(true);
    });

    it('rejects missing inputSchema', () => {
      const result = validateTool(makeValidTool({ inputSchema: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('inputSchema'))).toBe(true);
    });

    it('rejects bad retryPolicy shape - missing maxRetries', () => {
      const result = validateTool(makeValidTool({ retryPolicy: { backoff: [], timeoutMs: 1000 } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maxRetries'))).toBe(true);
    });

    it('rejects bad retryPolicy shape - missing backoff', () => {
      const result = validateTool(makeValidTool({ retryPolicy: { maxRetries: 1, timeoutMs: 1000 } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('backoff'))).toBe(true);
    });

    it('rejects bad retryPolicy shape - missing timeoutMs', () => {
      const result = validateTool(makeValidTool({ retryPolicy: { maxRetries: 1, backoff: [] } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('timeoutMs'))).toBe(true);
    });

    it('collects multiple errors at once', () => {
      const result = validateTool({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('createEnvelope', () => {
    it('produces correct shape with all fields', () => {
      const env = createEnvelope(true, { result: 42 }, null, {
        tool: 'test_tool',
        duration_ms: 150,
        attempt: 1,
        truncated: false,
        cost_usd: 0.001,
      });
      expect(env).toEqual({
        ok: true,
        data: { result: 42 },
        error: null,
        metadata: {
          tool: 'test_tool',
          duration_ms: 150,
          attempt: 1,
          truncated: false,
          cost_usd: 0.001,
          effectiveTier: null,
        },
      });
    });

    it('defaults metadata fields when omitted', () => {
      const env = createEnvelope(false, null, 'something broke', {});
      expect(env.ok).toBe(false);
      expect(env.error).toBe('something broke');
      expect(env.data).toBeNull();
      expect(env.metadata.tool).toBeNull();
      expect(env.metadata.duration_ms).toBe(0);
      expect(env.metadata.attempt).toBe(1);
      expect(env.metadata.truncated).toBe(false);
      expect(env.metadata.cost_usd).toBe(0);
    });

    it('defaults data and error to null when undefined', () => {
      const env = createEnvelope(true, undefined, undefined, {});
      expect(env.data).toBeNull();
      expect(env.error).toBeNull();
    });
  });

  describe('PERMISSION_TIERS', () => {
    it('contains expected values', () => {
      expect(PERMISSION_TIERS).toEqual(['auto', 'confirm', 'review']);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(PERMISSION_TIERS)).toBe(true);
    });
  });

  describe('CATEGORIES', () => {
    it('contains expected values', () => {
      expect(CATEGORIES).toEqual(['observe', 'analyze', 'create', 'execute', 'ship', 'communicate']);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(CATEGORIES)).toBe(true);
    });
  });

  describe('PROTECTED_TABLES', () => {
    it('contains expected values', () => {
      expect(PROTECTED_TABLES).toEqual(['trust_ledger', 'trust_scores', 'agent_definitions', 'approval_requests']);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(PROTECTED_TABLES)).toBe(true);
    });
  });

  describe('DEFAULT_RETRY_POLICIES', () => {
    it('covers all categories', () => {
      for (const cat of CATEGORIES) {
        expect(DEFAULT_RETRY_POLICIES).toHaveProperty(cat);
        const policy = DEFAULT_RETRY_POLICIES[cat];
        expect(typeof policy.maxRetries).toBe('number');
        expect(Array.isArray(policy.backoff)).toBe(true);
        expect(typeof policy.timeoutMs).toBe('number');
      }
    });

    it('has correct observe policy', () => {
      expect(DEFAULT_RETRY_POLICIES.observe).toEqual({ maxRetries: 2, backoff: [1000, 3000], timeoutMs: 30000 });
    });

    it('has correct ship policy with zero retries', () => {
      expect(DEFAULT_RETRY_POLICIES.ship).toEqual({ maxRetries: 0, backoff: [], timeoutMs: 300000 });
    });

    it('is frozen', () => {
      expect(Object.isFrozen(DEFAULT_RETRY_POLICIES)).toBe(true);
    });
  });
});
