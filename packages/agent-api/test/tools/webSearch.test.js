'use strict';

const { webSearch } = require('../../src/tools/webSearch.js');

function ctxWithDeps(rows) {
  return {
    brandContext: { brand: 'acme' },
    deps: { webSearch: { searchWeb: async () => rows } },
  };
}

describe('web_search tool', () => {
  it('has locked reliability profile (sync, 15s, 1 retry)', () => {
    expect(webSearch.name).toBe('web_search');
    expect(webSearch.mode).toBe('sync');
    expect(webSearch.timeoutMs).toBe(15000);
    expect(webSearch.retry.maxAttempts).toBe(1);
    expect(webSearch.needsApproval).toBe(false);
  });

  it('returns rows from deps.webSearch.searchWeb', async () => {
    const ctx = ctxWithDeps([
      { title: 'A', url: 'https://a.example', snippet: 'a snip' },
      { title: 'B', url: 'https://b.example', snippet: 'b snip' },
    ]);
    const out = await webSearch.execute({ query: 'latest news', count: 5 }, ctx);
    expect(out.items).toEqual([
      { title: 'A', url: 'https://a.example', snippet: 'a snip' },
      { title: 'B', url: 'https://b.example', snippet: 'b snip' },
    ]);
  });

  it('returns empty items when searchWeb returns []', async () => {
    const out = await webSearch.execute({ query: 'q', count: 3 }, ctxWithDeps([]));
    expect(out.items).toEqual([]);
  });

  it('passes query and count into the dep call', async () => {
    let captured;
    const ctx = {
      brandContext: { brand: 'acme' },
      deps: { webSearch: { searchWeb: async (q, n) => { captured = { q, n }; return []; } } },
    };
    await webSearch.execute({ query: 'foo', count: 7 }, ctx);
    expect(captured).toEqual({ q: 'foo', n: 7 });
  });

  it('count defaults to 5 when omitted', async () => {
    let captured;
    const ctx = {
      brandContext: { brand: 'acme' },
      deps: { webSearch: { searchWeb: async (q, n) => { captured = n; return []; } } },
    };
    await webSearch.execute({ query: 'foo' }, ctx);
    expect(captured).toBe(5);
  });
});
