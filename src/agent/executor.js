// src/agent/executor.js
'use strict';

const { pool } = require('../db');
const { callWithFallback } = require('./llm-client');
const { getTool, getToolSchemas } = require('../tools/registry');
const { recall } = require('../utils/recall');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');

const MAX_TOOL_ROUNDS = 10;
const MAX_TOKENS = 200_000;
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
  const serverTools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  // 4. Multi-turn agent loop
  const messages = [{ role: 'user', content: `Execute task: ${task.name}` }];
  let finalResult = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { response, cost } = await callWithFallback({
      system: systemPrompt,
      messages,
      tools: agentTools,
      serverTools,
    });

    totalCost += cost.costUsd;
    totalTokens += cost.inputTokens + cost.outputTokens;

    // Cost cap check
    if (task.max_cost_per_run && totalCost > parseFloat(task.max_cost_per_run)) {
      sendTelegramMessage(`Warning: Task "${task.name}" exceeded cost cap ($${totalCost.toFixed(4)}). Stopping.`);
      return { success: false, result: { summary: 'Cost cap exceeded' }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    // Token safety cap
    if (totalTokens > MAX_TOKENS) {
      console.warn(`[Executor] Task ${task.id} hit ${MAX_TOKENS / 1000}k token cap`);
      return { success: false, result: { summary: `Token safety cap exceeded (${MAX_TOKENS / 1000}k)` }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      finalResult = { summary: textBlocks.map(b => b.text).join('\n') };
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      const tool = getTool(toolBlock.name);
      let result;
      if (!tool) {
        result = { success: false, data: null, summary: `Unknown tool: ${toolBlock.name}` };
      } else {
        try {
          result = await withTimeout(tool.execute(toolBlock.input || {}, { brandId, userId: task.user_id, pool }));
        } catch (err) {
          result = { success: false, data: null, summary: `Tool error: ${err.message}` };
        }
      }
      result = validateResult(result);
      toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'user', content: toolResults });

    if (round >= MAX_TOOL_ROUNDS - 1) {
      console.warn(`[Executor] Task ${task.id} hit max tool rounds (${MAX_TOOL_ROUNDS})`);
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

module.exports = { executeAgentTask };
