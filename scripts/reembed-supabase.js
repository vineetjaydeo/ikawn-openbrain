/**
 * Re-embed Supabase memories with NULL embeddings.
 *
 * During the Fly PG → Supabase backfill, embedding columns were intentionally
 * skipped (embedding_status was copied as 'done' but embedding is NULL).
 * This script re-embeds all such rows using gemini-embedding-001 (768-dim).
 *
 * Usage:
 *   SUPABASE_DIRECT_URL=... GOOGLE_AI_API_KEY=... node scripts/reembed-supabase.js
 *
 * On Fly machine:
 *   flyctl ssh console --app ikawn-openbrain -C \
 *     "node /app/scripts/reembed-supabase.js"
 *
 * Environment:
 *   SUPABASE_DIRECT_URL  — Supabase direct connection string (required)
 *   GOOGLE_AI_API_KEY    — Google AI API key (required)
 *   BATCH_SIZE           — rows per batch (default: 50)
 *   BATCH_DELAY_MS       — ms between batches (default: 2000, ~1500 RPM safe)
 */

'use strict';

// Support both local node_modules and Fly /app/node_modules
let Pool, GoogleGenerativeAI;
try {
  ({ Pool } = require('pg'));
  ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (_) {
  ({ Pool } = require('/app/node_modules/pg'));
  ({ GoogleGenerativeAI } = require('/app/node_modules/@google/generative-ai'));
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_DIRECT_URL;
const GOOGLE_KEY   = process.env.GOOGLE_AI_API_KEY;
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE   || '50', 10);
const BATCH_DELAY  = parseInt(process.env.BATCH_DELAY_MS || '2000', 10);
const EMBEDDING_MODEL = 'gemini-embedding-001';

if (!SUPABASE_URL) {
  console.error('[reembed] ERROR: SUPABASE_DIRECT_URL is required');
  process.exit(1);
}
if (!GOOGLE_KEY) {
  console.error('[reembed] ERROR: GOOGLE_AI_API_KEY is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Postgres pool (Supabase)
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ---------------------------------------------------------------------------
// Google Generative AI
// ---------------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(GOOGLE_KEY);
const embModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch-embed an array of text strings.
 * Returns parallel array of float[] (one per input text).
 */
async function getBatchEmbeddings(texts) {
  const result = await embModel.batchEmbedContents({
    requests: texts.map(text => ({
      content: { parts: [{ text: text.slice(0, 8000) }] },
    })),
  });
  return result.embeddings.map(e => e.values);
}

/**
 * Embed a single text string. Used as fallback when batch fails.
 */
async function getSingleEmbedding(text) {
  const result = await embModel.embedContent(text.slice(0, 8000));
  return result.embedding.values;
}

/**
 * Format a float array as a Postgres float8[] literal: {0.1,0.2,...}
 */
function toFloat8Array(values) {
  return `{${values.join(',')}}`;
}

/**
 * Write embedding for a single row.
 */
async function writeEmbedding(id, embedding) {
  await pool.query(
    `UPDATE memories
     SET embedding        = $1::float8[],
         embedding_status = 'done',
         embedding_model  = $2,
         embedded_at      = NOW()
     WHERE id = $3`,
    [toFloat8Array(embedding), EMBEDDING_MODEL, id]
  );
}

/**
 * Mark a row as permanently failed.
 */
async function markFailed(id) {
  await pool.query(
    `UPDATE memories SET embedding_status = 'failed' WHERE id = $1`,
    [id]
  );
}

// ---------------------------------------------------------------------------
// Count total NULL-embedding rows (for progress display)
// ---------------------------------------------------------------------------
async function countRemaining() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM memories WHERE embedding IS NULL AND deleted_at IS NULL`
  );
  return parseInt(rows[0].cnt, 10);
}

// ---------------------------------------------------------------------------
// Process one batch: fetch → embed → write
// Returns { succeeded, failed } counts.
// ---------------------------------------------------------------------------
async function processBatch() {
  const { rows } = await pool.query(
    `SELECT id, content
     FROM memories
     WHERE embedding IS NULL
       AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (rows.length === 0) return { done: true, succeeded: 0, failed: 0 };

  // Separate empty-content rows (Google API rejects them)
  const emptyRows = rows.filter(r => !r.content || !r.content.trim());
  const validRows  = rows.filter(r => r.content  &&  r.content.trim());

  let succeeded = 0;
  let failed    = 0;

  // Mark empty rows failed immediately
  for (const row of emptyRows) {
    try { await markFailed(row.id); } catch (_) {}
    failed++;
  }

  if (validRows.length === 0) return { done: false, succeeded, failed };

  // Try batch embedding first
  try {
    const embeddings = await getBatchEmbeddings(validRows.map(r => r.content));
    for (let i = 0; i < validRows.length; i++) {
      try {
        await writeEmbedding(validRows[i].id, embeddings[i]);
        succeeded++;
      } catch (writeErr) {
        console.error(`[reembed] Write failed for id=${validRows[i].id}: ${writeErr.message}`);
        failed++;
      }
    }
  } catch (batchErr) {
    // Batch failed — fall back to per-row with up to 3 attempts each
    console.warn(`[reembed] Batch failed (${batchErr.message}), falling back to individual rows`);
    for (const row of validRows) {
      let lastErr;
      let ok = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await delay(500 * attempt); // progressive back-off: 500ms, 1000ms, 1500ms
          const embedding = await getSingleEmbedding(row.content);
          await writeEmbedding(row.id, embedding);
          succeeded++;
          ok = true;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!ok) {
        console.error(`[reembed] id=${row.id} failed after 3 attempts: ${lastErr.message}`);
        try { await markFailed(row.id); } catch (_) {}
        failed++;
      }
    }
  }

  return { done: false, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function main() {
  console.log('[reembed] Starting Supabase re-embedding run');
  console.log(`[reembed] Model: ${EMBEDDING_MODEL} | Batch: ${BATCH_SIZE} | Delay: ${BATCH_DELAY}ms`);

  const totalAtStart = await countRemaining();
  console.log(`[reembed] Rows to embed: ${totalAtStart}`);

  if (totalAtStart === 0) {
    console.log('[reembed] Nothing to do. All rows already embedded.');
    await pool.end();
    return;
  }

  let totalSucceeded = 0;
  let totalFailed    = 0;
  let batchNum       = 0;

  while (true) {
    batchNum++;
    const { done, succeeded, failed } = await processBatch();

    totalSucceeded += succeeded;
    totalFailed    += failed;

    if (done) break;

    // Progress log every 10 batches
    if (batchNum % 10 === 0) {
      const remaining = await countRemaining();
      const processed = totalAtStart - remaining;
      console.log(`[reembed] Processed ~${processed}/${totalAtStart} memories (batch ${batchNum}, ${totalSucceeded} ok, ${totalFailed} failed)`);
    }

    // Rate-limit delay between batches (2s default → ~1500 RPM safe zone)
    await delay(BATCH_DELAY);
  }

  const finalRemaining = await countRemaining();
  console.log('');
  console.log('[reembed] ---- DONE ----');
  console.log(`[reembed] Total succeeded : ${totalSucceeded}`);
  console.log(`[reembed] Total failed    : ${totalFailed}`);
  console.log(`[reembed] Still NULL      : ${finalRemaining}`);

  if (finalRemaining > 0) {
    console.warn(`[reembed] WARNING: ${finalRemaining} rows still have NULL embeddings.`);
    console.warn('[reembed] These were either empty-content or hit persistent API errors (embedding_status=failed).');
    console.warn('[reembed] Re-run the script to retry any that are not permanently failed.');
  } else {
    console.log('[reembed] All memories embedded successfully.');
  }

  await pool.end();
}

main().catch(err => {
  console.error('[reembed] Fatal error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
