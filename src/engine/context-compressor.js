'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_TOKEN_LIMIT = 150000;
const COMPRESSION_THRESHOLD = 0.7; // trigger at 70% of limit
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_SUMMARY_INPUT_CHARS = 80000;

// Haiku pricing: $0.80/M input, $4/M output
const HAIKU_INPUT_COST_PER_TOKEN = 0.80 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000;

// Lazy injection for testing
let _callSummarizeFn = null;
function _setCallSummarize(fn) { _callSummarizeFn = fn; }

let _client = null;
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Extract text content from a single message.
 */
function messageText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('\n');
  }
  return '';
}

/**
 * Estimate tokens from a message array (4 chars ~ 1 token).
 */
function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil(messageText(msg).length / 4);
  }
  return total;
}

/**
 * Call Haiku to summarize text. Uses injected fn if set, otherwise real SDK.
 * Returns { summary, inputTokens, outputTokens }.
 */
async function callSummarize(text) {
  if (_callSummarizeFn) {
    return _callSummarizeFn(text);
  }

  const client = getClient();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: 'You are a conversation summarizer for an AI reasoning engine. Produce a concise but thorough summary. Preserve: key facts, decisions made, tool results and their outcomes, user preferences, action items, specific names, numbers, dates, file paths, and any commitments. Group related items. Do NOT add commentary — just summarize.',
    messages: [
      { role: 'user', content: `Summarize this conversation history:\n\n${text}` },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return {
    summary: textBlock ? textBlock.text : '',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

/**
 * Compress messages when approaching token limit.
 *
 * @param {Array} messages - Message array (Anthropic format: role + content)
 * @param {Object} options
 * @param {number} [options.tokenLimit=150000]
 * @param {number} [options.keepRecentMessages=10] - Recent user/assistant messages to keep
 * @param {number} [options.keepRecentToolResults=5] - Recent tool_result messages to keep
 * @param {string} [options.workingMemory] - Stringified working memory to preserve
 * @returns {Promise<{ compressed: boolean, messages: Array, summary: string|null, tokensSaved: number, compressionCostUsd: number }>}
 */
async function compressMessages(messages, options = {}) {
  const tokenLimit = options.tokenLimit || DEFAULT_TOKEN_LIMIT;
  const keepRecentMessages = options.keepRecentMessages ?? 10;
  const keepRecentToolResults = options.keepRecentToolResults ?? 5;
  const workingMemory = options.workingMemory || null;

  const unchanged = {
    compressed: false,
    messages,
    summary: null,
    tokensSaved: 0,
    compressionCostUsd: 0,
  };

  if (!messages || messages.length === 0) return unchanged;

  // 1. Estimate total tokens
  const totalTokens = estimateTokens(messages);
  const threshold = Math.floor(tokenLimit * COMPRESSION_THRESHOLD);

  // 2. Below threshold — return unchanged
  if (totalTokens <= threshold) return unchanged;

  // 3. Separate messages into categories
  const systemMessages = [];
  const chatMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      chatMessages.push(msg);
    }
  }

  // Not enough messages to compress
  if (chatMessages.length <= keepRecentMessages) return unchanged;

  // Identify recent tool results (walk backwards)
  const recentToolResultIndices = new Set();
  let toolResultCount = 0;
  for (let i = chatMessages.length - 1; i >= 0 && toolResultCount < keepRecentToolResults; i--) {
    const msg = chatMessages[i];
    const isToolResult = msg.role === 'user' && Array.isArray(msg.content) &&
      msg.content.some(p => p.type === 'tool_result');
    if (isToolResult) {
      recentToolResultIndices.add(i);
      toolResultCount++;
    }
  }

  // Split: keep last N messages + recent tool results; compress everything else
  const cutoff = chatMessages.length - keepRecentMessages;
  const keepIndices = new Set();

  // Always keep the last keepRecentMessages
  for (let i = cutoff; i < chatMessages.length; i++) {
    keepIndices.add(i);
  }

  // Also keep recent tool results even if they're in the "older" section
  for (const idx of recentToolResultIndices) {
    keepIndices.add(idx);
  }

  const olderMessages = [];
  const keptMessages = [];

  for (let i = 0; i < chatMessages.length; i++) {
    if (keepIndices.has(i)) {
      keptMessages.push(chatMessages[i]);
    } else {
      olderMessages.push(chatMessages[i]);
    }
  }

  if (olderMessages.length === 0) return unchanged;

  // 4. Build summary text from older messages (cap at 80K chars)
  let olderText = olderMessages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const content = messageText(m);
    return `${role}: ${content}`;
  }).join('\n\n');

  if (olderText.length > MAX_SUMMARY_INPUT_CHARS) {
    olderText = olderText.slice(0, MAX_SUMMARY_INPUT_CHARS);
  }

  // 5. Call Haiku to summarize
  try {
    const result = await callSummarize(olderText);
    const { summary, inputTokens, outputTokens } = result;

    if (!summary) return unchanged;

    // 6. Calculate compression cost
    const compressionCostUsd =
      (inputTokens * HAIKU_INPUT_COST_PER_TOKEN) +
      (outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN);

    // 7. Build summary message content
    let summaryContent = `[Context Summary — earlier conversation compressed]\n\n${summary}`;
    if (workingMemory) {
      summaryContent += `\n\n[Working Memory — preserved across compression]\n${workingMemory}`;
    }

    const summaryMessage = { role: 'user', content: summaryContent };

    // Reassemble: system + summary + kept messages (in original order)
    const compressedMessages = [...systemMessages, summaryMessage, ...keptMessages];
    const afterTokens = estimateTokens(compressedMessages);
    const tokensSaved = Math.max(0, totalTokens - afterTokens);

    return {
      compressed: true,
      messages: compressedMessages,
      summary,
      tokensSaved,
      compressionCostUsd,
    };
  } catch (err) {
    console.error('[EngineContextCompressor] Compression failed, returning original:', err.message);
    return unchanged;
  }
}

module.exports = { compressMessages, estimateTokens, _setCallSummarize };
