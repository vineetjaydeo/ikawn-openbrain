// src/agent/executor.js
'use strict';

const { pool } = require('../db');
const { callWithFallback } = require('./llm-client');
const { getTool, getToolSchemas, checkToolPermission } = require('../tools/registry');
const { recall } = require('../utils/recall');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');
const { feature } = require('../utils/features');

const MAX_TOOL_ROUNDS = 10;
const MAX_TOKENS = 50_000;
const TOOL_TIMEOUT_MS = 20_000;
const TOOL_CONCURRENCY = 5;

/**
 * Wrap a promise with a timeout.
 */
function withTimeout(promise, ms = TOOL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool timeout after ${ms}ms`)), ms)),
  ]);
}

/**
 * Execute a single tool block and return the validated result.
 * context.resolveTool is optional — defaults to registry's getTool.
 */
async function executeSingleTool(toolBlock, context) {
  const resolve = context.resolveTool || getTool;
  const tool = resolve(toolBlock.name);
  let result;
  if (!tool) {
    result = { success: false, data: null, summary: `Unknown tool: ${toolBlock.name}` };
  } else {
    // Feature flag check for gated tools
    const CODE_TOOL_NAMES = ['code_read', 'code_write', 'code_edit', 'bash_exec'];
    const DEPLOY_TOOL_NAMES = ['deploy_openbrain'];
    if (CODE_TOOL_NAMES.includes(toolBlock.name) && !feature('CODE_TOOLS')) {
      result = { success: false, data: null, summary: `Tool ${toolBlock.name} is disabled (CODE_TOOLS feature flag is off)` };
    } else if (DEPLOY_TOOL_NAMES.includes(toolBlock.name) && !feature('DEPLOY_TOOLS')) {
      result = { success: false, data: null, summary: `Tool ${toolBlock.name} is disabled (DEPLOY_TOOLS feature flag is off)` };
    } else {
      // Permission check before execution
      const permission = checkToolPermission(toolBlock.name, {
        brandId: context.brandId,
        userId: context.userId,
        isInternal: context.brandId === 'ikawn',
      });
      if (!permission.allowed) {
        result = { success: false, data: null, summary: `Permission denied: ${permission.reason}` };
      } else {
        try {
          result = await withTimeout(tool.execute(toolBlock.input || {}, context));
        } catch (err) {
          result = { success: false, data: null, summary: `Tool error: ${err.message}` };
        }
      }
    }
  }
  return validateResult(result);
}

/**
 * Execute tool blocks in parallel with a concurrency cap.
 * Returns tool_result objects in the same order as toolBlocks (critical for Anthropic API).
 */
async function executeToolsParallel(toolBlocks, context) {
  const startTime = Date.now();

  // Single tool optimization — skip Promise.allSettled overhead
  if (toolBlocks.length === 1) {
    const result = await executeSingleTool(toolBlocks[0], context);
    console.log(`[Executor] 1 tool executed in ${Date.now() - startTime}ms (direct)`);
    return [{ type: 'tool_result', tool_use_id: toolBlocks[0].id, content: JSON.stringify(result) }];
  }

  // Process in batches of TOOL_CONCURRENCY
  const results = new Array(toolBlocks.length);

  for (let i = 0; i < toolBlocks.length; i += TOOL_CONCURRENCY) {
    const batch = toolBlocks.slice(i, i + TOOL_CONCURRENCY);
    const batchPromises = batch.map(block => executeSingleTool(block, context));
    const settled = await Promise.allSettled(batchPromises);

    for (let j = 0; j < settled.length; j++) {
      const idx = i + j;
      const outcome = settled[j];
      let result;
      if (outcome.status === 'fulfilled') {
        result = outcome.value;
      } else {
        result = { success: false, data: null, summary: `Tool error: ${outcome.reason?.message || 'Unknown error'}` };
      }
      results[idx] = { type: 'tool_result', tool_use_id: toolBlocks[idx].id, content: JSON.stringify(result) };
    }
  }

  console.log(`[Executor] ${toolBlocks.length} tools executed in ${Date.now() - startTime}ms (parallel)`);
  return results;
}

/**
 * Validate tool response contract.
 */
function validateResult(result) {
  if (!result || typeof result !== 'object') {
    return { success: false, data: null, summary: 'No result returned' };
  }
  if (typeof result.success !== 'boolean') result.success = false;
  if (typeof result.summary !== 'string') result.summary = result.summary || 'No summary provided';
  return result;
}

/**
 * Execute a Tier 2 (agent) task.
 * Claude reasons about the task, calls tools, and produces a final result.
 */
async function executeAgentTask(task, agentDef) {
  const brandId = task.brand_id || 'ikawn';
  let totalCost = 0;
  let totalTokens = 0;

  // 1. Build context: RAG + past runs
  let memoryContext = '';
  try {
    const recalled = await recall({
      brandId,
      userId: task.user_id,
      query: `${task.name}: ${task.description || task.tool}`,
      memoryTypes: agentDef.memory_tags || undefined,
      source: 'both',
      limit: 10,
    });
    if (recalled.memories.length > 0) {
      memoryContext = recalled.memories.map(m => `- [${m.memoryType}] ${m.content}`).join('\n');
    }
  } catch (err) {
    console.warn(`[Executor] RAG failed for task ${task.id}:`, err.message);
  }

  let pastRunsContext = '';
  try {
    const { rows: pastRuns } = await pool.query(
      'SELECT status, result, error, completed_at FROM task_runs WHERE task_id = $1 ORDER BY started_at DESC LIMIT 3',
      [task.id]
    );
    if (pastRuns.length > 0) {
      pastRunsContext = pastRuns.map(r => {
        const date = r.completed_at ? new Date(r.completed_at).toLocaleDateString() : 'in-progress';
        return `[${date}] ${r.status}: ${r.result?.summary || r.error || 'no details'}`;
      }).join('\n');
    }
  } catch (_) {}

  // 2. System prompt
  const systemPrompt = `${agentDef.persona}

CURRENT TASK: ${task.name}
${task.description ? `DESCRIPTION: ${task.description}` : ''}
TASK CONFIG: ${JSON.stringify(task.config || {})}

${memoryContext ? `RELEVANT MEMORY:\n${memoryContext}` : ''}
${pastRunsContext ? `PAST RUNS:\n${pastRunsContext}` : ''}

INSTRUCTIONS:
- Use tools to complete this task
- Be thorough but efficient
- End with a clear summary of what you did`;

  // 3. Tool definitions
  const agentTools = getToolSchemas(agentDef.tools || []);
  const maxSearches = (task.config && task.config.max_web_searches) || 5;
  const serverTools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }];

  // Model override: tasks can specify config.model (e.g., 'claude-haiku-4-5-20251001' for cheap tasks)
  const modelOverride = (task.config && task.config.model) || null;

  // 4. Multi-turn agent loop
  const messages = [{ role: 'user', content: `Execute task: ${task.name}` }];
  let finalResult = null;

  const maxRounds = (task.config && task.config.max_tool_rounds) || MAX_TOOL_ROUNDS;
  for (let round = 0; round < maxRounds; round++) {
    const { response, cost } = await callWithFallback({
      system: systemPrompt,
      messages,
      tools: agentTools,
      serverTools,
      model: modelOverride,
    });

    totalCost += cost.costUsd;
    totalTokens += cost.inputTokens + cost.outputTokens;

    // Cost cap check
    if (task.max_cost_per_run && totalCost > parseFloat(task.max_cost_per_run)) {
      sendTelegramMessage(`Warning: Task "${task.name}" exceeded cost cap ($${totalCost.toFixed(4)}). Stopping.`);
      return { success: false, result: { summary: 'Cost cap exceeded' }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    // Token safety cap (task config can override default)
    const tokenCap = (task.config && task.config.max_tokens) || MAX_TOKENS;
    if (totalTokens > tokenCap) {
      console.warn(`[Executor] Task ${task.id} hit ${tokenCap / 1000}k token cap`);
      return { success: false, result: { summary: `Token safety cap exceeded (${tokenCap / 1000}k)` }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      finalResult = { summary: textBlocks.map(b => b.text).join('\n') };
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = await executeToolsParallel(toolUseBlocks, { brandId, userId: task.user_id, pool });

    messages.push({ role: 'user', content: toolResults });

    if (round >= MAX_TOOL_ROUNDS - 1) {
      console.warn(`[Executor] Task ${task.id} hit max tool rounds (${maxRounds})`);
    }
  }

  if (!finalResult) finalResult = { summary: 'Agent reached max tool rounds without final response' };

  // 5. Capture to memory
  captureMessage({
    brand_id: brandId,
    channel: 'agent',
    direction: 'outbound',
    content: `[${agentDef.slug}] Task "${task.name}": ${finalResult.summary}`.slice(0, 2000),
    source_ref: `agent_${task.id}_${Date.now()}`,
    metadata: { project: 'agent-platform' },
  });

  return { success: true, result: finalResult, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
}

module.exports = { executeAgentTask, executeToolsParallel, executeSingleTool };
