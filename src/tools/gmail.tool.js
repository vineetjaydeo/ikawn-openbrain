// src/tools/gmail.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'gmail_read',
  description: 'Fetch recent Gmail messages matching a query (default: unread inbox)',
  tier: 'direct',
  parameters: {
    query: { type: 'string', required: false, description: 'Gmail search query (default: is:unread in:inbox)' },
    max_results: { type: 'number', required: false, description: 'Max messages (default: 10)' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['gmail.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Gmail not connected.' };

    const gmail = google.gmail({ version: 'v1', auth });
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: config.query || 'is:unread in:inbox',
        maxResults: config.max_results || 10,
      });
      const messageIds = (listRes.data.messages || []).map(m => m.id);
      const messages = [];
      for (const id of messageIds) {
        const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const headers = msg.data.payload?.headers || [];
        messages.push({
          id: msg.data.id,
          from: headers.find(h => h.name === 'From')?.value || '',
          subject: headers.find(h => h.name === 'Subject')?.value || '',
          date: headers.find(h => h.name === 'Date')?.value || '',
          snippet: msg.data.snippet || '',
        });
      }
      return {
        success: true,
        data: { messages, count: messages.length },
        summary: messages.length > 0
          ? `${messages.length} message(s): ${messages.slice(0, 3).map(m => m.subject).join(', ')}${messages.length > 3 ? '...' : ''}`
          : 'No messages matching query.',
      };
    } catch (err) {
      return { success: false, data: null, summary: `Gmail fetch failed: ${err.message}` };
    }
  },
};
