'use strict';

const { SCHEMA_VERSION, deserializeRunState, serializeRunState, appendItem: appendItemFn } = require('./runState.js');

class PgSession {
  constructor({ pool, captureMessage }) {
    if (!pool) throw new Error('PgSession requires { pool }');
    if (!captureMessage) throw new Error('PgSession requires { captureMessage }');
    this._pool = pool;
    this._captureMessage = captureMessage;
  }

  async load(conversationId) {
    const res = await this._pool.query(
      'SELECT state, schema_version FROM agent_run_states WHERE conversation_id = $1',
      [conversationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (row.schema_version !== SCHEMA_VERSION) {
      throw new Error(`PgSession.load: schema_version mismatch, got ${row.schema_version}, expected ${SCHEMA_VERSION}`);
    }
    return deserializeRunState(row.state);
  }

  async save(state) {
    const json = JSON.parse(serializeRunState(state));
    await this._pool.query(
      `INSERT INTO agent_run_states (conversation_id, brand, current_step, pending_approval_count, pending_job_count, state, schema_version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (conversation_id) DO UPDATE SET
         brand = EXCLUDED.brand,
         current_step = EXCLUDED.current_step,
         pending_approval_count = EXCLUDED.pending_approval_count,
         pending_job_count = EXCLUDED.pending_job_count,
         state = EXCLUDED.state,
         schema_version = EXCLUDED.schema_version,
         updated_at = now()`,
      [
        state.conversationId,
        state.brand,
        state.currentStep || 'idle',
        (state.pendingApprovals || []).length,
        (state.pendingJobs || []).length,
        json,
        state.schemaVersion || SCHEMA_VERSION,
      ]
    );
  }

  async appendItem(conversationId, item, _opts) {
    const current = await this.load(conversationId);
    if (!current) throw new Error(`no such conversation: ${conversationId}`);
    const next = appendItemFn(current, item);

    if (item.type === 'user_message' || item.type === 'assistant_message') {
      const direction = item.type === 'user_message' ? 'inbound' : 'outbound';
      const memId = await this._captureMessage({
        brand_id: current.brand,
        session_id: String(conversationId),
        channel: 'web',
        direction,
        content: item.content,
        source_ref: `web_${direction === 'inbound' ? 'in' : 'out'}_${conversationId}_${item.ts}`,
        user_id: current.userId,
      });
      item.memoryId = memId;
    }

    await this.save(next);
  }
}

module.exports = { PgSession };
