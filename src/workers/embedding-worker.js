const { pool } = require('../db');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_SIZE = 50;
const INTERVAL_MS = 5000;
const RETRY_STATUS_SEQUENCE = { 'pending': 'retry_1', 'retry_1': 'retry_2', 'retry_2': 'failed' };

/** Jittered delay between 1-3 seconds */
function jitteredDelay() {
  const ms = 1000 + Math.random() * 2000;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try embedding each memory individually after a batch failure.
 * Returns { succeeded, retried, failed } counts.
 */
async function processIndividualMemories(rows, table, extraUpdateFields) {
  let succeeded = 0, retried = 0, failed = 0;

  for (const row of rows) {
    try {
      await jitteredDelay();
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: [row.content.slice(0, 8000)]
      });

      const embeddingStr = `{${response.data[0].embedding.join(',')}}`;
      const setClauses = [`embedding = $1::float8[]`, `embedding_status = 'done'`];
      if (extraUpdateFields) setClauses.push(...extraUpdateFields);

      await pool.query(
        `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $2`,
        [embeddingStr, row.id]
      );
      succeeded++;
    } catch (individualErr) {
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
  try {
    const { rows } = await pool.query(`
      SELECT id, content, embedding_status FROM memories
      WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) return;

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rows.map(r => r.content.slice(0, 8000))
    });

    for (let i = 0; i < rows.length; i++) {
      // Postgres float8[] expects array parameter, not JSON string
      await pool.query(`
        UPDATE memories
        SET embedding = $1::float8[],
            embedding_status = 'done',
            embedding_model = 'text-embedding-3-small',
            embedded_at = NOW()
        WHERE id = $2
      `, [`{${response.data[i].embedding.join(',')}}`, rows[i].id]);
    }

    const totalTokens = response.usage?.total_tokens || 0;
    const estCost = (totalTokens / 1_000_000 * 0.02).toFixed(6);
    console.log(`[EmbeddingWorker] Batch processed ${rows.length} memories (${totalTokens} tokens, ~$${estCost})`);
  } catch (err) {
    console.error(`[EmbeddingWorker] Batch failed, falling back to individual processing: ${err.message}`);

    // Re-fetch the same rows to process individually
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
        `embedding_model = 'text-embedding-3-small'`,
        `embedded_at = NOW()`
      ]);

      console.log(`[EmbeddingWorker] Individual fallback: ${result.succeeded} succeeded, ${result.retried} queued for retry, ${result.failed} permanently failed`);
    } catch (fallbackErr) {
      console.error(`[EmbeddingWorker] Individual fallback also failed: ${fallbackErr.message}`);
    }
  }
}

async function processPendingDistilledEmbeddings() {
  try {
    const { rows } = await pool.query(`
      SELECT id, content, embedding_status FROM distilled_memory
      WHERE embedding_status IN ('pending', 'retry_1', 'retry_2')
        AND superseded_by IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) return;

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rows.map(r => r.content.slice(0, 8000))
    });

    for (let i = 0; i < rows.length; i++) {
      await pool.query(`
        UPDATE distilled_memory
        SET embedding = $1::float8[],
            embedding_status = 'done'
        WHERE id = $2
      `, [`{${response.data[i].embedding.join(',')}}`, rows[i].id]);
    }

    const totalTokens = response.usage?.total_tokens || 0;
    const estCost = (totalTokens / 1_000_000 * 0.02).toFixed(6);
    console.log(`[EmbeddingWorker] Batch processed ${rows.length} distilled memories (${totalTokens} tokens, ~$${estCost})`);
  } catch (err) {
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

function startEmbeddingWorker() {
  console.log('[EmbeddingWorker] Starting (5s interval, batch size 50, memories + distilled)');
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
