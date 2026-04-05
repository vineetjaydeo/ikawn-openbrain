'use strict';

const { pool: defaultPool } = require('../db');
const { getEmbedding: defaultGetEmbedding } = require('../embeddings');

let _pool = defaultPool;
let _getEmbedding = defaultGetEmbedding;

const BATCH_SIZE = 50;
const BATCH_PAUSE_MS = 1000;
const DEFAULT_INTERVAL_MS = 10000;

let _interval = null;

/**
 * Override pool for testing.
 */
function _setPool(p) { _pool = p; }

/**
 * Override getEmbedding for testing.
 */
function _setGetEmbedding(fn) { _getEmbedding = fn; }

/**
 * Process unembedded episodic memories.
 * Fetches up to BATCH_SIZE rows with NULL embedding, generates embeddings,
 * and stores them as serialized JSON arrays (TEXT).
 */
async function processUnembeddedEpisodic() {
  const { rows } = await _pool.query(
    `SELECT id, content FROM episodic_memories WHERE embedding IS NULL ORDER BY created_at ASC LIMIT $1`,
    [BATCH_SIZE]
  );

  if (rows.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  let totalEstimatedTokens = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const vector = await _getEmbedding(row.content);
      // Store as JSON array text — can be cast to pgvector later with ::vector
      const embeddingText = JSON.stringify(vector);
      await _pool.query(
        `UPDATE episodic_memories SET embedding = $1 WHERE id = $2`,
        [embeddingText, row.id]
      );
      processed++;
      totalEstimatedTokens += Math.ceil((row.content || '').length / 4);
    } catch (err) {
      failed++;
      console.error(`[EpisodicEmbeddingWorker] Failed to embed id=${row.id}: ${err.message}`);
      // Skip and continue with next row
    }

    // Pause between batches (not after the last item)
    if (i < rows.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  if (processed > 0 || failed > 0) {
    console.log(`[EpisodicEmbeddingWorker] Processed ${processed}, failed ${failed}, ~${totalEstimatedTokens} tokens`);
  }

  return { processed, failed };
}

/**
 * Start the episodic embedding worker polling loop.
 */
function startEpisodicEmbeddingWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  console.log(`[EpisodicEmbeddingWorker] Starting (${intervalMs / 1000}s interval, batch size ${BATCH_SIZE})`);
  processUnembeddedEpisodic().catch(err => {
    console.error(`[EpisodicEmbeddingWorker] Initial run error: ${err.message}`);
  });
  _interval = setInterval(() => {
    processUnembeddedEpisodic().catch(err => {
      console.error(`[EpisodicEmbeddingWorker] Poll error: ${err.message}`);
    });
  }, intervalMs);
}

/**
 * Stop the episodic embedding worker.
 */
function stopEpisodicEmbeddingWorker() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = {
  processUnembeddedEpisodic,
  startEpisodicEmbeddingWorker,
  stopEpisodicEmbeddingWorker,
  _setPool,
  _setGetEmbedding,
};
