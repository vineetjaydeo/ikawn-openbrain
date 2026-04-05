'use strict';

const originalTool = require('../code-edit.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'code_edit',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to project root' },
      old_string: { type: 'string', description: 'The exact string to find and replace' },
      new_string: { type: 'string', description: 'The replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
    },
    required: ['path', 'old_string', 'new_string'],
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
        result.success === false ? result.summary : null,
        { tool: 'code_edit', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'code_edit', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
