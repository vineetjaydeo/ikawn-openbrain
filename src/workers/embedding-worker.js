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
      await pool.query(`
        UPDATE memories
        SET embedding = $1,
            embedding_status = 'done',
            embedding_model = 'text-embedding-3-small',
            embedded_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(response.data[i].embedding), rows[i].id]);
    }

    console.log(`[EmbeddingWorker] Processed ${rows.length} memories`);
  } catch (err) {
    // Try to mark as failed
    try {
      await pool.query(`
        UPDATE memories SET embedding_status = 'failed'
        WHERE embedding_status = 'pending' AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT $1
      `, [BATCH_SIZE]);
    } catch (_) {}
    console.error('[EmbeddingWorker] Batch failed:', err.message);
  }
}

let interval = null;

function startEmbeddingWorker() {
  console.log('[EmbeddingWorker] Starting (5s interval, batch size 50)');
  processPendingEmbeddings();
  interval = setInterval(processPendingEmbeddings, INTERVAL_MS);
}

function stopEmbeddingWorker() {
  if (interval) clearInterval(interval);
}

module.exports = { startEmbeddingWorker, stopEmbeddingWorker };
