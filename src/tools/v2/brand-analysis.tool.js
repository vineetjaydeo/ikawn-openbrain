'use strict';

const originalTool = require('../brand-analysis.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'brand_analysis',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The brand website URL to analyze' },
      brand_type: {
        type: 'string',
        description: 'Brand type hint: product, service, saas, agency, personal, hybrid (default: hybrid)',
        enum: ['product', 'service', 'saas', 'agency', 'personal', 'hybrid'],
      },
      confirm: { type: 'boolean', description: 'Set to true to execute the analysis. If false or omitted, returns a confirmation prompt instead.' },
    },
    required: ['url'],
  },
  permissionTier: 'confirm',
  category: 'analyze',
  timeout: 120000,
  retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
  async execute(input, context) {
    const start = Date.now();
    try {
      const result = await originalTool.execute(input, context);
      return createEnvelope(
        result.success !== false,
        result.data,
        result.success === false ? result.summary : null,
        { tool: 'brand_analysis', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'brand_analysis', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
