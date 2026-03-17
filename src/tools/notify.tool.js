// src/tools/notify.tool.js
'use strict';

const { sendTelegramMessage } = require('../utils/telegram');

module.exports = {
  name: 'notify',
  description: 'Send a notification message via Telegram or web chat to the user',
  tier: 'direct',
  parameters: {
    message: { type: 'string', required: true, description: 'Message to send (HTML supported)' },
    channel: { type: 'string', required: false, description: 'Channel: telegram or web', enum: ['telegram', 'web'] },
  },
  async execute(config, context) {
    const channel = config.channel || 'telegram';
    if (channel === 'telegram') {
      const sent = await sendTelegramMessage(config.message, { reply_markup: config.reply_markup });
      return { success: sent, data: { channel: 'telegram' }, summary: sent ? 'Notification sent via Telegram' : 'Failed to send' };
    }
    return { success: true, data: { channel: 'web', message: config.message }, summary: 'Notification queued for web' };
  },
};
