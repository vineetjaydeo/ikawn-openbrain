'use strict';

const { randomUUID } = require('crypto');
const { callClaude: _callClaude, callClaudeStreaming: _callClaudeStreaming } = require('../agent/llm-client');
const { resolveModel } = require('./model-router');
const { logLLMCall, checkBudget } = require('./cost-tracker');
const { captureFromLoopTurn } = require('./episodic-capture');

// ── Test injection points ──
let _callClaudeFn = null;
function getCallClaude() { return _callClaudeFn || _callClaude; }
function _setCallClaude(fn) { _callClaudeFn = fn; }

let _callClaudeStreamingFn = null;
function getCallClaudeStreaming() { return _callClaudeStreamingFn || _callClaudeStreaming; }
function _setCallClaudeStreaming(fn) { _callClaudeStreamingFn = fn; }

/**
 * Lightweight text similarity using word-overlap Jaccard coefficient.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1 similarity score
 */
function textSimilarity(a, b) {
  if (a === '' && b === '') return 1;
  if (!a || !b) return 0;
  const tokenize = (s) => {
    const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    return new Set(words);
  };
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if the reasoning loop has converged (diminishing returns).
 * @param {string[]} turnTexts
 * @param {number} currentTurn
 * @param {number} [threshold=0.85]
 * @returns {{converged: boolean, avgSimilarity: number}}
 */
function checkConvergence(turnTexts, currentTurn, threshold = 0.85) {
  if (currentTurn < 6 || turnTexts.length < 6) return { converged: false, avgSimilarity: 0 };
  const recent = turnTexts.slice(-3);
  const previous = turnTexts.slice(-6, -3);
  let totalSim = 0;
  for (let j = 0; j < 3; j++) {
    totalSim += textSimilarity(recent[j], previous[j]);
  }
  const avgSimilarity = totalSim / 3;
  return { converged: avgSimilarity >= threshold, avgSimilarity };
}

class BudgetExceededError extends Error {
  constructor(spent, cap) {
    super(`Budget exceeded: spent $${spent.toFixed(6)} of $${cap.toFixed(6)} cap`);
    this.name = 'BudgetExceededError';
    this.spent = spent;
    this.cap = cap;
  }
}

/**
 * Patch orphaned tool_use blocks that lack matching tool_result messages.
 * Anthropic API rejects conversations with unpaired tool_use — this ensures
 * every exit path produces a valid conversation state.
 * (Adapted from Claude Code's yieldMissingToolResultBlocks pattern)
 *
 * @param {Array} messages - Conversation messages array (mutated in place)
 * @param {string} [reason='Loop terminated'] - Reason string for the error result
 */
function patchOrphans(messages, reason = 'Loop terminated') {
  const pairedIds = new Set();
  for (const m of messages) {
    if (m.role === 'user' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'tool_result') pairedIds.add(b.tool_use_id);
      }
    }
  }

  const orphans = [];
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'tool_use' && !pairedIds.has(b.id)) {
          orphans.push(b);
        }
      }
    }
  }

  if (orphans.length > 0) {
    console.warn(`[Harness] Patching ${orphans.length} orphaned tool_use block(s) — ${reason}`);
    messages.push({
      role: 'user',
      content: orphans.map(tu => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `Tool execution was interrupted — ${reason}`,
        is_error: true,
      })),
    });
  }
}

/**
 * Multi-turn LLM reasoning loop with tool execution.
 * Modeled after Claude Code's query loop (lcc/src/query.ts):
 * - Single-turn tool_choice: force on turn 0 only, clear after
 * - No compliance hacks: trust the API contract
 * - Orphan patching on ALL exit paths
 * - Max output token escalation on truncation
 *
 * @param {Object} config
 * @param {string} [config.sessionId]
 * @param {string} [config.brandId]
 * @param {string} [config.modelTier]
 * @param {Array}  [config.tools]
 * @param {string}  config.systemPrompt
 * @param {number} [config.dollarCap]
 * @param {Array}   config.messages      - Message array (mutated in place)
 * @param {Function} [config.executeToolFn]
 * @param {number} [config.maxIterations]
 * @param {Function} [config.onEvent]
 * @param {number} [config.timeoutMs]
 * @param {string} [config.userId]
 * @param {object} [config.toolRegistry]
 * @param {string} [config.trustLevel]
 * @param {object} [config.toolChoice]
 * @returns {Promise<Object>}
 */
async function executeReasoningLoop({
  sessionId,
  brandId = 'ikawn',
  modelTier = 'balanced',
  tools = [],
  systemPrompt,
  dollarCap,
  messages,
  executeToolFn,
  maxIterations = 8,
  onEvent,
  timeoutMs,
  userId,
  toolRegistry,
  trustLevel,
  toolChoice,
}) {
  const { modelId } = resolveModel(modelTier);
  const executionId = randomUUID();
  const startTime = timeoutMs ? Date.now() : null;

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  let turnCount = 0;
  let toolCallCount = 0;
  let accumulatedText = '';
  const assistantTurnTexts = [];

  // Max output token escalation (LCC pattern)
  // Generation tools (HTML, PDF, DOCX, spreadsheet, PPTX) produce large output — start higher
  const GENERATION_TOOLS = ['generate_html', 'generate_pdf', 'generate_document', 'generate_spreadsheet', 'generate_pptx'];
  const isGenerationForced = toolChoice?.type === 'tool' && GENERATION_TOOLS.includes(toolChoice.name);
  let currentMaxTokens = isGenerationForced ? 16384 : 2048;
  let maxTokenRetries = 0;

  // Cross-session continuity (best-effort, once at start)
  if (sessionId && userId) {
    try {
      const { loadPreviousSessionContext } = require('./cross-session');
      const prevContext = await loadPreviousSessionContext({ brandId, userId, channel: 'web' });
      if (prevContext) {
        messages.unshift({ role: 'user', content: `[System context - previous sessions]\n${prevContext}` });
      }
    } catch (_) { /* best-effort */ }
  }

  for (let i = 0; i < maxIterations; i++) {
    // ── Timeout check ──
    if (startTime && (Date.now() - startTime) >= timeoutMs) {
      patchOrphans(messages, 'timeout reached');
      if (onEvent) {
        onEvent({ type: 'timeout', partial: !!accumulatedText.trim() });
        onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
      }
      return {
        response: accumulatedText.trim() || '[Response time limit reached]',
        messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
        timedOut: true,
      };
    }

    // ── Budget check ──
    if (dollarCap && sessionId) {
      const budget = await checkBudget(sessionId, dollarCap);
      if (!budget.withinBudget) {
        patchOrphans(messages, 'budget exceeded');
        throw new BudgetExceededError(budget.spent, dollarCap);
      }
    }

    // ── Memory augmentation (first turn only, best-effort) ──
    if (sessionId && i === 0) {
      try {
        const { buildMemoryContext } = require('./memory-augmenter');
        const memoryContext = await buildMemoryContext(messages, { brandId, userId, sessionId });
        if (memoryContext) {
          messages.splice(Math.max(messages.length - 1, 0), 0,
            { role: 'user', content: `[System context - relevant memories]\n${memoryContext}` }
          );
        }
      } catch (_) { /* best-effort */ }
    }

    // ── Build LLM call params ──
    // tool_choice: force on iteration 0 ONLY, then clear (LCC pattern)
    const callParams = {
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: modelId,
      toolChoice: (i === 0 && toolChoice) ? toolChoice : undefined,
      maxTokens: currentMaxTokens,
    };

    let response, cost, stopReason;

    if (onEvent) {
      // ── Streaming path ──
      onEvent({ type: 'thinking' });
      const { events, buildResult } = getCallClaudeStreaming()(callParams);

      for await (const event of events) {
        if (event.type === 'text_delta') {
          onEvent({ type: 'text_delta', text: event.text });
        } else if (event.type === 'tool_use_start') {
          onEvent({ type: 'tool_start', name: event.name });
        } else if (event.type === 'server_tool_start') {
          onEvent({ type: 'tool_start', name: event.name, detail: event.input?.query });
        } else if (event.type === 'server_tool_done') {
          onEvent({ type: 'tool_done', name: event.name, success: true });
        }
      }

      const result = buildResult();
      response = result.response;
      cost = result.cost;
      stopReason = response.stop_reason || null;
    } else {
      // ── Non-streaming path ──
      const result = await getCallClaude()(callParams);
      response = result.response;
      cost = result.cost;
      stopReason = response.stop_reason || null;
    }

    totalTokensIn += cost.inputTokens;
    totalTokensOut += cost.outputTokens;
    totalCostUsd += cost.costUsd;
    turnCount++;

    if (sessionId) {
      await logLLMCall(sessionId, executionId, brandId, modelId, cost.inputTokens, cost.outputTokens);
    }

    // ── Separate content blocks ──
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');
    const turnText = textBlocks.map(b => b.text).join('\n');
    if (turnText) {
      accumulatedText += (accumulatedText ? '\n' : '') + turnText;
      assistantTurnTexts.push(turnText);
    }

    // ── Max output token escalation (LCC pattern) ──
    // If Claude was truncated, retry with doubled maxTokens (up to 64k, max 2 retries)
    // Also escalate when a tool call was truncated mid-JSON (toolUseBlocks exist but stop_reason is max_tokens)
    if (stopReason === 'max_tokens' && maxTokenRetries < 2) {
      // Check if a generation tool is being attempted (forced or voluntary)
      const hasGenerationTool = toolUseBlocks.some(b => GENERATION_TOOLS.includes(b.name));
      // Aggressive escalation for generation tools: jump straight to 16384, then 65536
      if (hasGenerationTool && currentMaxTokens < 16384) {
        currentMaxTokens = 16384;
      } else {
        currentMaxTokens = Math.min(currentMaxTokens * 2, 65536);
      }
      maxTokenRetries++;
      console.log(`[ReasoningLoop] max_tokens hit — escalating to ${currentMaxTokens} (retry ${maxTokenRetries}/2)${hasGenerationTool ? ' [generation tool detected]' : ''}`);
      // Don't increment i — retry this turn with more room
      i--;
      continue;
    }

    // ── Convergence check (turn 6+) ──
    if (i >= 6) {
      const { converged } = checkConvergence(assistantTurnTexts, i);
      if (converged) {
        console.log(`[ReasoningLoop] Convergence detected at turn ${i}`);
        patchOrphans(messages, 'convergence detected');
        if (onEvent) onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
        return {
          response: accumulatedText.trim() || '[Converged — no further progress]',
          messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
          converged: true,
        };
      }
    }

    // ── No tool calls = final text response, done ──
    if (toolUseBlocks.length === 0) {
      const finalResponse = turnText;

      if (sessionId && finalResponse) {
        captureFromLoopTurn(
          { content: finalResponse, role: 'assistant' },
          { brandId, userId, sessionId, channel: 'reasoning' }
        ).catch(() => {});
      }

      patchOrphans(messages, 'normal completion');
      if (onEvent) onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
      return {
        response: finalResponse,
        messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
      };
    }

    // ── Tool execution ──
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      let resultContent;
      let success = true;
      let artifactData = null;
      let taskData = null;

      // Input schema validation
      const toolDef = tools.find(t => t.name === block.name);
      if (toolDef?.input_schema?.required) {
        const missing = toolDef.input_schema.required.filter(f => !(f in (block.input || {})));
        if (missing.length > 0) {
          console.warn(`[Harness] Tool ${block.name} missing required fields: ${missing.join(', ')}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Input validation error: missing required fields: ${missing.join(', ')}. Please provide all required parameters.`,
            is_error: true,
          });
          continue;
        }
      }

      try {
        if (toolRegistry) {
          const { executeTool } = require('./tool-executor');
          const toolContext = {
            sessionId,
            brandId,
            userId: userId || undefined,
            workingMemory: null,
            costTracker: null,
            trustLevel: trustLevel || 'auto',
          };

          const envelope = await executeTool(block.name, block.input, toolContext, toolRegistry);

          if (envelope.gated) {
            if (onEvent) onEvent({ type: 'tool_gated', name: block.name, approvalRequired: envelope.approvalRequired });
            patchOrphans(messages, 'tool gated');
            return {
              response: accumulatedText.trim() || `[Tool ${block.name} requires ${envelope.approvalRequired} approval]`,
              messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
              gated: true,
              gatedTool: block.name,
              approvalRequired: envelope.approvalRequired,
            };
          }

          if (envelope.suspend) {
            if (onEvent) onEvent({ type: 'tool_suspended', name: block.name, error: envelope.error });
            resultContent = `Tool error (session suspended): ${envelope.error}`;
            success = false;
          } else if (envelope.hotl) {
            if (onEvent) onEvent({ type: 'tool_hotl', name: block.name, error: envelope.error });
            resultContent = `Tool error (requires human review): ${envelope.error}`;
            success = false;
          } else if (!envelope.ok) {
            resultContent = `Tool error: ${envelope.error}`;
            success = false;
          } else {
            if (envelope.summary) {
              resultContent = envelope.summary;
            } else if (typeof envelope.data === 'string') {
              resultContent = envelope.data;
            } else if (envelope.data?.taskId) {
              resultContent = `Task queued (ID: ${envelope.data.taskId}). The user can see a live progress card.`;
            } else {
              resultContent = JSON.stringify(envelope.data);
            }
            const ARTIFACT_TOOLS = ['generate_pdf', 'generate_pptx', 'generate_chart', 'generate_document', 'generate_spreadsheet', 'generate_html'];
            if (ARTIFACT_TOOLS.includes(block.name) && typeof envelope.data !== 'string') {
              artifactData = envelope.data;
            }
            if (envelope.data?.taskId && typeof envelope.data !== 'string') {
              taskData = envelope.data;
            }
            toolCallCount++;
          }
        } else {
          resultContent = await executeToolFn(block.name, block.input);
          toolCallCount++;
        }
      } catch (err) {
        resultContent = `Tool error: ${err.message}`;
        success = false;
      }

      if (onEvent) {
        onEvent({ type: 'tool_result', name: block.name, success, artifactData, taskData });
      }

      const resultStr = typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent);

      if (sessionId) {
        captureFromLoopTurn(
          { content: resultStr, role: 'tool_result', toolName: block.name },
          { brandId, userId, sessionId, channel: 'reasoning' }
        ).catch(() => {});
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultStr,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // ── Max iterations reached ──
  patchOrphans(messages, 'max iterations reached');
  if (onEvent) onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
  return {
    response: accumulatedText.trim() || '[Max iterations reached]',
    messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
  };
}

module.exports = { executeReasoningLoop, BudgetExceededError, _setCallClaude, _setCallClaudeStreaming, textSimilarity, checkConvergence };
