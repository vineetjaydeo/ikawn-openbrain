// src/tools/recall.tool.js
'use strict';

const { recall } = require('../utils/recall');

module.exports = {
  name: 'search_memory',
  description: 'Search through stored memories, decisions, conversations, and knowledge. Use when the user asks about past events, decisions, or context that may be in memory.',
  tier: 'direct',
  parameters: {
    query: { type: 'string', required: true, description: 'Natural language search query' },
    limit: { type: 'number', required: false, description: 'Max results to return (default 8)' },
    domain: { type: 'string', required: false, description: 'Filter by domain: marketing, product, content, analytics, operations, strategy, customer, technical' },
  },
  async execute(config, context) {
    const query = config.query;
    if (!query) {
      return { success: false, data: null, summary: 'Missing required parameter: query' };
    }

    const result = await recall({
      brandId: context.brandId || 'ikawn',
      userId: context.userId,
      query,
      limit: config.limit || 8,
      domain: config.domain,
    });

    if (result.memories.length === 0) {
      return { success: true, data: [], summary: 'No relevant memories found for this query.' };
    }

    const formatted = result.memories.map((m, i) => {
      const date = new Date(m.lastUpdated).toLocaleDateString();
      return `[${i + 1}] (${m.memoryType}, ${m.source}, ${date}) ${m.content.slice(0, 500)}`;
    }).join('\n\n');

    return {
      success: true,
      data: result.memories,
      summary: `Found ${result.memories.length} relevant memories:\n\n${formatted}`,
    };
  },
};
