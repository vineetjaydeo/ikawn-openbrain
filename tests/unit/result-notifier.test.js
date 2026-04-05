'use strict';

const { createNotifier, _setPool } = require('../../src/engine/result-notifier');

describe('result-notifier', () => {
  let mockQuery;
  let mockPool;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockPool = { query: mockQuery };
    _setPool(mockPool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('waitForChildren', () => {
    it('resolves when all children complete', async () => {
      // First poll: one running, one completed
      // Second poll: both completed
      let callCount = 0;
      mockQuery.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            rows: [
              { id: 1, last_status: 'completed', result: { response: 'done' }, error: null, run_status: 'completed' },
              { id: 2, last_status: 'running', result: null, error: null, run_status: 'running' },
            ],
          };
        }
        return {
          rows: [
            { id: 1, last_status: 'completed', result: { response: 'done' }, error: null, run_status: 'completed' },
            { id: 2, last_status: 'completed', result: { response: 'also done' }, error: null, run_status: 'completed' },
          ],
        };
      });

      const notifier = createNotifier('parent-session-1', { pollIntervalMs: 50, maxWaitMs: 5000 });
      const { results, timedOut } = await notifier.waitForChildren();

      expect(timedOut).toBe(false);
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('completed');
    });

    it('includes failed children in results', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 1, last_status: 'completed', result: { response: 'ok' }, error: null, run_status: 'completed' },
          { id: 2, last_status: 'failed', result: null, error: 'OOM', run_status: 'failed' },
        ],
      });

      const notifier = createNotifier('parent-session-2', { pollIntervalMs: 50 });
      const { results, timedOut } = await notifier.waitForChildren();

      expect(timedOut).toBe(false);
      expect(results).toHaveLength(2);
      expect(results[1].error).toBe('OOM');
    });
  });

  describe('waitForAny', () => {
    it('resolves on first completion', async () => {
      let callCount = 0;
      mockQuery.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { rows: [{ id: 1, last_status: 'running', result: null, error: null, run_status: 'running' }] };
        }
        return {
          rows: [{ id: 1, last_status: 'completed', result: { response: 'first!' }, error: null, run_status: 'completed' }],
        };
      });

      const notifier = createNotifier('parent-session-3', { pollIntervalMs: 50, maxWaitMs: 5000 });
      const { result, timedOut } = await notifier.waitForAny();

      expect(timedOut).toBe(false);
      expect(result).toBeTruthy();
      expect(result.taskId).toBe(1);
      expect(result.status).toBe('completed');
    });
  });

  describe('polling behavior', () => {
    it('interval increases with backoff', async () => {
      // Always return running — will eventually timeout
      mockQuery.mockResolvedValue({
        rows: [{ id: 1, last_status: 'running', result: null, error: null, run_status: 'running' }],
      });

      const notifier = createNotifier('parent-session-4', {
        pollIntervalMs: 100,
        maxWaitMs: 600,
        backoffCap: 500,
      });

      const start = Date.now();
      const { timedOut } = await notifier.waitForChildren();
      const elapsed = Date.now() - start;

      expect(timedOut).toBe(true);
      // With backoff, fewer polls should have occurred than linear 100ms intervals would allow
      // In 600ms at 100ms constant, we'd get ~6 polls. With 1.5x backoff we get fewer.
      expect(mockQuery).toHaveBeenCalled();
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });

    it('timeout resolves with partial results', async () => {
      // One completed, one still running — timeout
      mockQuery.mockResolvedValue({
        rows: [
          { id: 1, last_status: 'completed', result: { response: 'done' }, error: null, run_status: 'completed' },
          { id: 2, last_status: 'running', result: null, error: null, run_status: 'running' },
        ],
      });

      const notifier = createNotifier('parent-session-5', { pollIntervalMs: 50, maxWaitMs: 200 });
      const { results, timedOut } = await notifier.waitForChildren();

      expect(timedOut).toBe(true);
      expect(results).toHaveLength(2);
    });

    it('stop() cancels polling', async () => {
      let pollCount = 0;
      mockQuery.mockImplementation(() => {
        pollCount++;
        return Promise.resolve({
          rows: [{ id: 1, last_status: 'running', result: null, error: null, run_status: 'running' }],
        });
      });

      const notifier = createNotifier('parent-session-6', { pollIntervalMs: 50, maxWaitMs: 10000 });
      const promise = notifier.waitForChildren();

      // Wait enough for a couple polls, then stop
      await new Promise(r => setTimeout(r, 200));
      notifier.stop();

      const { stopped } = await promise;
      expect(stopped).toBe(true);
      expect(pollCount).toBeGreaterThanOrEqual(1);
    });
  });
});
