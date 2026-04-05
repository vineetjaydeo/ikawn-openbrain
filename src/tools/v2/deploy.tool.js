'use strict';

const originalTool = require('../deploy.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'deploy_openbrain',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'Fly app name. Only ikawn-openbrain (Lucy) is allowed.' },
      reason: { type: 'string', description: 'Why this deploy is happening (logged to memory)' },
      skip_tests: { type: 'boolean', description: 'Skip pre-deploy checks. Default: false. Strongly discouraged.' },
    },
    required: ['reason'],
  },
  permissionTier: 'review',
  category: 'execute',
  timeout: 300000,
  retryPolicy: DEFAULT_RETRY_POLICIES.execute,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'deploy_openbrain', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'deploy_openbrain', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
