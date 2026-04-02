'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { captureMessage: _realCapture } = require('./capture');

// Lazy singleton — same pattern as llm-client.js
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// Allow tests to inject mocks
let _captureFn = _realCapture;

/** @internal — inject mock Anthropic client for testing */
function _setClient(client) { _anthropic = client; }

/** @internal — inject mock captureMessage for testing */
function _setCaptureFn(fn) { _captureFn = fn; }

// Greetings / trivial messages — skip extraction entirely
const TRIVIAL_PATTERN = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye|good morning|good evening|gm|gn|lol|haha|hmm|cool|nice|great|got it|noted|yo|sup|what's up|how are you)[\s!.?]*$/i;

const EXTRACTION_PROMPT = `Extract structured facts from this conversation exchange. Only extract items with high confidence.

User: {USER_MSG}
Assistant: {ASSISTANT_MSG}

Return a JSON array of extracted items:
[{ "type": "fact"|"decision"|"commitment"|"preference", "content": "...", "confidence": 0.0-1.0 }]

Rules:
- Only extract concrete, actionable information
- Skip pleasantries, greetings, generic responses
- Confidence must be > 0.7 to include
- Keep content concise (max 200 chars per item)
- Return [] if nothing meaningful to extract`;

const MAX_TEXT_LENGTH = 2000;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Extract structured memories from a conversation turn.
 * Designed to be fire-and-forget — NEVER throws to caller on failure.
 *
 * @param {string} userMessage
 * @param {string} assistantResponse
 * @param {{ userId: number|string, brandId?: string, conversationId: string }} context
 * @returns {Promise<Array<{ type: string, content: string, confidence: number }>>}
 */
async function extractMemories(userMessage, assistantResponse, context) {
  const { userId, brandId = 'ikawn', conversationId } = context;

  // Skip trivial exchanges
  const trimmedUser = (userMessage || '').trim();
  if (trimmedUser.length < 20 && TRIVIAL_PATTERN.test(trimmedUser)) {
    return [];
  }

  // Truncate to cap cost (~$0.0002 per call with Haiku)
  const truncatedUser = trimmedUser.slice(0, MAX_TEXT_LENGTH);
  const truncatedAssistant = (assistantResponse || '').trim().slice(0, MAX_TEXT_LENGTH);

  // Skip if both sides are empty after truncation
  if (!truncatedUser && !truncatedAssistant) return [];

  const prompt = EXTRACTION_PROMPT
    .replace('{USER_MSG}', truncatedUser)
    .replace('{ASSISTANT_MSG}', truncatedAssistant);

  let response;
  try {
    const client = getAnthropic();
    response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    console.warn('[MemoryExtractor] Haiku call failed:', err.message);
    return [];
  }

  // Parse JSON from response
  let items;
  try {
    const text = response.content?.[0]?.text || '';
    // Handle cases where model wraps JSON in markdown code blocks
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    items = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('[MemoryExtractor] JSON parse failed:', err.message);
    return [];
  }

  if (!Array.isArray(items)) return [];

  // Filter to high-confidence items only
  const filtered = items.filter(
    item => item && typeof item.confidence === 'number' && item.confidence > 0.7 && item.content
  );

  if (filtered.length === 0) return [];

  // Capture each item via the ONLY door — captureMessage()
  const captured = [];
  for (const item of filtered) {
    const content = String(item.content).slice(0, 200);
    const type = ['fact', 'decision', 'commitment', 'preference'].includes(item.type)
      ? item.type
      : 'fact';

    await _captureFn({
      brand_id: brandId,
      user_id: userId,
      channel: 'extraction',
      direction: 'internal',
      content,
      memory_type: type,
      source_ref: `extract_${conversationId}_${Date.now()}_${captured.length}`,
      metadata: { extracted_from: 'conversation', confidence: item.confidence },
    });

    captured.push({ type, content, confidence: item.confidence });
  }

  return captured;
}

module.exports = { extractMemories, _setClient, _setCaptureFn };
