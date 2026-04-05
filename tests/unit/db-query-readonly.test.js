// Tests for db-query-readonly.tool.js
'use strict';

describe('db_query_readonly tool', () => {
  let tool;
  let mockClient;
  let mockPool;

  beforeEach(() => {
    vi.resetModules();

    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      release: vi.fn(),
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    tool = require('../../src/tools/v2/db-query-readonly.tool.js');
    tool._setPool(mockPool);
  });

  // ── Validation: allowed queries ─────────────────────────────────────

  it('SELECT passes validation and executes', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] }) // SET statement_timeout
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1, fields: [{ name: 'id' }] });

    const result = await tool.execute({ query: 'SELECT id FROM memories LIMIT 5' });

    expect(result.ok).toBe(true);
    expect(result.data.rows).toEqual([{ id: 1 }]);
    expect(result.data.rowCount).toBe(1);
    expect(result.data.fields).toEqual(['id']);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('WITH (CTE) is allowed', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }], rowCount: 1, fields: [{ name: 'cnt' }] });

    const result = await tool.execute({ query: 'WITH t AS (SELECT 1) SELECT * FROM t' });

    expect(result.ok).toBe(true);
    expect(result.data.rows).toEqual([{ cnt: 5 }]);
  });

  it('EXPLAIN is allowed', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ 'QUERY PLAN': 'Seq Scan' }], rowCount: 1, fields: [{ name: 'QUERY PLAN' }] });

    const result = await tool.execute({ query: 'EXPLAIN SELECT 1' });

    expect(result.ok).toBe(true);
    expect(result.data.rows).toHaveLength(1);
  });

  // ── Validation: rejected queries ────────────────────────────────────

  it('INSERT is rejected without executing', async () => {
    const result = await tool.execute({ query: 'INSERT INTO memories (content) VALUES (\'test\')' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must start with SELECT|forbidden/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('UPDATE is rejected', async () => {
    const result = await tool.execute({ query: 'UPDATE memories SET content = \'x\'' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must start with SELECT|forbidden/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('DELETE is rejected', async () => {
    const result = await tool.execute({ query: 'DELETE FROM memories WHERE id = 1' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must start with SELECT|forbidden/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('DROP is rejected', async () => {
    const result = await tool.execute({ query: 'DROP TABLE memories' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must start with SELECT|forbidden/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('Multi-statement injection is rejected', async () => {
    const result = await tool.execute({ query: 'SELECT 1; DROP TABLE users' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/multi-statement/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  // ── Truncation ──────────────────────────────────────────────────────

  it('truncates results at 100 rows', async () => {
    const manyRows = Array.from({ length: 150 }, (_, i) => ({ id: i }));
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockResolvedValueOnce({ rows: manyRows, rowCount: 150, fields: [{ name: 'id' }] });

    const result = await tool.execute({ query: 'SELECT id FROM memories' });

    expect(result.ok).toBe(true);
    expect(result.data.rows).toHaveLength(100);
    expect(result.data.rowCount).toBe(150);
    expect(result.metadata.truncated).toBe(true);
  });

  // ── Statement timeout ───────────────────────────────────────────────

  it('sets statement_timeout before executing the query', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] });

    await tool.execute({ query: 'SELECT 1' });

    expect(mockClient.query).toHaveBeenCalledTimes(2);
    expect(mockClient.query.mock.calls[0][0]).toBe("SET statement_timeout = '30s'");
    expect(mockClient.query.mock.calls[1][0]).toBe('SELECT 1');
  });

  // ── Client release on error ─────────────────────────────────────────

  it('releases client even on query error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
      .mockRejectedValueOnce(new Error('relation does not exist'));

    const result = await tool.execute({ query: 'SELECT * FROM nonexistent' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/relation does not exist/);
    expect(mockClient.release).toHaveBeenCalled();
  });

  // ── Validation helper direct tests ──────────────────────────────────

  describe('validateQuery', () => {
    it('rejects empty input', () => {
      expect(tool.validateQuery('').valid).toBe(false);
      expect(tool.validateQuery(null).valid).toBe(false);
      expect(tool.validateQuery(undefined).valid).toBe(false);
    });

    it('allows keywords inside string literals', () => {
      // "INSERT" inside a string literal should not trigger rejection
      const result = tool.validateQuery("SELECT * FROM memories WHERE content = 'INSERT INTO foo'");
      expect(result.valid).toBe(true);
    });

    it('rejects SELECT with subquery containing DELETE', () => {
      const result = tool.validateQuery('SELECT * FROM (DELETE FROM memories RETURNING *)');
      expect(result.valid).toBe(false);
    });
  });
});
