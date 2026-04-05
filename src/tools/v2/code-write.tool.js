'use strict';

const originalTool = require('../code-write.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'code_write',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root' },
      content: { type: 'string', description: 'Full file content to write' },
    },
    required: ['path', 'content'],
  },
  permissionTier: 'confirm',
  category: 'create',
  timeout: 60000,
  retryPolicy: DEFAULT_RETRY_POLICIES.create,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? (result.summary || result.error) : null,
        { tool: 'code_write', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'code_write', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
