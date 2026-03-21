// @ts-check
'use strict';

/**
 * Cross-brain sync worker: Lucy → Ruhi.
 * Runs ONLY on Lucy (ikawn-openbrain). Pushes new research-derived
 * distilled memories to Ruhi Brain's /api/sync/receive endpoint.
 *
 * Controlled by RUHI_BRAIN_URL and RUHI_BRAIN_API_KEY env vars.
 * If not set, worker stays dormant.
 */

const { pool } = require('../db');

const RUHI_BRAIN_URL = process.env.RUHI_BRAIN_URL; // e.g. https://ruhi-os-brain.fly.dev
const RUHI_BRAIN_API_KEY = process.env.RUHI_BRAIN_API_KEY;

const RESEARCH_TYPES = [
  'MARKET_INTELLIGENCE',
  'SEO_UPDATE',
  'AD_STRATEGY',
  'PLATFORM_UPDATE',
];

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Get the last sync timestamp from intelligence_snapshots.
 * @returns {Promise<Date>}
 */
async function getLastSyncAt() {
  const { rows } = await pool.query(
    `SELECT created_at FROM intelligence_snapshots
     WHERE snapshot_type = 'cross_brain_sync'
     ORDER BY created_at DESC LIMIT 1`
  );
  // Default to 7 days ago if never synced
  return rows.length > 0
    ? new Date(rows[0].created_at)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Save sync snapshot.
 */
async function saveSyncSnapshot(data) {
  await pool.query(
    `INSERT INTO intelligence_snapshots (snapshot_type, period, data, summary)
     VALUES ('cross_brain_sync', $1, $2, $3)`,
    [
      new Date().toISOString().slice(0, 10),
      JSON.stringify(data),
      data.summary || '',
    ]
  );
}

/**
 * Run sync: push new research distillations from Lucy to Ruhi.
 */
async function runSync() {
  if (!RUHI_BRAIN_URL || !RUHI_BRAIN_API_KEY) {
    return; // Silently skip — not configured (e.g. running on Ruhi itself)
  }

  try {
    const lastSync = await getLastSyncAt();
    console.log(`[SyncWorker] Syncing memories created after ${lastSync.toISOString()}`);

    const { rows: newMemories } = await pool.query(`
      SELECT content, memory_type, confidence, reasoning,
             source_event_ids::text[] as source_refs
      FROM distilled_memory
      WHERE memory_type = ANY($1)
        AND superseded_by IS NULL
        AND user_id IS NULL
        AND created_at > $2
      ORDER BY confidence DESC
      LIMIT 50
    `, [RESEARCH_TYPES, lastSync]);

    if (newMemories.length === 0) {
      console.log('[SyncWorker] No new research memories to sync');
      await saveSyncSnapshot({ synced: 0, summary: 'No new memories' });
      return;
    }

    console.log(`[SyncWorker] Pushing ${newMemories.length} memories to Ruhi Brain`);

    const payload = {
      memories: newMemories.map(m => ({
        content: m.content,
        memory_type: m.memory_type,
        confidence: m.confidence,
        reasoning: m.reasoning,
        source_ref: `lucy-sync-${new Date().toISOString().slice(0, 10)}`,
      })),
    };

    const response = await fetch(`${RUHI_BRAIN_URL}/api/sync/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': RUHI_BRAIN_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ruhi Brain returned ${response.status}: ${text}`);
    }

    const result = await response.json();
    console.log(`[SyncWorker] Sync complete:`, result);

    await saveSyncSnapshot({
      synced: newMemories.length,
      accepted: result.accepted || 0,
      skipped: result.skipped || 0,
      summary: `Pushed ${newMemories.length}, accepted ${result.accepted || 0}`,
    });
  } catch (err) {
    console.error('[SyncWorker] Sync failed:', err.message);
  }
}

// ── Scheduling ──

let scheduledTimeout = null;
let scheduledInterval = null;

function startSyncWorker() {
  if (!RUHI_BRAIN_URL || !RUHI_BRAIN_API_KEY) {
    console.log('[SyncWorker] RUHI_BRAIN_URL/RUHI_BRAIN_API_KEY not set — worker dormant');
    return;
  }

  console.log('[SyncWorker] Starting (every 6h, Lucy → Ruhi)');

  // First run 10 minutes after startup
  scheduledTimeout = setTimeout(() => {
    runSync();
    scheduledInterval = setInterval(runSync, INTERVAL_MS);
  }, 10 * 60 * 1000);
}

function stopSyncWorker() {
  if (scheduledTimeout) clearTimeout(scheduledTimeout);
  if (scheduledInterval) clearInterval(scheduledInterval);
}

module.exports = { startSyncWorker, stopSyncWorker, runSync };
