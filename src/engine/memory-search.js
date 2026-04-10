'use strict';

/**
 * Hybrid memory search — combines embedding similarity with recency scoring.
 * Searches episodic_memories and/or semantic_knowledge tables.
 * Embeddings are stored as TEXT (JSON arrays), so similarity is computed in application code.
 */

let _pool = null;
let _getEmbedding = null;
let _kg = null;
function getKG() { if (!_kg) _kg = require('./knowledge-graph'); return _kg; }

function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}

function getEmbeddingFn() {
  if (!_getEmbedding) _getEmbedding = require('../embeddings').getEmbedding;
  return _getEmbedding;
}

function _setPool(p) { _pool = p; }
function _setGetEmbedding(fn) { _getEmbedding = fn; }

/**
 * Extract capitalized words/phrases that look like named entities.
 * Returns deduplicated lowercase array.
 */
function extractEntityMentions(text) {
  if (!text) return [];
  // Extract capitalized words/phrases that look like named entities
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  // Deduplicate and return lowercase
  return [...new Set(matches.map(m => m.toLowerCase()))];
}

/**
 * Cosine similarity between two float arrays.
 * Returns 0 if either vector is zero-length or all zeros.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * Parse a TEXT-stored embedding into a float array.
 * Handles both JSON array strings and Postgres array literal strings.
 */
function parseEmbedding(raw) {
  if (!raw) return null;
  try {
    if (typeof raw === 'string') {
      // JSON array: "[0.1, 0.2, ...]"
      if (raw.startsWith('[')) return JSON.parse(raw);
      // Postgres array literal: "{0.1,0.2,...}"
      if (raw.startsWith('{')) return raw.slice(1, -1).split(',').map(Number);
    }
    if (Array.isArray(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Hybrid memory search across episodic and/or semantic tables.
 *
 * @param {Object} params
 * @param {string} params.query - Text to search for
 * @param {string} params.brandId - Required brand filter
 * @param {string} [params.userId] - Optional user filter
 * @param {string} [params.sessionId] - Optional session filter
 * @param {number} [params.topK=10] - Max results
 * @param {number} [params.minSimilarity=0.5] - Minimum similarity threshold
 * @param {string} [params.tables='both'] - 'episodic', 'semantic', or 'both'
 * @param {string[]} [params.contentTypes] - Optional content_type filter (episodic only)
 * @param {string} [params.domain] - Optional domain filter (semantic_knowledge only)
 * @returns {Promise<Array>} Ranked results with combined score
 */
async function searchMemory(params) {
  const {
    query,
    brandId,
    userId,
    sessionId,
    topK = 10,
    minSimilarity = 0.5,
    tables = 'both',
    contentTypes,
    domain,
  } = params;

  if (!query || !brandId) return [];

  const embedFn = getEmbeddingFn();
  const queryEmbedding = await embedFn(query);
  if (!queryEmbedding || queryEmbedding.length === 0) return [];

  const pool = getPool();
  const now = Date.now();
  const results = [];

  // --- Episodic memories ---
  if (tables === 'episodic' || tables === 'both') {
    const episodicResults = await _searchEpisodic(pool, {
      brandId, userId, sessionId, contentTypes, queryEmbedding, now,
    });
    results.push(...episodicResults);
  }

  // --- Semantic knowledge ---
  if (tables === 'semantic' || tables === 'both') {
    const semanticResults = await _searchSemantic(pool, {
      brandId, queryEmbedding, now, domain,
    });
    results.push(...semanticResults);
  }

  // KG entity boost (best-effort, non-blocking)
  try {
    const queryEntities = extractEntityMentions(query);
    if (queryEntities.length > 0) {
      const kgConnections = await getKG().getEntityConnections(brandId, queryEntities);
      if (kgConnections.size > 0) {
        for (const result of results) {
          const mentionedEntities = extractEntityMentions(result.content);
          const overlap = mentionedEntities.filter(e => kgConnections.has(e));
          if (overlap.length > 0) {
            result.combinedScore += Math.min(0.1, overlap.length * 0.05);
          }
        }
      }
    }
  } catch (err) {
    // KG boost is best-effort, don't fail search
  }

  // Filter by minSimilarity, sort by combined score descending, take topK
  const filtered = results
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);

  // Increment times_referenced for returned semantic results
  const semanticIds = filtered
    .filter(r => r.source_table === 'semantic_knowledge')
    .map(r => r.id);

  if (semanticIds.length > 0) {
    await pool.query(
      `UPDATE semantic_knowledge SET times_referenced = times_referenced + 1, updated_at = NOW() WHERE id = ANY($1)`,
      [semanticIds]
    ).catch(() => {}); // best-effort
  }

  return filtered;
}

/**
 * @private Search episodic_memories table.
 */
async function _searchEpisodic(pool, opts) {
  const { brandId, userId, sessionId, contentTypes, queryEmbedding, now } = opts;

  let sql = `SELECT id, content, content_type, author_type, author_ref, session_id, embedding, created_at, metadata
    FROM episodic_memories
    WHERE brand_id = $1 AND embedding IS NOT NULL`;
  const params = [brandId];
  let idx = 2;

  if (userId) {
    sql += ` AND user_id = $${idx}`;
    params.push(userId);
    idx++;
  }
  if (sessionId) {
    sql += ` AND session_id = $${idx}`;
    params.push(sessionId);
    idx++;
  }
  if (contentTypes && contentTypes.length > 0) {
    sql += ` AND content_type = ANY($${idx})`;
    params.push(contentTypes);
    idx++;
  }

  const { rows } = await pool.query(sql, params);

  return rows.map(row => {
    const emb = parseEmbedding(row.embedding);
    if (!emb) return null;

    const similarity = cosineSimilarity(queryEmbedding, emb);
    const daysSinceCreation = (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const recency = 1 / (1 + daysSinceCreation);
    const combinedScore = 0.7 * similarity + 0.3 * recency;

    return {
      id: row.id,
      content: row.content,
      content_type: row.content_type,
      author_type: row.author_type,
      author_ref: row.author_ref,
      session_id: row.session_id,
      similarity,
      recency,
      combinedScore,
      created_at: row.created_at,
      metadata: row.metadata,
      source_table: 'episodic_memories',
    };
  }).filter(Boolean);
}

/**
 * @private Search semantic_knowledge table (active facts only).
 */
async function _searchSemantic(pool, opts) {
  const { brandId, queryEmbedding, now, domain } = opts;

  let sql = `SELECT id, content, fact_type, confidence, embedding, created_at, times_referenced
     FROM semantic_knowledge
     WHERE brand_id = $1 AND superseded_by IS NULL AND embedding IS NOT NULL`;
  const params = [brandId];

  if (domain) {
    sql += ` AND domain = $2`;
    params.push(domain);
  }

  const { rows } = await pool.query(sql, params);

  return rows.map(row => {
    const emb = parseEmbedding(row.embedding);
    if (!emb) return null;

    const similarity = cosineSimilarity(queryEmbedding, emb);
    const daysSinceCreation = (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const recency = 1 / (1 + daysSinceCreation);
    const combinedScore = 0.7 * similarity + 0.3 * recency;

    return {
      id: row.id,
      content: row.content,
      fact_type: row.fact_type,
      confidence: row.confidence,
      similarity,
      recency,
      combinedScore,
      created_at: row.created_at,
      times_referenced: row.times_referenced,
      source_table: 'semantic_knowledge',
    };
  }).filter(Boolean);
}

module.exports = { searchMemory, cosineSimilarity, _setPool, _setGetEmbedding };
