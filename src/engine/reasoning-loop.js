'use strict';

const { randomUUID } = require('crypto');
const { callClaude: _callClaude, callClaudeStreaming: _callClaudeStreaming } = require('../agent/llm-client');
const { resolveModel } = require('./model-router');
const { logLLMCall, checkBudget } = require('./cost-tracker');
const { captureFromLoopTurn } = require('./episodic-capture');

// Lazy accessors — allow test injection via _setCallClaude() / _setCallClaudeStreaming()
let _callClaudeFn = null;
function getCallClaude() { return _callClaudeFn || _callClaude; }
function _setCallClaude(fn) { _callClaudeFn = fn; }

let _callClaudeStreamingFn = null;
function getCallClaudeStreaming() { return _callClaudeStreamingFn || _callClaudeStreaming; }
function _setCallClaudeStreaming(fn) { _callClaudeStreamingFn = fn; }

/**
 * Lightweight text similarity using word-overlap Jaccard coefficient.
 * No external dependencies — pure in-process computation.
 *
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
 * Compares the last 3 assistant turn texts to the 3 before them.
 *
 * @param {string[]} turnTexts - Array of assistant response texts per turn
 * @param {number} currentTurn - Current turn index (0-based)
 * @param {number} [threshold=0.85] - Similarity threshold
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
 * Multi-turn LLM reasoning loop with tool execution.
 *
 * @param {Object} config
 * @param {string} [config.sessionId]    - Optional session ID for DB cost tracking
 * @param {string} [config.brandId]      - Brand ID (default: 'ikawn')
 * @param {string} [config.modelTier]    - 'fast'|'balanced'|'deep' (default: 'balanced')
 * @param {Array}  [config.tools]        - Claude tool definitions (Anthropic format)
 * @param {string}  config.systemPrompt  - System prompt
 * @param {number} [config.dollarCap]    - Optional dollar budget cap
 * @param {Array}   config.messages      - Message array (mutated in place)
 * @param {Function} [config.executeToolFn] - Legacy: async (toolName, toolInput) => string
 * @param {number} [config.maxIterations] - Max loop iterations (default: 25)
 * @param {number} [config.timeoutMs]    - Optional timeout in ms; checks elapsed time before each LLM call
 * @param {string} [config.userId]       - Optional userId for tool context
 * @param {object} [config.toolRegistry] - V2 registry object; if provided, uses tool executor instead of executeToolFn
 * @param {string} [config.trustLevel]   - 'auto'|'confirm'|'review' (default: 'auto')
 * @returns {Promise<Object>} { response, messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount, timedOut, gated?, gatedTool?, approvalRequired? }
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
  maxIterations = 25,
  onEvent,
  timeoutMs,
  userId,
  toolRegistry,
  trustLevel,
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
  const assistantTurnTexts = []; // For convergence detection

  // Cross-session continuity (optional, best-effort, once at start)
  if (sessionId && userId) {
    try {
      const { loadPreviousSessionContext } = require('./cross-session');
      const prevContext = await loadPreviousSessionContext({ brandId, userId, channel: 'web' });
      if (prevContext) {
        const contextMsg = { role: 'user', content: `[System context - previous sessions]\n${prevContext}` };
        messages.unshift(contextMsg);
      }
    } catch (_) { /* best-effort */ }
  }

  for (let i = 0; i < maxIterations; i++) {
    // Timeout check before each LLM call
    if (startTime && (Date.now() - startTime) >= timeoutMs) {
      if (onEvent) {
        onEvent({ type: 'timeout', partial: !!accumulatedText.trim() });
        onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
      }
      return {
        response: accumulatedText.trim() || '[Response time limit reached]',
        messages,
        totalTokensIn,
        totalTokensOut,
        totalCostUsd,
        turnCount,
        toolCallCount,
        timedOut: true,
      };
    }

    // Budget check before each LLM call
    if (dollarCap && sessionId) {
      const budget = await checkBudget(sessionId, dollarCap);
      if (!budget.withinBudget) {
        throw new BudgetExceededError(budget.spent, dollarCap);
      }
    }

    // Memory augmentation (optional, best-effort, first turn only)
    if (sessionId && i === 0) {
      try {
        const { buildMemoryContext } = require('./memory-augmenter');
        const memoryContext = await buildMemoryContext(messages, { brandId, userId, sessionId });
        if (memoryContext) {
          const memoryMsg = { role: 'user', content: `[System context - relevant memories]\n${memoryContext}` };
          messages.splice(Math.max(messages.length - 1, 0), 0, memoryMsg);
        }
      } catch (_) { /* best-effort */ }
    }

    const callParams = {
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: modelId,
    };

    let response, cost;

    if (onEvent) {
      // --- Streaming path ---
      onEvent({ type: 'thinking' });

      const { events, buildResult } = getCallClaudeStreaming()(callParams);

      // Iterate through stream events, forwarding relevant ones to onEvent
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

      // Build final result from accumulated stream data
      const result = buildResult();
      response = result.response;
      cost = result.cost;
    } else {
      // --- Non-streaming path (unchanged) ---
      const result = await getCallClaude()(callParams);
      response = result.response;
      cost = result.cost;
    }

    totalTokensIn += cost.inputTokens;
    totalTokensOut += cost.outputTokens;
    totalCostUsd += cost.costUsd;
    turnCount++;

    // Log cost to DB if session tracking is active
    if (sessionId) {
      await logLLMCall(sessionId, executionId, brandId, modelId, cost.inputTokens, cost.outputTokens);
    }

    // Extract tool_use and text blocks from response
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    // Accumulate text from each turn for timeout partial results
    const turnText = textBlocks.map(b => b.text).join('\n');
    if (turnText) accumulatedText += (accumulatedText ? '\n' : '') + turnText;

    // Track assistant turn texts for convergence detection
    if (turnText) assistantTurnTexts.push(turnText);

    // Convergence check: after turn 6+, detect diminishing returns
    if (i >= 6) {
      const { converged, avgSimilarity } = checkConvergence(assistantTurnTexts, i);
      if (converged) {
        console.log(`[ReasoningLoop] Convergence detected at turn ${i} — synthesizing`);
        if (onEvent) {
          onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
        }
        return {
          response: accumulatedText.trim() || '[Converged — no further progress]',
          messages,
          totalTokensIn,
          totalTokensOut,
          totalCostUsd,
          turnCount,
          toolCallCount,
          converged: true,
        };
      }
    }

    // No tool calls — final text response, we're done
    if (toolUseBlocks.length === 0) {
      const finalResponse = turnText;

      // Fire-and-forget episodic capture for final response
      if (sessionId && finalResponse) {
        captureFromLoopTurn(
          { content: finalResponse, role: 'assistant' },
          { brandId, userId, sessionId, channel: 'reasoning' }
        ).catch(() => {});
      }

      if (onEvent) {
        onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
      }
      return {
        response: finalResponse,
        messages,
        totalTokensIn,
        totalTokensOut,
        totalCostUsd,
        turnCount,
        toolCallCount,
      };
    }

    // Append assistant message with tool_use blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool via tool executor (v2) or legacy callback
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let resultContent;
      let success = true;

      try {
        if (toolRegistry) {
          // V2 path: use tool executor
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

          // Handle gated result (HOTL needed — Phase 4 will handle fully)
          if (envelope.gated) {
            if (onEvent) onEvent({ type: 'tool_gated', name: block.name, approvalRequired: envelope.approvalRequired });
            // Return partial results — loop cannot continue without approval
            return {
              response: accumulatedText.trim() || `[Tool ${block.name} requires ${envelope.approvalRequired} approval]`,
              messages,
              totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount,
              gated: true,
              gatedTool: block.name,
              approvalRequired: envelope.approvalRequired,
            };
          }

          // Handle suspended result
          if (envelope.suspend) {
            if (onEvent) onEvent({ type: 'tool_suspended', name: block.name, error: envelope.error });
            resultContent = `Tool error (session suspended): ${envelope.error}`;
            success = false;
          } else if (envelope.hotl) {
            // Ship tool failed — needs human review to retry
            if (onEvent) onEvent({ type: 'tool_hotl', name: block.name, error: envelope.error });
            resultContent = `Tool error (requires human review): ${envelope.error}`;
            success = false;
          } else if (!envelope.ok) {
            // Regular error — let Claude adapt
            resultContent = `Tool error: ${envelope.error}`;
            success = false;
          } else {
            // Success
            resultContent = typeof envelope.data === 'string' ? envelope.data : JSON.stringify(envelope.data);
            toolCallCount++;
          }
        } else {
          // Legacy path: use executeToolFn callback
          resultContent = await executeToolFn(block.name, block.input);
          toolCallCount++;
        }
      } catch (err) {
        resultContent = `Tool error: ${err.message}`;
        success = false;
      }

      if (onEvent) {
        onEvent({ type: 'tool_result', name: block.name, success });
      }

      const resultStr = typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent);

      // Fire-and-forget episodic capture for tool result
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

    // Append tool results as user message
    messages.push({ role: 'user', content: toolResults });
  }

  // Max iterations reached
  if (onEvent) {
    onEvent({ type: 'done', totalCostUsd, turnCount, toolCallCount });
  }
  return {
    response: '[Max iterations reached]',
    messages,
    totalTokensIn,
    totalTokensOut,
    totalCostUsd,
    turnCount,
    toolCallCount,
  };
}

module.exports = { executeReasoningLoop, BudgetExceededError, _setCallClaude, _setCallClaudeStreaming, textSimilarity, checkConvergence };
