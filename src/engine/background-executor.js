// src/engine/background-executor.js
'use strict';

const { executeReasoningLoop } = require('./reasoning-loop');
const { getToolDefinitions } = require('./tool-registry-v2');
const { captureMessage } = require('../utils/capture');
const { getTool } = require('../tools/registry');

const HAIKU_MODEL_TIER = 'fast'; // Maps to claude-haiku-4-5-20251001 via model-router
const POLL_INTERVAL_MS = 10000;
const MAX_CONCURRENT = 2;
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DOLLAR_CAP_PER_TASK = 0.50;

// Task-type-specific system prompts
const TASK_TYPE_PROMPTS = {
  research_report: [
    'You are Lucy, producing a thorough research report.',
    'Steps:',
    '1. Search memories for relevant context using search_memory.',
    '2. Use web_search for current information on the topic.',
    '3. Organize findings into clear sections with headings.',
    '4. Generate charts if the data warrants visualization.',
    '5. Produce a PDF report. Optionally produce a PPTX summary if the user requested it.',
    'Be thorough, cite sources, and present findings in a professional format.',
  ].join('\n'),

  presentation: [
    'You are Lucy, creating a professional presentation.',
    'Steps:',
    '1. Research the topic using search_memory and web_search.',
    '2. Create an outline with 8-12 slides.',
    '3. For each slide, write detailed content with data points.',
    '4. Generate supporting charts for key data.',
    '5. Call generate_pptx with the complete slide deck.',
    'Make each slide concise but informative. Use data to support points.',
  ].join('\n'),

  data_analysis: [
    'You are Lucy, analyzing data.',
    'Steps:',
    '1. Read the uploaded files referenced in the context.',
    '2. Identify key patterns, trends, and anomalies.',
    '3. Generate charts for key metrics using generate_chart.',
    '4. Produce a comprehensive PDF report with findings and recommendations.',
    'Be precise with numbers. Highlight actionable insights.',
  ].join('\n'),

  document_generation: [
    'You are Lucy, creating a professional document.',
    'Steps:',
    '1. Research the topic using search_memory and web_search.',
    '2. Structure the content with clear sections and headings.',
    '3. Write detailed, well-researched content for each section.',
    '4. Generate the document in the requested format (PDF or PPTX).',
    'Write clearly and professionally. Include relevant data and examples.',
  ].join('\n'),
};

/**
 * Build a system prompt for a background task.
 */
function buildTaskSystemPrompt(task) {
  const parts = [];

  // Load Ruhi knowledge base if available
  const kb = global.ruhiKnowledge || {};
  if (kb.tools) {
    parts.push(`=== YOUR TOOLS ===\n${kb.tools}`);
  }

  // Task-type-specific instructions
  const typePrompt = TASK_TYPE_PROMPTS[task.task_type];
  if (typePrompt) {
    parts.push(typePrompt);
  } else {
    parts.push(`You are Lucy, executing a background task. Complete the work thoroughly and produce the requested deliverables.`);
  }

  // Task details
  parts.push(`=== TASK ===\n${task.task_description}`);

  if (task.deliverables) {
    parts.push(`=== DELIVERABLES ===\n${task.deliverables}`);
  }

  if (task.context) {
    parts.push(`=== ADDITIONAL CONTEXT ===\n${task.context}`);
  }

  parts.push(
    '=== RULES ===',
    '- Complete ALL steps before finishing.',
    '- Generate all requested artifacts (PDF, PPTX, charts, etc.).',
    '- If a tool fails, note the error and continue with remaining steps.',
    '- Summarize your work at the end with links to all artifacts produced.'
  );

  return parts.join('\n\n');
}

class BackgroundExecutor {
  constructor(pool) {
    this.pool = pool;
    this._running = 0;
    this._pollInterval = null;
    this._stopping = false;
    this._activeTasks = new Set();
    this._recoveryInterval = null;
  }

  /**
   * Claim the next pending background task using SELECT ... FOR UPDATE SKIP LOCKED.
   */
  async claimTask() {
    const { rows } = await this.pool.query(`
      UPDATE ob_background_tasks
      SET status = 'running', started_at = NOW()
      WHERE id = (
        SELECT id FROM ob_background_tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    return rows[0] || null;
  }

  /**
   * Update task progress (best-effort, never throws).
   */
  async updateProgress(taskId, step, pct) {
    try {
      await this.pool.query(
        `UPDATE ob_background_tasks SET progress = $1 WHERE id = $2`,
        [JSON.stringify({ step, pct }), taskId]
      );
    } catch (_) { /* best-effort */ }
  }

  /**
   * Process a single background task through the reasoning loop.
   */
  async processTask(task) {
    console.log(`[BackgroundExecutor] Starting task #${task.id} (${task.task_type})`);

    await this.updateProgress(task.id, 'initializing', 5);

    const systemPrompt = buildTaskSystemPrompt(task);

    // Get all tool definitions (no scope restriction -- background tasks get full access)
    const tools = getToolDefinitions(null);

    // Also include v1 tool schemas for tools not yet in v2
    const { getToolSchemas, getTools } = require('../tools/registry');
    const v1ToolNames = [];
    for (const [name] of getTools()) {
      v1ToolNames.push(name);
    }
    const v1Schemas = getToolSchemas(v1ToolNames);

    // Merge: v2 tools take precedence, add v1 tools that are not in v2
    const v2Names = new Set(tools.map(t => t.name));
    const allTools = [...tools];
    for (const schema of v1Schemas) {
      if (!v2Names.has(schema.name)) {
        allTools.push(schema);
      }
    }

    const messages = [
      {
        role: 'user',
        content: task.task_description + (task.deliverables ? `\n\nDeliverables: ${task.deliverables}` : ''),
      },
    ];

    await this.updateProgress(task.id, 'reasoning', 10);

    // Build a tool executor that works with both v1 and v2 registries
    const { lookupTool } = require('./tool-registry-v2');
    const toolRegistryAdapter = {
      lookupTool: (name) => {
        // Try v2 first, then v1
        const v2Tool = lookupTool(name);
        if (v2Tool) return v2Tool;

        // Wrap v1 tool to match v2 interface
        const v1Tool = getTool(name);
        if (!v1Tool) return null;

        return {
          name: v1Tool.name,
          description: v1Tool.description,
          category: 'create',
          permissionTier: 'auto',
          retryPolicy: { maxRetries: 1, backoff: [1000], timeoutMs: 120000 },
          inputSchema: {},
          execute: async (input, ctx) => {
            const result = await v1Tool.execute(input, {
              brandId: task.brand_id,
              userId: task.user_id,
              sessionId: null,
              conversationId: task.conversation_id,
            });
            return result;
          },
        };
      },
    };

    try {
      const result = await executeReasoningLoop({
        sessionId: null, // No SSE session
        brandId: task.brand_id,
        modelTier: HAIKU_MODEL_TIER, // CRITICAL: Always Haiku for background tasks
        tools: allTools,
        systemPrompt,
        dollarCap: DOLLAR_CAP_PER_TASK,
        messages,
        maxIterations: 25,
        timeoutMs: TASK_TIMEOUT_MS,
        userId: task.user_id || undefined,
        toolRegistry: toolRegistryAdapter,
        trustLevel: 'auto',
      });

      const totalTokens = (result.totalTokensIn || 0) + (result.totalTokensOut || 0);
      const responseSummary = (result.response || '').substring(0, 2000);

      // Extract artifact URLs from the response and tool calls
      const artifacts = this.extractArtifacts(result.messages || []);

      const taskResult = {
        summary: responseSummary,
        artifacts,
        turnCount: result.turnCount,
        toolCallCount: result.toolCallCount,
        costUsd: result.totalCostUsd,
        timedOut: result.timedOut || false,
      };

      // Mark task as completed
      await this.pool.query(`
        UPDATE ob_background_tasks
        SET status = 'completed', result = $1, tokens_used = $2,
            model_used = 'haiku', completed_at = NOW(),
            progress = $3
        WHERE id = $4
      `, [
        JSON.stringify(taskResult),
        totalTokens,
        JSON.stringify({ step: 'completed', pct: 100 }),
        task.id,
      ]);

      console.log(`[BackgroundExecutor] Task #${task.id} completed (${result.turnCount} turns, ${totalTokens} tokens, $${(result.totalCostUsd || 0).toFixed(4)})`);

      // Notify: capture result to conversation memory and send notification
      await this.notifyCompletion(task, taskResult);

    } catch (err) {
      console.error(`[BackgroundExecutor] Task #${task.id} failed:`, err.message);

      await this.pool.query(`
        UPDATE ob_background_tasks
        SET status = 'failed', error_message = $1, completed_at = NOW(),
            progress = $2
        WHERE id = $3
      `, [
        err.message.substring(0, 500),
        JSON.stringify({ step: 'failed', pct: 0 }),
        task.id,
      ]);

      // Best-effort notification of failure
      await this.notifyCompletion(task, { summary: `Task failed: ${err.message}`, artifacts: [] }).catch(() => {});
    }
  }

  /**
   * Extract artifact URLs from tool result messages in the conversation.
   * Looks for URLs in tool results from generate_pdf, generate_pptx, generate_chart, etc.
   */
  extractArtifacts(messages) {
    const artifacts = [];
    const urlPattern = /https?:\/\/[^\s"'<>]+\.(pdf|pptx|xlsx|png|jpg|svg|csv)/gi;

    for (const msg of messages) {
      if (!msg.content || !Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        if (block.type !== 'tool_result') continue;

        const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        const matches = text.match(urlPattern);
        if (matches) {
          for (const url of matches) {
            const ext = url.split('.').pop().toLowerCase();
            const typeMap = {
              pdf: 'pdf', pptx: 'presentation', xlsx: 'spreadsheet',
              png: 'chart', jpg: 'image', svg: 'chart', csv: 'data',
            };
            artifacts.push({
              type: typeMap[ext] || 'file',
              url,
              filename: url.split('/').pop(),
            });
          }
        }
      }
    }

    return artifacts;
  }

  /**
   * Notify the user that a background task is complete.
   * Captures to conversation memory and sends a notification if possible.
   */
  async notifyCompletion(task, result) {
    const artifactList = (result.artifacts || [])
      .map(a => `- ${a.filename || a.type}: ${a.url}`)
      .join('\n');

    const completionMessage = [
      `Background task #${task.id} (${task.task_type}) ${result.summary ? 'completed' : 'failed'}.`,
      result.summary ? `Summary: ${result.summary.substring(0, 500)}` : '',
      artifactList ? `\nArtifacts:\n${artifactList}` : '',
    ].filter(Boolean).join('\n');

    // Capture to conversation memory
    if (task.conversation_id || task.user_id) {
      await captureMessage({
        brand_id: task.brand_id,
        session_id: task.conversation_id || undefined,
        channel: 'background_task',
        direction: 'outbound',
        content: completionMessage,
        metadata: { taskId: task.id, taskType: task.task_type },
        source_ref: `bg_task_${task.id}_result`,
        user_id: task.user_id,
        memory_type: 'task_result',
      }).catch(err => {
        console.error(`[BackgroundExecutor] Failed to capture result for task #${task.id}:`, err.message);
      });
    }

    // Try to send a notification via the notify tool
    try {
      const notifyTool = getTool('notify');
      if (notifyTool) {
        const shortSummary = `Your background task "${task.task_description.substring(0, 60)}" is ${result.artifacts?.length ? 'complete' : 'done'}. ${artifactList ? 'Artifacts ready.' : ''}`;
        await notifyTool.execute(
          { message: shortSummary, channel: 'telegram' },
          { brandId: task.brand_id, userId: task.user_id, conversationId: task.conversation_id }
        );
      }
    } catch (err) {
      // Best-effort notification; do not fail the task over this
      console.warn(`[BackgroundExecutor] Notify failed for task #${task.id}:`, err.message);
    }
  }

  /**
   * Recover tasks that stopped heartbeating (stuck/crashed).
   * Re-enqueues up to 2 retries, then marks failed.
   */
  async recoverStuckTasks() {
    try {
      // Find tasks that stopped heartbeating (stuck/crashed)
      const stuck = await this.pool.query(
        `SELECT * FROM ob_background_tasks
         WHERE status = 'running'
         AND last_heartbeat_at IS NOT NULL
         AND last_heartbeat_at < NOW() - INTERVAL '60 seconds'`
      );

      for (const task of stuck.rows) {
        if (task.retry_count < 2) {
          // Re-enqueue for retry
          await this.pool.query(
            `UPDATE ob_background_tasks SET status = 'pending', retry_count = retry_count + 1,
             last_heartbeat_at = NULL, started_at = NULL WHERE id = $1`,
            [task.id]
          );
          console.log(`[BackgroundExecutor] Re-enqueued stuck task #${task.id} (retry ${task.retry_count + 1}/2)`);

          // For pptx_generation tasks, fire off direct processing
          if (task.task_type === 'pptx_generation' && task.context) {
            try {
              const generatePptx = require('../tools/generate_pptx.tool');
              if (generatePptx.retryTask) {
                generatePptx.retryTask(task);
              }
            } catch (e) {
              console.error(`[BackgroundExecutor] Failed to trigger PPTX retry for task #${task.id}:`, e.message);
            }
          }
        } else {
          // Max retries exceeded — mark failed
          await this.pool.query(
            `UPDATE ob_background_tasks SET status = 'failed', error_message = 'Exceeded retry limit after process restart',
             completed_at = NOW() WHERE id = $1`,
            [task.id]
          );
          console.log(`[BackgroundExecutor] Failed stuck task #${task.id} (exceeded 2 retries)`);

          // Update placeholder message if exists
          if (task.placeholder_message_id) {
            await this.pool.query(
              `UPDATE ob_memory SET content = $1, metadata = metadata || $2::jsonb WHERE id = $3`,
              ['Failed to generate presentation after multiple attempts.',
               JSON.stringify({ type: 'artifact_failed', error: 'Exceeded retry limit', taskId: task.id }),
               task.placeholder_message_id]
            ).catch(() => {});
          }
        }
      }

      if (stuck.rows.length > 0) {
        console.log(`[BackgroundExecutor] Recovered ${stuck.rows.length} stuck task(s)`);
      }
    } catch (err) {
      console.error('[BackgroundExecutor] Error in recoverStuckTasks:', err.message);
    }
  }

  /**
   * Poll for pending tasks and process them.
   */
  async pollOnce() {
    if (this._stopping || this._running >= MAX_CONCURRENT) return;

    let task;
    try {
      task = await this.claimTask();
    } catch (err) {
      console.error('[BackgroundExecutor] Claim query failed:', err.message);
      return;
    }

    if (!task) return;

    this._running++;
    const taskPromise = this.processTask(task).finally(() => {
      this._running--;
      this._activeTasks.delete(taskPromise);
    });
    this._activeTasks.add(taskPromise);
  }

  /**
   * Start the background executor polling loop.
   */
  start() {
    if (this._pollInterval) return;

    console.log(`[BackgroundExecutor] Starting (poll=${POLL_INTERVAL_MS / 1000}s, maxConcurrent=${MAX_CONCURRENT}, model=haiku, cap=$${DOLLAR_CAP_PER_TASK})`);

    this._stopping = false;
    this._pollInterval = setInterval(() => this.pollOnce(), POLL_INTERVAL_MS);

    // Run first poll immediately
    this.pollOnce();

    // Stuck task recovery: check every 60s + immediately on boot
    this._recoveryInterval = setInterval(() => this.recoverStuckTasks(), 60000);
    this.recoverStuckTasks();
  }

  /**
   * Stop the background executor gracefully.
   */
  async stop() {
    this._stopping = true;
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._recoveryInterval) {
      clearInterval(this._recoveryInterval);
      this._recoveryInterval = null;
    }

    if (this._activeTasks.size > 0) {
      console.log(`[BackgroundExecutor] Waiting for ${this._activeTasks.size} active task(s) to finish...`);
      await Promise.allSettled([...this._activeTasks]);
    }

    console.log('[BackgroundExecutor] Stopped');
  }

  getRunningCount() {
    return this._running;
  }
}

module.exports = { BackgroundExecutor };
