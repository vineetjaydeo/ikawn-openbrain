'use strict';

const originalTool = require('../gmail.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'gmail_read',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Gmail search query (default: is:unread in:inbox)' },
      max_results: { type: 'number', description: 'Max messages (default: 10)' },
    },
    required: [],
  },
  permissionTier: 'auto',
  category: 'communicate',
  timeout: 30000,
  retryPolicy: DEFAULT_RETRY_POLICIES.communicate,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'gmail_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'gmail_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
