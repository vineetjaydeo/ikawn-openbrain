// src/tools/create-user-task.tool.js
'use strict';

const { pool } = require('../db');
const { INSTANCE_NAME } = require('../utils/ruhi-assets');

module.exports = {
  name: 'create_user_task',
  description: 'Create a task assigned to a team member. Use when someone asks to relay work, assign a task, or flag something for another person.',
  tier: 'direct',
  parameters: {
    title: { type: 'string', required: true, description: 'Task title' },
    description: { type: 'string', required: false, description: 'Task details and context' },
    assigned_to_name: { type: 'string', required: true, description: 'Name of the person to assign to (e.g. "Vineet", "Abhishek", "Avinash")' },
    priority: { type: 'string', required: false, description: 'Priority level', enum: ['low', 'normal', 'high', 'urgent'] },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';

    // Look up the assigned user by name (case-insensitive partial match)
    const userResult = await pool.query(
      `SELECT id, name FROM users WHERE LOWER(name) ILIKE $1 LIMIT 1`,
      [`%${config.assigned_to_name}%`]
    );

    let assignedUserId = null;
    let assignedUserName = config.assigned_to_name;

    if (userResult.rows.length > 0) {
      assignedUserId = userResult.rows[0].id;
      assignedUserName = userResult.rows[0].name;
    } else {
      // Also check ob_users if not found in users table
      const obResult = await pool.query(
        `SELECT name FROM ob_users WHERE LOWER(name) ILIKE $1 LIMIT 1`,
        [`%${config.assigned_to_name}%`]
      );
      if (obResult.rows.length > 0) {
        assignedUserName = obResult.rows[0].name;
      }
    }

    const { rows } = await pool.query(`
      INSERT INTO user_tasks (brand_id, title, description, assigned_to, created_by, created_by_name, priority, source, conversation_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ruhi', $8)
      RETURNING uuid, title, assigned_to, priority, status, created_at
    `, [
      brandId,
      config.title,
      config.description || null,
      assignedUserId,
      context.userId || null,
      context.userName || INSTANCE_NAME,
      config.priority || 'normal',
      context.conversationId || null,
    ]);

    return {
      success: true,
      data: { task: rows[0], assigned_to_name: assignedUserName },
      summary: `Task "${config.title}" created and assigned to ${assignedUserName} (${config.priority || 'normal'} priority).`,
    };
  },
};
