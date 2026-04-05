'use strict';

const originalTool = require('../ikawn-os.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'ikawn_generate',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent', enum: ['genie', 'remix', 'prism', 'lazarus'] },
      prompt: { type: 'string', description: 'Generation prompt' },
      image_url: { type: 'string', description: 'Input image URL (for remix/prism/lazarus)' },
    },
    required: ['agent', 'prompt'],
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
        { tool: 'ikawn_generate', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'ikawn_generate', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
