'use strict';

const { getPreset } = require('./agent-presets');

const MAX_ACTIVE_CHILDREN = 3;
const DESCRIPTION_MAX_LENGTH = 500;

// Valid sub-agent types (coordinator cannot spawn coordinators)
const SPAWNABLE_TYPES = ['researcher', 'builder', 'reviewer', 'deployer', 'analyst'];

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

/**
 * Spawn a sub-agent task in scheduled_tasks for immediate pickup.
 *
 * @param {object} config
 * @param {string} config.type - preset type (researcher, builder, reviewer, deployer, analyst)
 * @param {string} config.prompt - task prompt for the sub-agent
 * @param {string} config.parentSession - UUID of the coordinator's session
 * @param {string} [config.brandId] - brand context (default: 'ikawn')
 * @param {number} [config.budget] - optional token budget override
 * @param {number} [config.dollarCap] - optional dollar cap override
 * @returns {Promise<object>} { taskId, taskUuid, type, toolScope } or { error }
 */
async function spawnAgent(config) {
  const { type, prompt, parentSession, brandId = 'ikawn', budget, dollarCap } = config || {};

  // Validate type
  if (!type || !SPAWNABLE_TYPES.includes(type)) {
    const reason = type === 'coordinator'
      ? 'Coordinators cannot spawn other coordinators'
      : `Invalid sub-agent type: ${type}`;
    return { error: reason };
  }

  if (!prompt || typeof prompt !== 'string') {
    return { error: 'Prompt is required and must be a string' };
  }

  if (!parentSession) {
    return { error: 'parentSession UUID is required' };
  }

  // Get preset defaults — toolScope is LOCKED to preset
  const preset = getPreset(type);
  if (!preset) {
    return { error: `No preset found for type: ${type}` };
  }

  // Max children check
  const countResult = await getPool().query(
    `SELECT COUNT(*)::int AS cnt FROM scheduled_tasks
     WHERE parent_session = $1 AND task_type = 'sub_agent' AND last_status NOT IN ('completed', 'failed')`,
    [parentSession]
  );
  const activeCount = countResult.rows[0]?.cnt ?? 0;
  if (activeCount >= MAX_ACTIVE_CHILDREN) {
    return { error: 'Max 3 active sub-agents per coordinator' };
  }

  // Resolve budget values: override or preset default
  const resolvedBudget = budget != null ? budget : preset.tokenBudget;
  const resolvedDollarCap = dollarCap != null ? dollarCap : preset.dollarCap;

  const taskConfig = {
    prompt,
    parentSession,
    toolScope: preset.toolScope,   // IMMUTABLE — always from preset
    modelTier: preset.modelTier,
    tokenBudget: resolvedBudget,
    dollarCap: resolvedDollarCap,
  };

  const { rows } = await getPool().query(
    `INSERT INTO scheduled_tasks
       (brand_id, agent_slug, name, description, tier, tool, config,
        schedule_type, task_type, parent_session, enabled, last_status, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 'pending', NOW())
     RETURNING id, uuid`,
    [
      brandId,
      type,
      `Sub-agent: ${type}`,
      prompt.slice(0, DESCRIPTION_MAX_LENGTH),
      'agent',
      'sub_agent',
      JSON.stringify(taskConfig),
      'once',
      'sub_agent',
      parentSession,
    ]
  );

  const row = rows[0];
  return {
    taskId: row.id,
    taskUuid: row.uuid,
    type,
    toolScope: preset.toolScope,
  };
}

/**
 * Get status of all child sub-agents for a coordinator session.
 *
 * @param {string} parentSessionId - UUID of the coordinator's session
 * @returns {Promise<object[]>}
 */
async function getChildStatus(parentSessionId) {
  const { rows } = await getPool().query(
    `SELECT st.id, st.uuid, st.agent_slug, st.last_status, st.config,
            tr.status AS run_status, tr.result, tr.error, tr.cost_usd
     FROM scheduled_tasks st
     LEFT JOIN task_runs tr ON tr.task_id = st.id
     WHERE st.parent_session = $1 AND st.task_type = 'sub_agent'
     ORDER BY st.created_at ASC`,
    [parentSessionId]
  );
  return rows;
}

/**
 * Count active (non-completed, non-failed) children for a coordinator session.
 *
 * @param {string} parentSessionId - UUID of the coordinator's session
 * @returns {Promise<number>}
 */
async function getChildCount(parentSessionId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS cnt FROM scheduled_tasks
     WHERE parent_session = $1 AND task_type = 'sub_agent' AND last_status NOT IN ('completed', 'failed')`,
    [parentSessionId]
  );
  return rows[0]?.cnt ?? 0;
}

module.exports = { spawnAgent, getChildStatus, getChildCount, _setPool };
