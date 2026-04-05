'use strict';

const { executeTool, _setLogToolCall, _setGetTrustLevel } = require('../../src/engine/tool-executor');

// Stub out cost logging and trust level for all tests
beforeEach(() => {
  _setLogToolCall(async () => {});
  _setGetTrustLevel(async () => 'auto');
});

function makeTool(overrides = {}) {
  return {
    name: 'retry_tool',
    description: 'A tool for retry testing',
    inputSchema: { type: 'object', properties: {} },
    permissionTier: 'auto',
    category: 'observe',
    timeout: 5000,
    retryPolicy: { maxRetries: 2, backoff: [100, 200], timeoutMs: 5000 },
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

describe('context-aware-retries', () => {
  describe('normal retries with backoff', () => {
    it('waits between retries in normal mode', async () => {
      let attempts = 0;
      const timestamps = [];

      const tool = makeTool({
        retryPolicy: { maxRetries: 2, backoff: [50, 100], timeoutMs: 5000 },
        execute: async () => {
          attempts++;
          timestamps.push(Date.now());
          if (attempts < 3) throw new Error('transient error');
          return { ok: true, data: 'success', error: null, metadata: {} };
        },
      });

      const registry = makeRegistry([tool]);
      const ctx = makeContext();

      const result = await executeTool('retry_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);

      // Verify there was some delay between attempts (at least 40ms to account for timing)
      const gap1 = timestamps[1] - timestamps[0];
      const gap2 = timestamps[2] - timestamps[1];
      expect(gap1).toBeGreaterThanOrEqual(40);
      expect(gap2).toBeGreaterThanOrEqual(40);
    });
  });

  describe('HOTL-approved retries (skip backoff)', () => {
    it('retries immediately when fromHOTLApproval is true', async () => {
      let attempts = 0;
      const timestamps = [];

      const tool = makeTool({
        retryPolicy: { maxRetries: 2, backoff: [500, 1000], timeoutMs: 5000 },
        execute: async () => {
          attempts++;
          timestamps.push(Date.now());
          if (attempts < 3) throw new Error('transient error');
          return { ok: true, data: 'success', error: null, metadata: {} };
        },
      });

      const registry = makeRegistry([tool]);
      const ctx = makeContext({ fromHOTLApproval: true });

      const result = await executeTool('retry_tool', {}, ctx, registry);

      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);

      // Verify retries were fast (no 500ms/1000ms backoff)
      const gap1 = timestamps[1] - timestamps[0];
      const gap2 = timestamps[2] - timestamps[1];
      // Should be well under the 500ms backoff that would normally apply
      expect(gap1).toBeLessThan(100);
      expect(gap2).toBeLessThan(100);
    });

    it('still respects maxRetries even with HOTL approval', async () => {
      let attempts = 0;

      const tool = makeTool({
        retryPolicy: { maxRetries: 1, backoff: [500], timeoutMs: 5000 },
        execute: async () => {
          attempts++;
          throw new Error('persistent error');
        },
      });

      const registry = makeRegistry([tool]);
      const ctx = makeContext({ fromHOTLApproval: true });

      const result = await executeTool('retry_tool', {}, ctx, registry);

      expect(result.ok).toBe(false);
      expect(attempts).toBe(2); // 1 initial + 1 retry
      expect(result.error).toContain('persistent error');
    });
  });

  describe('HOTL config propagation', () => {
    it('processApproval adds fromHOTLApproval to config', async () => {
      // We verify by reading the hotl.js module and checking its output
      // Since processApproval hits the DB, we mock it
      const mockPool = {
        query: vi.fn(),
      };

      // Mock the UPDATE returning an approval
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          uuid: 'test-uuid',
          brand_id: 'ikawn',
          resume_token: 'tok-123',
          action_type: 'deploy_code',
          action_description: 'Deploy to production',
        }],
      });

      // Mock the INSERT for scheduled_task
      mockPool.query.mockResolvedValueOnce({
        rows: [{ uuid: 'task-uuid-1' }],
      });

      // Load hotl with mocked pool
      delete require.cache[require.resolve('../../src/engine/hotl')];
      const hotl = require('../../src/engine/hotl');
      hotl._setPool(mockPool);

      await hotl.processApproval('test-uuid', true, 'user-1', null);

      // Check the INSERT call for scheduled_tasks
      const insertCall = mockPool.query.mock.calls[1];
      const configParam = JSON.parse(insertCall[1][3]); // 4th param is JSON config

      expect(configParam.fromHOTLApproval).toBe(true);
      expect(configParam.approved).toBe(true);
      expect(configParam.resumeToken).toBe('tok-123');
    });

    it('processApproval sets fromHOTLApproval even on rejection', async () => {
      const mockPool = {
        query: vi.fn(),
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          uuid: 'test-uuid',
          brand_id: 'ikawn',
          resume_token: 'tok-456',
          action_type: 'send_email',
          action_description: 'Send marketing email',
        }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ uuid: 'task-uuid-2' }],
      });

      delete require.cache[require.resolve('../../src/engine/hotl')];
      const hotl = require('../../src/engine/hotl');
      hotl._setPool(mockPool);

      await hotl.processApproval('test-uuid', false, 'user-1', 'Not approved');

      const insertCall = mockPool.query.mock.calls[1];
      const configParam = JSON.parse(insertCall[1][3]);

      expect(configParam.fromHOTLApproval).toBe(true);
      expect(configParam.approved).toBe(false);
      expect(configParam.rejectionReason).toBe('Not approved');
    });
  });
});
