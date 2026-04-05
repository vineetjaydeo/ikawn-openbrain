// vitest globals enabled
'use strict';

const sessionManager = require('../../src/engine/session-manager');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
sessionManager._setPool({ query: mockQuery });

const FAKE_SESSION = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  brand_id: 'ikawn',
  user_id: null,
  model_tier: 'balanced',
  status: 'active',
  working_memory: {},
  resume_token: null,
  total_tokens_in: 0,
  total_tokens_out: 0,
  total_cost_usd: 0,
  dollar_cap: null,
  turn_count: 0,
  tool_call_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('session-manager', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('create', () => {
    it('inserts session with defaults', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [FAKE_SESSION], rowCount: 1 });
      const session = await sessionManager.create({ brandId: 'ikawn' });
      expect(session.id).toBe(FAKE_SESSION.id);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO sessions');
      expect(mockQuery.mock.calls[0][0]).toContain('RETURNING');
    });

    it('passes all config fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_SESSION, model_tier: 'deep', dollar_cap: 5.0 }], rowCount: 1 });
      const session = await sessionManager.create({ brandId: 'ikawn', userId: 'user-1', modelTier: 'deep', dollarCap: 5.0 });
      expect(session.model_tier).toBe('deep');
    });
  });

  describe('get', () => {
    it('returns session by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [FAKE_SESSION] });
      const session = await sessionManager.get(FAKE_SESSION.id);
      expect(session.id).toBe(FAKE_SESSION.id);
    });

    it('returns null for non-existent session', async () => {
      const session = await sessionManager.get('nonexistent');
      expect(session).toBeNull();
    });
  });

  describe('suspend', () => {
    it('sets status to suspended and generates resume_token', async () => {
      mockQuery.mockImplementationOnce(async (text, params) => ({
        rows: [{ ...FAKE_SESSION, status: 'suspended', resume_token: params[2], working_memory: params[1] }],
        rowCount: 1,
      }));
      const session = await sessionManager.suspend(FAKE_SESSION.id, { key: 'value' });
      expect(session.status).toBe('suspended');
      expect(session.resume_token).toBeTruthy();
    });

    it('throws on non-existent session', async () => {
      await expect(sessionManager.suspend('nonexistent', {})).rejects.toThrow('Session not found');
    });
  });

  describe('resume', () => {
    it('restores session to active and clears resume_token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_SESSION, status: 'active', resume_token: null }], rowCount: 1 });
      const session = await sessionManager.resume('some-token');
      expect(session.status).toBe('active');
      expect(session.resume_token).toBeNull();
    });

    it('throws on invalid resume token', async () => {
      await expect(sessionManager.resume('bad-token')).rejects.toThrow('No session found for resume token');
    });
  });

  describe('complete', () => {
    it('sets status to completed with summary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_SESSION, status: 'completed', summary: 'Done' }], rowCount: 1 });
      const session = await sessionManager.complete(FAKE_SESSION.id, 'Done');
      expect(session.status).toBe('completed');
    });
  });

  describe('fail', () => {
    it('sets status to failed with error message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...FAKE_SESSION, status: 'failed', error: 'boom' }], rowCount: 1 });
      const session = await sessionManager.fail(FAKE_SESSION.id, new Error('boom'));
      expect(session.status).toBe('failed');
    });
  });

  describe('updateCost', () => {
    it('uses atomic increment SQL', async () => {
      await sessionManager.updateCost(FAKE_SESSION.id, 100, 50, 0.001);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('total_tokens_in = total_tokens_in + $2');
      expect(sql).toContain('total_tokens_out = total_tokens_out + $3');
      expect(sql).toContain('total_cost_usd = total_cost_usd + $4');
      expect(params).toEqual([FAKE_SESSION.id, 100, 50, 0.001]);
    });
  });

  describe('listActive', () => {
    it('returns active and suspended sessions for brand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [FAKE_SESSION, { ...FAKE_SESSION, status: 'suspended' }] });
      const sessions = await sessionManager.listActive('ikawn');
      expect(sessions).toHaveLength(2);
      expect(mockQuery.mock.calls[0][0]).toContain("('active', 'suspended')");
    });
  });
});
