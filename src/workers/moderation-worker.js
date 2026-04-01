const { pool } = require('../db');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INTERVAL_MS = 30000;
const DELAY_BETWEEN_CALLS_MS = 1000; // 1s between API calls to avoid 429s
const BACKOFF_MS = 5 * 60 * 1000; // 5 min backoff on rate limit
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VINEET_CHAT_ID = '534771402';

let rateLimitedUntil = 0; // in-memory cache, synced with DB

async function notifyTelegram(memoryId, score, flags, content) {
  if (!BOT_TOKEN) return;
  try {
    const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
    const text = `🔴 *SEVERE content detected*\n\nMemory ID: ${memoryId}\nScore: ${score.toFixed(3)}\nFlags: ${flags.join(', ')}\n\nPreview:\n\`${preview}\``;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: VINEET_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('[Moderation] Telegram notify failed:', err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadBackoffState() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM worker_state WHERE key = 'moderation_backoff_until' LIMIT 1"
    );
    if (rows.length > 0) {
      rateLimitedUntil = parseInt(rows[0].value) || 0;
    }
  } catch (_) {
    // Table may not exist yet — will be created on first save
  }
}

async function saveBackoffState(until) {
  rateLimitedUntil = until;
  try {
    await pool.query(`
      INSERT INTO worker_state (key, value, updated_at) VALUES ('moderation_backoff_until', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [String(until)]);
  } catch (err) {
    // Create table if it doesn't exist (one-time)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS worker_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO worker_state (key, value, updated_at) VALUES ('moderation_backoff_until', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [String(until)]);
    } catch (_) {}
  }
}

async function moderateUnscored() {
  // Skip if we're in backoff period
  if (Date.now() < rateLimitedUntil) {
    return;
  }

  try {
    const { rows } = await pool.query(`
      SELECT id, content FROM memories
      WHERE moderation_score IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 10
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
          await notifyTelegram(row.id, maxScore, flags, row.content);
        }

        // Delay between calls to stay under rate limits
        await sleep(DELAY_BETWEEN_CALLS_MS);
      } catch (err) {
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
          console.warn(`[Moderation] Rate limited. Backing off for 5 minutes.`);
          await saveBackoffState(Date.now() + BACKOFF_MS);
          return; // Stop processing this batch entirely
        }
        console.error('[Moderation] Failed for memory', row.id, err.message);
      }
    }
  } catch (err) {
    console.error('[Moderation] Worker error:', err.message);
  }
}

let interval = null;

async function startModerationWorker() {
  console.log('[ModerationWorker] Starting (30s interval, 1s between calls, 5min backoff on 429, persistent state)');
  await loadBackoffState();
  moderateUnscored();
  interval = setInterval(moderateUnscored, INTERVAL_MS);
}

function stopModerationWorker() {
  if (interval) clearInterval(interval);
}

module.exports = { startModerationWorker, stopModerationWorker };
