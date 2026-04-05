'use strict';

/**
 * Semantic knowledge extractor — processes episodic memories in batches,
 * extracts durable facts via Haiku, deduplicates, and stores in semantic_knowledge.
 */

let _pool = null;
let _callClaude = null;
let _getEmbedding = null;
let _intervalHandle = null;

function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}

function getCallClaude() {
  if (!_callClaude) _callClaude = require('../agent/llm-client').callClaude;
  return _callClaude;
}

function getGetEmbedding() {
  if (!_getEmbedding) _getEmbedding = require('../embeddings').getEmbedding;
  return _getEmbedding;
}

function _setPool(p) { _pool = p; }
function _setCallClaude(fn) { _callClaude = fn; }
function _setGetEmbedding(fn) { _getEmbedding = fn; }

const { cosineSimilarity } = require('../engine/memory-search');

// Use Haiku (fast tier) — cheapest model
const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

const EXTRACTION_PROMPT = `Extract factual knowledge from these interactions. Return a JSON array of facts:
[{"fact": "...", "confidence": 0.X, "reasoning": "..."}]

Only extract durable facts, not ephemeral conversation. Facts should be things that would be useful to remember across sessions.

Interactions:
`;

/**
 * Parse embedding stored as TEXT (JSON array or Postgres array literal).
 */
function parseEmbedding(raw) {
  if (!raw) return null;
  try {
    if (typeof raw === 'string') {
      if (raw.startsWith('[')) return JSON.parse(raw);
      if (raw.startsWith('{')) return raw.slice(1, -1).split(',').map(Number);
    }
    if (Array.isArray(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract semantic knowledge from unprocessed episodic memories for a brand.
 *
 * @param {string} brandId
 * @returns {Promise<{ extracted: number, skipped: number, superseded: number, cost: number }>}
 */
async function extractSemanticKnowledge(brandId) {
  const pool = getPool();
  const callClaude = getCallClaude();
  const getEmbedding = getGetEmbedding();

  const stats = { extracted: 0, skipped: 0, superseded: 0, cost: 0 };

  // 1. Query unprocessed episodic memories
  const { rows: memories } = await pool.query(
    `SELECT id, session_id, content, content_type, author_type, created_at
     FROM episodic_memories
     WHERE brand_id = $1 AND processed_for_extraction = false
     ORDER BY session_id, created_at
     LIMIT 100`,
    [brandId]
  );

  if (memories.length === 0) return stats;

  // 2. Group by session_id
  const sessions = new Map();
  for (const mem of memories) {
    const key = mem.session_id || '__no_session__';
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key).push(mem);
  }

  // 3. Process each session batch
  for (const [, batch] of sessions) {
    const formatted = batch.map(m =>
      `[${m.author_type}] (${m.content_type}): ${m.content}`
    ).join('\n');

    let facts;
    let costUsd = 0;
    try {
      const result = await callClaude({
        system: 'You are a knowledge extraction system. Respond ONLY with valid JSON.',
        messages: [{ role: 'user', content: EXTRACTION_PROMPT + formatted }],
        model: EXTRACTION_MODEL,
        maxTokens: 2048,
      });
      costUsd = result.cost?.costUsd || 0;
      stats.cost += costUsd;

      // Parse the response — find JSON array in the text
      const textBlock = result.response.content?.find(b => b.type === 'text');
      const text = textBlock?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Mark as processed even if no facts extracted
        await _markProcessed(pool, batch.map(m => m.id));
        continue;
      }
      facts = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn(`[SemanticExtractor] LLM call failed for batch: ${err.message}`);
      continue;
    }

    if (!Array.isArray(facts) || facts.length === 0) {
      await _markProcessed(pool, batch.map(m => m.id));
      continue;
    }

    const episodeIds = batch.map(m => m.id);

    // 5. For each fact: embed, check duplicates/contradictions, insert
    for (const fact of facts) {
      if (!fact.fact || typeof fact.fact !== 'string') continue;

      let factEmbedding;
      try {
        factEmbedding = await getEmbedding(fact.fact);
      } catch {
        continue;
      }

      const embeddingText = JSON.stringify(factEmbedding);

      // Search existing semantic_knowledge for similar facts
      const { rows: existing } = await pool.query(
        `SELECT id, content, embedding FROM semantic_knowledge
         WHERE brand_id = $1 AND superseded_by IS NULL AND embedding IS NOT NULL`,
        [brandId]
      );

      let isDuplicate = false;
      let supersededId = null;

      for (const ex of existing) {
        const exEmb = parseEmbedding(ex.embedding);
        if (!exEmb) continue;
        const sim = cosineSimilarity(factEmbedding, exEmb);

        if (sim > 0.9) {
          // Duplicate — skip
          isDuplicate = true;
          break;
        } else if (sim > 0.7) {
          // Contradicts or updates — supersede old
          supersededId = ex.id;
          break;
        }
      }

      if (isDuplicate) {
        stats.skipped++;
        continue;
      }

      // Insert new fact
      const { rows: inserted } = await pool.query(
        `INSERT INTO semantic_knowledge (brand_id, content, fact_type, confidence, source_episodes, embedding)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [brandId, fact.fact, 'fact', fact.confidence || 0.5, episodeIds, embeddingText]
      );

      if (supersededId && inserted.length > 0) {
        // Mark old fact as superseded
        await pool.query(
          `UPDATE semantic_knowledge SET superseded_by = $1, updated_at = NOW() WHERE id = $2`,
          [inserted[0].id, supersededId]
        );
        stats.superseded++;
      }

      stats.extracted++;
    }

    // 6. Mark episodic memories as processed
    await _markProcessed(pool, episodeIds);
  }

  // 7. Track extraction cost in cost_events
  if (stats.cost > 0) {
    await pool.query(
      `INSERT INTO cost_events (brand_id, event_type, model, cost_usd, metadata)
       VALUES ($1, 'semantic_extraction', $2, $3, $4)`,
      [brandId, EXTRACTION_MODEL, stats.cost, JSON.stringify({
        extracted: stats.extracted,
        skipped: stats.skipped,
        superseded: stats.superseded,
      })]
    ).catch(() => {}); // best-effort
  }

  return stats;
}

/**
 * @private Mark episodic memories as processed for extraction.
 */
async function _markProcessed(pool, ids) {
  if (!ids || ids.length === 0) return;
  await pool.query(
    `UPDATE episodic_memories SET processed_for_extraction = true WHERE id = ANY($1)`,
    [ids]
  );
}

/**
 * Start the semantic extractor on an interval.
 * @param {number} [intervalMs=1800000] - Poll interval (default 30 minutes)
 */
function startSemanticExtractor(intervalMs = 30 * 60 * 1000) {
  if (_intervalHandle) return;

  console.log(`[SemanticExtractor] Starting (interval: ${intervalMs / 1000}s)`);

  _intervalHandle = setInterval(async () => {
    try {
      const stats = await extractSemanticKnowledge('ikawn');
      if (stats.extracted > 0 || stats.superseded > 0) {
        console.log(`[SemanticExtractor] Processed: ${stats.extracted} new, ${stats.skipped} skipped, ${stats.superseded} superseded, $${stats.cost.toFixed(6)} cost`);
      }
    } catch (err) {
      console.error(`[SemanticExtractor] Error: ${err.message}`);
    }
  }, intervalMs);
}

/**
 * Stop the semantic extractor.
 */
function stopSemanticExtractor() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

module.exports = {
  extractSemanticKnowledge,
  startSemanticExtractor,
  stopSemanticExtractor,
  _setPool,
  _setCallClaude,
  _setGetEmbedding,
};
