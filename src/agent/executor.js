// src/agent/executor.js
'use strict';

const { pool } = require('../db');
const { callWithFallback } = require('./llm-client');
const { getTool, getToolSchemas, checkToolPermission } = require('../tools/registry');
const { recall } = require('../utils/recall');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');
const { feature } = require('../utils/features');

const TOOL_TIMEOUT_MS = 20_000;
const TOOL_CONCURRENCY = 5;
const MAX_TOOL_RESULT_CHARS = 4000;     // Cap individual tool results
const COMPRESS_AFTER_ROUND = 3;          // Compress old tool results after this round

// ── Tiered token budgets based on task tools ──────────────────────────
const CODE_TOOLS = new Set(['code_read', 'code_write', 'code_edit', 'bash_exec', 'deploy_openbrain']);
const RESEARCH_TOOLS = new Set(['web_search', 'ga_report', 'system_status', 'fly_status', 'search_memory']);

const TOKEN_TIERS = {
  coding:   { maxTokens: 120_000, maxRounds: 6 },
  research: { maxTokens: 40_000,  maxRounds: 4 },
  simple:   { maxTokens: 20_000,  maxRounds: 3 },
};

/**
 * Determine the token tier for a task based on its agent's tools.
 */
function getTokenTier(agentTools) {
  const tools = agentTools || [];
  if (tools.some(t => CODE_TOOLS.has(t))) return TOKEN_TIERS.coding;
  if (tools.some(t => RESEARCH_TOOLS.has(t))) return TOKEN_TIERS.research;
  return TOKEN_TIERS.simple;
}

function getTierName(tier) {
  if (tier === TOKEN_TIERS.coding) return 'coding';
  if (tier === TOKEN_TIERS.research) return 'research';
  return 'simple';
}

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
 * Truncate a tool result string to MAX_TOOL_RESULT_CHARS.
 * Preserves the first and last portions for context.
 */
function truncateToolResult(content) {
  if (!content || content.length <= MAX_TOOL_RESULT_CHARS) return content;
  const half = Math.floor(MAX_TOOL_RESULT_CHARS / 2) - 30;
  return content.slice(0, half) + `\n\n... [truncated ${content.length - MAX_TOOL_RESULT_CHARS} chars] ...\n\n` + content.slice(-half);
}

/**
 * Compress older messages in the conversation to save tokens.
 * Replaces verbose tool_result content from early rounds with summaries.
 */
function compressOldMessages(messages, currentRound) {
  if (currentRound < COMPRESS_AFTER_ROUND) return messages;

  return messages.map((msg, idx) => {
    // Only compress user messages (which contain tool_results) from early rounds
    // Each round = 2 messages (assistant + user), so early rounds are low indices
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    // Don't compress the last 2 user messages (most recent context)
    const userMsgIdx = messages.filter((m, i) => i <= idx && m.role === 'user').length;
    const totalUserMsgs = messages.filter(m => m.role === 'user').length;
    if (totalUserMsgs - userMsgIdx < 2) return msg;

    // Compress tool_result blocks
    const compressed = msg.content.map(block => {
      if (block.type !== 'tool_result') return block;
      const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      if (content.length <= 500) return block; // Already small
      // Extract just the summary from the JSON result
      try {
        const parsed = JSON.parse(content);
        return { ...block, content: JSON.stringify({ success: parsed.success, summary: parsed.summary }) };
      } catch {
        return { ...block, content: content.slice(0, 200) + '... [compressed]' };
      }
    });

    return { ...msg, content: compressed };
  });
}

/**
 * Execute a single tool block and return the validated result.
 */
async function executeSingleTool(toolBlock, context) {
  const resolve = context.resolveTool || getTool;
  const tool = resolve(toolBlock.name);
  let result;
  if (!tool) {
    result = { success: false, data: null, summary: `Unknown tool: ${toolBlock.name}` };
  } else {
    const CODE_TOOL_NAMES = ['code_read', 'code_write', 'code_edit', 'bash_exec'];
    const DEPLOY_TOOL_NAMES = ['deploy_openbrain'];
    if (CODE_TOOL_NAMES.includes(toolBlock.name) && !feature('CODE_TOOLS')) {
      result = { success: false, data: null, summary: `Tool ${toolBlock.name} is disabled (CODE_TOOLS feature flag is off)` };
    } else if (DEPLOY_TOOL_NAMES.includes(toolBlock.name) && !feature('DEPLOY_TOOLS')) {
      result = { success: false, data: null, summary: `Tool ${toolBlock.name} is disabled (DEPLOY_TOOLS feature flag is off)` };
    } else {
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
 */
async function executeToolsParallel(toolBlocks, context) {
  const startTime = Date.now();

  if (toolBlocks.length === 1) {
    const result = await executeSingleTool(toolBlocks[0], context);
    const content = truncateToolResult(JSON.stringify(result));
    console.log(`[Executor] 1 tool executed in ${Date.now() - startTime}ms (direct)`);
    return [{ type: 'tool_result', tool_use_id: toolBlocks[0].id, content }];
  }

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
      results[idx] = { type: 'tool_result', tool_use_id: toolBlocks[idx].id, content: truncateToolResult(JSON.stringify(result)) };
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
 * Supports checkpoint/continue: if task has a saved checkpoint, resumes from there.
 */
async function executeAgentTask(task, agentDef) {
  const brandId = task.brand_id || 'ikawn';
  let totalCost = 0;
  let totalTokens = 0;

  // 1. Check for checkpoint (continue from previous run)
  let checkpoint = null;
  if (task._continueFromRun) {
    try {
      const { rows } = await pool.query(
        'SELECT result FROM task_runs WHERE id = $1',
        [task._continueFromRun]
      );
      if (rows[0]?.result?.checkpoint) {
        checkpoint = rows[0].result.checkpoint;
        console.log(`[Executor] Resuming task ${task.id} from checkpoint (run ${task._continueFromRun}, ${checkpoint.messages.length} messages, round ${checkpoint.round})`);
      }
    } catch (err) {
      console.warn(`[Executor] Failed to load checkpoint:`, err.message);
    }
  }

  // 2. Build context: RAG + past runs (skip if continuing)
  let memoryContext = '';
  if (!checkpoint) {
    try {
      const recalled = await recall({
        brandId,
        userId: task.user_id,
        query: `${task.name}: ${task.description || task.tool}`,
        memoryTypes: agentDef.memory_tags || undefined,
        source: 'both',
        limit: 5, // Reduced from 10 to save tokens
      });
      if (recalled.memories.length > 0) {
        memoryContext = recalled.memories.map(m => `- [${m.memoryType}] ${m.content}`).join('\n');
      }
    } catch (err) {
      console.warn(`[Executor] RAG failed for task ${task.id}:`, err.message);
    }
  }

  let pastRunsContext = '';
  if (!checkpoint) {
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
  }

  // 3. System prompt
  const systemPrompt = `${agentDef.persona}

CURRENT TASK: ${task.name}
${task.description ? `DESCRIPTION: ${task.description}` : ''}

${memoryContext ? `RELEVANT MEMORY:\n${memoryContext}` : ''}
${pastRunsContext ? `PAST RUNS:\n${pastRunsContext}` : ''}

INSTRUCTIONS:
- Use tools to complete this task
- Be thorough but efficient — minimize unnecessary tool calls
- Prefer targeted reads (specific line ranges) over full file reads
- End with a clear summary of what you did`;

  // 4. Tool definitions
  const agentTools = getToolSchemas(agentDef.tools || []);
  const maxSearches = (task.config && task.config.max_web_searches) || 3;
  const serverTools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }];

  const modelOverride = (task.config && task.config.model) || null;

  // 5. Determine token tier
  const tier = getTokenTier(agentDef.tools);
  const maxRounds = (task.config && task.config.max_tool_rounds) || tier.maxRounds;
  const tokenCap = (task.config && task.config.max_tokens) || tier.maxTokens;
  console.log(`[Executor] Task ${task.id} tier: ${getTierName(tier)} (${tokenCap/1000}k tokens, ${maxRounds} rounds${checkpoint ? ', CONTINUING' : ''})`);

  // 6. Multi-turn agent loop
  let messages;
  let startRound = 0;

  if (checkpoint) {
    messages = checkpoint.messages;
    startRound = checkpoint.round;
    totalCost = checkpoint.cost || 0;
    totalTokens = checkpoint.tokens || 0;
    // Add continuation prompt
    messages.push({ role: 'user', content: 'Continue from where you left off. You were interrupted by a token cap. Complete the remaining work.' });
  } else {
    messages = [{ role: 'user', content: `Execute task: ${task.name}` }];
  }

  let finalResult = null;
  let stoppedReason = null;

  for (let round = startRound; round < maxRounds; round++) {
    // Compress old messages to save tokens
    const compressedMessages = compressOldMessages(messages, round);

    const { response, cost } = await callWithFallback({
      system: systemPrompt,
      messages: compressedMessages,
      tools: agentTools,
      serverTools,
      model: modelOverride,
    });

    totalCost += cost.costUsd;
    totalTokens += cost.inputTokens + cost.outputTokens;

    // Cost cap check
    if (task.max_cost_per_run && totalCost > parseFloat(task.max_cost_per_run)) {
      stoppedReason = 'cost_cap';
      console.warn(`[Executor] Task ${task.id} hit cost cap ($${totalCost.toFixed(4)})`);
      break;
    }

    // Token safety cap
    if (totalTokens > tokenCap) {
      stoppedReason = 'token_cap';
      console.warn(`[Executor] Task ${task.id} hit ${tokenCap / 1000}k token cap`);
      break;
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

    if (round >= maxRounds - 1) {
      stoppedReason = 'max_rounds';
      console.warn(`[Executor] Task ${task.id} hit max tool rounds (${maxRounds})`);
    }
  }

  // 7. Handle stopped tasks — save checkpoint for continue
  if (stoppedReason) {
    const checkpoint = {
      messages,
      round: messages.filter(m => m.role === 'assistant').length,
      cost: totalCost,
      tokens: totalTokens,
      stoppedReason,
    };

    const summary = stoppedReason === 'cost_cap'
      ? `Cost cap exceeded ($${totalCost.toFixed(4)}). Checkpoint saved — use 'continue' to resume.`
      : stoppedReason === 'token_cap'
      ? `Token cap exceeded (${(totalTokens / 1000).toFixed(0)}k/${tokenCap / 1000}k). Checkpoint saved — use 'continue' to resume.`
      : `Max rounds reached (${maxRounds}). Checkpoint saved — use 'continue' to resume.`;

    sendTelegramMessage(`⚠️ Task "${task.name}" paused: ${summary}\nCost so far: $${totalCost.toFixed(4)}`).catch(() => {});

    return {
      success: false,
      result: { summary, checkpoint },
      cost: { costUsd: totalCost, tokensUsed: totalTokens },
    };
  }

  if (!finalResult) finalResult = { summary: 'Agent reached max tool rounds without final response' };

  // 8. Capture to memory
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

module.exports = { executeAgentTask, executeToolsParallel, executeSingleTool, getTokenTier, TOKEN_TIERS, getTierName };
