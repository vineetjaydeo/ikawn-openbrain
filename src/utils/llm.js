const OpenAI = require('openai');

const DEFAULT_PRIMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_SECONDARY_MODEL = 'gpt-4o';

let _client = null;

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

module.exports = {
  streamChat,
  chatCompletion,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_SECONDARY_MODEL,
};
