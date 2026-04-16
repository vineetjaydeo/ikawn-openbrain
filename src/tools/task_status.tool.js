// src/tools/task_status.tool.js
'use strict';

const { pool } = require('../db');

module.exports = {
  name: 'check_task_status',
  description: 'Check the status of a background task. Use when the user asks about pending or completed tasks, or wants to know the progress of work running in the background.',
  tier: 'direct',
  parameters: {
    task_id: { type: 'number', required: false, description: 'Specific task ID to check. If omitted, lists recent tasks for this user.' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';
    const userId = context.userId || null;

    if (config.task_id) {
      // Fetch a specific task
      const { rows } = await pool.query(`
        SELECT id, task_type, task_description, deliverables, status, progress,
               result, model_used, tokens_used, started_at, completed_at,
               error_message, created_at
        FROM ob_background_tasks
        WHERE id = $1 AND brand_id = $2
        LIMIT 1
      `, [config.task_id, brandId]);

      if (rows.length === 0) {
        return {
          success: false,
          data: null,
          summary: `No background task found with ID #${config.task_id}.`,
        };
      }

      const task = rows[0];
      const artifacts = task.result?.artifacts || [];
      const artifactList = artifacts.map(a => `${a.filename || a.type} (${a.url})`).join(', ');

      let statusMsg = `Task #${task.id} (${task.task_type}): ${task.status}`;
      if (task.status === 'running' && task.progress) {
        try {
          const prog = typeof task.progress === 'string' ? JSON.parse(task.progress) : task.progress;
          statusMsg += ` - ${prog.step || 'working'}${prog.pct ? ` (${prog.pct}%)` : ''}`;
        } catch (_) {}
      }
      if (task.status === 'completed' && artifacts.length > 0) {
        statusMsg += `. Artifacts: ${artifactList}`;
      }
      if (task.status === 'completed' && task.result?.summary) {
        statusMsg += `. Summary: ${task.result.summary}`;
      }
      if (task.status === 'failed' && task.error_message) {
        statusMsg += `. Error: ${task.error_message}`;
      }

      return {
        success: true,
        data: task,
        summary: statusMsg,
      };
    }

    // List recent tasks for this user/brand
    const params = [brandId];
    let userFilter = '';
    if (userId) {
      userFilter = 'AND user_id = $2';
      params.push(userId);
    }

    const { rows } = await pool.query(`
      SELECT id, task_type, task_description, status, progress,
             started_at, completed_at, created_at
      FROM ob_background_tasks
      WHERE brand_id = $1 ${userFilter}
      ORDER BY created_at DESC
      LIMIT 10
    `, params);

    if (rows.length === 0) {
      return {
        success: true,
        data: { tasks: [] },
        summary: 'No background tasks found.',
      };
    }

    const taskLines = rows.map(t => {
      let line = `#${t.id} [${t.status}] ${t.task_type}: ${t.task_description.substring(0, 80)}`;
      if (t.status === 'running' && t.progress) {
        try {
          const prog = typeof t.progress === 'string' ? JSON.parse(t.progress) : t.progress;
          line += ` (${prog.step || 'working'}${prog.pct ? ` ${prog.pct}%` : ''})`;
        } catch (_) {}
      }
      return line;
    });

    return {
      success: true,
      data: { tasks: rows },
      summary: `Recent background tasks:\n${taskLines.join('\n')}`,
    };
  },
};
