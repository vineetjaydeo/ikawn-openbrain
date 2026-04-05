// vitest globals enabled
'use strict';

const {
  getSessionTotalWithChildren,
  getSessionCostBreakdown,
  _setPool,
} = require('../../src/engine/cost-tracker');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
_setPool({ query: mockQuery });

describe('cost-rollup', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('getSessionTotalWithChildren', () => {
    it('sums parent + child costs via recursive CTE', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3.50' }] });
      const total = await getSessionTotalWithChildren('sess-parent');
      expect(total).toBeCloseTo(3.50, 2);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('WITH RECURSIVE session_tree');
      expect(sql).toContain('parent_session');
      expect(mockQuery.mock.calls[0][1]).toEqual(['sess-parent']);
    });

    it('returns 0 for session with no costs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      const total = await getSessionTotalWithChildren('sess-empty');
      expect(total).toBe(0);
    });
  });

  describe('getSessionCostBreakdown', () => {
    it('returns per-child breakdown', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'child-1', agent_slug: 'tech', status: 'completed', total_cost_usd: '1.25', event_count: '3' },
          { id: 'child-2', agent_slug: 'ops', status: 'active', total_cost_usd: '0.50', event_count: '1' },
        ],
      });
      const breakdown = await getSessionCostBreakdown('sess-parent');
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        id: 'child-1',
        agent_slug: 'tech',
        status: 'completed',
        total_cost_usd: 1.25,
        event_count: 3,
      });
      expect(breakdown[1]).toEqual({
        id: 'child-2',
        agent_slug: 'ops',
        status: 'active',
        total_cost_usd: 0.50,
        event_count: 1,
      });
      expect(mockQuery.mock.calls[0][1]).toEqual(['sess-parent']);
    });

    it('returns empty array when no children exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const breakdown = await getSessionCostBreakdown('sess-no-children');
      expect(breakdown).toEqual([]);
    });
  });
});
