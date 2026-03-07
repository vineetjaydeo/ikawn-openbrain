const { pool } = require('../db');

const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

async function promoteToMothership() {
  try {
    const { rows } = await pool.query(`
      SELECT ed.*, b.tier, b.gdpr_region, bc.industry
      FROM edit_deltas ed
      JOIN brands b ON b.brand_id = ed.brand_id
      LEFT JOIN brand_context bc ON bc.brand_id = ed.brand_id
      WHERE ed.promoted_to_mothership = FALSE
        AND ed.anonymised = FALSE
        AND ed.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM memories m
          WHERE m.brand_id = ed.brand_id
            AND m.moderation_score > 0.3
            AND m.deleted_at IS NULL
          LIMIT 1
        )
      LIMIT 100
    `);

    if (rows.length === 0) return;

    for (const delta of rows) {
      await pool.query(`
        INSERT INTO mothership_log (data_type, anonymised_payload, demographic_tags, signal_strength)
        VALUES ('edit_delta', $1, $2, $3)
      `, [
        JSON.stringify({
          agent_name: delta.agent_name,
          delta_type: delta.delta_type,
          original_prompt: delta.original_prompt,
          revised_prompt: delta.revised_prompt,
          user_signal: delta.user_signal
        }),
        JSON.stringify({ industry: delta.industry, tier: delta.tier, region: delta.gdpr_region }),
        delta.selected_urls && delta.selected_urls.length > 0 ? 0.9 : 0.5
      ]);

      await pool.query(`
        UPDATE edit_deltas SET promoted_to_mothership = TRUE, anonymised = TRUE WHERE id = $1
      `, [delta.id]);
    }

    console.log(`[MothershipWorker] Promoted ${rows.length} deltas`);
  } catch (err) {
    console.error('[MothershipWorker] Promotion failed:', err.message);
  }
}

let interval = null;

function startMothershipWorker() {
  console.log('[MothershipWorker] Starting (daily)');
  // Run at 2am UTC — calculate delay to next 2am
  const now = new Date();
  const next2am = new Date(now);
  next2am.setUTCHours(2, 0, 0, 0);
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1);
  const delay = next2am - now;

  setTimeout(() => {
    promoteToMothership();
    interval = setInterval(promoteToMothership, INTERVAL_MS);
  }, delay);
}

function stopMothershipWorker() {
  if (interval) clearInterval(interval);
}

module.exports = { startMothershipWorker, stopMothershipWorker };
