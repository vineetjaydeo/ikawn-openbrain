// @ts-check
'use strict';

const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

/**
 * @typedef {Object} RecallParams
 * @property {string} brandId
 * @property {string} query - Natural language query to search for
 * @property {string[]} [memoryTypes] - Filter by memory types (e.g. ['BRAND_VOICE_RULE', 'CREATIVE_PATTERN'])
 * @property {'both' | 'memories_only' | 'distilled_only'} [source='both'] - Which tables to query
 * @property {number} [limit=10] - Max results
 * @property {boolean} [includeReasoning=true] - Include reasoning field
 */

/**
 * @typedef {Object} RecalledMemory
 * @property {string} id
 * @property {'memories' | 'distilled'} source - Which table this came from
 * @property {string} memoryType
 * @property {string} content
 * @property {number} confidence
 * @property {string|null} reasoning
 * @property {string} lastUpdated
 * @property {number} score - Combined similarity * confidence
 */

/**
 * Recall relevant memories from both memories and distilled_memory tables.
 * Results are merged by weighted score: similarity * confidence.
 *
 * @param {RecallParams} params
 * @returns {Promise<{ memories: RecalledMemory[] }>}
 */
async function recall(params) {
  const {
    brandId,
    query,
    memoryTypes,
    source = 'both',
    limit = 10,
    includeReasoning = true,
  } = params;

  let embedding;
  try {
    embedding = await getEmbedding(query);
  } catch (err) {
    console.error('[Recall] Embedding failed, falling back to text search:', err.message);
    return recallTextFallback(params);
  }

  const embeddingStr = `{${embedding.join(',')}}`;
  const results = [];

  // Query distilled_memory
  if (source !== 'memories_only') {
    const distilledParams = [embeddingStr, brandId];
    let paramIdx = 3;
    let distilledWhere = `
      WHERE brand_id = $2
        AND superseded_by IS NULL
        AND embedding IS NOT NULL
    `;

    if (memoryTypes && memoryTypes.length > 0) {
      distilledWhere += ` AND memory_type = ANY($${paramIdx++})`;
      distilledParams.push(memoryTypes);
    }

    const distilledQuery = `
      SELECT *, similarity * confidence AS score FROM (
        SELECT id, memory_type, content, confidence, reasoning, last_updated, created_at,
               cosine_similarity(embedding, $1::float8[]) AS similarity
        FROM distilled_memory
        ${distilledWhere}
      ) sub
      ORDER BY score DESC
      LIMIT $${paramIdx}
    `;
    distilledParams.push(limit);

    const { rows } = await pool.query(distilledQuery, distilledParams);

    for (const row of rows) {
      results.push({
        id: row.id,
        source: 'distilled',
        memoryType: row.memory_type,
        content: row.content,
        confidence: row.confidence,
        reasoning: includeReasoning ? row.reasoning : null,
        lastUpdated: (row.last_updated || row.created_at).toISOString(),
        score: (row.similarity || 0) * row.confidence,
      });
    }
  }

  // Query memories (existing table)
  if (source !== 'distilled_only') {
    const memoriesParams = [embeddingStr, brandId];
    let paramIdx = 3;
    let memoriesWhere = `
      WHERE brand_id = $2
        AND embedding IS NOT NULL
        AND (archived IS NULL OR archived = false)
        AND deleted_at IS NULL
    `;

    if (memoryTypes && memoryTypes.length > 0) {
      memoriesWhere += ` AND memory_type = ANY($${paramIdx++})`;
      memoriesParams.push(memoryTypes);
    }

    const memoriesQuery = `
      SELECT * FROM (
        SELECT id, memory_type, content, created_at,
               cosine_similarity(embedding, $1::float8[]) AS similarity
        FROM memories
        ${memoriesWhere}
      ) sub
      ORDER BY similarity DESC
      LIMIT $${paramIdx}
    `;
    memoriesParams.push(limit);

    const { rows } = await pool.query(memoriesQuery, memoriesParams);

    for (const row of rows) {
      results.push({
        id: String(row.id),
        source: 'memories',
        memoryType: row.memory_type || 'note',
        content: row.content,
        confidence: 1.0, // Existing memories treated as confidence 1.0
        reasoning: null,
        lastUpdated: row.created_at.toISOString(),
        score: (row.similarity || 0) * 1.0,
      });
    }
  }

  // Merge and sort by score descending, take top `limit`
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  // Update last_used on distilled memories that were returned
  const distilledIds = topResults
    .filter(r => r.source === 'distilled')
    .map(r => r.id);
  if (distilledIds.length > 0) {
    pool.query(`
      UPDATE distilled_memory SET last_used = NOW() WHERE id = ANY($1)
    `, [distilledIds]).catch(() => {}); // fire-and-forget
  }

  return { memories: topResults };
}

/**
 * Text-based fallback when embedding fails.
 * @param {RecallParams} params
 * @returns {Promise<{ memories: RecalledMemory[] }>}
 */
async function recallTextFallback(params) {
  const { brandId, query, limit = 10 } = params;
  const results = [];

  // Search distilled_memory by ILIKE
  const { rows: distilled } = await pool.query(`
    SELECT id, memory_type, content, confidence, reasoning, last_updated, created_at
    FROM distilled_memory
    WHERE brand_id = $1
      AND superseded_by IS NULL
      AND content ILIKE '%' || $2 || '%'
    ORDER BY confidence DESC, last_updated DESC
    LIMIT $3
  `, [brandId, query, limit]);

  for (const row of distilled) {
    results.push({
      id: row.id,
      source: 'distilled',
      memoryType: row.memory_type,
      content: row.content,
      confidence: row.confidence,
      reasoning: row.reasoning,
      lastUpdated: (row.last_updated || row.created_at).toISOString(),
      score: row.confidence * 0.5,
    });
  }

  // Search memories by ILIKE
  const { rows: mems } = await pool.query(`
    SELECT id, memory_type, content, created_at
    FROM memories
    WHERE brand_id = $1
      AND content ILIKE '%' || $2 || '%'
      AND (archived IS NULL OR archived = false)
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $3
  `, [brandId, query, limit]);

  for (const row of mems) {
    results.push({
      id: String(row.id),
      source: 'memories',
      memoryType: row.memory_type || 'note',
      content: row.content,
      confidence: 1.0,
      reasoning: null,
      lastUpdated: row.created_at.toISOString(),
      score: 0.5,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return { memories: results.slice(0, limit) };
}

module.exports = { recall };
