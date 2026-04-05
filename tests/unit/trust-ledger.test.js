'use strict';

const { logTrustEvent, getDomainForTool, determineOutcome, getConsecutiveSuccesses, _setPool } = require('../../src/engine/trust-ledger');

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

describe('trust-ledger', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    _setPool(mockPool);
  });

  describe('logTrustEvent', () => {
    it('inserts record and returns it', async () => {
      const fakeRow = {
        id: 1,
        brand_id: 'ikawn',
        domain: 'monitoring',
        action_type: 'fly_status',
        outcome: 'success',
        session_id: null,
        tool_name: 'fly_status',
        detail: null,
        created_at: new Date().toISOString(),
      };
      mockPool._pushResult({ rows: [fakeRow] });

      const result = await logTrustEvent({
        brandId: 'ikawn',
        domain: 'monitoring',
        actionType: 'fly_status',
        outcome: 'success',
        toolName: 'fly_status',
      });

      expect(result).toEqual(fakeRow);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query.mock.calls[0][0]).toContain('INSERT INTO trust_ledger');
      expect(mockPool.query.mock.calls[0][1]).toContain('ikawn');
      expect(mockPool.query.mock.calls[0][1]).toContain('monitoring');
      expect(mockPool.query.mock.calls[0][1]).toContain('success');
    });
  });

  describe('getDomainForTool', () => {
    it('maps deploy_staging to staging_deploys', () => {
      expect(getDomainForTool('deploy_staging')).toBe('staging_deploys');
    });

    it('maps code_write to code_changes', () => {
      expect(getDomainForTool('code_write')).toBe('code_changes');
    });

    it('maps code_edit to code_changes', () => {
      expect(getDomainForTool('code_edit')).toBe('code_changes');
    });

    it('maps bash_exec to code_changes', () => {
      expect(getDomainForTool('bash_exec')).toBe('code_changes');
    });

    it('maps notify to client_facing', () => {
      expect(getDomainForTool('notify')).toBe('client_facing');
    });

    it('maps gmail_send to client_facing', () => {
      expect(getDomainForTool('gmail_send')).toBe('client_facing');
    });

    it('maps gmail_draft to client_facing', () => {
      expect(getDomainForTool('gmail_draft')).toBe('client_facing');
    });

    it('maps deploy_production to production_deploys', () => {
      expect(getDomainForTool('deploy_production')).toBe('production_deploys');
    });

    it('maps deploy_openbrain to production_deploys', () => {
      expect(getDomainForTool('deploy_openbrain')).toBe('production_deploys');
    });

    it('maps fly_status to monitoring', () => {
      expect(getDomainForTool('fly_status')).toBe('monitoring');
    });

    it('maps system_status to monitoring', () => {
      expect(getDomainForTool('system_status')).toBe('monitoring');
    });

    it('maps unknown tools to general', () => {
      expect(getDomainForTool('some_random_tool')).toBe('general');
    });
  });

  describe('determineOutcome', () => {
    it('returns success when ok is true', () => {
      expect(determineOutcome({ ok: true, data: {} })).toBe('success');
    });

    it('returns failure when ok is false', () => {
      expect(determineOutcome({ ok: false, error: 'boom' })).toBe('failure');
    });

    it('returns failure for null', () => {
      expect(determineOutcome(null)).toBe('failure');
    });

    it('returns failure for undefined', () => {
      expect(determineOutcome(undefined)).toBe('failure');
    });
  });

  describe('getConsecutiveSuccesses', () => {
    it('counts 5 successes then failure as 5', async () => {
      const rows = [
        { outcome: 'success' },
        { outcome: 'success' },
        { outcome: 'success' },
        { outcome: 'success' },
        { outcome: 'success' },
        { outcome: 'failure' },
        { outcome: 'success' },
      ];
      mockPool._pushResult({ rows });

      const count = await getConsecutiveSuccesses('ikawn', 'monitoring');
      expect(count).toBe(5);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query.mock.calls[0][1]).toEqual(['ikawn', 'monitoring']);
    });

    it('counts all successes when no failures', async () => {
      const rows = Array.from({ length: 30 }, () => ({ outcome: 'success' }));
      mockPool._pushResult({ rows });

      const count = await getConsecutiveSuccesses('ikawn', 'code_changes');
      expect(count).toBe(30);
    });

    it('returns 0 when most recent is failure', async () => {
      mockPool._pushResult({ rows: [{ outcome: 'failure' }, { outcome: 'success' }] });

      const count = await getConsecutiveSuccesses('ikawn', 'staging_deploys');
      expect(count).toBe(0);
    });

    it('returns 0 for empty ledger', async () => {
      mockPool._pushResult({ rows: [] });

      const count = await getConsecutiveSuccesses('ikawn', 'general');
      expect(count).toBe(0);
    });
  });
});
