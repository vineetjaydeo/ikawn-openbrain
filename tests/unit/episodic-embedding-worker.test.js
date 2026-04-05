'use strict';

const {
  processUnembeddedEpisodic,
  _setPool,
  _setGetEmbedding,
} = require('../../src/workers/episodic-embedding-worker');

// Mock embedding: returns a 768-dim vector of the row index value
function mockEmbedding(text) {
  return Promise.resolve(new Array(768).fill(0.123));
}

function makeMockPool(rows = []) {
  const queryFn = vi.fn();
  // Default: SELECT returns rows, UPDATE succeeds
  queryFn.mockImplementation((sql) => {
    if (sql.includes('SELECT')) {
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
  return { query: queryFn };
}

describe('episodic-embedding-worker', () => {
  beforeEach(() => {
    _setGetEmbedding(mockEmbedding);
  });

  it('processes unembedded rows and stores embedding as JSON text', async () => {
    const mockRows = [
      { id: 1, content: 'Hello world' },
      { id: 2, content: 'Second memory' },
      { id: 3, content: 'Third memory' },
    ];
    const pool = makeMockPool(mockRows);
    _setPool(pool);

    const result = await processUnembeddedEpisodic();

    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);

    // Verify UPDATE calls with JSON array text
    const updateCalls = pool.query.mock.calls.filter(c => c[0].includes('UPDATE'));
    expect(updateCalls).toHaveLength(3);

    for (const call of updateCalls) {
      const embeddingText = call[1][0];
      // Should be valid JSON array
      const parsed = JSON.parse(embeddingText);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(768);
    }
  });

  it('returns zero processed when no unembedded rows exist', async () => {
    const pool = makeMockPool([]);
    _setPool(pool);

    const result = await processUnembeddedEpisodic();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);

    // Only the SELECT query should have been called
    const updateCalls = pool.query.mock.calls.filter(c => c[0].includes('UPDATE'));
    expect(updateCalls).toHaveLength(0);
  });

  it('handles embedding failure gracefully — skips failed, processes others', async () => {
    const mockRows = [
      { id: 1, content: 'Good memory' },
      { id: 2, content: 'Bad memory' },
      { id: 3, content: 'Another good memory' },
    ];
    const pool = makeMockPool(mockRows);
    _setPool(pool);

    let callCount = 0;
    _setGetEmbedding(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('API error'));
      return Promise.resolve(new Array(768).fill(0.5));
    });

    const result = await processUnembeddedEpisodic();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);

    // Only 2 UPDATE calls (the failed one is skipped)
    const updateCalls = pool.query.mock.calls.filter(c => c[0].includes('UPDATE'));
    expect(updateCalls).toHaveLength(2);
  });

  it('stores embedding as serialized JSON array text (not pgvector format)', async () => {
    const mockRows = [{ id: 1, content: 'Test' }];
    const pool = makeMockPool(mockRows);
    _setPool(pool);

    const vector = [0.1, 0.2, 0.3];
    _setGetEmbedding(() => Promise.resolve(vector));

    await processUnembeddedEpisodic();

    const updateCalls = pool.query.mock.calls.filter(c => c[0].includes('UPDATE'));
    expect(updateCalls).toHaveLength(1);

    const storedEmbedding = updateCalls[0][1][0];
    // Should be JSON format '[0.1,0.2,0.3]', not pgvector format '[0.1, 0.2, 0.3]'
    expect(storedEmbedding).toBe(JSON.stringify(vector));
    // Verify it's valid JSON
    expect(JSON.parse(storedEmbedding)).toEqual(vector);
  });

  it('queries only rows WHERE embedding IS NULL', async () => {
    const pool = makeMockPool([]);
    _setPool(pool);

    await processUnembeddedEpisodic();

    const selectCall = pool.query.mock.calls.find(c => c[0].includes('SELECT'));
    expect(selectCall[0]).toContain('WHERE embedding IS NULL');
  });
});
