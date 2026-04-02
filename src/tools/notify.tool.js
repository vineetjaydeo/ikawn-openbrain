// src/tools/notify.tool.js
'use strict';

const { sendTelegramMessage } = require('../utils/telegram');

// Per-conversation rate limit: max 3 notifications per session
const notifyCounts = new Map();
const MAX_NOTIFICATIONS_PER_SESSION = 3;

module.exports = {
  name: 'notify',
  description: 'Send a notification message via Telegram or web chat to the user (max 3 per conversation)',
  tier: 'direct',
  parameters: {
    message: { type: 'string', required: true, description: 'Message to send (HTML supported)' },
    channel: { type: 'string', required: false, description: 'Channel: telegram or web', enum: ['telegram', 'web'] },
    conversation_id: { type: 'string', required: false, description: 'Conversation ID for rate limiting' },
  },
  async execute(config, context) {
    // Rate limit by conversation
    const key = config.conversation_id || context.conversationId || 'default';
    const count = notifyCounts.get(key) || 0;
    if (count >= MAX_NOTIFICATIONS_PER_SESSION) {
      return { success: false, data: null, summary: 'Notification limit reached for this conversation (max 3). Try again in a new conversation.' };
    }
    notifyCounts.set(key, count + 1);

    const channel = config.channel || 'telegram';
    if (channel === 'telegram') {
      const msg = config.message || '';
      // Telegram max message length is 4096 chars. Chunk if longer.
      const MAX_TG_LEN = 4000;
      if (msg.length <= MAX_TG_LEN) {
        const sent = await sendTelegramMessage(msg, { reply_markup: config.reply_markup });
        return { success: sent, data: { channel: 'telegram' }, summary: sent ? 'Notification sent via Telegram' : 'Failed to send' };
      }
      // Split into chunks
      const chunks = [];
      for (let i = 0; i < msg.length; i += MAX_TG_LEN) {
        chunks.push(msg.slice(i, i + MAX_TG_LEN));
      }
      let allSent = true;
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : '';
        const sent = await sendTelegramMessage(prefix + chunks[i], i === 0 ? { reply_markup: config.reply_markup } : {});
        if (!sent) allSent = false;
      }
      return { success: allSent, data: { channel: 'telegram', chunks: chunks.length }, summary: allSent ? `Notification sent via Telegram (${chunks.length} parts)` : 'Some message parts failed to send' };
    }
    return { success: true, data: { channel: 'web', message: config.message }, summary: 'Notification queued for web' };
  },
};
