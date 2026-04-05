'use strict';

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

/**
 * Fast 32-bit djb2 hash for content deduplication.
 * Not cryptographic — just a fast fingerprint for exact-match detection.
 *
 * @param {string} str
 * @returns {string} Hex string hash
 */
function hashContent(str) {
  if (!str) return '0';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  // Convert to unsigned 32-bit then hex
  return (hash >>> 0).toString(16);
}

/**
 * Heuristic content type classifier.
 * @param {string} content - The text content to classify
 * @param {string} role - 'user' | 'assistant' | 'tool_result'
 * @returns {string} One of: 'tool_result', 'decision', 'error', 'message'
 */
function classifyContentType(content, role) {
  if (role === 'tool_result') return 'tool_result';
  if (typeof content === 'string' && /\b(error|failed|exception|crash)\b/i.test(content)) return 'error';
  if (typeof content === 'string' && /\b(I'll|Let's|I decided|We should|I'm going to)\b/i.test(content)) return 'decision';
  if (role === 'user') return 'message';
  return 'message';
}

/**
 * Fire-and-forget INSERT into episodic_memories.
 * Best-effort — never throws, never blocks the reasoning loop.
 *
 * @param {Object} event
 * @param {string} event.brandId
 * @param {string} [event.userId]
 * @param {string} [event.sessionId]
 * @param {string} event.content
 * @param {string} [event.contentType='message']
 * @param {string} [event.authorType='agent']
 * @param {string} [event.authorRef]
 * @param {string} [event.source]
 * @param {string} [event.expiresAt]
 * @param {Object} [event.metadata={}]
 * @returns {Promise<void>}
 */
async function captureEpisodic(event) {
  try {
    const {
      brandId = 'ikawn',
      userId,
      sessionId,
      content,
      contentType = 'message',
      authorType = 'agent',
      authorRef,
      source,
      expiresAt,
      metadata = {},
    } = event;

    if (!content) return;

    const pool = getPool();
    const contentHash = hashContent(content);

    // Dedup: check last 10 episodes for same session for exact content match
    if (sessionId) {
      try {
        const { rows: recent } = await pool.query(
          `SELECT id, content FROM episodic_memories
           WHERE session_id = $1
           ORDER BY id DESC LIMIT 10`,
          [sessionId]
        );

        for (const ep of recent) {
          if (hashContent(ep.content) === contentHash) {
            console.log(`[EpisodicCapture] Skipping duplicate (matches episode ${ep.id})`);
            return null;
          }
        }
      } catch (_) {
        // Best-effort dedup — proceed with capture on failure
      }
    }

    await pool.query(
      `INSERT INTO episodic_memories (brand_id, user_id, session_id, content, content_type, author_type, author_ref, source, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        brandId,
        userId || null,
        sessionId || null,
        content,
        contentType,
        authorType,
        authorRef || null,
        source || null,
        expiresAt || null,
        JSON.stringify(metadata),
      ]
    );
  } catch (_err) {
    // Best-effort — swallow errors silently
  }
}

/**
 * Convenience wrapper for the reasoning loop.
 * Auto-classifies content_type and sets author_type from role.
 *
 * @param {Object} turnData
 * @param {string} turnData.content
 * @param {string} turnData.role - 'user' | 'assistant' | 'tool_result'
 * @param {string} [turnData.toolName]
 * @param {Object} sessionContext
 * @param {string} sessionContext.brandId
 * @param {string} [sessionContext.userId]
 * @param {string} [sessionContext.sessionId]
 * @param {string} [sessionContext.channel]
 * @returns {Promise<void>}
 */
async function captureFromLoopTurn(turnData, sessionContext) {
  const { content, role, toolName } = turnData;
  const { brandId, userId, sessionId, channel } = sessionContext;

  if (!content) return;

  const contentType = classifyContentType(content, role);
  const authorType = role === 'user' ? 'user' : (role === 'tool_result' ? 'tool' : 'agent');
  const authorRef = toolName || undefined;

  return captureEpisodic({
    brandId,
    userId,
    sessionId,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    contentType,
    authorType,
    authorRef,
    source: channel || 'reasoning',
    metadata: toolName ? { toolName } : {},
  });
}

module.exports = { captureEpisodic, classifyContentType, captureFromLoopTurn, hashContent, _setPool };
