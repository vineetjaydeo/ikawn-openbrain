// src/seeds/operator-tasks.js
'use strict';

const { calculateNextRun } = require('../utils/schedule');

/**
 * Operator task definitions for Lucy's autonomous iKawn infrastructure monitoring.
 * These are seeded on startup (idempotent via ON CONFLICT DO NOTHING on name+brand_id).
 *
 * All tasks use:
 * - tier: 'agent' (LLM reasoning with tool access)
 * - agent_slug: 'ruhi' (coordinator agent with full tool scope)
 * - model: claude-haiku (cost control for background tasks)
 * - 24/7 active window (operator tasks run around the clock)
 * - max_cost_per_run: $0.25 (tight budget per execution)
 */

const OPERATOR_TASKS = [
  {
    name: 'morning-briefing',
    description: `Review overnight activity across all iKawn systems. Check:
1. System health via system_status tool (all Fly apps, DB connections, worker status)
2. API costs via the cost monitoring data (OpenAI/Anthropic spend trends)
3. Error rates from recent task runs (check for failures, auto-disabled tasks)
4. Scheduled task outcomes from the last 12 hours
5. Memory growth and embedding queue depth

Produce a clean morning briefing report in markdown. If anything is concerning (spend > $5/day, error spikes, services down, tasks auto-disabled), flag it prominently at the top. Send critical alerts via the notify tool to Telegram.

Keep the report concise: 3-5 bullet points for normal status, expanded detail only for issues.`,
    agent_slug: 'ruhi',
    tier: 'agent',
    tool: 'web_search', // placeholder for agent-tier tasks
    schedule_type: 'cron',
    cron_expression: '30 2 * * *', // 2:30 AM UTC = 8:00 AM IST
    timezone: 'UTC',
    active_window_start: '00:00',
    active_window_end: '23:59',
    max_cost_per_run: 0.25,
    config: {
      model: 'claude-haiku-4-5-20251001',
      max_tool_rounds: 4,
      max_web_searches: 0,
    },
  },
  {
    name: 'hourly-cost-monitor',
    description: `Check current API spend across all providers. Steps:
1. Use system_status to get current cost data and system metrics
2. Compare today's spend against the daily budget of $5
3. Check if spend rate is trending toward exceeding the budget by end of day
4. Look for any single model or tool consuming disproportionate resources

If today's spend exceeds $3 (60% of daily budget) OR the hourly rate suggests we'll exceed $5 by EOD, send an alert via the notify tool to Telegram with: current spend, projected daily total, and the top cost contributor.

If spend is normal, produce a one-line summary. Do NOT send Telegram alerts for normal spend.`,
    agent_slug: 'ruhi',
    tier: 'agent',
    tool: 'web_search',
    schedule_type: 'cron',
    cron_expression: '0 * * * *', // Every hour on the hour
    timezone: 'UTC',
    active_window_start: '00:00',
    active_window_end: '23:59',
    max_cost_per_run: 0.10,
    config: {
      model: 'claude-haiku-4-5-20251001',
      max_tool_rounds: 3,
      max_web_searches: 0,
    },
  },
  {
    name: 'error-log-scanner',
    description: `Scan recent application activity for errors, exceptions, and anomalies. Steps:
1. Use system_status to check current system health across all services
2. Query recent task_runs for failures (last 30 minutes)
3. Check for tasks that have been auto-disabled due to consecutive failures
4. Look for patterns: same error repeating, cascading failures, or new error types

Categorize findings by severity:
- CRITICAL: Service down, data loss risk, cascading failures
- WARNING: Elevated error rate, task auto-disabled, resource exhaustion trending
- INFO: Isolated failures, expected transient errors

For CRITICAL issues: send immediate Telegram alert via notify tool.
For WARNING: include in summary, alert only if pattern persists across 2+ consecutive scans.
For INFO: log in summary only.

Keep output concise. If no issues found, produce a single line: "No errors detected."`,
    agent_slug: 'ruhi',
    tier: 'agent',
    tool: 'web_search',
    schedule_type: 'cron',
    cron_expression: '*/30 * * * *', // Every 30 minutes
    timezone: 'UTC',
    active_window_start: '00:00',
    active_window_end: '23:59',
    max_cost_per_run: 0.10,
    config: {
      model: 'claude-haiku-4-5-20251001',
      max_tool_rounds: 3,
      max_web_searches: 0,
    },
  },
  {
    name: 'weekly-health-report',
    description: `Generate a comprehensive weekly health report for iKawn infrastructure. Cover all areas:

1. **Uptime & Availability**: Check system_status for current health. Note any outages or degraded periods from the past week.

2. **API Costs**: Summarize the week's total spend. Break down by day and by model/service. Compare to previous week if data available. Flag any cost anomalies.

3. **Error Analysis**: Aggregate task_run failures for the week. Identify recurring errors, new error types, and resolution status. Calculate success rate percentage.

4. **Task Performance**: Total tasks executed, success/failure rates, average cost per task. Identify most and least reliable tasks. Flag any tasks that were auto-disabled.

5. **Memory & Storage**: Current memory count, growth rate, embedding queue health, retention cleanup stats.

6. **User Activity**: Active conversations, messages processed, tools used. Trends vs previous week.

7. **Recommendations**: Based on the above data, suggest 1-3 specific actions to improve reliability, reduce costs, or enhance performance.

Format as a clean markdown report with headers and bullet points. Send via notify tool to Telegram as a summary with the full report available in the Lucy Updates conversation.`,
    agent_slug: 'ruhi',
    tier: 'agent',
    tool: 'web_search',
    schedule_type: 'cron',
    cron_expression: '30 3 * * 1', // Monday 3:30 AM UTC = Monday 9:00 AM IST
    timezone: 'UTC',
    active_window_start: '00:00',
    active_window_end: '23:59',
    max_cost_per_run: 0.50,
    config: {
      model: 'claude-haiku-4-5-20251001',
      max_tool_rounds: 5,
      max_web_searches: 0,
    },
  },
];

/**
 * Seed operator tasks into the scheduled_tasks table.
 * Idempotent: uses ON CONFLICT (name, brand_id) DO NOTHING.
 * Requires a unique index on (name, brand_id) -- created if missing.
 *
 * @param {import('pg').Pool} pool - Postgres pool
 * @returns {Promise<number>} Number of tasks seeded
 */
async function seedOperatorTasks(pool) {
  // Ensure unique index exists for idempotent upsert
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_tasks_name_brand
    ON scheduled_tasks (name, brand_id)
  `);

  let seeded = 0;

  for (const task of OPERATOR_TASKS) {
    // Calculate initial next_run_at from cron expression
    const nextRun = calculateNextRun({
      schedule_type: task.schedule_type,
      cron_expression: task.cron_expression,
      timezone: task.timezone,
    });

    const { rowCount } = await pool.query(`
      INSERT INTO scheduled_tasks (
        brand_id, agent_slug, name, description, tier, tool, config,
        schedule_type, cron_expression, timezone,
        active_window_start, active_window_end,
        max_cost_per_run, next_run_at, enabled
      ) VALUES (
        'ikawn', $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13, true
      )
      ON CONFLICT (name, brand_id) DO NOTHING
    `, [
      task.agent_slug,
      task.name,
      task.description,
      task.tier,
      task.tool,
      JSON.stringify(task.config),
      task.schedule_type,
      task.cron_expression,
      task.timezone,
      task.active_window_start,
      task.active_window_end,
      task.max_cost_per_run,
      nextRun ? nextRun.toISOString() : null,
    ]);

    if (rowCount > 0) {
      seeded++;
      console.log(`[OperatorSeed] Seeded: ${task.name} (next: ${nextRun ? nextRun.toISOString() : 'none'})`);
    }
  }

  if (seeded > 0) {
    console.log(`[OperatorSeed] Done. ${seeded} new operator task(s) seeded.`);
  } else {
    console.log('[OperatorSeed] All operator tasks already exist. No changes.');
  }

  return seeded;
}

module.exports = { seedOperatorTasks, OPERATOR_TASKS };
