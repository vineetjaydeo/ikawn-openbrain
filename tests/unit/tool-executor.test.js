'use strict';

const { executeTool, _setLogToolCall } = require('../../src/engine/tool-executor');

// Stub out cost logging for all tests
let logCalls = [];
beforeEach(() => {
  logCalls = [];
  _setLogToolCall(async (sessionId, executionId, brandId, toolName, costUsd) => {
    logCalls.push({ sessionId, executionId, brandId, toolName, costUsd });
  });
});

function makeTool(overrides = {}) {
  return {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: {} },
    permissionTier: 'auto',
    category: 'observe',
    timeout: 5000,
    retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
    execute: async () => ({ ok: true, data: 'result', error: null, metadata: {} }),
    ...overrides,
  };
}

function makeRegistry(tools) {
  const map = {};
  for (const t of tools) map[t.name] = t;
  return { lookupTool: (name) => map[name] || null };
}

function makeContext(overrides = {}) {
  return {
    sessionId: 'sess-1',
    brandId: 'ikawn',
    userId: 'user-1',
    workingMemory: {},
    costTracker: null,
    trustLevel: 'auto',
    ...overrides,
  };
}

describe('tool-executor', () => {
  describe('successful execution', () => {
    it('returns a well-shaped success envelope', async () => {
      const tool = makeTool();
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
      expect(result.data).toBe('result');
      expect(result.error).toBeNull();
      expect(result.metadata.tool).toBe('test_tool');
      expect(result.metadata.attempt).toBe(1);
      expect(typeof result.metadata.duration_ms).toBe('number');
      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('tool not found', () => {
    it('returns error envelope when tool does not exist', async () => {
      const registry = makeRegistry([]);
      const ctx = makeContext();

      const result = await executeTool('nonexistent', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.metadata.tool).toBe('nonexistent');
    });
  });

  describe('permission gating', () => {
    it('gates tool with review tier when context has auto trust', async () => {
      const tool = makeTool({ permissionTier: 'review' });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ trustLevel: 'auto' });

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.gated).toBe(true);
      expect(result.approvalRequired).toBe('review');
    });

    it('gates tool with confirm tier when context has auto trust', async () => {
      const tool = makeTool({ permissionTier: 'confirm' });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ trustLevel: 'auto' });

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.gated).toBe(true);
      expect(result.approvalRequired).toBe('confirm');
    });
  });

  describe('permission passing', () => {
    it('allows auto-tier tool with confirm trust', async () => {
      const tool = makeTool({ permissionTier: 'auto' });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ trustLevel: 'confirm' });

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
      expect(result.gated).toBeUndefined();
    });

    it('allows confirm-tier tool with review trust', async () => {
      const tool = makeTool({ permissionTier: 'confirm' });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ trustLevel: 'review' });

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
    });

    it('allows review-tier tool with review trust', async () => {
      const tool = makeTool({ permissionTier: 'review' });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ trustLevel: 'review' });

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
    });
  });

  describe('protected table rejection', () => {
    it('rejects input referencing trust_ledger', async () => {
      const tool = makeTool();
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', { query: 'SELECT * FROM trust_ledger' }, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('protected table');
      expect(result.error).toContain('trust_ledger');
    });

    it('rejects input referencing approval_requests (case-insensitive)', async () => {
      const tool = makeTool();
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', { table: 'APPROVAL_REQUESTS' }, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('protected table');
    });

    it('does not reject safe input', async () => {
      const tool = makeTool();
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', { query: 'SELECT * FROM memories' }, ctx, registry);

      expect(result.ok).toBe(true);
    });
  });

  describe('retry with backoff', () => {
    it('retries on failure then succeeds', async () => {
      let callCount = 0;
      const tool = makeTool({
        retryPolicy: { maxRetries: 2, backoff: [10, 20], timeoutMs: 5000 },
        execute: async () => {
          callCount++;
          if (callCount < 3) throw new Error('transient failure');
          return { ok: true, data: 'recovered', error: null, metadata: {} };
        },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
      expect(result.data).toBe('recovered');
      expect(result.metadata.attempt).toBe(3);
      expect(callCount).toBe(3);
    });
  });

  describe('timeout enforcement', () => {
    it('times out when tool exceeds timeout', async () => {
      const tool = makeTool({
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 50 },
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return { ok: true, data: 'late', error: null, metadata: {} };
        },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('category-based failure handling', () => {
    it('sets suspend:true for execute category on final failure', async () => {
      const tool = makeTool({
        category: 'execute',
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
        execute: async () => { throw new Error('boom'); },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.suspend).toBe(true);
      expect(result.hotl).toBeUndefined();
    });

    it('sets suspend:true for create category on final failure', async () => {
      const tool = makeTool({
        category: 'create',
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
        execute: async () => { throw new Error('boom'); },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.suspend).toBe(true);
    });

    it('sets hotl:true for ship category on final failure', async () => {
      const tool = makeTool({
        category: 'ship',
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
        execute: async () => { throw new Error('deploy failed'); },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.hotl).toBe(true);
      expect(result.suspend).toBeUndefined();
    });

    it('sets neither flag for observe category on final failure', async () => {
      const tool = makeTool({
        category: 'observe',
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
        execute: async () => { throw new Error('read failed'); },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.suspend).toBeUndefined();
      expect(result.hotl).toBeUndefined();
    });

    it('sets neither flag for communicate category on final failure', async () => {
      const tool = makeTool({
        category: 'communicate',
        retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
        execute: async () => { throw new Error('notify failed'); },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('test_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(result.suspend).toBeUndefined();
      expect(result.hotl).toBeUndefined();
    });
  });

  describe('cost logging', () => {
    it('calls logToolCall after successful execution', async () => {
      const tool = makeTool({
        execute: async () => ({ ok: true, data: 'done', error: null, metadata: { cost_usd: 0.05 } }),
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ sessionId: 'sess-cost', brandId: 'brand-1' });

      await executeTool('test_tool', {}, ctx, registry);

      expect(logCalls.length).toBe(1);
      expect(logCalls[0].sessionId).toBe('sess-cost');
      expect(logCalls[0].brandId).toBe('brand-1');
      expect(logCalls[0].toolName).toBe('test_tool');
      expect(logCalls[0].costUsd).toBe(0.05);
    });

    it('calls logToolCall on each failed attempt', async () => {
      let callCount = 0;
      const tool = makeTool({
        retryPolicy: { maxRetries: 1, backoff: [10], timeoutMs: 5000 },
        execute: async () => {
          callCount++;
          throw new Error('fail');
        },
      });
      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      await executeTool('test_tool', {}, ctx, registry);

      // 2 attempts (initial + 1 retry), each logs
      expect(logCalls.length).toBe(2);
    });

    it('skips logging when sessionId is absent', async () => {
      const tool = makeTool();
      const registry = makeRegistry([tool]);
      const ctx = makeContext({ sessionId: null });

      await executeTool('test_tool', {}, ctx, registry);

      expect(logCalls.length).toBe(0);
    });
  });
});
