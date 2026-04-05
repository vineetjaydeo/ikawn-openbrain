'use strict';

/**
 * Memory-augmented reasoning — retrieves relevant memories and formats
 * them as context for injection into the reasoning loop.
 * Best-effort: errors are swallowed by the caller.
 */

let _searchMemoryFn = null;

function getSearchMemory() {
  if (!_searchMemoryFn) _searchMemoryFn = require('./memory-search').searchMemory;
  return _searchMemoryFn;
}

function _setSearchMemory(fn) { _searchMemoryFn = fn; }

const MAX_MEMORY_CONTEXT_CHARS = 2000;

/**
 * Retrieve relevant memories for a query and format as a context string.
 *
 * @param {string} query - The search query
 * @param {Object} context - { brandId, userId, sessionId }
 * @returns {Promise<string|null>} Formatted context string or null if no results
 */
async function retrieveRelevantMemories(query, context) {
  const { brandId, userId, sessionId } = context || {};
  if (!query || !brandId) return null;

  const searchMemory = getSearchMemory();
  const results = await searchMemory({
    query,
    brandId,
    userId,
    topK: 5,
    minSimilarity: 0.7,
    tables: 'both',
  });

  if (!results || results.length === 0) return null;

  const lines = ['Relevant context from your memory:'];

  for (const r of results) {
    const contentSnippet = (r.content || '').slice(0, 200);
    if (r.source_table === 'episodic_memories') {
      const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : 'unknown';
      lines.push(`- [episodic, ${date}] "${contentSnippet}"`);
    } else if (r.source_table === 'semantic_knowledge') {
      const conf = typeof r.confidence === 'number' ? r.confidence.toFixed(1) : '?';
      lines.push(`- [semantic, confidence: ${conf}] "${contentSnippet}"`);
    } else {
      lines.push(`- "${contentSnippet}"`);
    }
  }

  let formatted = lines.join('\n');
  if (formatted.length > MAX_MEMORY_CONTEXT_CHARS) {
    formatted = formatted.slice(0, MAX_MEMORY_CONTEXT_CHARS - 3) + '...';
  }

  return formatted;
}

/**
 * Extract the query from the latest user message and retrieve relevant memories.
 *
 * @param {Array} messages - Message array (Anthropic format)
 * @param {Object} context - { brandId, userId, sessionId }
 * @returns {Promise<string|null>} Formatted context string or null
 */
async function buildMemoryContext(messages, context) {
  if (!messages || messages.length === 0) return null;

  // Find the last user message
  let query = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        query = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text from content blocks
        const textBlock = msg.content.find(b => b.type === 'text');
        if (textBlock) query = textBlock.text;
      }
      break;
    }
  }

  if (!query) return null;

  return retrieveRelevantMemories(query, context);
}

module.exports = { retrieveRelevantMemories, buildMemoryContext, _setSearchMemory };
