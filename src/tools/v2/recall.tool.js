'use strict';

const originalTool = require('../recall.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'search_memory',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      limit: { type: 'number', description: 'Max results to return (default 8)' },
    },
    required: ['query'],
  },
  permissionTier: 'auto',
  category: 'analyze',
  timeout: 60000,
  retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'search_memory', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'search_memory', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
