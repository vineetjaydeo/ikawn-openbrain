'use strict';

/**
 * HOTL — Human On The Loop
 *
 * Manages approval requests for gated actions. When a tool/action requires
 * human confirmation (permission tier = 'confirm' or 'review'), the session
 * is suspended and an approval request is created. The human can approve/reject
 * via Telegram, which schedules a hotl_resume task to continue execution.
 */

// Lazy pool accessor — allows test injection via _setPool()
let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

// Lazy session manager
let _sessionManager = null;
function getSessionManager() {
  if (!_sessionManager) _sessionManager = require('./session-manager');
  return _sessionManager;
}
function _setSessionManager(sm) { _sessionManager = sm; }

const TIMEOUT_HOURS = {
  confirm: 2,
  review: 8,
};

/**
 * Create an approval request and suspend the session.
 *
 * @param {Object} session - The active session object (must have .id)
 * @param {Object} taskRun - The task_run record (must have .id)
 * @param {string} actionType - What the agent wants to do (e.g. 'deploy_code', 'send_email')
 * @param {Object} context - Why the agent wants to do it + any relevant data
 * @param {Object} [opts]
 * @param {string} [opts.permissionTier] - 'confirm' or 'review' (default: 'confirm')
 * @param {string} [opts.brandId] - Brand ID (default: 'ikawn')
 * @param {string} [opts.description] - Human-readable description of the action
 * @returns {Promise<{approvalId: number, approvalUuid: string, resumeToken: string}>}
 */
async function requestApproval(session, taskRun, actionType, context, opts = {}) {
  const pool = getPool();
  const sm = getSessionManager();

  const permissionTier = opts.permissionTier || 'confirm';
  const brandId = opts.brandId || session.brand_id || 'ikawn';
  const description = opts.description || context?.description || actionType;
  const timeoutHours = TIMEOUT_HOURS[permissionTier] || TIMEOUT_HOURS.confirm;

  // Suspend the session — stores working memory and returns resume_token
  const suspendedSession = await sm.suspend(session.id, session.working_memory || {}, {
    hotl: true,
    actionType,
    taskRunId: taskRun?.id,
  });

  const resumeToken = suspendedSession.resume_token;

  // Create approval request
  const { rows: [approval] } = await pool.query(
    `INSERT INTO approval_requests
       (session_id, task_run_id, brand_id, permission_tier, action_type,
        action_description, context, timeout_hours, resume_token, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING id, uuid, resume_token`,
    [
      session.id,
      taskRun?.id || null,
      brandId,
      permissionTier,
      actionType,
      description,
      JSON.stringify(context || {}),
      timeoutHours,
      resumeToken,
    ]
  );

  return {
    approvalId: approval.id,
    approvalUuid: approval.uuid,
    resumeToken,
  };
}

/**
 * Process a human's approval or rejection.
 * Creates a hotl_resume scheduled_task so the task processor picks it up.
 *
 * @param {string} approvalUuid - UUID of the approval request
 * @param {boolean} approved - true = approve, false = reject
 * @param {string} userId - Who responded (Telegram user ID, email, etc.)
 * @param {string|null} note - Optional reason/note from the reviewer
 * @returns {Promise<string>} UUID of the created hotl_resume task
 */
async function processApproval(approvalUuid, approved, userId, note) {
  const pool = getPool();

  // Update the approval request
  const status = approved ? 'approved' : 'rejected';
  const { rows: [approval] } = await pool.query(
    `UPDATE approval_requests
     SET status = $1, responded_at = NOW(), responded_by = $2, response_note = $3
     WHERE uuid = $4 AND status = 'pending'
     RETURNING *`,
    [status, userId, note, approvalUuid]
  );

  if (!approval) {
    throw new Error(`Approval not found or already processed: ${approvalUuid}`);
  }

  // Create a hotl_resume task for the task processor to pick up
  const config = approved
    ? { resumeToken: approval.resume_token, approved: true, originalAction: approval.action_type, fromHOTLApproval: true }
    : { resumeToken: approval.resume_token, approved: false, rejectionReason: note || 'Rejected by reviewer', fromHOTLApproval: true };

  const { rows: [task] } = await pool.query(
    `INSERT INTO scheduled_tasks
       (brand_id, agent_slug, name, description, tier, tool, config,
        schedule_type, task_type, enabled, last_status)
     VALUES ($1, 'system', $2, $3, 'direct', 'hotl_resume', $4,
             'once', 'hotl_resume', true, 'pending')
     RETURNING uuid`,
    [
      approval.brand_id,
      `HOTL Resume: ${approval.action_type}`,
      approved ? `Approved: ${approval.action_description}` : `Rejected: ${approval.action_description}`,
      JSON.stringify(config),
    ]
  );

  return task.uuid;
}

/**
 * Get full context for an approval request (for display in Telegram, UI, etc.)
 */
async function getApprovalContext(approvalUuid) {
  const pool = getPool();
  const { rows: [approval] } = await pool.query(
    `SELECT * FROM approval_requests WHERE uuid = $1`,
    [approvalUuid]
  );
  return approval || null;
}

/**
 * Get all pending approvals for a brand.
 */
async function getPendingApprovals(brandId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM approval_requests
     WHERE brand_id = $1 AND status = 'pending'
     ORDER BY requested_at ASC`,
    [brandId]
  );
  return rows;
}

module.exports = {
  requestApproval,
  processApproval,
  getApprovalContext,
  getPendingApprovals,
  _setPool,
  _setSessionManager,
  TIMEOUT_HOURS,
};
