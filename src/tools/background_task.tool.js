// src/tools/background_task.tool.js
'use strict';

const { pool } = require('../db');

module.exports = {
  name: 'start_background_task',
  description: 'Start a complex task that runs in the background. Use this for work that needs multiple steps: researching topics, analyzing data from multiple sources, generating detailed reports or presentations. The task will run asynchronously and the user will be notified when complete.',
  tier: 'direct',
  parameters: {
    task_description: { type: 'string', required: true, description: 'Detailed description of what to accomplish' },
    task_type: { type: 'string', required: true, description: 'Type of task', enum: ['research_report', 'presentation', 'data_analysis', 'document_generation'] },
    deliverables: { type: 'string', required: false, description: 'What artifacts to produce (e.g., "PDF report + PPTX summary")' },
    context: { type: 'string', required: false, description: 'Additional context, data references, or constraints' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';
    const userId = context.userId || null;
    const conversationId = context.conversationId || context.sessionId || null;

    const { rows } = await pool.query(`
      INSERT INTO ob_background_tasks (
        brand_id, user_id, conversation_id,
        task_type, task_description, deliverables, context,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id, status, created_at
    `, [
      brandId,
      userId,
      conversationId,
      config.task_type,
      config.task_description,
      config.deliverables || null,
      config.context || null,
    ]);

    const task = rows[0];

    return {
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        taskType: config.task_type,
        createdAt: task.created_at,
      },
      summary: `Background task #${task.id} queued (${config.task_type}). I will notify you when it is complete.`,
    };
  },
};
