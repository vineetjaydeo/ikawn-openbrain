'use strict';

const originalTool = require('../create-user-task.tool');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = {
  name: 'create_user_task',
  description: originalTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task details and context' },
      assigned_to_name: { type: 'string', description: 'Name of the person to assign to (e.g. "Vineet", "Abhishek", "Avinash")' },
      priority: { type: 'string', description: 'Priority level', enum: ['low', 'normal', 'high', 'urgent'] },
    },
    required: ['title', 'assigned_to_name'],
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
        { tool: 'create_user_task', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0 }
      );
    } catch (err) {
      return createEnvelope(false, null, err.message, {
        tool: 'create_user_task', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
      });
    }
  },
};
