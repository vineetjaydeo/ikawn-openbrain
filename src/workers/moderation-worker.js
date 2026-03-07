const { pool } = require('../db');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INTERVAL_MS = 30000;

async function moderateUnscored() {
  try {
    const { rows } = await pool.query(`
      SELECT id, content FROM memories
      WHERE moderation_score IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 20
    `);

    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const result = await openai.moderations.create({ input: row.content });
        const score = result.results[0].category_scores;
        const maxScore = Math.max(...Object.values(score));
        const flags = Object.entries(score)
          .filter(([_, v]) => v > 0.3)
          .map(([k]) => k);

        await pool.query(`
          UPDATE memories SET moderation_score = $1, moderation_flags = $2
          WHERE id = $3
        `, [maxScore, flags, row.id]);

        if (maxScore > 0.7) {
          // Increment abuse counter on brand_ratings
          const mem = await pool.query('SELECT brand_id FROM memories WHERE id = $1', [row.id]);
          if (mem.rows.length > 0 && mem.rows[0].brand_id) {
            await pool.query(`
              INSERT INTO brand_ratings (brand_id, abuse_flags, inappropriate_content_count, notes, rated_by, rated_at)
              VALUES ($1, 1, 1, 'Auto-flagged by moderation worker', 'system', NOW())
              ON CONFLICT DO NOTHING
            `, [mem.rows[0].brand_id]);
          }
        }

        if (maxScore > 0.9) {
          console.error(`[Moderation] SEVERE content detected in memory ${row.id}. Manual review required.`);
        }
      } catch (err) {
        console.error('[Moderation] Failed for memory', row.id, err.message);
      }
    }
  } catch (err) {
    console.error('[Moderation] Worker error:', err.message);
  }
}

let interval = null;

function startModerationWorker() {
  console.log('[ModerationWorker] Starting (30s interval)');
  moderateUnscored();
  interval = setInterval(moderateUnscored, INTERVAL_MS);
}

function stopModerationWorker() {
  if (interval) clearInterval(interval);
}

module.exports = { startModerationWorker, stopModerationWorker };
