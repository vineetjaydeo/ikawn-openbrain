// src/agent/llm-client.js
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Cost per 1M tokens (input/output) — update when pricing changes
const PRICING = {
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gpt-5.2':                   { input: 2.50, output: 10.00 },
  'gpt-4o':                    { input: 2.50, output: 10.00 },
};

let _anthropic = null;
let _openai = null;

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * Calculate cost from token usage.
 */
function calculateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] || { input: 5.00, output: 15.00 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/**
 * Call Claude with tool_use support. Primary path for Tier 2 agent execution.
 */
async function callClaude(params) {
  const { system, messages, tools = [], serverTools = [], maxTokens = 4096 } = params;
  const model = 'claude-sonnet-4-6';
  const client = getAnthropic();

  const allTools = [...tools, ...serverTools];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools: allTools.length > 0 ? allTools : undefined,
  });

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  return {
    response,
    cost: {
      model,
      inputTokens,
      outputTokens,
      costUsd: calculateCost(model, inputTokens, outputTokens),
    },
  };
}

/**
 * Fallback: call OpenAI GPT-5.2 with tool_use support.
 */
async function callOpenAIFallback(params) {
  const { system, messages, tools = [], maxTokens = 4096 } = params;
  const model = 'gpt-5.2';
  const client = getOpenAI();

  const openaiTools = tools
    .filter(t => t.type !== 'server_tool')
    .map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

  const openaiMessages = [
    { role: 'system', content: system },
    ...messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  ];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: openaiMessages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
  });

  const usage = response.usage || {};
  return {
    response,
    cost: {
      model,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      costUsd: calculateCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0),
    },
  };
}

/**
 * Call LLM with automatic fallback.
 * Anthropic primary -> retry once with 5s backoff -> OpenAI fallback.
 */
async function callWithFallback(params) {
  try {
    return await callClaude(params);
  } catch (err) {
    console.warn(`[LLMClient] Anthropic failed: ${err.message}. Retrying in 5s...`);
  }

  await new Promise(r => setTimeout(r, 5000));
  try {
    return await callClaude(params);
  } catch (err) {
    console.warn(`[LLMClient] Anthropic retry failed: ${err.message}. Falling back to OpenAI...`);
  }

  return await callOpenAIFallback(params);
}

module.exports = { callClaude, callOpenAIFallback, callWithFallback, calculateCost, PRICING };
