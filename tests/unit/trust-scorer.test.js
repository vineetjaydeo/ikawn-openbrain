'use strict';

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

describe('trust-scorer', () => {
  let scorer, ledger, mockPool, mockSendAlert;

  beforeEach(() => {
    mockPool = createMockPool();
    mockSendAlert = vi.fn().mockResolvedValue(true);

    // Fresh require to reset lazy dependencies
    delete require.cache[require.resolve('../../src/engine/trust-scorer')];
    delete require.cache[require.resolve('../../src/engine/trust-ledger')];

    ledger = require('../../src/engine/trust-ledger');
    scorer = require('../../src/engine/trust-scorer');

    ledger._setPool(mockPool);
    scorer._setPool(mockPool);
    scorer._setSendAlert(mockSendAlert);
  });

  describe('getTrustLevel', () => {
    it('returns default confirm for unknown domain', async () => {
      mockPool._pushResult({ rows: [] });

      const level = await scorer.getTrustLevel('ikawn', 'some_new_domain');
      expect(level).toBe('confirm');
    });

    it('returns stored tier', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto' }] });

      const level = await scorer.getTrustLevel('ikawn', 'monitoring');
      expect(level).toBe('auto');
    });

    it('always returns review for client_facing regardless of stored value', async () => {
      // Should NOT even query the DB
      const level = await scorer.getTrustLevel('ikawn', 'client_facing');
      expect(level).toBe('review');
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAllDomains — promotion', () => {
    it('promotes to auto after meeting threshold (20 monitoring successes)', async () => {
      // 1. Get all unique domains
      mockPool._pushResult({ rows: [{ domain: 'monitoring' }] });
      // 2. getConsecutiveSuccesses query (via trust-ledger)
      mockPool._pushResult({ rows: Array.from({ length: 20 }, () => ({ outcome: 'success' })) });
      // 3. Get current trust_scores row
      mockPool._pushResult({ rows: [{ current_tier: 'confirm', last_evaluated: null }] });
      // 4. UPDATE to promote
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const changes = await scorer.evaluateAllDomains('ikawn');

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        domain: 'monitoring',
        from: 'confirm',
        to: 'auto',
        reason: 'promotion',
      });
    });

    it('does NOT promote below threshold (19 monitoring successes)', async () => {
      // 1. Get all unique domains
      mockPool._pushResult({ rows: [{ domain: 'monitoring' }] });
      // 2. getConsecutiveSuccesses
      mockPool._pushResult({ rows: Array.from({ length: 19 }, () => ({ outcome: 'success' })) });
      // 3. Get current trust_scores row
      mockPool._pushResult({ rows: [{ current_tier: 'confirm', last_evaluated: null }] });
      // 4. UPDATE (just eval timestamp, no tier change)
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const changes = await scorer.evaluateAllDomains('ikawn');

      expect(changes).toHaveLength(0);
    });
  });

  describe('evaluateAllDomains — demotion', () => {
    it('demotes auto to confirm on failure since last eval', async () => {
      const lastEval = new Date(Date.now() - 3600000).toISOString(); // 1h ago

      // 1. Get all unique domains
      mockPool._pushResult({ rows: [{ domain: 'staging_deploys' }] });
      // 2. getConsecutiveSuccesses — starts with failure
      mockPool._pushResult({ rows: [{ outcome: 'failure' }, { outcome: 'success' }] });
      // 3. Get current trust_scores row — currently auto
      mockPool._pushResult({ rows: [{ current_tier: 'auto', last_evaluated: lastEval }] });
      // 4. Check failures since last_evaluated
      mockPool._pushResult({ rows: [{ count: 1 }] });
      // 5. UPDATE to demote
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const changes = await scorer.evaluateAllDomains('ikawn');

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        domain: 'staging_deploys',
        from: 'auto',
        to: 'confirm',
        reason: 'demotion',
      });
    });
  });

  describe('evaluateAllDomains — client_facing NEVER auto', () => {
    it('client_facing stays at review even with 100 successes', async () => {
      // 1. Get all unique domains
      mockPool._pushResult({ rows: [{ domain: 'client_facing' }] });
      // 2. getConsecutiveSuccesses
      mockPool._pushResult({ rows: Array.from({ length: 100 }, () => ({ outcome: 'success' })) });
      // 3. Get current trust_scores row
      mockPool._pushResult({ rows: [{ current_tier: 'review', last_evaluated: null }] });
      // 4. UPDATE (just eval timestamp)
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const changes = await scorer.evaluateAllDomains('ikawn');

      // No promotion should occur
      expect(changes).toHaveLength(0);

      // Verify the UPDATE query did NOT set tier to 'auto'
      const updateCalls = mockPool.query.mock.calls.filter(c =>
        typeof c[0] === 'string' && c[0].includes('UPDATE trust_scores')
      );
      for (const call of updateCalls) {
        expect(call[0]).not.toContain("'auto'");
      }
    });
  });

  describe('checkImmediateDemotion', () => {
    it('demotes and sends alert when domain is auto with NEGLIGENCE failure', async () => {
      // 1. SELECT current_tier + score
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 0.7 }] });
      // 2. UPDATE to demote
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'NEGLIGENCE');

      // NEGLIGENCE weight=1.0, penalty=-0.2, newScore=0.5 < 0.6 threshold → demoted
      expect(result.demoted).toBe(true);
      expect(result.penalty).toBeCloseTo(-0.2);
      expect(result.newScore).toBeCloseTo(0.5);
      expect(mockSendAlert).toHaveBeenCalledTimes(1);
      expect(mockSendAlert.mock.calls[0][0]).toContain('Trust Demotion');
      expect(mockSendAlert.mock.calls[0][0]).toContain('monitoring');
    });

    it('does not demote on minor failure (EXTERNAL) with high score', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'auto', score: 1.0 }] });
      mockPool._pushResult({ rows: [], rowCount: 1 });

      const result = await scorer.checkImmediateDemotion('ikawn', 'monitoring', 'EXTERNAL');

      // EXTERNAL weight=0.3, penalty=-0.06, newScore=0.94 → no demotion
      expect(result.demoted).toBe(false);
      expect(result.newScore).toBeCloseTo(0.94);
      expect(mockSendAlert).not.toHaveBeenCalled();
    });

    it('does not demote when domain is confirm', async () => {
      mockPool._pushResult({ rows: [{ current_tier: 'confirm' }] });

      const result = await scorer.checkImmediateDemotion('ikawn', 'staging_deploys');

      expect(result).toEqual({ demoted: false });
      expect(mockSendAlert).not.toHaveBeenCalled();
    });

    it('does not demote when domain not found', async () => {
      mockPool._pushResult({ rows: [] });

      const result = await scorer.checkImmediateDemotion('ikawn', 'unknown_domain');

      expect(result).toEqual({ demoted: false });
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('THRESHOLDS', () => {
    it('client_facing threshold is Infinity', () => {
      expect(scorer.THRESHOLDS.client_facing).toBe(Infinity);
    });

    it('monitoring threshold is 20', () => {
      expect(scorer.THRESHOLDS.monitoring).toBe(20);
    });

    it('production_deploys threshold is 25', () => {
      expect(scorer.THRESHOLDS.production_deploys).toBe(25);
    });

    it('thresholds object is frozen', () => {
      expect(Object.isFrozen(scorer.THRESHOLDS)).toBe(true);
    });
  });
});
