'use strict';

const originalTool = require('../code-read.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'code_read',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root (e.g., src/routes/chat-api.js)' },
      offset: { type: 'number', description: 'Line number to start reading from (default: 1)' },
      limit: { type: 'number', description: 'Number of lines to read (default: 200, max: 500)' },
    },
    required: ['path'],
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
        { tool: 'code_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'code_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
