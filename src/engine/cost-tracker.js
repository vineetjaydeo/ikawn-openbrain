'use strict';

const { MODELS } = require('./model-router');

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

// Build reverse lookup: modelId → pricing
const _pricingByModelId = {};
for (const [, config] of Object.entries(MODELS)) {
  _pricingByModelId[config.modelId] = config;
}

function calculateCostFromModel(model, tokensIn, tokensOut) {
  const pricing = _pricingByModelId[model];
  if (!pricing) {
    console.warn(`[CostTracker] Unknown model "${model}" — recording $0 cost`);
    return 0;
  }
  return (tokensIn * pricing.inputPricePerMToken + tokensOut * pricing.outputPricePerMToken) / 1_000_000;
}

async function logLLMCall(sessionId, executionId, brandId, model, tokensIn, tokensOut) {
  const costUsd = calculateCostFromModel(model, tokensIn, tokensOut);
  await getPool().query(
    `INSERT INTO cost_events (session_id, execution_id, brand_id, event_type, model, tokens_in, tokens_out, cost_usd)
     VALUES ($1, $2, $3, 'llm_call', $4, $5, $6, $7)`,
    [sessionId, executionId, brandId, model, tokensIn, tokensOut, costUsd]
  );
  return costUsd;
}

async function logToolCall(sessionId, executionId, brandId, toolName, costUsd = 0) {
  await getPool().query(
    `INSERT INTO cost_events (session_id, execution_id, brand_id, event_type, tool_name, cost_usd)
     VALUES ($1, $2, $3, 'tool_call', $4, $5)`,
    [sessionId, executionId, brandId, toolName, costUsd]
  );
}

async function logEmbedding(sessionId, brandId, tokenCount) {
  const costUsd = 0;
  await getPool().query(
    `INSERT INTO cost_events (session_id, brand_id, event_type, tokens_in, cost_usd)
     VALUES ($1, $2, 'embedding', $3, $4)`,
    [sessionId, brandId, tokenCount, costUsd]
  );
}

async function getSessionTotal(sessionId) {
  const { rows } = await getPool().query(
    'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_events WHERE session_id = $1',
    [sessionId]
  );
  return parseFloat(rows[0].total);
}

async function getBrandDaily(brandId, date) {
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_events
     WHERE brand_id = $1 AND created_at::date = $2::date`,
    [brandId, typeof date === 'string' ? date : date.toISOString().split('T')[0]]
  );
  return parseFloat(rows[0].total);
}

async function checkBudget(sessionId, dollarCap) {
  const spent = await getSessionTotal(sessionId);
  return {
    withinBudget: spent < dollarCap,
    spent,
    remaining: Math.max(0, dollarCap - spent),
  };
}

async function getSessionTotalWithChildren(sessionId) {
  const { rows } = await getPool().query(
    `WITH RECURSIVE session_tree AS (
      SELECT id FROM sessions WHERE id = $1
      UNION ALL
      SELECT s.id FROM sessions s JOIN session_tree st ON s.parent_session = st.id
    )
    SELECT COALESCE(SUM(ce.cost_usd), 0) as total
    FROM cost_events ce
    WHERE ce.session_id IN (SELECT id FROM session_tree)`,
    [sessionId]
  );
  return parseFloat(rows[0].total);
}

async function getSessionCostBreakdown(sessionId) {
  const { rows } = await getPool().query(
    `SELECT s.id, s.agent_slug, s.status, s.total_cost_usd,
            (SELECT COUNT(*) FROM cost_events WHERE session_id = s.id) as event_count
     FROM sessions s
     WHERE s.parent_session = $1
     ORDER BY s.created_at`,
    [sessionId]
  );
  return rows.map(r => ({
    id: r.id,
    agent_slug: r.agent_slug,
    status: r.status,
    total_cost_usd: parseFloat(r.total_cost_usd || 0),
    event_count: parseInt(r.event_count, 10),
  }));
}

module.exports = {
  logLLMCall, logToolCall, logEmbedding,
  getSessionTotal, getBrandDaily, checkBudget,
  calculateCostFromModel, _setPool,
  getSessionTotalWithChildren, getSessionCostBreakdown,
};
