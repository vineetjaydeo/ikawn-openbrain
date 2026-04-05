'use strict';

const { randomUUID } = require('crypto');

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

async function create({ brandId, userId, agentSlug, channel, modelTier, systemPrompt, dollarCap, parentSession }) {
  const { rows } = await getPool().query(
    `INSERT INTO sessions (brand_id, user_id, agent_slug, channel, model_tier, system_prompt, dollar_cap, parent_session, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     RETURNING *`,
    [brandId || 'ikawn', userId || null, agentSlug || null, channel || 'web', modelTier || 'balanced', systemPrompt || null, dollarCap || null, parentSession || null]
  );
  return rows[0];
}

async function get(sessionId) {
  const { rows } = await getPool().query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  return rows[0] || null;
}

async function suspend(sessionId, workingMemory, checkpoint) {
  const resumeToken = randomUUID();
  const wmData = { ...(workingMemory || {}), ...(checkpoint ? { _checkpoint: checkpoint } : {}) };
  const { rows } = await getPool().query(
    `UPDATE sessions
     SET status = 'suspended', working_memory = $2, resume_token = $3, suspended_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sessionId, JSON.stringify(wmData), resumeToken]
  );
  if (!rows[0]) throw new Error(`Session not found: ${sessionId}`);
  return rows[0];
}

async function resume(resumeToken) {
  const { rows } = await getPool().query(
    `UPDATE sessions
     SET status = 'active', suspended_at = NULL, resume_token = NULL, updated_at = NOW()
     WHERE resume_token = $1
     RETURNING *`,
    [resumeToken]
  );
  if (!rows[0]) throw new Error(`No session found for resume token: ${resumeToken}`);
  return rows[0];
}

async function complete(sessionId, summary) {
  const { rows } = await getPool().query(
    `UPDATE sessions
     SET status = 'completed', summary = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sessionId, summary || null]
  );
  if (!rows[0]) throw new Error(`Session not found: ${sessionId}`);
  return rows[0];
}

async function fail(sessionId, error) {
  const errorText = typeof error === 'string' ? error : (error?.message || String(error));
  const { rows } = await getPool().query(
    `UPDATE sessions
     SET status = 'failed', error = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sessionId, errorText]
  );
  if (!rows[0]) throw new Error(`Session not found: ${sessionId}`);
  return rows[0];
}

async function updateCost(sessionId, tokensIn, tokensOut, costUsd) {
  await getPool().query(
    `UPDATE sessions
     SET total_tokens_in = total_tokens_in + $2,
         total_tokens_out = total_tokens_out + $3,
         total_cost_usd = total_cost_usd + $4,
         turn_count = turn_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [sessionId, tokensIn, tokensOut, costUsd]
  );
}

async function listActive(brandId) {
  const { rows } = await getPool().query(
    `SELECT * FROM sessions WHERE brand_id = $1 AND status IN ('active', 'suspended') ORDER BY updated_at DESC`,
    [brandId]
  );
  return rows;
}

module.exports = { create, get, suspend, resume, complete, fail, updateCost, listActive, _setPool };
