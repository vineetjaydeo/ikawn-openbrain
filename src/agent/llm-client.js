// src/agent/llm-client.js
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cost per 1M tokens (input/output) — update when pricing changes
const PRICING = {
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gemini-2.5-flash':          { input: 0.15, output: 0.60 },
};

let _anthropic = null;
let _genAI = null;

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getGenAI() {
  if (!_genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
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
  const { system, messages, tools = [], serverTools = [], maxTokens = 2048, model: modelOverride } = params;
  const model = modelOverride || 'claude-sonnet-4-6';
  const client = getAnthropic();

  const allTools = [...tools, ...serverTools];

  // Apply prompt caching: convert system to block format with cache_control on last block
  const { formatSystemForCaching } = require('../utils/llm');
  const cachedSystem = formatSystemForCaching(system);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: cachedSystem,
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
 * Fallback: call Gemini 2.5 Flash with tool_use support.
 * Converts Anthropic-style messages to Gemini format.
 */
async function callGeminiFallback(params) {
  const { system, messages, tools = [], maxTokens = 2048 } = params;
  const modelName = 'gemini-2.5-flash';
  const genAI = getGenAI();

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });

  // Convert Anthropic messages to Gemini format
  const geminiHistory = [];
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : JSON.stringify(msg.content);
    geminiHistory.push({ role, parts: [{ text }] });
  }

  // Convert tools to Gemini function declarations
  const functionDeclarations = tools
    .filter(t => t.type !== 'server_tool')
    .map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    }));

  const generationConfig = { maxOutputTokens: maxTokens };

  const chatOpts = { history: geminiHistory.slice(0, -1), generationConfig };
  if (functionDeclarations.length > 0) {
    chatOpts.tools = [{ functionDeclarations }];
  }

  const chat = model.startChat(chatOpts);

  // Send last message
  const lastMsg = geminiHistory[geminiHistory.length - 1];
  const result = await chat.sendMessage(lastMsg.parts);
  const response = result.response;

  const usage = response.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;

  return {
    response,
    cost: {
      model: modelName,
      inputTokens,
      outputTokens,
      costUsd: calculateCost(modelName, inputTokens, outputTokens),
    },
  };
}

/**
 * Call LLM with automatic fallback.
 * Anthropic primary -> retry once with 5s backoff -> Gemini fallback.
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
    console.warn(`[LLMClient] Anthropic retry failed: ${err.message}. Falling back to Gemini...`);
  }

  return await callGeminiFallback(params);
}

/**
 * Streaming variant of callClaude. Returns an async generator of events + final cost.
 * Events: { type: 'text_delta', text } | { type: 'tool_use_start', id, name } |
 *         { type: 'tool_use_delta', partial_json } | { type: 'tool_use_end' } |
 *         { type: 'content_block_stop' } | { type: 'message_delta', stop_reason }
 *
 * @returns {{ stream: AsyncIterable, getResult: () => Promise<{ response, cost }> }}
 */
function callClaudeStreaming(params) {
  const { system, messages, tools = [], serverTools = [], maxTokens = 2048, model: modelOverride } = params;
  const model = modelOverride || 'claude-sonnet-4-6';
  const client = getAnthropic();

  const allTools = [...tools, ...serverTools];
  const { formatSystemForCaching } = require('../utils/llm');
  const cachedSystem = formatSystemForCaching(system);

  const apiParams = {
    model,
    max_tokens: maxTokens,
    system: cachedSystem,
    messages,
  };
  if (allTools.length > 0) apiParams.tools = allTools;

  const anthropicStream = client.messages.stream(apiParams);

  // Collect content blocks as they complete
  const contentBlocks = [];
  let currentBlock = null;
  let stopReason = 'end_turn';
  let inputTokens = 0;
  let outputTokens = 0;

  // Create an async iterable that yields events
  async function* eventIterator() {
    for await (const event of anthropicStream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'text') {
          currentBlock = { type: 'text', text: '' };
        } else if (block.type === 'tool_use') {
          currentBlock = { type: 'tool_use', id: block.id, name: block.name, input: '' };
          yield { type: 'tool_use_start', id: block.id, name: block.name };
        } else if (block.type === 'server_tool_use' || block.type === 'web_search_tool_use') {
          currentBlock = { type: block.type, id: block.id, name: block.name, input: block.input || {} };
          yield { type: 'server_tool_start', id: block.id, name: block.name, input: block.input };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
          currentBlock.text += event.delta.text;
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
          currentBlock.input += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlock) {
          if (currentBlock.type === 'tool_use') {
            try { currentBlock.input = JSON.parse(currentBlock.input || '{}'); } catch (_) { currentBlock.input = {}; }
          } else if (currentBlock.type === 'server_tool_use' || currentBlock.type === 'web_search_tool_use') {
            yield { type: 'server_tool_done', name: currentBlock.name };
          }
          contentBlocks.push(currentBlock);
          currentBlock = null;
        }
      } else if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage) {
          outputTokens = event.usage.output_tokens || outputTokens;
        }
      } else if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      }
    }
  }

  // After iteration completes, build the response object
  function buildResult() {
    return {
      response: { content: contentBlocks, stop_reason: stopReason },
      cost: { model, inputTokens, outputTokens, costUsd: calculateCost(model, inputTokens, outputTokens) },
    };
  }

  return { events: eventIterator(), buildResult };
}

module.exports = { callClaude, callClaudeStreaming, callGeminiFallback, callWithFallback, calculateCost, PRICING };
