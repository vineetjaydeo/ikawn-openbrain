const { vi } = require('vitest');

/**
 * Creates a mock Postgres pool that records queries and returns configurable results.
 */
function createMockPool() {
  const queries = [];
  const mockResults = new Map();
  const defaultResult = { rows: [], rowCount: 0 };

  const pool = {
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      for (const [pattern, result] of mockResults) {
        if (typeof pattern === 'string' && text.includes(pattern)) {
          return typeof result === 'function' ? result(text, params) : result;
        }
        if (pattern instanceof RegExp && pattern.test(text)) {
          return typeof result === 'function' ? result(text, params) : result;
        }
      }
      return defaultResult;
    }),
    connect: vi.fn(async () => ({
      query: pool.query,
      release: vi.fn(),
    })),
    end: vi.fn(),
  };

  return {
    pool,
    getQueries: () => queries,
    clearQueries: () => { queries.length = 0; },
    mockQuery: (pattern, result) => mockResults.set(pattern, result),
    clearMocks: () => mockResults.clear(),
  };
}

module.exports = { createMockPool };
