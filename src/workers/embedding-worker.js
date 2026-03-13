const { pool } = require('../db');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_SIZE = 50;
const INTERVAL_MS = 5000;

async function processPendingEmbeddings() {
  try {
    const { rows } = await pool.query(`
      SELECT id, content FROM memories
      WHERE embedding_status = 'pending'
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

    console.log(`[EmbeddingWorker] Processed ${rows.length} memories`);
  } catch (err) {
    // Try to mark as failed so they don't retry forever
    try {
      await pool.query(`
        UPDATE memories SET embedding_status = 'failed'
        WHERE id IN (
          SELECT id FROM memories
          WHERE embedding_status = 'pending' AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT $1
        )
      `, [BATCH_SIZE]);
    } catch (_) {}
    console.error('[EmbeddingWorker] Batch failed:', err.message);
  }
}

async function processPendingDistilledEmbeddings() {
  try {
    const { rows } = await pool.query(`
      SELECT id, content FROM distilled_memory
      WHERE embedding_status = 'pending'
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

    console.log(`[EmbeddingWorker] Processed ${rows.length} distilled memories`);
  } catch (err) {
    try {
      await pool.query(`
        UPDATE distilled_memory SET embedding_status = 'failed'
        WHERE id IN (
          SELECT id FROM distilled_memory
          WHERE embedding_status = 'pending' AND superseded_by IS NULL
          ORDER BY created_at ASC LIMIT $1
        )
      `, [BATCH_SIZE]);
    } catch (_) {}
    console.error('[EmbeddingWorker] Distilled batch failed:', err.message);
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
