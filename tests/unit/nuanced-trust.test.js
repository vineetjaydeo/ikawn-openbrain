'use strict';

const { classifyFailure } = require('../../src/engine/tool-executor');

// ── Mock pool factory ──
function createMockPool() {
  const queryResults = [];
  const pool = {
    query: vi.fn(async () => {
      return queryResults.shift() || { rows: [], rowCount: 0 };
    }),
    _pushResult(result) {
      queryResults.push(result);
    },
  };
  return pool;
}

describe('nuanced-trust', () => {
  describe('FAILURE_WEIGHTS', () => {
    let scorer;

    beforeEach(() => {
      delete require.cache[require.resolve('../../src/engine/trust-scorer')];
      scorer = require('../../src/engine/trust-scorer');
    });

    it('exports FAILURE_WEIGHTS with all expected keys', () => {
      expect(scorer.FAILURE_WEIGHTS).toBeDefined();
      expect(scorer.FAILURE_WEIGHTS.EDGE_CASE).toBe(0.5);
      expect(scorer.FAILURE_WEIGHTS.CONFIGURATION).toBe(0.7);
      expect(scorer.FAILURE_WEIGHTS.NEGLIGENCE).toBe(1.0);
      expect(scorer.FAILURE_WEIGHTS.EXTERNAL).toBe(0.3);
      expect(scorer.FAILURE_WEIGHTS.UNKNOWN).toBe(0.8);
    });

    it('FAILURE_WEIGHTS is frozen', () => {
      expect(Object.isFrozen(scorer.FAILURE_WEIGHTS)).toBe(true);
    });
  });

  describe('checkImmediateDemotion — weighted penalty', () => {
    let scorer, mockPool, mockSendAlert;

    beforeEach(() => {
      mockPool = createMockPool();
      mockSendAlert = vi.fn().mockResolvedValue(true);

      delete require.cache[require.resolve('../../src/engine/trust-scorer')];
      delete require.cache[require.resolve('../../src/engine/trust-ledger')];

      const ledger = require('../../src/engine/trust-ledger');
      scorer = require('../../src/engine/trust-scorer');

      ledger._setPool(mockPool);
      scorer._setPool(mockPool);
      scorer._setSendAlert(mockSendAlert);
    });

    it('applies EXTERNAL weight (0.3) — small penalty, no demotion if score is high', async () => {
      // Return current auto tier with high score
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 1.0 }] });
      // For the UPDATE query
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'EXTERNAL');

      // penalty = -0.2 * 0.3 = -0.06, newScore = 0.94, still above 0.6 threshold
      expect(result.demoted).toBe(false);
      expect(result.penalty).toBeCloseTo(-0.06);
      expect(result.newScore).toBeCloseTo(0.94);
    });

    it('applies NEGLIGENCE weight (1.0) — full penalty, demotes from score 0.7', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 0.7 }] });
      // For the UPDATE query
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'NEGLIGENCE');

      // penalty = -0.2 * 1.0 = -0.2, newScore = 0.5, below 0.6 → demoted
      expect(result.demoted).toBe(true);
      expect(result.penalty).toBeCloseTo(-0.2);
      expect(result.newScore).toBeCloseTo(0.5);
    });

    it('floors score at 0.4', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 0.45 }] });
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'NEGLIGENCE');

      // penalty = -0.2 * 1.0 = -0.2, 0.45 + (-0.2) = 0.25, floored to 0.4
      expect(result.newScore).toBe(0.4);
      expect(result.demoted).toBe(true);
    });

    it('defaults to UNKNOWN weight when no failureType provided', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 0.7 }] });
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring');

      // UNKNOWN weight = 0.8, penalty = -0.2 * 0.8 = -0.16, newScore = 0.54 → demoted
      expect(result.penalty).toBeCloseTo(-0.16);
      expect(result.newScore).toBeCloseTo(0.54);
      expect(result.demoted).toBe(true);
    });

    it('returns demoted=false when domain is not auto', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'confirm' }] });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'NEGLIGENCE');

      expect(result.demoted).toBe(false);
    });

    it('returns demoted=false when domain does not exist', async () => {
      mockPool._pushResult({ rows: [] });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'EXTERNAL');

      expect(result.demoted).toBe(false);
    });

    it('handles missing score field (defaults to 1.0)', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: null }] });
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'EXTERNAL');

      // score defaults to 1.0, penalty = -0.06, newScore = 0.94
      expect(result.newScore).toBeCloseTo(0.94);
      expect(result.demoted).toBe(false);
    });
  });

  describe('classifyFailure', () => {
    it('classifies network errors as EXTERNAL', () => {
      expect(classifyFailure(new Error('ECONNREFUSED'))).toBe('EXTERNAL');
      expect(classifyFailure(new Error('ETIMEDOUT'))).toBe('EXTERNAL');
      expect(classifyFailure(new Error('Request timeout after 5000ms'))).toBe('EXTERNAL');
      expect(classifyFailure(new Error('socket hang up'))).toBe('EXTERNAL');
      expect(classifyFailure(new Error('ENOTFOUND api.example.com'))).toBe('EXTERNAL');
    });

    it('classifies permission errors as NEGLIGENCE', () => {
      expect(classifyFailure(new Error('approval required'))).toBe('NEGLIGENCE');
      expect(classifyFailure(new Error('Permission denied'))).toBe('NEGLIGENCE');
      expect(classifyFailure(new Error('Forbidden: insufficient scope'))).toBe('NEGLIGENCE');
      expect(classifyFailure(new Error('Unauthorized access'))).toBe('NEGLIGENCE');
    });

    it('classifies config errors as CONFIGURATION', () => {
      expect(classifyFailure(new Error('config not found'))).toBe('CONFIGURATION');
      expect(classifyFailure(new Error('API key not configured'))).toBe('CONFIGURATION');
      expect(classifyFailure(new Error('Missing required field'))).toBe('CONFIGURATION');
    });

    it('classifies unknown errors as UNKNOWN', () => {
      expect(classifyFailure(new Error('something went wrong'))).toBe('UNKNOWN');
      expect(classifyFailure(new Error('unexpected state'))).toBe('UNKNOWN');
    });

    it('handles null/undefined error', () => {
      expect(classifyFailure(null)).toBe('UNKNOWN');
      expect(classifyFailure(undefined)).toBe('UNKNOWN');
      expect(classifyFailure({})).toBe('UNKNOWN');
    });
  });
});
