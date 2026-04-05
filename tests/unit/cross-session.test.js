'use strict';

const { loadPreviousSessionContext, _setPool } = require('../../src/engine/cross-session');

const mockQuery = vi.fn();
_setPool({ query: mockQuery });

describe('cross-session', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('loadPreviousSessionContext', () => {
    it('loads last 3 completed sessions and formats context', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'sess-3',
            working_memory: JSON.stringify({
              current_plan: 'Deploy MaxFashion integration',
              decisions_made: ['Use blue-green deploy'],
              pending_actions: ['Set up monitoring'],
            }),
            summary: 'Completed MaxFashion deploy plan',
            agent_slug: 'cto',
            created_at: '2026-04-03T10:00:00Z',
            completed_at: '2026-04-03T11:00:00Z',
          },
          {
            id: 'sess-2',
            working_memory: JSON.stringify({
              current_plan: 'Review Shubhkart pilot',
              decisions_made: [],
              pending_actions: [],
            }),
            summary: null,
            agent_slug: null,
            created_at: '2026-04-02T10:00:00Z',
            completed_at: '2026-04-02T11:00:00Z',
          },
          {
            id: 'sess-1',
            working_memory: null,
            summary: 'Initial setup session',
            agent_slug: 'ceo',
            created_at: '2026-04-01T10:00:00Z',
            completed_at: '2026-04-01T11:00:00Z',
          },
        ],
        rowCount: 3,
      });

      const result = await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'u1', channel: 'web' });

      expect(result).toContain('Previous session context:');
      expect(result).toContain('Session [2026-04-03]');
      expect(result).toContain('Deploy MaxFashion');
      expect(result).toContain('blue-green deploy');
      expect(result).toContain('Set up monitoring');
      expect(result).toContain('Session [2026-04-02]');
      expect(result).toContain('Review Shubhkart pilot');
      expect(result).toContain('Session [2026-04-01]');
      expect(result).toContain('Initial setup session');

      // Verify SQL query
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('brand_id = $1');
      expect(sql).toContain('user_id = $2');
      expect(sql).toContain('channel = $3');
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain('LIMIT 3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['ikawn', 'u1', 'web']);
    });

    it('returns null for new user (no previous sessions)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'new-user', channel: 'web' });
      expect(result).toBeNull();
    });

    it('returns null when userId is missing', async () => {
      const result = await loadPreviousSessionContext({ brandId: 'ikawn', channel: 'web' });
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns null when brandId is missing', async () => {
      const result = await loadPreviousSessionContext({ userId: 'u1', channel: 'web' });
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('truncates to 1000 chars', async () => {
      const longPlan = 'X'.repeat(500);
      const rows = [
        {
          id: 'sess-1',
          working_memory: JSON.stringify({ current_plan: longPlan, decisions_made: [longPlan], pending_actions: [longPlan] }),
          summary: longPlan,
          agent_slug: 'cto',
          created_at: '2026-04-03T10:00:00Z',
          completed_at: '2026-04-03T11:00:00Z',
        },
        {
          id: 'sess-2',
          working_memory: JSON.stringify({ current_plan: longPlan, decisions_made: [longPlan], pending_actions: [longPlan] }),
          summary: longPlan,
          agent_slug: 'ceo',
          created_at: '2026-04-02T10:00:00Z',
          completed_at: '2026-04-02T11:00:00Z',
        },
        {
          id: 'sess-3',
          working_memory: JSON.stringify({ current_plan: longPlan, decisions_made: [longPlan], pending_actions: [longPlan] }),
          summary: longPlan,
          agent_slug: 'cfo',
          created_at: '2026-04-01T10:00:00Z',
          completed_at: '2026-04-01T11:00:00Z',
        },
      ];
      mockQuery.mockResolvedValue({ rows, rowCount: 3 });

      const result = await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'u1', channel: 'web' });
      expect(result.length).toBeLessThanOrEqual(1000);
      expect(result).toMatch(/\.\.\.$/);
    });

    it('filters by channel parameter', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'u1', channel: 'telegram' });

      expect(mockQuery.mock.calls[0][1]).toEqual(['ikawn', 'u1', 'telegram']);
    });

    it('defaults channel to web when not provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'u1' });

      expect(mockQuery.mock.calls[0][1]).toEqual(['ikawn', 'u1', 'web']);
    });

    it('handles working_memory as pre-parsed object', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'sess-1',
          working_memory: { current_plan: 'Already parsed', decisions_made: ['d1'], pending_actions: [] },
          summary: null,
          agent_slug: null,
          created_at: '2026-04-03T10:00:00Z',
          completed_at: '2026-04-03T11:00:00Z',
        }],
        rowCount: 1,
      });

      const result = await loadPreviousSessionContext({ brandId: 'ikawn', userId: 'u1', channel: 'web' });
      expect(result).toContain('Already parsed');
      expect(result).toContain('d1');
    });
  });
});
