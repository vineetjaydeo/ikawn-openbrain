'use strict';

const { randomUUID } = require('crypto');
const { callClaude: _callClaude } = require('../agent/llm-client');
const { resolveModel } = require('./model-router');
const { logLLMCall, checkBudget } = require('./cost-tracker');

// Lazy accessor — allows test injection via _setCallClaude()
let _callClaudeFn = null;
function getCallClaude() { return _callClaudeFn || _callClaude; }
function _setCallClaude(fn) { _callClaudeFn = fn; }

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
 * @param {Function} config.executeToolFn - async (toolName, toolInput) => string
 * @param {number} [config.maxIterations] - Max loop iterations (default: 25)
 * @returns {Promise<Object>} { response, messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount }
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
}) {
  const { modelId } = resolveModel(modelTier);
  const executionId = randomUUID();

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  let turnCount = 0;
  let toolCallCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    // Budget check before each LLM call
    if (dollarCap && sessionId) {
      const budget = await checkBudget(sessionId, dollarCap);
      if (!budget.withinBudget) {
        throw new BudgetExceededError(budget.spent, dollarCap);
      }
    }

    // Call Claude via existing llm-client
    const { response, cost } = await getCallClaude()({
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: modelId,
    });

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

    // No tool calls — final text response, we're done
    if (toolUseBlocks.length === 0) {
      return {
        response: textBlocks.map(b => b.text).join('\n'),
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

    // Execute each tool via callback
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let resultContent;
      try {
        resultContent = await executeToolFn(block.name, block.input);
        toolCallCount++;
      } catch (err) {
        resultContent = `Tool error: ${err.message}`;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent),
      });
    }

    // Append tool results as user message
    messages.push({ role: 'user', content: toolResults });
  }

  // Max iterations reached
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

module.exports = { executeReasoningLoop, BudgetExceededError, _setCallClaude };
