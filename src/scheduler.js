const { syncAll: syncGitHub } = require('./connectors/github');
const { syncCalendar } = require('./connectors/gcal');
const { registerWebhook, startFlushTimer, stopFlushTimer } = require('./connectors/telegram');
const { pool } = require('./db');
const { getTool } = require('./tools/registry');
const { executeAgentTask } = require('./agent/executor');
const { calculateNextRun, isInActiveWindow } = require('./utils/schedule');
const { sendTelegramMessage } = require('./utils/telegram');
const eventBus = require('./utils/event-bus');
const { captureMessage } = require('./utils/capture');
const { INSTANCE_NAME } = require('./utils/ruhi-assets');

let githubInterval = null;
let calendarInterval = null;
let retentionInterval = null;
let taskSchedulerInterval = null;

const BASE_URL = process.env.BASE_URL || 'https://ikawn-openbrain.fly.dev';
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_COOLDOWN_MS = 15 * 60 * 1000; // 15 min
const TOOL_TIMEOUT_MS = 20_000;

/**
 * Wrap a promise with a timeout.
 */
function withTimeout(promise, ms = TOOL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool timeout after ${ms}ms`)), ms)),
  ]);
}

function startScheduler() {
  console.log('Starting ingestion scheduler...');

  // GitHub sync: every 30 minutes
  githubInterval = setInterval(async () => {
    try {
      await syncGitHub();
    } catch (err) {
      console.error('Scheduled GitHub sync failed:', err.message);
    }
  }, 30 * 60 * 1000);

  // Calendar sync: every 2 hours
  calendarInterval = setInterval(async () => {
    try {
      await syncCalendar();
    } catch (err) {
      console.error('Scheduled Calendar sync failed:', err.message);
    }
  }, 2 * 60 * 60 * 1000);

  // Data retention cron: daily — soft-delete expired memories
  retentionInterval = setInterval(async () => {
    try {
      const result = await pool.query(`
        UPDATE memories m SET deleted_at = NOW(), content = '[RETENTION EXPIRED]'
        FROM brands b
        WHERE m.brand_id = b.brand_id
          AND m.deleted_at IS NULL
          AND m.created_at < NOW() - INTERVAL '1 day' * b.data_retention_days
      `);
      if (result.rowCount > 0) {
        console.log(`[Retention] Expired ${result.rowCount} memories`);
      }
    } catch (err) {
      console.error('Retention cron failed:', err.message);
    }
  }, 24 * 60 * 60 * 1000);

  // ── Agent Platform: Task Scheduler (30s polling) ──
  taskSchedulerInterval = setInterval(runTaskScheduler, 30_000);

  // ── Event Bus: trigger-based tasks ──
  setupEventListeners();

  console.log('Scheduler started: GitHub 30min, Calendar 2hr, Retention daily, Tasks 30s');
}

/**
 * Poll scheduled_tasks for due tasks. Uses advisory locks for crash safety.
 */
async function runTaskScheduler() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Transaction-scoped advisory lock — auto-releases on commit/rollback/crash
    const lockResult = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('task_scheduler'))");
    if (!lockResult.rows[0].pg_try_advisory_xact_lock) {
      await client.query('ROLLBACK');
      return; // Another tick is running
    }

    // Fetch due tasks, skip locked rows, skip currently running
    const { rows: dueTasks } = await client.query(`
      SELECT st.*, da.persona, da.tools AS agent_tools, da.memory_tags
      FROM scheduled_tasks st
      LEFT JOIN domain_agents da ON da.slug = st.agent_slug AND da.brand_id = st.brand_id
      WHERE st.enabled
        AND st.next_run_at <= NOW()
        AND (st.last_status IS NULL OR st.last_status != 'running')
      ORDER BY st.next_run_at ASC
      LIMIT 10
      FOR UPDATE OF st SKIP LOCKED
    `);

    await client.query('COMMIT');

    if (dueTasks.length > 0) {
      console.log(`[TaskScheduler] Found ${dueTasks.length} due task(s): ${dueTasks.map(t => `"${t.name}" (id=${t.id}, tier=${t.tier})`).join(', ')}`);
    }

    // Execute tasks outside the lock transaction
    for (const task of dueTasks) {
      if (!isInActiveWindow(task)) {
        console.log(`[TaskScheduler] Skipping "${task.name}" — outside active window`);
        continue;
      }
      console.log(`[TaskScheduler] Executing "${task.name}" (agent=${task.agent_slug}, tier=${task.tier})`);
      await executeTask(task);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[TaskScheduler] Tick failed:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Execute a single scheduled task (Tier 1 or Tier 2).
 */
/**
 * Deliver a task result to the user's "Ruhi Updates" conversation.
 * Creates the conversation if it doesn't exist yet.
 * Also captures to memories for RAG searchability.
 */
async function deliverTaskResultToChat(task, result, runId) {
  if (!task.user_id) return; // No user to deliver to
  try {
    // Find or create updates conversation for this user
    const updatesTitle = `${INSTANCE_NAME} Updates`;
    let convResult = await pool.query(
      `SELECT id FROM conversations WHERE user_id = $1 AND title IN ($2, 'Ruhi Updates') LIMIT 1`,
      [task.user_id, updatesTitle]
    );
    let convId;
    if (convResult.rows.length > 0) {
      convId = convResult.rows[0].id;
    } else {
      const newConv = await pool.query(
        `INSERT INTO conversations (user_id, title, uuid) VALUES ($1, $2, gen_random_uuid()) RETURNING id`,
        [task.user_id, updatesTitle]
      );
      convId = newConv.rows[0].id;
    }

    const summary = result?.summary || 'Task completed with no summary.';
    const content = `**Scheduled Task: ${task.name}**\n\n${summary}`;

    // Insert as assistant message in the conversation (visible in chat UI)
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'assistant', content]
    );

    // Update conversation activity
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);

    // Also capture to memories for RAG searchability
    captureMessage({
      brand_id: task.brand_id || 'ikawn',
      channel: 'ruhi-task',
      direction: 'outbound',
      content,
      source_ref: `task_result_${runId}_${Date.now()}`,
      metadata: { project: 'ruhi-tasks', task_name: task.name },
      user_id: task.user_id,
    });
  } catch (err) {
    console.error(`[TaskScheduler] Failed to deliver result to chat for task "${task.name}":`, err.message);
  }
}

async function executeTask(task) {
  const startedAt = new Date();

  // Create task_run record (propagate brand_id from scheduled_task)
  const { rows: [run] } = await pool.query(`
    INSERT INTO task_runs (task_id, agent_slug, tier, started_at, brand_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [task.id, task.agent_slug, task.tier, startedAt, task.brand_id || 'ikawn']);

  // Set status to 'running' immediately
  await pool.query(
    "UPDATE scheduled_tasks SET last_status = 'running', last_run_at = $1 WHERE id = $2",
    [startedAt, task.id]
  );

  let finalized = false;

  try {
    let result;

    if (task.tier === 'direct') {
      // Tier 1: direct tool execution
      const tool = getTool(task.tool);
      if (!tool) {
        throw new Error(`Tool not found: ${task.tool}`);
      }
      result = await withTimeout(
        tool.execute(task.config || {}, { brandId: task.brand_id, userId: task.user_id, pool }),
        TOOL_TIMEOUT_MS
      );
      // Validate response contract
      if (typeof result?.success !== 'boolean') result = { ...result, success: false };
      if (typeof result?.summary !== 'string') result = { ...result, summary: result?.summary || 'No summary' };
    } else {
      // Tier 2: agent execution
      // Fallback to ruhi if agent not found
      if (!task.persona) {
        const { rows: [ruhiAgent] } = await pool.query(
          "SELECT persona, tools, memory_tags FROM domain_agents WHERE slug = 'ruhi' AND brand_id = $1",
          [task.brand_id || 'ikawn']
        );
        if (ruhiAgent) {
          task.persona = ruhiAgent.persona;
          task.agent_tools = ruhiAgent.tools;
          task.memory_tags = ruhiAgent.memory_tags;
        }
      }

      const agentDef = {
        slug: task.agent_slug,
        persona: task.persona || `You are ${INSTANCE_NAME}, an AI assistant.`,
        tools: task.agent_tools || [],
        memory_tags: task.memory_tags || null,
      };

      // Handle approval flow
      if (task.requires_approval) {
        const agentResult = await executeAgentTask(task, agentDef);
        const approvalMsg = `<b>Task: ${task.name}</b>\n` +
          `Agent: ${agentDef.slug}\n` +
          `Action: ${agentResult.result?.summary || 'Unknown'}\n` +
          `Est. cost: $${(agentResult.cost?.costUsd || 0).toFixed(4)}`;

        // Only send Telegram to admin (user_id=1) — no per-user Telegram routing yet
        if (task.user_id === 1) {
          await sendTelegramMessage(approvalMsg, {
            reply_markup: {
              inline_keyboard: [[
                { text: '\u2705 Approve', callback_data: `approve:${run.id}` },
                { text: '\u274c Reject', callback_data: `reject:${run.id}` },
              ]],
            },
          });
        }

        // Update run as awaiting approval
        await pool.query(`
          UPDATE task_runs SET status = 'awaiting_approval', result = $1, cost_usd = $2, tokens_used = $3, approval_message = $4
          WHERE id = $5
        `, [JSON.stringify(agentResult.result), agentResult.cost?.costUsd || 0, agentResult.cost?.tokensUsed || 0, approvalMsg, run.id]);

        finalized = true;
        // Calculate next run
        const nextRun = calculateNextRun({ ...task, last_run_at: startedAt, run_count: (task.run_count || 0) + 1 });
        await pool.query(`
          UPDATE scheduled_tasks SET last_status = 'awaiting_approval', run_count = run_count + 1, consecutive_failures = 0,
            next_run_at = $1, updated_at = NOW()
          WHERE id = $2
        `, [nextRun, task.id]);

        // Disable 'once' tasks
        if (task.schedule_type === 'once') {
          await pool.query('UPDATE scheduled_tasks SET enabled = false WHERE id = $1', [task.id]);
        }

        eventBus.emit('task.completed', { taskId: task.id, name: task.name, status: 'awaiting_approval' });
        return;
      }

      const agentResult = await executeAgentTask(task, agentDef);
      result = {
        success: agentResult.success,
        summary: agentResult.result?.summary || 'No summary',
        data: agentResult.result,
        cost: agentResult.cost,
      };
    }

    // Success path
    await pool.query(`
      UPDATE task_runs SET status = 'completed', result = $1, completed_at = NOW(),
        cost_usd = $2, tokens_used = $3
      WHERE id = $4
    `, [JSON.stringify(result), result.cost?.costUsd || 0, result.cost?.tokensUsed || 0, run.id]);
    finalized = true;

    const nextRun = calculateNextRun({ ...task, last_run_at: startedAt, run_count: (task.run_count || 0) + 1 });
    await pool.query(`
      UPDATE scheduled_tasks SET last_status = 'completed', run_count = run_count + 1, consecutive_failures = 0,
        next_run_at = $1, updated_at = NOW()
      WHERE id = $2
    `, [nextRun, task.id]);

    // Disable 'once' tasks after execution
    if (task.schedule_type === 'once') {
      await pool.query('UPDATE scheduled_tasks SET enabled = false WHERE id = $1', [task.id]);
    }

    console.log(`[TaskScheduler] Task "${task.name}" completed: ${result.summary}`);
    eventBus.emit('task.completed', { taskId: task.id, name: task.name, status: 'completed' });

    // Deliver result to user's chat
    deliverTaskResultToChat(task, result, run.id);

  } catch (err) {
    console.error(`[TaskScheduler] Task "${task.name}" failed:`, err.message);

    if (!finalized) {
      await pool.query(`
        UPDATE task_runs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2
      `, [err.message, run.id]).catch(() => {});
    }

    const failures = (task.consecutive_failures || 0) + 1;

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      // Auto-disable after 3 consecutive failures
      await pool.query(`
        UPDATE scheduled_tasks SET last_status = 'failed', last_error = $1, consecutive_failures = $2,
          enabled = false, updated_at = NOW()
        WHERE id = $3
      `, [err.message, failures, task.id]);

      // Only send Telegram failure alerts for admin tasks
      if (task.user_id === 1) {
        sendTelegramMessage(`<b>Task auto-disabled:</b> "${task.name}" — ${failures} consecutive failures.\nLast error: ${err.message}`);
      }
      console.warn(`[TaskScheduler] Auto-disabled task "${task.name}" after ${failures} failures`);
    } else {
      // Backoff: push next_run 15 minutes instead of immediate retry
      const backoffNextRun = new Date(Date.now() + FAILURE_COOLDOWN_MS);
      await pool.query(`
        UPDATE scheduled_tasks SET last_status = 'failed', last_error = $1, consecutive_failures = $2,
          next_run_at = $3, updated_at = NOW()
        WHERE id = $4
      `, [err.message, failures, backoffNextRun, task.id]);
    }

    eventBus.emit('task.failed', { taskId: task.id, name: task.name, error: err.message });

  } finally {
    // Safety net: always finalize task_runs
    if (!finalized) {
      await pool.query(
        "UPDATE task_runs SET status = 'failed', error = 'Execution interrupted', completed_at = NOW() WHERE id = $1 AND completed_at IS NULL",
        [run.id]
      ).catch(() => {});
    }
  }
}

/**
 * Set up event bus listeners for trigger-based tasks.
 */
function setupEventListeners() {
  eventBus.onAny(async (eventName) => {
    // Skip our own task events to prevent loops
    if (eventName.startsWith('task.')) return;

    try {
      const { rows: triggers } = await pool.query(
        'SELECT id FROM scheduled_tasks WHERE trigger_event = $1 AND enabled',
        [eventName]
      );
      for (const trigger of triggers) {
        await pool.query(
          'UPDATE scheduled_tasks SET next_run_at = NOW() WHERE id = $1',
          [trigger.id]
        );
      }
      if (triggers.length > 0) {
        console.log(`[EventBus] Event "${eventName}" triggered ${triggers.length} task(s)`);
      }
    } catch (err) {
      console.error(`[EventBus] Error handling event "${eventName}":`, err.message);
    }
  });
}

async function triggerSync(source) {
  switch (source) {
    case 'github':
      return await syncGitHub();
    case 'calendar':
      return await syncCalendar();
    case 'all':
      const github = await syncGitHub();
      const calendar = await syncCalendar();
      return { github, calendar };
    default:
      throw new Error(`Unknown sync source: ${source}`);
  }
}

function stopScheduler() {
  if (githubInterval) clearInterval(githubInterval);
  if (calendarInterval) clearInterval(calendarInterval);
  if (retentionInterval) clearInterval(retentionInterval);
  if (taskSchedulerInterval) clearInterval(taskSchedulerInterval);
  stopFlushTimer();
}

module.exports = { startScheduler, triggerSync, stopScheduler };
