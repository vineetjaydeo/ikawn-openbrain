const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_PRIMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_SECONDARY_MODEL = 'gpt-4o';

const MODEL_ROUTING = {
  edit_delta_distillation: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  event_distillation:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  outcome_reflection:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  session_summary:         { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  research_distillation:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  intelligence_distillation: { provider: 'openai', model: 'gpt-4.1-mini' },
  strategic_rollup:        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  product_reflection:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  content_generation:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
};

let _client = null;
let _anthropicClient = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
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
 * Streaming chat completion. Calls onChunk per token and onDone with the full text.
 * @param {Array} messages - OpenAI messages array (supports text and image_url content parts)
 * @param {string} model - Model ID (e.g. "gpt-4o", "gpt-4o-mini")
 * @param {(text: string) => void} onChunk - Called with each token chunk
 * @param {(fullText: string) => void} onDone - Called with the complete response text
 * @returns {Promise<void>}
 */
async function streamChat(messages, opts = {}) {
  const client = getClient();
  const model = opts.model || DEFAULT_PRIMARY_MODEL;
  const onChunk = opts.onChunk;
  const onDone = opts.onDone;

  let fullText = '';

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        if (onChunk) onChunk(content);
      }
    }

    if (onDone) onDone(fullText);
    return fullText;
  } catch (err) {
    const status = err.status || err.statusCode;
    const msg = err.message || 'Unknown OpenAI error';
    throw new Error(`OpenAI streaming request failed (model: ${model}, status: ${status}): ${msg}`);
  }
}

/**
 * Non-streaming chat completion with optional function calling.
 * @param {Array} messages - OpenAI messages array
 * @param {string} model - Model ID
 * @param {Array} [tools] - OpenAI tools array for function calling
 * @returns {Promise<object>} The response message object (including tool_calls if any)
 */
async function chatCompletion(messages, opts = {}) {
  const client = getClient();
  const model = opts.model || DEFAULT_PRIMARY_MODEL;
  const tools = opts.tools;

  const params = {
    model,
    messages,
  };

  if (tools && tools.length > 0) {
    params.tools = tools;
  }

  try {
    const response = await client.chat.completions.create(params);
    const message = response.choices?.[0]?.message;

    if (!message) {
      throw new Error('No message in OpenAI response');
    }

    return message;
  } catch (err) {
    const status = err.status || err.statusCode;
    const msg = err.message || 'Unknown OpenAI error';
    throw new Error(`OpenAI completion request failed (model: ${model}, status: ${status}): ${msg}`);
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

  // Fallback to OpenAI
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
 * Converts OpenAI-style messages to Anthropic format.
 * @param {Array} messages - OpenAI-style messages array (system extracted automatically)
 * @param {object} opts - { model, maxTokens, onChunk, onDone }
 * @returns {Promise<string>} Full response text
 */
async function streamChatAnthropic(messages, opts = {}) {
  const client = getAnthropicClient();
  const model = opts.model || 'claude-sonnet-4-6';
  const maxTokens = opts.maxTokens || 4096;
  const onChunk = opts.onChunk;
  const onDone = opts.onDone;

  // Extract system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;
  const chatMessages = messages.filter(m => m.role !== 'system');

  let fullText = '';

  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const text = event.delta.text;
        fullText += text;
        if (onChunk) onChunk(text);
      }
    }

    if (onDone) onDone(fullText);
    return fullText;
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
