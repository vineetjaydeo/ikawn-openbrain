'use strict';

const { pool } = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let _genAI = null;

function getGenAI() {
  if (!_genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

const EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 50;
const INTERVAL_MS = 5000;
const RETRY_STATUS_SEQUENCE = { 'pending': 'retry_1', 'retry_1': 'retry_2', 'retry_2': 'failed' };

// 429 backoff: when rate-limited, pause for 5 minutes before retrying
let _rateLimitedUntil = 0;
function isRateLimited() { return Date.now() < _rateLimitedUntil; }
function setRateLimited() {
  _rateLimitedUntil = Date.now() + 5 * 60 * 1000; // 5 minute cooldown
  console.log('[EmbeddingWorker] Rate limited — backing off for 5 minutes');
}
function isRateLimitError(err) {
  return err.message && (err.message.includes('429') || err.message.includes('Too Many Requests') || err.message.includes('quota'));
}

/** Jittered delay between 1-3 seconds */
function jitteredDelay() {
  const ms = 1000 + Math.random() * 2000;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get embedding for a single text using Google Generative AI.
 */
async function getEmbedding(text) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text: text.slice(0, 8000) }] },
    outputDimensionality: 768
  });
  return result.embedding.values;
}

/**
 * Get embeddings for a batch of texts using Google Generative AI.
 */
async function getBatchEmbeddings(texts) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.batchEmbedContents({
    requests: texts.map(text => ({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: 768
    })),
  });
  return result.embeddings.map(e => e.values);
}

/**
 * Try embedding each memory individually after a batch failure.
 * Returns { succeeded, retried, failed } counts.
 */
async function processIndividualMemories(rows, table, extraUpdateFields) {
  let succeeded = 0, retried = 0, failed = 0;

  for (const row of rows) {
    if (!row.content || !row.content.trim()) {
      try {
        await pool.query(`UPDATE ${table} SET embedding_status = 'failed' WHERE id = $1`, [row.id]);
      } catch (_) {}
      failed++;
      continue;
    }
    try {
      await jitteredDelay();
      const embedding = await getEmbedding(row.content);

      const vectorStr = `[${embedding.join(',')}]`;
      const setClauses = [`embedding = $1::vector`, `embedding_status = 'done'`];
      if (extraUpdateFields) setClauses.push(...extraUpdateFields);

      await pool.query(
        `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $2`,
        [vectorStr, row.id]
      );
      succeeded++;
    } catch (individualErr) {
      // On rate limit: stop processing entirely, don't advance retry status
      if (isRateLimitError(individualErr)) {
        setRateLimited();
        break;
      }

      // Advance to next retry status based on current status
      const currentStatus = row.embedding_status || 'pending';
      const nextStatus = RETRY_STATUS_SEQUENCE[currentStatus] || 'failed';

      try {
        await pool.query(
          `UPDATE ${table} SET embedding_status = $1 WHERE id = $2`,
          [nextStatus, row.id]
        );
      } catch (_) {}

      if (nextStatus === 'failed') {
        failed++;
        console.error(`[EmbeddingWorker] ${table} id=${row.id} permanently failed after 3 attempts: ${individualErr.message}`);
      } else {
        retried++;
      }
    }
  }

  return { succeeded, retried, failed };
}

async function processPendingEmbeddings() {
  if (isRateLimited()) return; // Skip while in cooldown

  try {
    const { rows } = await pool.query(`
      SELECT id, content, embedding_status FROM memories
      WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) return;

    // Skip empty content rows — Google API returns 400 on empty strings
    const emptyRows = rows.filter(r => !r.content || !r.content.trim());
    if (emptyRows.length > 0) {
      for (const row of emptyRows) {
        await pool.query(
          `UPDATE memories SET embedding_status = 'failed' WHERE id = $1`,
          [row.id]
        );
      }
      console.log(`[EmbeddingWorker] Skipped ${emptyRows.length} empty-content memories (marked failed)`);
    }
    const validRows = rows.filter(r => r.content && r.content.trim());
    if (validRows.length === 0) return;

    const embeddings = await getBatchEmbeddings(validRows.map(r => r.content));

    for (let i = 0; i < validRows.length; i++) {
      // pgvector expects '[1,2,3,...]' format for vector type
      await pool.query(`
        UPDATE memories
        SET embedding = $1::vector,
            embedding_status = 'done',
            embedding_model = $3,
            embedded_at = NOW()
        WHERE id = $2
      `, [`[${embeddings[i].join(',')}]`, validRows[i].id, EMBEDDING_MODEL]);
    }

    console.log(`[EmbeddingWorker] Batch processed ${rows.length} memories (model: ${EMBEDDING_MODEL})`);
  } catch (err) {
    // On rate limit: back off for 5 minutes, do NOT retry individual rows
    if (isRateLimitError(err)) {
      setRateLimited();
      return;
    }

    console.error(`[EmbeddingWorker] Batch failed, falling back to individual processing: ${err.message}`);

    // Re-fetch the same rows to process individually (only for non-rate-limit errors)
    try {
      const { rows } = await pool.query(`
        SELECT id, content, embedding_status FROM memories
        WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT $1
      `, [BATCH_SIZE]);

      if (rows.length === 0) return;

      const result = await processIndividualMemories(rows, 'memories', [
        `embedding_model = '${EMBEDDING_MODEL}'`,
        `embedded_at = NOW()`
      ]);

      console.log(`[EmbeddingWorker] Individual fallback: ${result.succeeded} succeeded, ${result.retried} queued for retry, ${result.failed} permanently failed`);
    } catch (fallbackErr) {
      if (isRateLimitError(fallbackErr)) { setRateLimited(); return; }
      console.error(`[EmbeddingWorker] Individual fallback also failed: ${fallbackErr.message}`);
    }
  }
}

async function processPendingDistilledEmbeddings() {
  if (isRateLimited()) return; // Skip while in cooldown

  try {
    const { rows } = await pool.query(`
      SELECT id, content, embedding_status FROM distilled_memory
      WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
        AND superseded_by IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) return;

    // Skip empty content rows
    const emptyRows = rows.filter(r => !r.content || !r.content.trim());
    if (emptyRows.length > 0) {
      for (const row of emptyRows) {
        await pool.query(
          `UPDATE distilled_memory SET embedding_status = 'failed' WHERE id = $1`,
          [row.id]
        );
      }
      console.log(`[EmbeddingWorker] Skipped ${emptyRows.length} empty distilled memories (marked failed)`);
    }
    const validRows = rows.filter(r => r.content && r.content.trim());
    if (validRows.length === 0) return;

    const embeddings = await getBatchEmbeddings(validRows.map(r => r.content));

    for (let i = 0; i < validRows.length; i++) {
      await pool.query(`
        UPDATE distilled_memory
        SET embedding = $1::vector,
            embedding_status = 'done'
        WHERE id = $2
      `, [`[${embeddings[i].join(',')}]`, validRows[i].id]);
    }

    console.log(`[EmbeddingWorker] Batch processed ${rows.length} distilled memories (model: ${EMBEDDING_MODEL})`);
  } catch (err) {
    if (isRateLimitError(err)) { setRateLimited(); return; }

    console.error(`[EmbeddingWorker] Distilled batch failed, falling back to individual processing: ${err.message}`);

    try {
      const { rows } = await pool.query(`
        SELECT id, content, embedding_status FROM distilled_memory
        WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
          AND superseded_by IS NULL
        ORDER BY created_at ASC
        LIMIT $1
      `, [BATCH_SIZE]);

      if (rows.length === 0) return;

      const result = await processIndividualMemories(rows, 'distilled_memory', null);

      console.log(`[EmbeddingWorker] Distilled individual fallback: ${result.succeeded} succeeded, ${result.retried} queued for retry, ${result.failed} permanently failed`);
    } catch (fallbackErr) {
      console.error(`[EmbeddingWorker] Distilled individual fallback also failed: ${fallbackErr.message}`);
    }
  }
}

let interval = null;

async function startEmbeddingWorker() {
  console.log(`[EmbeddingWorker] Starting (5s interval, batch size ${BATCH_SIZE}, model: ${EMBEDDING_MODEL}, memories + distilled)`);

  // One-time repair: reset memories incorrectly marked 'failed' due to 429 rate limits
  // These have content but no embedding — they should be retried
  try {
    const { rowCount } = await pool.query(`
      UPDATE memories SET embedding_status = 'pending'
      WHERE embedding_status = 'failed' AND embedding IS NULL AND content IS NOT NULL AND content != ''
    `);
    if (rowCount > 0) console.log(`[EmbeddingWorker] Repaired ${rowCount} memories incorrectly marked failed (reset to pending)`);
  } catch (err) {
    console.warn('[EmbeddingWorker] Repair query failed:', err.message);
  }

  processPendingEmbeddings();
  processPendingDistilledEmbeddings();
  interval = setInterval(async () => {
    await processPendingEmbeddings();
    await processPendingDistilledEmbeddings();
  }, INTERVAL_MS);
}

function stopEmbeddingWorker() {
  if (interval) clearInterval(interval);
}

module.exports = { startEmbeddingWorker, stopEmbeddingWorker };
