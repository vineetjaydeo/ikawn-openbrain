'use strict';

const originalTool = require('../calendar.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'calendar_read',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      hours: { type: 'number', description: 'Hours ahead to fetch (default: 24)' },
      calendar_id: { type: 'string', description: 'Calendar ID (default: primary)' },
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
        { tool: 'calendar_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'calendar_read', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
