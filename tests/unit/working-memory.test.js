// vitest globals enabled
'use strict';

const wm = require('../../src/engine/working-memory');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
wm._setPool({ query: mockQuery });

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const DB_MEMORY = { key1: 'val1', key2: 42 };

describe('working-memory', () => {
  beforeEach(() => {
    wm._clearCache();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('loadMemory', () => {
    it('reads from DB and caches the result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      const data = await wm.loadMemory(SESSION_ID);
      expect(data).toEqual(DB_MEMORY);
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT working_memory FROM sessions');
      expect(mockQuery.mock.calls[0][1]).toEqual([SESSION_ID]);
    });

    it('returns empty object when session has no working_memory', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: null }] });
      const data = await wm.loadMemory(SESSION_ID);
      expect(data).toEqual({});
    });

    it('returns empty object when session not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const data = await wm.loadMemory(SESSION_ID);
      expect(data).toEqual({});
    });
  });

  describe('getMemory', () => {
    it('returns cached value without DB call on cache hit', async () => {
      // Prime the cache
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      await wm.loadMemory(SESSION_ID);
      mockQuery.mockReset();

      const val = await wm.getMemory(SESSION_ID, 'key1');
      expect(val).toBe('val1');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('loads from DB on cache miss', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      const val = await wm.getMemory(SESSION_ID, 'key2');
      expect(val).toBe(42);
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('returns null for missing key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      const val = await wm.getMemory(SESSION_ID, 'nonexistent');
      expect(val).toBeNull();
    });
  });

  describe('setMemory', () => {
    it('updates cache and marks dirty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'foo', 'bar');

      // Should not have written to DB yet
      expect(mockQuery).toHaveBeenCalledOnce(); // only the initial load
      const val = await wm.getMemory(SESSION_ID, 'foo');
      expect(val).toBe('bar');
    });

    it('rejects writes exceeding 100KB', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      const bigValue = 'x'.repeat(wm.MAX_MEMORY_BYTES + 1);
      await expect(wm.setMemory(SESSION_ID, 'big', bigValue))
        .rejects.toThrow('Working memory would exceed 100KB limit');
    });

    it('allows writes up to the 100KB limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      // JSON overhead for {"k":"..."} = 8 bytes of framing ({"k":""} around value)
      const maxPayload = 'x'.repeat(wm.MAX_MEMORY_BYTES - 8);
      await expect(wm.setMemory(SESSION_ID, 'k', maxPayload)).resolves.not.toThrow();
    });
  });

  describe('getAllMemory', () => {
    it('returns a shallow copy of the data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      const all = await wm.getAllMemory(SESSION_ID);
      expect(all).toEqual(DB_MEMORY);

      // Mutating the returned object should not affect the cache
      all.key1 = 'mutated';
      const fresh = await wm.getAllMemory(SESSION_ID);
      expect(fresh.key1).toBe('val1');
    });
  });

  describe('flushMemory', () => {
    it('writes to DB and clears dirty flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'a', 1);
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await wm.flushMemory(SESSION_ID);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE sessions SET working_memory');
      expect(params[0]).toBe(SESSION_ID);
      expect(JSON.parse(params[1])).toEqual({ a: 1 });
    });

    it('no-ops when session is not in cache', async () => {
      await wm.flushMemory('unknown-session');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('flushIfStale', () => {
    it('does not flush clean cache entries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      await wm.loadMemory(SESSION_ID);
      mockQuery.mockReset();

      const flushed = await wm.flushIfStale(SESSION_ID);
      expect(flushed).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('does not flush dirty entries before interval elapses', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'x', 1);
      mockQuery.mockReset();

      const flushed = await wm.flushIfStale(SESSION_ID);
      expect(flushed).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('flushes dirty entries after interval elapses', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'x', 1);

      // Simulate time passing by backdating lastFlush
      const entry = wm.getAllMemory(SESSION_ID); // just to confirm cache exists
      // Reach into internals — test-only hack via loadMemory + setMemory
      // We need to manually backdate; _clearCache is the only exposed internal
      // Instead, use a fresh load with setMemory then manipulate via the module
      // Actually, we set lastFlush through loadMemory which creates the cache entry.
      // The simplest approach: call loadMemory to reset, set, then backdate.
      wm._clearCache();
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'x', 1);

      // Backdate by reaching into the Map via getAllMemory timing trick:
      // We can't directly access the cache, but we know flushIfStale checks
      // Date.now() - lastFlush. Let's use vi.useFakeTimers instead.
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Advance time past flush interval
      vi.useFakeTimers();
      vi.advanceTimersByTime(wm.FLUSH_INTERVAL_MS + 1000);

      const flushed = await wm.flushIfStale(SESSION_ID);
      expect(flushed).toBe(true);
      expect(mockQuery).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('returns false for unknown session', async () => {
      const flushed = await wm.flushIfStale('unknown');
      expect(flushed).toBe(false);
    });
  });

  describe('evictMemory', () => {
    it('flushes dirty data then removes from cache', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      await wm.setMemory(SESSION_ID, 'temp', true);
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await wm.evictMemory(SESSION_ID);

      // Should have flushed to DB
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE sessions');

      // Cache should be empty — next getMemory should hit DB
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      const val = await wm.getMemory(SESSION_ID, 'temp');
      expect(val).toBeNull(); // DB was mocked to return empty
      expect(mockQuery).toHaveBeenCalledOnce(); // had to reload from DB
    });

    it('skips flush for clean cache entries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: DB_MEMORY }] });
      await wm.loadMemory(SESSION_ID);
      mockQuery.mockReset();

      await wm.evictMemory(SESSION_ID);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('no-ops for sessions not in cache', async () => {
      await wm.evictMemory('unknown');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
