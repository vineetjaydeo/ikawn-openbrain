'use strict';

const originalTool = require('../ga.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'ga_report',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Days of data (default: 7)' },
      property_id: { type: 'string', description: 'GA4 property ID' },
    },
    required: [],
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
        { tool: 'ga_report', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'ga_report', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
