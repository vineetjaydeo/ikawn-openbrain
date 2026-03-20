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
  source_ref = null,
  user_id = null,
  access_level = 'internal'
}) {
  const ref = source_ref || `${channel}_${direction}_${Date.now()}`;

  try {
    const result = await pool.query(`
      INSERT INTO memories (
        brand_id, content, source, memory_type,
        source_ref, tags, author, project,
        embedding_status, user_id, access_level
      ) VALUES ($1, $2, $3, 'conversation', $4, $5, $6, $7, 'pending', $8, $9)
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
      metadata.project || channel,
      user_id,
      access_level
    ]);

    // Emit event for trigger-based tasks
    try {
      const eventBus = require('./event-bus');
      eventBus.emit('memory.created', { brandId: brand_id, channel, direction });
    } catch (_) {}

    return result.rows[0].id;
  } catch (err) {
    console.error('[Capture] Failed:', err.message, { ref, channel });
    return null;
  }
}

/** @type {Record<string, string>} */
const EVENT_TYPE_MAP = {
  prompt_edit: 'caption_edit',
  output_edit: 'caption_edit',
  selection: 'signal',
  regeneration: 'signal',
  rejection: 'signal',
};

/**
 * Capture edit delta — implicit user signals from generation interactions.
 * Dual-writes: edit_deltas (existing pipeline) + memory_events (distillation pipeline).
 * NEVER throws.
 */
async function captureEditDelta(data) {
  // Write 1: edit_deltas (existing pipeline)
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
    console.error('[EditDelta] edit_deltas write failed:', err.message);
  }

  // Write 2: memory_events (distillation pipeline)
  try {
    const eventType = EVENT_TYPE_MAP[data.delta_type] || 'signal';
    await pool.query(`
      INSERT INTO memory_events (brand_id, event_type, payload, user_id)
      VALUES ($1, $2, $3, $4)
    `, [
      data.brand_id || 'ikawn',
      eventType,
      JSON.stringify(data),
      data.user_id || null
    ]);
  } catch (err) {
    console.error('[EditDelta] memory_events write failed:', err.message);
  }
}

/**
 * Capture a generic event into the memory_events distillation pipeline.
 * NEVER throws.
 */
async function captureEvent(data) {
  try {
    const result = await pool.query(`
      INSERT INTO memory_events (brand_id, event_type, payload, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      data.brand_id || 'ikawn',
      data.event_type,
      JSON.stringify(data.payload),
      data.user_id || null
    ]);
    return result.rows[0].id;
  } catch (err) {
    console.error('[CaptureEvent] Failed:', err.message, { event_type: data.event_type });
    return null;
  }
}

module.exports = { captureMessage, captureEditDelta, captureEvent };
