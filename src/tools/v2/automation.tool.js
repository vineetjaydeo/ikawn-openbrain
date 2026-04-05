'use strict';

const originalTool = require('../automation.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'manage_automation',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['list_flows', 'get_flow', 'get_flow_runs', 'get_run_details', 'get_flow_metrics', 'toggle_flow', 'update_flow', 'rollback_flow', 'update_flow_config'],
      },
      flow_id: { type: 'string', description: 'ActivePieces flow ID (required for most actions)' },
      flow_config: { type: 'object', description: 'For update_flow_config: the config object to set' },
      run_id: { type: 'string', description: 'Flow run ID (for get_run_details)' },
      enabled: { type: 'boolean', description: 'Enable/disable flow (for toggle_flow)' },
      status_filter: { type: 'string', description: 'Filter runs by status: SUCCEEDED, FAILED, RUNNING' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
      period: { type: 'string', description: 'Time period for metrics: 24h, 7d, 30d (default 7d)' },
      changes: { type: 'string', description: 'JSON string of flow definition changes (for update_flow)' },
      reason: { type: 'string', description: 'Reason for update/rollback' },
      version: { type: 'number', description: 'Target version number (for rollback_flow)' },
    },
    required: ['action'],
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
        { tool: 'manage_automation', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'manage_automation', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
