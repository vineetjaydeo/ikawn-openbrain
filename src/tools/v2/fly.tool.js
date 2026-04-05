'use strict';

const originalTool = require('../fly.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'fly_status',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'Fly app name (default: ikawn-openbrain)' },
    },
    required: [],
  },
  permissionTier: 'auto',
  category: 'observe',
  timeout: 30000,
  retryPolicy: DEFAULT_RETRY_POLICIES.observe,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'fly_status', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'fly_status', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
