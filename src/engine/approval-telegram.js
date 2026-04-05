'use strict';

/**
 * Telegram integration for HOTL approval requests.
 * Sends rich messages with inline approve/reject buttons.
 */

// Dependency injection for testability
let _sendMessage = null;
function getSendMessage() {
  if (!_sendMessage) _sendMessage = require('../utils/telegram').sendTelegramMessage;
  return _sendMessage;
}
function _setSendMessage(fn) { _sendMessage = fn; }

let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

const TIER_LABELS = {
  confirm: 'CONFIRM',
  review: 'REVIEW',
};

const TIER_EMOJI = {
  confirm: '\u26a0\ufe0f',
  review: '\ud83d\udd0d',
};

/**
 * Send an approval request to Telegram with inline keyboard buttons.
 *
 * @param {Object} approval - The approval_requests row
 * @returns {Promise<{messageId: number|null}>}
 */
async function sendApprovalRequest(approval) {
  const pool = getPool();
  const send = getSendMessage();

  const tierLabel = TIER_LABELS[approval.permission_tier] || 'CONFIRM';
  const tierEmoji = TIER_EMOJI[approval.permission_tier] || '\u26a0\ufe0f';
  const timeoutHours = Number(approval.timeout_hours) || 2;

  // Parse context if it's a string
  let context = approval.context;
  if (typeof context === 'string') {
    try { context = JSON.parse(context); } catch (_) { context = {}; }
  }

  const contextText = context?.reason || context?.description || '';

  const message = [
    `\ud83d\udd12 <b>Lucy needs your approval</b>`,
    ``,
    `${tierEmoji} <b>[${tierLabel}]</b>`,
    ``,
    `<b>Action:</b> ${approval.action_description || approval.action_type}`,
    contextText ? `<b>Context:</b> ${contextText}` : null,
    ``,
    `\u23f3 <i>Expires in ${timeoutHours} hour${timeoutHours !== 1 ? 's' : ''}</i>`,
  ].filter(Boolean).join('\n');

  const reply_markup = {
    inline_keyboard: [[
      { text: '\u2705 Approve', callback_data: `hotl:approve:${approval.uuid}` },
      { text: '\u274c Reject', callback_data: `hotl:reject:${approval.uuid}` },
    ]],
  };

  const result = await send(message, { reply_markup });

  // If the send function returns a message_id (from raw API), store it
  // The default sendTelegramMessage returns boolean, so we store null in that case
  const messageId = (typeof result === 'object' && result?.message_id) ? result.message_id : null;

  if (messageId) {
    await pool.query(
      `UPDATE approval_requests SET telegram_message_id = $1 WHERE uuid = $2`,
      [messageId, approval.uuid]
    );
  }

  return { messageId };
}

/**
 * Edit the original Telegram message to show APPROVED/REJECTED status.
 * Removes the inline keyboard.
 *
 * @param {Object} approval - The approval_requests row (must have telegram_message_id)
 * @param {string} status - 'approved' or 'rejected'
 */
async function updateApprovalMessage(approval, status) {
  if (!approval.telegram_message_id) return;

  const token = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.INTELLIGENCE_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const badge = status === 'approved'
    ? '\u2705 <b>APPROVED</b>'
    : '\u274c <b>REJECTED</b>';

  const text = [
    `\ud83d\udd12 <b>Lucy needed your approval</b>`,
    ``,
    `<b>Action:</b> ${approval.action_description || approval.action_type}`,
    ``,
    badge,
    approval.response_note ? `<b>Note:</b> ${approval.response_note}` : null,
  ].filter(Boolean).join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: approval.telegram_message_id,
        text,
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({ inline_keyboard: [] }),
      }),
    });
  } catch (err) {
    console.error('[HOTL] Failed to update Telegram message:', err.message);
  }
}

/**
 * Send an expiry notice for a timed-out approval request.
 *
 * @param {Object} approval - The approval_requests row
 */
async function sendExpiryNotice(approval) {
  const send = getSendMessage();
  const message = [
    `\u23f0 <b>Approval expired</b>`,
    ``,
    `<b>Action:</b> ${approval.action_description || approval.action_type}`,
    `<i>The ${approval.timeout_hours}h window has passed. The action was not executed.</i>`,
  ].join('\n');

  await send(message);
}

module.exports = {
  sendApprovalRequest,
  updateApprovalMessage,
  sendExpiryNotice,
  _setSendMessage,
  _setPool,
};
