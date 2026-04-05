'use strict';

const {
  cleanExpiredMemories,
  setExpiryOnInsert,
  getExpiryStats,
  _setPool,
} = require('../../src/workers/memory-lifecycle');

function makeMockPool() {
  const queryFn = vi.fn();
  return { query: queryFn };
}

describe('memory-lifecycle', () => {
  describe('cleanExpiredMemories', () => {
    it('deletes expired rows and returns count', async () => {
      const pool = makeMockPool();
      pool.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }, { id: 5 }],
        rowCount: 3,
      });
      _setPool(pool);

      const result = await cleanExpiredMemories();

      expect(result.deletedCount).toBe(3);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query.mock.calls[0][0]).toContain('DELETE FROM episodic_memories');
      expect(pool.query.mock.calls[0][0]).toContain('expires_at < NOW()');
    });

    it('returns zero when no expired rows', async () => {
      const pool = makeMockPool();
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      _setPool(pool);

      const result = await cleanExpiredMemories();

      expect(result.deletedCount).toBe(0);
    });

    it('does not delete non-expired rows (query includes expires_at < NOW())', async () => {
      const pool = makeMockPool();
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      _setPool(pool);

      await cleanExpiredMemories();

      const sql = pool.query.mock.calls[0][0];
      // Must require expires_at IS NOT NULL AND expires_at < NOW()
      expect(sql).toContain('expires_at IS NOT NULL');
      expect(sql).toContain('expires_at < NOW()');
    });
  });

  describe('setExpiryOnInsert', () => {
    it('returns date 90 days from now by default', async () => {
      const pool = makeMockPool();
      // Simulate brands table not having the brand / no custom retention
      pool.query.mockResolvedValue({ rows: [] });
      _setPool(pool);

      const before = Date.now();
      const expiry = await setExpiryOnInsert('ikawn');
      const after = Date.now();

      const expectedMin = before + 90 * 86400000;
      const expectedMax = after + 90 * 86400000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('uses brand-specific retention when available', async () => {
      const pool = makeMockPool();
      pool.query.mockResolvedValue({
        rows: [{ data_retention_days: 30 }],
      });
      _setPool(pool);

      const before = Date.now();
      const expiry = await setExpiryOnInsert('custom-brand');
      const after = Date.now();

      const expectedMin = before + 30 * 86400000;
      const expectedMax = after + 30 * 86400000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('falls back to 90 days if brands table query fails', async () => {
      const pool = makeMockPool();
      pool.query.mockRejectedValue(new Error('relation "brands" does not exist'));
      _setPool(pool);

      const before = Date.now();
      const expiry = await setExpiryOnInsert('ikawn');
      const after = Date.now();

      const expectedMin = before + 90 * 86400000;
      const expectedMax = after + 90 * 86400000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('getExpiryStats', () => {
    it('returns correct counts for permanent, active, and expired', async () => {
      const pool = makeMockPool();
      pool.query.mockResolvedValue({
        rows: [{ permanent: '5', active: '10', expired: '2' }],
      });
      _setPool(pool);

      const stats = await getExpiryStats('ikawn');

      expect(stats).toEqual({
        permanent: 5,
        active: 10,
        expired: 2,
      });

      // Verify it filters by brand_id
      expect(pool.query.mock.calls[0][1]).toEqual(['ikawn']);
    });
  });
});
