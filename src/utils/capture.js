const { pool } = require('../db');

/**
 * Universal message capture — the ONLY way data enters the memories table.
 * Called by ALL channels: web, telegram, slack, api.
 * NEVER throws. Capture failure must not break user experience.
 */
async function captureMessage({
  brand_id = 'ikawn',
  session_id,
  channel,
  direction,
  content,
  metadata = {},
  source_ref = null
}) {
  const ref = source_ref || `${channel}_${direction}_${Date.now()}`;

  try {
    const result = await pool.query(`
      INSERT INTO memories (
        brand_id, content, source, memory_type,
        source_ref, tags, author, project,
        embedding_status
      ) VALUES ($1, $2, $3, 'conversation', $4, $5, $6, $7, 'pending')
      ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET
        content = EXCLUDED.content,
        updated_at = NOW()
      RETURNING id
    `, [
      brand_id,
      content,
      `ruhi-${channel}`,
      ref,
      [channel, direction],
      direction === 'inbound' ? 'user' : 'ruhi',
      metadata.project || channel
    ]);

    return result.rows[0].id;
  } catch (err) {
    console.error('[Capture] Failed:', err.message, { ref, channel });
    return null;
  }
}

/**
 * Capture edit delta — implicit user signals from generation interactions.
 * NEVER throws.
 */
async function captureEditDelta(data) {
  try {
    await pool.query(`
      INSERT INTO edit_deltas (
        brand_id, agent_name, generation_id, session_id,
        delta_type, original_prompt, revised_prompt,
        original_output, edited_output, selected_urls, rejected_urls,
        model_used, user_signal
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      data.brand_id || 'ikawn',
      data.agent_name, data.generation_id || null, data.session_id || null,
      data.delta_type, data.original_prompt || null, data.revised_prompt || null,
      data.original_output || null, data.edited_output || null,
      data.selected_urls || [], data.rejected_urls || [],
      data.model_used || null, data.user_signal || 'implicit'
    ]);
  } catch (err) {
    console.error('[EditDelta] Capture failed:', err.message);
  }
}

module.exports = { captureMessage, captureEditDelta };
