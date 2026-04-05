'use strict';

const originalTool = require('../bash.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'bash_exec',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
    },
    required: ['command'],
  },
  permissionTier: 'confirm',
  category: 'execute',
  timeout: 120000,
  retryPolicy: DEFAULT_RETRY_POLICIES.execute,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'bash_exec', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'bash_exec', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
