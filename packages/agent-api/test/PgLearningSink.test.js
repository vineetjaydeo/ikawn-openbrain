'use strict';

const { PgLearningSink } = require('../src/engine/PgLearningSink.js');

function makeMockPool() {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (/RETURNING id/i.test(sql)) return { rows: [{ id: 1 }] };
      if (/SELECT/i.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe('PgLearningSink signal writes', () => {
  it('records edit_delta into learning_signals with kind=edit_delta', async () => {
    const pool = makeMockPool();
    const sink = new PgLearningSink({ pool });
    await sink.recordEditDelta('acme', 'turn_1', { type: 'caption_edit', before: 'a', after: 'b' });
    const insert = pool.calls.find((c) => /INSERT INTO learning_signals/i.test(c.sql));
    expect(insert.params[0]).toBe('acme');
    expect(insert.params[1]).toBe('turn_1');
    expect(insert.params[2]).toBe('edit_delta');
  });

  it('records tool_outcome and approval as separate kinds', async () => {
    const pool = makeMockPool();
    const sink = new PgLearningSink({ pool });
    await sink.recordToolOutcome('acme', 'turn_2', { tool: 'web_search', success: true });
    await sink.recordApproval('acme', 'turn_3', { approved: false });
    const inserts = pool.calls.filter((c) => /INSERT INTO learning_signals/i.test(c.sql));
    expect(inserts.map((c) => c.params[2])).toEqual(['tool_outcome', 'approval']);
  });
});

describe('PgLearningSink lessons', () => {
  it('writeLesson with brand scope sets cross_brand=false', async () => {
    const pool = makeMockPool();
    const sink = new PgLearningSink({ pool });
    await sink.writeLesson({ brand: 'acme' }, { agent: 'general', topic: 'tone', text: 'be concise', qualityScore: 0.8 });
    const insert = pool.calls.find((c) => /INSERT INTO lessons/i.test(c.sql));
    expect(insert.params[0]).toBe('acme');
    expect(insert.params[1]).toBe(false);
    expect(insert.params[2]).toBe('general');
    expect(insert.params[4]).toBe('be concise');
  });

  it('writeLesson with crossBrand scope sets cross_brand=true and brand=null', async () => {
    const pool = makeMockPool();
    const sink = new PgLearningSink({ pool });
    await sink.writeLesson({ crossBrand: true }, { agent: 'general', topic: 'safety', text: 'never reveal keys', qualityScore: 1.0 });
    const insert = pool.calls.find((c) => /INSERT INTO lessons/i.test(c.sql));
    expect(insert.params[0]).toBeNull();
    expect(insert.params[1]).toBe(true);
  });

  it('writeLesson throws on empty scope', async () => {
    const sink = new PgLearningSink({ pool: makeMockPool() });
    await expect(sink.writeLesson({}, { agent: 'a', topic: 't', text: 'x' }))
      .rejects.toThrow(/scope must specify brand or crossBrand/i);
  });

  it('readLessons filters by brand + agent and orders by quality_score desc, created_at desc', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementationOnce(async (_sql, _p) => ({ rows: [
      { id: 1, brand: 'acme', agent: 'general', topic: 't', text: 'lesson 1', quality_score: 0.9, created_at: new Date() },
    ] }));
    const sink = new PgLearningSink({ pool });
    const out = await sink.readLessons({ brand: 'acme', agent: 'general' }, 5);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('lesson 1');
    // Use vitest native call tracking — mockImplementationOnce replaces fn body so pool.calls is empty
    const [selectSql] = pool.query.mock.calls[0];
    expect(selectSql).toMatch(/cross_brand = false/i);
    expect(selectSql).toMatch(/ORDER BY quality_score DESC, created_at DESC/i);
  });
});
