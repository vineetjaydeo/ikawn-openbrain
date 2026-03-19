// @ts-check
'use strict';

/**
 * Skill: onboard_brand
 *
 * Manages skill session state for the brand onboarding wizard.
 * State machine: INIT -> BRAND_TYPE -> URL_INPUT -> CRAWLING -> ANALYZING ->
 *   SOCIAL_DISCOVERY -> COMPETITOR_RESEARCH -> SYNTHESIS ->
 *   DNA_READY -> AWAIT_DNA_REVIEW -> MARKET_CONTEXT ->
 *   AWAIT_MARKET_CONFIRM -> GENERATING_CREATIVES ->
 *   AWAIT_MODE_SELECT -> SAVING -> COMPLETE
 */

const crypto = require('crypto');
const { pool } = require('../db');

const STEPS = [
  'init', 'brand_type', 'url_input', 'crawling', 'analyzing',
  'social_discovery', 'competitor_research', 'synthesis',
  'dna_ready', 'await_dna_review', 'market_context',
  'await_market_confirm', 'generating_creatives',
  'await_mode_select', 'saving', 'complete'
];

/**
 * Required fields for a complete manual brand entry.
 * @type {string[]}
 */
const REQUIRED_MANUAL_FIELDS = ['name', 'industry'];

/**
 * Create a new skill session.
 * @param {string} orgId
 * @param {string} userId
 * @returns {Promise<string>} sessionId
 */
async function createSession(orgId, userId) {
  const sessionId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO skill_sessions (id, skill_name, org_id, user_id, current_step, state_data, created_at, updated_at)
     VALUES ($1, 'onboard_brand', $2, $3, 'init', '{}'::jsonb, NOW(), NOW())`,
    [sessionId, orgId, userId]
  );
  return sessionId;
}

/**
 * Get a skill session by ID.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function getSession(sessionId) {
  const { rows } = await pool.query(
    'SELECT * FROM skill_sessions WHERE id = $1',
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * Update session step and merge new data into state_data.
 * @param {string} sessionId
 * @param {string} step
 * @param {object} stateData
 * @returns {Promise<void>}
 */
async function updateSession(sessionId, step, stateData) {
  await pool.query(
    `UPDATE skill_sessions
     SET current_step = $2, state_data = state_data || $3::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [sessionId, step, JSON.stringify(stateData)]
  );
}

/**
 * Delete a skill session (cleanup after completion).
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
  await pool.query(
    'DELETE FROM skill_sessions WHERE id = $1',
    [sessionId]
  );
}

/**
 * Validate that manual brand data has all required fields.
 * @param {object} data
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateManualData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, missing: REQUIRED_MANUAL_FIELDS };
  }
  const missing = REQUIRED_MANUAL_FIELDS.filter(f => !data[f] || (typeof data[f] === 'string' && !data[f].trim()));
  return { valid: missing.length === 0, missing };
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  validateManualData,
  STEPS,
  REQUIRED_MANUAL_FIELDS,
};
