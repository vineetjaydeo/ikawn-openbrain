'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_PRIMARY_MODEL = 'gemini-2.5-flash';
const DEFAULT_SECONDARY_MODEL = 'gemini-2.5-flash';

const MODEL_ROUTING = {
  edit_delta_distillation: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  event_distillation:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  outcome_reflection:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  session_summary:         { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  research_distillation:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  intelligence_distillation: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  strategic_rollup:        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  product_reflection:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  content_generation:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
};

let _geminiClient = null;
let _anthropicClient = null;

function getGeminiClient() {
  if (!_geminiClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
    }
    _geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return _geminiClient;
}

function getAnthropicClient() {
  if (!_anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

/**
 * Streaming chat completion via Gemini. Drop-in replacement for old OpenAI streamChat.
 * @param {Array} messages - Messages array with role/content (system messages extracted)
 * @param {object} opts - { model, onChunk, onDone }
 * @returns {Promise<string>} Full response text
 */
async function streamChat(messages, opts = {}) {
  const genAI = getGeminiClient();
  const modelName = opts.model || DEFAULT_PRIMARY_MODEL;
  const onChunk = opts.onChunk;
  const onDone = opts.onDone;

  // Extract system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;
  const chatMessages = messages.filter(m => m.role !== 'system');

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  // Convert to Gemini history format
  const geminiHistory = chatMessages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));

  const chat = model.startChat({ history: geminiHistory });
  const lastMsg = chatMessages[chatMessages.length - 1];
  const lastText = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

  let fullText = '';

  try {
    const result = await chat.sendMessageStream(lastText);

    for await (const chunk of result.stream) {
      const content = chunk.text();
      if (content) {
        fullText += content;
        if (onChunk) onChunk(content);
      }
    }

    if (onDone) onDone(fullText);
    return fullText;
  } catch (err) {
    const status = err.status || err.statusCode;
    const msg = err.message || 'Unknown Gemini error';
    throw new Error(`Gemini streaming request failed (model: ${modelName}, status: ${status}): ${msg}`);
  }
}

/**
 * Non-streaming chat completion via Gemini with optional function calling.
 * @param {Array} messages - Messages array with role/content
 * @param {object} opts - { model, tools }
 * @returns {Promise<object>} Message object with content and optional tool_calls (OpenAI-compatible shape)
 */
async function chatCompletion(messages, opts = {}) {
  const genAI = getGeminiClient();
  const modelName = opts.model || DEFAULT_PRIMARY_MODEL;
  const tools = opts.tools;

  // Extract system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;
  const chatMessages = messages.filter(m => m.role !== 'system');

  const modelOpts = { model: modelName };
  if (systemPrompt) modelOpts.systemInstruction = systemPrompt;
  const model = genAI.getGenerativeModel(modelOpts);

  // Convert to Gemini history
  const geminiHistory = chatMessages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));

  const chatOpts = { history: geminiHistory };

  // Convert OpenAI-style tools to Gemini function declarations
  if (tools && tools.length > 0) {
    const functionDeclarations = tools.map(t => {
      // Support both OpenAI format ({type:'function', function:{...}}) and Anthropic format ({name, description, input_schema})
      if (t.type === 'function' && t.function) {
        return {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        };
      }
      return {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || t.parameters,
      };
    });
    chatOpts.tools = [{ functionDeclarations }];
  }

  const chat = model.startChat(chatOpts);
  const lastMsg = chatMessages[chatMessages.length - 1];
  const lastText = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

  try {
    const result = await chat.sendMessage(lastText);
    const response = result.response;
    const text = response.text();

    // Check for function calls in response
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      // Return in OpenAI-compatible tool_calls format for callers that expect it
      const tool_calls = functionCalls.map((fc, idx) => ({
        id: `call_${idx}`,
        type: 'function',
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args || {}),
        },
      }));
      return { role: 'assistant', content: text || null, tool_calls };
    }

    if (!text && (!functionCalls || functionCalls.length === 0)) {
      throw new Error('No content in Gemini response');
    }

    return { role: 'assistant', content: text };
  } catch (err) {
    const status = err.status || err.statusCode;
    const msg = err.message || 'Unknown Gemini error';
    throw new Error(`Gemini completion request failed (model: ${modelName}, status: ${status}): ${msg}`);
  }
}

/**
 * Call an LLM for reflection/distillation tasks with automatic provider routing.
 * Uses MODEL_ROUTING to pick provider + model based on promptType.
 * Override with LLM_MODEL_OVERRIDE env var to force a specific model.
 */
async function callReflectionLLM(promptType, systemPrompt, userPrompt, opts = {}) {
  const override = process.env.LLM_MODEL_OVERRIDE;
  const routing = MODEL_ROUTING[promptType];
  if (!routing) {
    throw new Error(`Unknown prompt type: ${promptType}`);
  }

  const provider = override ? 'anthropic' : routing.provider;
  const model = override || routing.model;
  const maxTokens = opts.maxTokens || 4096;

  if (provider === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  // Fallback to Gemini
  const message = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { model }
  );
  return message.content || '';
}

/**
 * Safely parse JSON from LLM output, stripping markdown fences and trailing commas.
 */
function parseJSONSafe(text) {
  if (!text) return null;
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0].replace(/,\s*([}\]])/g, '$1'));
      } catch (__) {}
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0].replace(/,\s*([}\]])/g, '$1'));
      } catch (__) {}
    }
    return null;
  }
}

/**
 * Streaming chat completion via Anthropic Claude.
 * Converts messages to Anthropic format.
 * Supports tool_use: when tools are provided, returns structured content blocks
 * and stop_reason so the caller can handle tool execution loops.
 *
 * @param {Array} messages - Messages array (system extracted automatically)
 * @param {object} opts - { model, maxTokens, tools, onChunk, onDone }
 * @returns {Promise<{ text: string, contentBlocks: Array, stopReason: string }>}
 */
async function streamChatAnthropic(messages, opts = {}) {
  const client = getAnthropicClient();
  const model = opts.model || 'claude-sonnet-4-6';
  const maxTokens = opts.maxTokens || 4096;
  const tools = opts.tools || undefined;
  const onChunk = opts.onChunk;
  const onDone = opts.onDone;
  const onServerToolUse = opts.onServerToolUse; // callback for native server tools (web_search)

  // Extract system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;
  const chatMessages = messages.filter(m => m.role !== 'system');

  let fullText = '';
  const contentBlocks = [];
  let currentBlock = null;
  let stopReason = 'end_turn';

  const apiParams = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: chatMessages,
  };
  if (tools && tools.length > 0) {
    apiParams.tools = tools;
  }

  try {
    const stream = await client.messages.stream(apiParams);

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'text') {
          currentBlock = { type: 'text', text: '' };
        } else if (block.type === 'tool_use') {
          currentBlock = { type: 'tool_use', id: block.id, name: block.name, input: '' };
        } else if (block.type === 'server_tool_use' || block.type === 'web_search_tool_use') {
          currentBlock = { type: block.type, id: block.id, name: block.name, input: block.input || {} };
          if (onServerToolUse) onServerToolUse({ event: 'start', name: block.name, input: block.input });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
          const text = event.delta.text;
          currentBlock.text += text;
          fullText += text;
          if (onChunk) onChunk(text);
        } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
          currentBlock.input += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlock) {
          if (currentBlock.type === 'tool_use') {
            // Parse accumulated JSON input
            try {
              currentBlock.input = JSON.parse(currentBlock.input || '{}');
            } catch (_) {
              currentBlock.input = {};
            }
          } else if (currentBlock.type === 'server_tool_use' || currentBlock.type === 'web_search_tool_use') {
            if (onServerToolUse) onServerToolUse({ event: 'done', name: currentBlock.name });
          }
          contentBlocks.push(currentBlock);
          currentBlock = null;
        }
      } else if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }
    }

    if (onDone) onDone(fullText);
    return { text: fullText, contentBlocks, stopReason };
  } catch (err) {
    const status = err.status || err.statusCode;
    const msg = err.message || 'Unknown Anthropic error';
    throw new Error(`Anthropic streaming request failed (model: ${model}, status: ${status}): ${msg}`);
  }
}

/**
 * Rough token estimate (~4 chars per token).
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

module.exports = {
  streamChat,
  streamChatAnthropic,
  chatCompletion,
  callReflectionLLM,
  parseJSONSafe,
  estimateTokens,
  MODEL_ROUTING,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_SECONDARY_MODEL,
};
