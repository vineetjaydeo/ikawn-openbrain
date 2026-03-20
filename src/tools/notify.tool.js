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
      const sent = await sendTelegramMessage(config.message, { reply_markup: config.reply_markup });
      return { success: sent, data: { channel: 'telegram' }, summary: sent ? 'Notification sent via Telegram' : 'Failed to send' };
    }
    return { success: true, data: { channel: 'web', message: config.message }, summary: 'Notification queued for web' };
  },
};
