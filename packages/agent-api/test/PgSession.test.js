'use strict';

const { PgSession } = require('../src/engine/PgSession.js');
const { createRunState, SCHEMA_VERSION } = require('../src/engine/runState.js');

function makeMockPool() {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      // Default returns empty rows; specific tests override.
      if (/SELECT .* FROM agent_run_states/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

describe('PgSession.load', () => {
  it('returns null when no row exists', async () => {
    const pool = makeMockPool();
    const session = new PgSession({ pool, captureMessage: vi.fn() });
    const out = await session.load('c1');
    expect(out).toBeNull();
    expect(pool.calls[0].sql).toMatch(/SELECT/i);
    expect(pool.calls[0].sql).toMatch(/agent_run_states/i);
  });

  it('deserializes the state JSONB and returns the RunState', async () => {
    const pool = makeMockPool();
    const stored = createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'g' });
    pool.query.mockImplementationOnce(async () => ({
      rows: [{ state: stored, schema_version: SCHEMA_VERSION }],
    }));
    const session = new PgSession({ pool, captureMessage: vi.fn() });
    const out = await session.load('c1');
    expect(out).toMatchObject({ conversationId: 'c1', brand: 'acme' });
  });

  it('rejects mismatched schema_version', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementationOnce(async () => ({
      rows: [{ state: { schemaVersion: '0.9' }, schema_version: '0.9' }],
    }));
    const session = new PgSession({ pool, captureMessage: vi.fn() });
    await expect(session.load('c1')).rejects.toThrow(/schema_version/i);
  });
});

describe('PgSession.save', () => {
  it('upserts a row keyed by conversation_id', async () => {
    const pool = makeMockPool();
    const session = new PgSession({ pool, captureMessage: vi.fn() });
    const state = createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'g' });
    await session.save(state);
    const upsert = pool.calls.find((c) => /INSERT INTO agent_run_states/i.test(c.sql));
    expect(upsert).toBeDefined();
    expect(upsert.sql).toMatch(/ON CONFLICT \(conversation_id\) DO UPDATE/i);
    expect(upsert.params[0]).toBe('c1');
    expect(upsert.params[1]).toBe('acme');
  });
});

describe('PgSession.appendItem', () => {
  it('routes user_message through captureMessage with channel=web direction=inbound', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementationOnce(async () => ({
      rows: [{
        state: createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'g' }),
        schema_version: SCHEMA_VERSION,
      }],
    }));
    const captureSpy = vi.fn(async () => 999);
    const session = new PgSession({ pool, captureMessage: captureSpy });
    await session.appendItem('c1', { type: 'user_message', content: 'hi', ts: 1 });
    expect(captureSpy).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'web',
      direction: 'inbound',
      content: 'hi',
      brand_id: 'acme',
    }));
  });

  it('routes assistant_message through captureMessage with direction=outbound', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementationOnce(async () => ({
      rows: [{
        state: createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'g' }),
        schema_version: SCHEMA_VERSION,
      }],
    }));
    const captureSpy = vi.fn(async () => 1000);
    const session = new PgSession({ pool, captureMessage: captureSpy });
    await session.appendItem('c1', { type: 'assistant_message', content: 'hello', ts: 2 });
    expect(captureSpy).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'web',
      direction: 'outbound',
      content: 'hello',
    }));
  });

  it('does NOT call captureMessage for tool_call / tool_result / denial / approval_pending / tool_async_pending', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementation(async () => ({
      rows: [{
        state: createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'g' }),
        schema_version: SCHEMA_VERSION,
      }],
    }));
    const captureSpy = vi.fn();
    const session = new PgSession({ pool, captureMessage: captureSpy });
    for (const t of ['tool_call', 'tool_result', 'denial', 'approval_pending', 'tool_async_pending']) {
      await session.appendItem('c1', { type: t, ts: 1 });
    }
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('throws when conversation row does not exist', async () => {
    const pool = makeMockPool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const session = new PgSession({ pool, captureMessage: vi.fn() });
    await expect(session.appendItem('missing', { type: 'user_message', content: 'x', ts: 1 }))
      .rejects.toThrow(/no such conversation/);
  });
});
