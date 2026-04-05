'use strict';

/**
 * HOTL Approval Timeout Handler
 *
 * Checks for expired approval requests and marks them as timed out.
 * Called periodically by the task processor or a separate interval.
 */

let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

let _sendExpiryNotice = null;
function getSendExpiryNotice() {
  if (!_sendExpiryNotice) _sendExpiryNotice = require('./approval-telegram').sendExpiryNotice;
  return _sendExpiryNotice;
}
function _setSendExpiryNotice(fn) { _sendExpiryNotice = fn; }

/**
 * Find and expire all overdue approval requests.
 *
 * @returns {Promise<number>} Count of expired approvals
 */
async function checkExpiredApprovals() {
  const pool = getPool();
  const sendNotice = getSendExpiryNotice();

  const { rows: expired } = await pool.query(`
    SELECT * FROM approval_requests
    WHERE status = 'pending'
      AND requested_at + (timeout_hours || ' hours')::interval < NOW()
  `);

  for (const approval of expired) {
    await pool.query(
      `UPDATE approval_requests SET status = 'timeout' WHERE id = $1`,
      [approval.id]
    );

    try {
      await sendNotice(approval);
    } catch (err) {
      console.error(`[HOTL] Failed to send expiry notice for approval ${approval.uuid}:`, err.message);
    }
  }

  if (expired.length > 0) {
    console.log(`[HOTL] Expired ${expired.length} approval(s)`);
  }

  return expired.length;
}

module.exports = {
  checkExpiredApprovals,
  _setPool,
  _setSendExpiryNotice,
};
