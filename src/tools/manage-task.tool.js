// src/tools/manage-task.tool.js
'use strict';

const { pool } = require('../db');
const { calculateNextRun } = require('../utils/schedule');

module.exports = {
  name: 'manage_task',
  description: 'Create, list, update, enable, disable, delete, or immediately run scheduled tasks. For research or complex tasks, use tool="agent" which delegates to an AI agent with web search. For simple tool-based tasks, specify the exact tool name.',
  tier: 'direct',
  parameters: {
    action: { type: 'string', required: true, description: 'Action', enum: ['create', 'list', 'enable', 'disable', 'delete', 'run_now', 'update'] },
    task_uuid: { type: 'string', required: false, description: 'Task UUID (for enable/disable/delete/run_now/update)' },
    name: { type: 'string', required: false, description: 'Task name (for create)' },
    tool: { type: 'string', required: false, description: 'Tool to execute. Use "agent" for research/complex tasks that need AI reasoning with web search. Use specific tool names (e.g. "web_search", "brand_analysis") for simple direct tasks.' },
    agent_slug: { type: 'string', required: false, description: 'Agent slug (default: ruhi)' },
    tier: { type: 'string', required: false, description: 'direct or agent', enum: ['direct', 'agent'] },
    schedule_type: { type: 'string', required: false, description: 'Schedule type: "once" for one-time tasks, "interval" for recurring, "cron" for cron-based, "trigger" for event-driven', enum: ['cron', 'interval', 'once', 'trigger'] },
    interval_minutes: { type: 'number', required: false, description: 'Interval in minutes' },
    cron_expression: { type: 'string', required: false, description: 'Cron expression' },
    trigger_event: { type: 'string', required: false, description: 'Event name for trigger type' },
    config: { type: 'object', required: false, description: 'Tool config JSON' },
    requires_approval: { type: 'boolean', required: false, description: 'Require human approval' },
    description: { type: 'string', required: false, description: 'Task description' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';

    switch (config.action) {
      case 'list': {
        const { rows } = await pool.query(
          `SELECT uuid, name, tool, agent_slug, tier, schedule_type, enabled, last_status, last_run_at, next_run_at, run_count, consecutive_failures
           FROM scheduled_tasks WHERE brand_id = $1
           ORDER BY enabled DESC, next_run_at ASC NULLS LAST`,
          [brandId]
        );
        return { success: true, data: { tasks: rows }, summary: `${rows.length} task(s) found.` };
      }

      case 'create': {
        // Normalize common LLM mistakes
        if (config.schedule_type === 'one_time') config.schedule_type = 'once';
        if (!config.name || !config.schedule_type) {
          return { success: false, data: null, summary: 'Missing required fields: name, schedule_type' };
        }
        // If tool is 'agent' or missing, this is a Tier 2 agent task (LLM reasoning, not direct tool)
        // Use a placeholder tool — the scheduler's agent executor handles the actual work via the description
        const { getTool } = require('./registry');
        if (!config.tool || config.tool === 'agent' || config.tool === 'research' || config.tool === 'coding') {
          config.tier = 'agent';
          config.tool = 'web_search'; // Placeholder — agent executor uses description + agent persona, not this tool directly
          // Auto-route coding tasks to tech agent (token budgets handled by executor tiers)
          const desc = (config.description || config.name || '').toLowerCase();
          const isCodingTask = /\b(code_read|code_write|code_edit|edit file|add.*border|modify|refactor|git push|git commit|npm test|deploy)\b/.test(desc);
          if (isCodingTask && (!config.agent_slug || config.agent_slug === 'ruhi')) {
            config.agent_slug = 'tech';
          }
        } else if (!getTool(config.tool)) {
          return { success: false, data: null, summary: `Unknown tool: "${config.tool}". Use 'list' action to see available tools.` };
        }
        const task = {
          brand_id: brandId,
          user_id: context.userId || null,
          agent_slug: config.agent_slug || 'ruhi',
          name: config.name,
          description: config.description || null,
          tier: config.tier || 'direct',
          tool: config.tool,
          config: config.config || {},
          schedule_type: config.schedule_type,
          cron_expression: config.cron_expression || null,
          interval_minutes: config.interval_minutes || null,
          trigger_event: config.trigger_event || null,
          requires_approval: config.requires_approval || false,
          max_cost_per_run: config.max_cost_per_run || (config.tier === 'agent' ? '2.00' : null),
        };
        const nextRun = calculateNextRun(task);
        const { rows } = await pool.query(`
          INSERT INTO scheduled_tasks (brand_id, user_id, agent_slug, name, description, tier, tool, config, schedule_type, cron_expression, interval_minutes, trigger_event, requires_approval, max_cost_per_run, next_run_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING uuid, name
        `, [task.brand_id, task.user_id, task.agent_slug, task.name, task.description, task.tier, task.tool, JSON.stringify(task.config), task.schedule_type, task.cron_expression, task.interval_minutes, task.trigger_event, task.requires_approval, task.max_cost_per_run, nextRun]);
        return { success: true, data: rows[0], summary: `Task "${rows[0].name}" created (${config.schedule_type}).` };
      }

      case 'enable':
      case 'disable': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const enabled = config.action === 'enable';
        const { rowCount } = await pool.query(
          'UPDATE scheduled_tasks SET enabled = $1, updated_at = NOW() WHERE uuid = $2 AND brand_id = $3',
          [enabled, config.task_uuid, brandId]
        );
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? `Task ${config.action}d.` : 'Task not found.' };
      }

      case 'delete': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const { rowCount } = await pool.query('DELETE FROM scheduled_tasks WHERE uuid = $1 AND brand_id = $2', [config.task_uuid, brandId]);
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task deleted.' : 'Task not found.' };
      }

      case 'run_now': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const { rowCount } = await pool.query(
          "UPDATE scheduled_tasks SET next_run_at = NOW(), updated_at = NOW() WHERE uuid = $1 AND brand_id = $2 AND enabled",
          [config.task_uuid, brandId]
        );
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task queued for immediate execution.' : 'Task not found or disabled.' };
      }

      case 'update': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const updates = [];
        const params = [config.task_uuid, brandId];
        let idx = 3;
        if (config.name) { updates.push(`name = $${idx++}`); params.push(config.name); }
        if (config.description) { updates.push(`description = $${idx++}`); params.push(config.description); }
        if (config.interval_minutes) { updates.push(`interval_minutes = $${idx++}`); params.push(config.interval_minutes); }
        if (config.cron_expression) { updates.push(`cron_expression = $${idx++}`); params.push(config.cron_expression); }
        if (config.config) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config.config)); }
        if (config.requires_approval !== undefined) { updates.push(`requires_approval = $${idx++}`); params.push(config.requires_approval); }
        if (updates.length === 0) return { success: false, data: null, summary: 'No fields to update.' };
        updates.push('updated_at = NOW()');
        const { rowCount } = await pool.query(`UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE uuid = $1 AND brand_id = $2`, params);
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task updated.' : 'Task not found.' };
      }

      default:
        return { success: false, data: null, summary: `Unknown action: ${config.action}` };
    }
  },
};
