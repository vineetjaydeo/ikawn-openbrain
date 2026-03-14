// src/utils/telegram.js
// @ts-check
'use strict';

/**
 * Send a message via Telegram Bot API.
 * Shared utility for intelligence alerts and governance notifications.
 *
 * @param {string} text - Message text (HTML parse mode)
 * @param {Object} [opts]
 * @param {string} [opts.chatId] - Override default chat ID
 * @param {Object} [opts.reply_markup] - Inline keyboard or other markup
 * @returns {Promise<boolean>} true if sent successfully
 */
async function sendTelegramMessage(text, opts = {}) {
  const token = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.INTELLIGENCE_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Not configured — skipping message');
    return false;
  }

  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (opts.reply_markup) {
      body.reply_markup = JSON.stringify(opts.reply_markup);
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Telegram] API error:', res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Telegram] Send failed:', err.message);
    return false;
  }
}

module.exports = { sendTelegramMessage };
