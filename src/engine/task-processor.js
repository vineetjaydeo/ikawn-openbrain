'use strict';

const { Cron } = require('croner');
const { randomUUID } = require('crypto');

// ── Lazy / injectable dependencies ──
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

let _sessionManager = null;
function getSessionManager() {
  if (!_sessionManager) _sessionManager = require('./session-manager');
  return _sessionManager;
}
function _setSessionManager(obj) { _sessionManager = obj; }

let _executeLoop = null;
function getExecuteLoop() {
  if (!_executeLoop) return require('./reasoning-loop').executeReasoningLoop;
  return _executeLoop;
}
function _setExecuteLoop(fn) { _executeLoop = fn; }

// ── State ──
const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 5000;
const STUCK_THRESHOLD_MINUTES = 30;

let _running = 0;
let _pollInterval = null;
let _stopping = false;
let _activeTasks = new Set(); // track active task promises for graceful shutdown

// ── Schema migration ──

async function ensureSchema() {
  const pool = getPool();
  await pool.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'scheduled'`);
  await pool.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS parent_session UUID`);
  await pool.query(`ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS session_id UUID`);
}

// ── Crash recovery ──

async function recoverStuckTasks() {
  const pool = getPool();
  const { rowCount } = await pool.query(`
    UPDATE task_runs
    SET status = 'failed', error = 'server_restart', completed_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
  `);
  if (rowCount > 0) {
    console.log(`[TaskProcessor] Recovered ${rowCount} stuck task run(s)`);
  }
  // Also reset the parent scheduled_tasks that were left in 'running'
  await pool.query(`
    UPDATE scheduled_tasks
    SET last_status = 'failed'
    WHERE last_status = 'running'
      AND last_run_at < NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
  `);
  return rowCount;
}

// ── Claim a task ──

async function claimTask() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT st.*, ad.persona, ad.tools AS agent_tools
    FROM scheduled_tasks st
    LEFT JOIN agent_definitions ad ON ad.slug = st.agent_slug AND ad.brand_id = st.brand_id
    WHERE st.task_type IN ('sub_agent', 'on_demand', 'hotl_resume')
      AND (st.last_status IN ('pending', 'queued') OR st.last_status IS NULL)
      AND st.enabled = true
      AND (st.next_run_at IS NULL OR st.next_run_at <= NOW())
    ORDER BY st.next_run_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE OF st SKIP LOCKED
  `);
  return rows[0] || null;
}

// ── Execute a claimed task ──

async function executeClaimedTask(task) {
  const pool = getPool();
  const sm = getSessionManager();
  const runLoop = getExecuteLoop();

  // Mark as running
  await pool.query(
    `UPDATE scheduled_tasks SET last_status = 'running', last_run_at = NOW() WHERE id = $1`,
    [task.id]
  );

  // ── HOTL Resume: restore a suspended session and continue ──
  if (task.task_type === 'hotl_resume') {
    const config = task.config || {};
    const resumeToken = config.resumeToken;

    if (!resumeToken) {
      await pool.query(
        `UPDATE scheduled_tasks SET last_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
      console.error(`[TaskProcessor] hotl_resume task ${task.id} missing resumeToken`);
      return;
    }

    try {
      // Resume the suspended session
      const session = await sm.resume(resumeToken);

      // Build messages from working memory
      const workingMemory = session.working_memory || {};
      const messages = workingMemory.messages || [];

      if (config.approved) {
        // Inject approval confirmation
        messages.push({
          role: 'user',
          content: `[SYSTEM] The human reviewer approved the action "${config.originalAction}". You may proceed with execution.`,
        });
      } else {
        // Inject rejection
        const reason = config.rejectionReason || 'No reason given';
        messages.push({
          role: 'user',
          content: `[SYSTEM] The human reviewer rejected this action. Reason: ${reason}. Adjust your approach and find an alternative.`,
        });
      }

      // Load tools for the session
      const { getPreset } = require('./agent-presets');
      const { getToolDefinitions } = require('./tool-registry-v2');
      const preset = getPreset(session.model_tier || 'balanced') || getPreset('researcher');
      const toolScope = preset ? preset.toolScope : null;
      const tools = getToolDefinitions(toolScope);

      // Execute reasoning loop from restored state
      const result = await runLoop({
        sessionId: session.id,
        brandId: session.brand_id || 'ikawn',
        modelTier: session.model_tier || 'balanced',
        tools,
        systemPrompt: session.system_prompt || '',
        dollarCap: session.dollar_cap ? Number(session.dollar_cap) : null,
        messages,
        maxIterations: 15,
        trustLevel: config.approved ? 'elevated' : 'auto',
      });

      // Mark task as completed
      await pool.query(
        `UPDATE scheduled_tasks SET last_status = 'completed', run_count = run_count + 1, updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
      await sm.complete(session.id, result.response ? result.response.substring(0, 500) : null);
      console.log(`[TaskProcessor] hotl_resume task "${task.name}" completed`);
    } catch (err) {
      console.error(`[TaskProcessor] hotl_resume task "${task.name}" failed:`, err.message);
      await pool.query(
        `UPDATE scheduled_tasks SET last_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
    }
    return;
  }

  // Create task_run entry
  const sessionId = randomUUID(); // pre-generate for the task_run record
  const { rows: [run] } = await pool.query(`
    INSERT INTO task_runs (task_id, agent_slug, tier, started_at, brand_id, session_id)
    VALUES ($1, $2, $3, NOW(), $4, $5)
    RETURNING id
  `, [task.id, task.agent_slug, task.tier || 'balanced', task.brand_id || 'ikawn', null]);

  let session;
  try {
    // Create session
    session = await sm.create({
      brandId: task.brand_id || 'ikawn',
      userId: task.user_id ? String(task.user_id) : null,
      agentSlug: task.agent_slug,
      channel: 'task',
      modelTier: task.tier || 'balanced',
      systemPrompt: buildSystemPrompt(task),
      dollarCap: task.max_cost_per_run ? Number(task.max_cost_per_run) : null,
      parentSession: task.parent_session || null,
    });

    // Update task_run with session_id
    await pool.query(`UPDATE task_runs SET session_id = $1 WHERE id = $2`, [session.id, run.id]);

    // Load tools via preset
    const { getPreset } = require('./agent-presets');
    const { getToolDefinitions } = require('./tool-registry-v2');

    const preset = getPreset(task.tier || 'balanced') || getPreset('researcher');
    const toolScope = preset ? preset.toolScope : null;
    const tools = getToolDefinitions(toolScope);

    // Determine trust level from tier
    const trustLevel = (task.tier === 'direct' || task.tier === 'fast') ? 'auto' : 'auto';

    // Build the user message from task config
    const taskPrompt = task.config?.prompt || task.description || task.name;
    const messages = [{ role: 'user', content: taskPrompt }];

    // Execute reasoning loop
    const result = await runLoop({
      sessionId: session.id,
      brandId: task.brand_id || 'ikawn',
      modelTier: task.tier || 'balanced',
      tools,
      systemPrompt: buildSystemPrompt(task),
      dollarCap: task.max_cost_per_run ? Number(task.max_cost_per_run) : null,
      messages,
      maxIterations: 25,
      userId: task.user_id ? String(task.user_id) : undefined,
      trustLevel,
    });

    // Success — update task_run
    const resultJson = {
      response: result.response,
      turnCount: result.turnCount,
      toolCallCount: result.toolCallCount,
    };

    await pool.query(`
      UPDATE task_runs
      SET status = 'completed', result = $1, completed_at = NOW(),
          cost_usd = $2, tokens_used = $3
      WHERE id = $4
    `, [JSON.stringify(resultJson), result.totalCostUsd || 0, (result.totalTokensIn || 0) + (result.totalTokensOut || 0), run.id]);

    // Update scheduled_task
    await pool.query(`
      UPDATE scheduled_tasks
      SET last_status = 'completed', run_count = run_count + 1, consecutive_failures = 0, updated_at = NOW()
      WHERE id = $1
    `, [task.id]);

    // Handle cron rescheduling
    await rescheduleIfCron(task);

    // Complete the session
    await sm.complete(session.id, result.response ? result.response.substring(0, 500) : null);

    console.log(`[TaskProcessor] Task "${task.name}" completed (run=${run.id})`);

  } catch (err) {
    console.error(`[TaskProcessor] Task "${task.name}" failed:`, err.message);

    // Update task_run as failed
    await pool.query(`
      UPDATE task_runs
      SET status = 'failed', error = $1, completed_at = NOW()
      WHERE id = $2
    `, [err.message, run.id]);

    // Update scheduled_task
    const failures = (task.consecutive_failures || 0) + 1;
    await pool.query(`
      UPDATE scheduled_tasks
      SET last_status = 'failed', consecutive_failures = $1, updated_at = NOW()
      WHERE id = $2
    `, [failures, task.id]);

    // Fail the session if it was created
    if (session) {
      await sm.fail(session.id, err.message).catch(() => {});
    }

    // Reschedule cron tasks even on failure
    await rescheduleIfCron(task).catch(() => {});
  }
}

// ── Build system prompt ──

function buildSystemPrompt(task) {
  const parts = [];
  const kb = global.ruhiKnowledge || {};

  if (task.persona) {
    parts.push(task.persona);
  } else {
    parts.push(`You are Lucy, iKawn's AI intelligence, executing a background task: "${task.name}".`);
  }

  // Inject knowledge base — full for coordinator/ruhi, tools-only for sub-agents
  const subAgentTiers = ['researcher', 'builder', 'reviewer', 'deployer', 'analyst'];
  const isSubAgent = subAgentTiers.includes(task.tier);

  if (!isSubAgent && kb.soul) {
    parts.push(`=== YOUR IDENTITY ===\n${kb.soul}`);
  }
  if (kb.tools) {
    parts.push(`=== YOUR TOOLS ===\n${kb.tools}`);
  }
  if (!isSubAgent && kb.memory) {
    parts.push(`=== YOUR MEMORY SYSTEM ===\n${kb.memory}`);
  }
  if (kb.changelog) {
    parts.push(`=== YOUR VERSION HISTORY ===\n${kb.changelog}`);
  }

  // Add preset addition if applicable
  const { getPreset } = require('./agent-presets');
  const preset = getPreset(task.tier || 'balanced');
  if (preset && preset.systemPromptAddition) {
    parts.push(preset.systemPromptAddition);
  }

  if (task.description) {
    parts.push(`Task description: ${task.description}`);
  }

  return parts.join('\n\n');
}

// ── Cron rescheduling ──

async function rescheduleIfCron(task) {
  if (task.schedule_type !== 'cron' || !task.cron_expression) return;

  try {
    const job = new Cron(task.cron_expression, { timezone: task.timezone || 'UTC' });
    const nextRun = job.nextRun();
    if (nextRun) {
      await getPool().query(
        `UPDATE scheduled_tasks SET next_run_at = $1 WHERE id = $2`,
        [nextRun.toISOString(), task.id]
      );
    }
  } catch (err) {
    console.error(`[TaskProcessor] Failed to reschedule cron for task ${task.id}:`, err.message);
  }
}

// ── Poll loop ──

async function pollOnce() {
  if (_stopping || _running >= MAX_CONCURRENT) return;

  let task;
  try {
    task = await claimTask();
  } catch (err) {
    console.error('[TaskProcessor] Claim query failed:', err.message);
    return;
  }

  if (!task) return;

  _running++;
  const taskPromise = executeClaimedTask(task)
    .finally(() => {
      _running--;
      _activeTasks.delete(taskPromise);
    });
  _activeTasks.add(taskPromise);
}

// ── Public API ──

async function startProcessor() {
  if (_pollInterval) return; // Already running

  console.log('[TaskProcessor] Starting (poll=5s, maxConcurrent=3)');
  await ensureSchema();
  await recoverStuckTasks();

  _stopping = false;
  _pollInterval = setInterval(pollOnce, POLL_INTERVAL_MS);

  // Run first poll immediately
  pollOnce();
}

async function stopProcessor() {
  _stopping = true;
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }

  // Wait for active tasks to finish (with a timeout)
  if (_activeTasks.size > 0) {
    console.log(`[TaskProcessor] Waiting for ${_activeTasks.size} active task(s) to finish...`);
    await Promise.allSettled([..._activeTasks]);
  }

  console.log('[TaskProcessor] Stopped');
}

function getRunningCount() {
  return _running;
}

// Test helpers — reset internal state
function _resetState() {
  _running = 0;
  _stopping = false;
  _activeTasks.clear();
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

module.exports = {
  startProcessor,
  stopProcessor,
  recoverStuckTasks,
  getRunningCount,
  ensureSchema,
  _setPool,
  _setExecuteLoop,
  _setSessionManager,
  _resetState,
  // Exposed for testing
  pollOnce,
  claimTask,
  executeClaimedTask,
  rescheduleIfCron,
};
