'use strict';

const { vectorSearch } = require('../../src/tools/vectorSearch.js');

function ctxWithDeps({ rows = [], embedding = [0.1, 0.2, 0.3] } = {}) {
  return {
    brandContext: { brand: 'acme', isolationToken: 'tok' },
    deps: {
      vectorSearch: {
        getEmbedding: async (q) => {
          if (q === 'fail') return null;
          return embedding;
        },
        query: async (sql, params) => ({ rows }),
      },
    },
  };
}

describe('vector_search tool', () => {
  it('has the locked schema name and reliability profile', () => {
    expect(vectorSearch.name).toBe('vector_search');
    expect(vectorSearch.mode).toBe('sync');
    expect(vectorSearch.timeoutMs).toBe(5000);
    expect(vectorSearch.retry.maxAttempts).toBe(0);
    expect(vectorSearch.needsApproval).toBe(false);
  });

  it('executes against deps.vectorSearch.query and returns items', async () => {
    const ctx = ctxWithDeps({
      rows: [
        { id: 'm1', similarity: 0.92, content: 'first' },
        { id: 'm2', similarity: 0.84, content: 'second' },
      ],
    });
    const out = await vectorSearch.execute({ query: 'topic', limit: 5 }, ctx);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toEqual({ id: 'm1', score: 0.92, text: 'first' });
    expect(out.truncated).toBe(false);
  });

  it('marks truncated=true when rows >= limit', async () => {
    const ctx = ctxWithDeps({
      rows: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, similarity: 0.5, content: `r${i}` })),
    });
    const out = await vectorSearch.execute({ query: 'topic', limit: 5 }, ctx);
    expect(out.truncated).toBe(true);
  });

  it('falls back to text-LIKE when embedding returns null', async () => {
    const ctx = ctxWithDeps({ rows: [{ id: 'm9', similarity: 0.5, content: 'x' }] });
    const out = await vectorSearch.execute({ query: 'fail', limit: 3 }, ctx);
    expect(out.items[0]).toEqual({ id: 'm9', score: 0.5, text: 'x' });
  });

  it('passes brand and isolationToken into the SQL params', async () => {
    let capturedSql;
    let capturedParams;
    const ctx = {
      brandContext: { brand: 'acme', isolationToken: 'tok-acme' },
      deps: {
        vectorSearch: {
          getEmbedding: async () => [0.1],
          query: async (sql, params) => {
            capturedSql = sql;
            capturedParams = params;
            return { rows: [] };
          },
        },
      },
    };
    await vectorSearch.execute({ query: 'topic', limit: 3 }, ctx);
    expect(capturedParams).toEqual(expect.arrayContaining(['acme']));
  });
});
