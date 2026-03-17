// src/tools/system.tool.js
'use strict';

const { pool } = require('../db');
const { getAllWorkerStatus } = require('../utils/worker-guards');

module.exports = {
  name: 'system_status',
  description: 'Get OpenBrain system health: database stats, worker status, memory counts',
  tier: 'direct',
  parameters: {},
  async execute(config, context) {
    const [memCount, convCount, taskCount, workerStatus] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM memories WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*)::int AS count FROM conversations'),
      pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM scheduled_tasks WHERE brand_id = $1", [context.brandId || 'ikawn']),
      Promise.resolve(getAllWorkerStatus()),
    ]);

    const data = {
      memories: memCount.rows[0].count,
      conversations: convCount.rows[0].count,
      tasks: taskCount.rows[0],
      workers: workerStatus,
      timestamp: new Date().toISOString(),
    };

    return {
      success: true,
      data,
      summary: `System healthy. ${data.memories} memories, ${data.conversations} conversations, ${data.tasks.active} active tasks.`,
    };
  },
};
