'use strict';

const originalTool = require('../manage-task.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'manage_task',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action', enum: ['create', 'list', 'enable', 'disable', 'delete', 'run_now', 'continue', 'update'] },
      task_uuid: { type: 'string', description: 'Task UUID (for enable/disable/delete/run_now/update)' },
      name: { type: 'string', description: 'Task name (for create)' },
      tool: { type: 'string', description: 'Tool to execute. Use "agent" for research/complex tasks.' },
      agent_slug: { type: 'string', description: 'Agent slug (default: ruhi)' },
      tier: { type: 'string', description: 'direct or agent', enum: ['direct', 'agent'] },
      schedule_type: { type: 'string', description: 'Schedule type', enum: ['cron', 'interval', 'once', 'trigger'] },
      interval_minutes: { type: 'number', description: 'Interval in minutes' },
      cron_expression: { type: 'string', description: 'Cron expression' },
      trigger_event: { type: 'string', description: 'Event name for trigger type' },
      config: { type: 'object', description: 'Tool config JSON' },
      requires_approval: { type: 'boolean', description: 'Require human approval' },
      description: { type: 'string', description: 'Task description' },
    },
    required: ['action'],
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
        { tool: 'manage_task', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'manage_task', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
