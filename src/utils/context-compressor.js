'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_KEEP_RECENT = 8;
const DEFAULT_THRESHOLD = 40000; // tokens (~160K chars at ~4 chars/token)
const MAX_SUMMARY_INPUT_CHARS = 80000;

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
 * Estimate token count (~4 chars per token).
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Estimate total tokens across an array of messages.
 */
function estimateMessagesTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') total += estimateTokens(part.text);
      }
    }
  }
  return total;
}

/**
 * Compress older conversation messages into a summary when history gets long.
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {object} [options]
 * @param {number} [options.keepRecent] - Number of recent messages to keep verbatim (default: 8)
 * @param {number} [options.threshold] - Token threshold to trigger compression (default: 40000)
 * @returns {Promise<{compressed: boolean, messages: Array, tokensSaved: number}>}
 */
async function compressContext(messages, options = {}) {
  const keepRecent = options.keepRecent || DEFAULT_KEEP_RECENT;
  const threshold = options.threshold || parseInt(process.env.CONTEXT_COMPRESS_THRESHOLD, 10) || DEFAULT_THRESHOLD;

  if (!messages || messages.length === 0) {
    return { compressed: false, messages, tokensSaved: 0 };
  }

  const totalTokens = estimateMessagesTokens(messages);

  // Below threshold — return unchanged
  if (totalTokens <= threshold) {
    return { compressed: false, messages, tokensSaved: 0 };
  }

  // Split: system messages stay, older messages get compressed, recent stay verbatim
  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  // If we have fewer messages than keepRecent, nothing to compress
  if (chatMessages.length <= keepRecent) {
    return { compressed: false, messages, tokensSaved: 0 };
  }

  const olderMessages = chatMessages.slice(0, chatMessages.length - keepRecent);
  const recentMessages = chatMessages.slice(chatMessages.length - keepRecent);

  // Build text from older messages for summarization
  let olderText = olderMessages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter(p => p.type === 'text').map(p => p.text).join('\n')
        : '';
    return `${role}: ${content}`;
  }).join('\n\n');

  // Cost guard: truncate to max 80K chars before sending to Haiku
  if (olderText.length > MAX_SUMMARY_INPUT_CHARS) {
    olderText = olderText.slice(0, MAX_SUMMARY_INPUT_CHARS);
  }

  const olderTokens = estimateMessagesTokens(olderMessages);

  try {
    const client = options._client || getClient();
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      system: 'You are a conversation summarizer. Produce a concise but thorough summary of the conversation below. Preserve: key facts, decisions made, user preferences, action items, specific names, numbers, dates, and any commitments. Do NOT add commentary — just summarize what was discussed.',
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation history:\n\n${olderText}`,
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const summary = textBlock ? textBlock.text : '';

    if (!summary) {
      // Summarization returned empty — fall back to original
      return { compressed: false, messages, tokensSaved: 0 };
    }

    const summaryMessage = {
      role: 'user',
      content: `[Context Summary — earlier conversation compressed]\n\n${summary}`,
    };

    // Reassemble: system + summary + recent messages
    const compressedMessages = [...systemMessages, summaryMessage, ...recentMessages];
    const afterTokens = estimateMessagesTokens(compressedMessages);
    const tokensSaved = totalTokens - afterTokens;

    return {
      compressed: true,
      messages: compressedMessages,
      summary,
      tokensSaved: Math.max(0, tokensSaved),
    };
  } catch (err) {
    console.error('[ContextCompressor] Compression failed, returning original messages:', err.message);
    return { compressed: false, messages, tokensSaved: 0 };
  }
}

// Test helper: reset cached client (allows mock injection)
function _resetClient() { _client = null; }

module.exports = { compressContext, estimateTokens, estimateMessagesTokens, _resetClient };
