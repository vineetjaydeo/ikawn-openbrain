'use strict';

const originalTool = require('../notify.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'notify',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to send (HTML supported)' },
      channel: { type: 'string', description: 'Channel: telegram or web', enum: ['telegram', 'web'] },
      conversation_id: { type: 'string', description: 'Conversation ID for rate limiting' },
    },
    required: ['message'],
  },
  permissionTier: 'confirm',
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
        { tool: 'notify', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'notify', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
