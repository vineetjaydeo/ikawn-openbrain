'use strict';

const originalTool = require('../content.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'content_draft',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'What to write about' },
      platform: { type: 'string', description: 'Target platform', enum: ['instagram', 'twitter', 'linkedin', 'general'] },
      tone: { type: 'string', description: 'Tone override' },
      count: { type: 'number', description: 'Number of variations (default: 3)' },
    },
    required: ['topic'],
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
        { tool: 'content_draft', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'content_draft', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
