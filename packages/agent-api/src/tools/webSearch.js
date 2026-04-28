'use strict';

const { z } = require('zod');
const { defineTool } = require('./defineTool.js');

const webSearch = defineTool({
  name: 'web_search',
  description: 'Search the public web (Brave Search) for recent or factual information.',
  parameters: z.object({
    query: z.string().min(1),
    count: z.number().int().min(1).max(20).default(5),
  }),
  output: z.object({
    items: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  mode: 'sync',
  concurrency: 'safe',
  needsApproval: false,
  timeoutMs: 15000,
  retry: { maxAttempts: 1 },
  async execute(input, ctx) {
    const deps = ctx.deps && ctx.deps.webSearch;
    if (!deps) throw new Error('web_search requires ctx.deps.webSearch = { searchWeb }');
    const count = input.count !== undefined ? input.count : 5;
    const rows = await deps.searchWeb(input.query, count);
    return {
      items: (rows || []).map((r) => ({
        title: String(r.title || ''),
        url: String(r.url || ''),
        snippet: String(r.snippet || ''),
      })),
    };
  },
});

module.exports = { webSearch };
