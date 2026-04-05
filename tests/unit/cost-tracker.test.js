// vitest globals enabled
'use strict';

const { logLLMCall, logToolCall, logEmbedding, getSessionTotal, getBrandDaily, checkBudget, calculateCostFromModel, _setPool } = require('../../src/engine/cost-tracker');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
_setPool({ query: mockQuery });

describe('cost-tracker', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('calculateCostFromModel', () => {
    it('calculates correct cost for Sonnet', () => {
      expect(calculateCostFromModel('claude-sonnet-4-6', 1000, 500)).toBeCloseTo(0.0105, 6);
    });

    it('calculates correct cost for Haiku', () => {
      expect(calculateCostFromModel('claude-haiku-4-5-20251001', 10000, 5000)).toBeCloseTo(0.028, 6);
    });

    it('calculates correct cost for Opus', () => {
      expect(calculateCostFromModel('claude-opus-4-6', 10000, 5000)).toBeCloseTo(0.525, 6);
    });

    it('returns 0 for unknown model', () => {
      expect(calculateCostFromModel('gpt-99', 1000, 500)).toBe(0);
    });
  });

  describe('logLLMCall', () => {
    it('inserts cost event and returns calculated cost', async () => {
      const cost = await logLLMCall('sess-1', 'exec-1', 'ikawn', 'claude-sonnet-4-6', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO cost_events');
    });
  });

  describe('logToolCall', () => {
    it('inserts tool_call event', async () => {
      await logToolCall('sess-1', 'exec-1', 'ikawn', 'web_search', 0.01);
      expect(mockQuery.mock.calls[0][0]).toContain('tool_call');
      expect(mockQuery.mock.calls[0][1]).toContain('web_search');
    });
  });

  describe('logEmbedding', () => {
    it('inserts embedding event', async () => {
      await logEmbedding('sess-1', 'ikawn', 256);
      expect(mockQuery.mock.calls[0][0]).toContain('embedding');
    });
  });

  describe('getSessionTotal', () => {
    it('returns sum of costs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1.234567' }] });
      expect(await getSessionTotal('sess-1')).toBeCloseTo(1.234567, 6);
    });

    it('returns 0 for empty session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      expect(await getSessionTotal('sess-1')).toBe(0);
    });
  });

  describe('getBrandDaily', () => {
    it('passes correct brand and date', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5.50' }] });
      expect(await getBrandDaily('ikawn', '2026-04-05')).toBeCloseTo(5.50, 2);
    });
  });

  describe('checkBudget', () => {
    it('returns withinBudget true when under cap', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0.50' }] });
      const result = await checkBudget('sess-1', 1.00);
      expect(result.withinBudget).toBe(true);
      expect(result.spent).toBeCloseTo(0.50, 2);
      expect(result.remaining).toBeCloseTo(0.50, 2);
    });

    it('returns withinBudget false when over cap', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1.50' }] });
      const result = await checkBudget('sess-1', 1.00);
      expect(result.withinBudget).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
