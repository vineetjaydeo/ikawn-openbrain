// src/tools/gmail-draft.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'gmail_draft',
  description: 'Create a Gmail draft (does NOT send — requires manual review and approval)',
  tier: 'agent',
  parameters: {
    to: { type: 'string', required: true, description: 'Recipient email address' },
    subject: { type: 'string', required: true, description: 'Email subject line' },
    body: { type: 'string', required: true, description: 'Email body (plain text)' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['gmail.compose']);
    if (!auth) return { success: false, data: null, summary: 'Gmail not connected.' };

    const gmail = google.gmail({ version: 'v1', auth });

    const rawMessage = [
      `To: ${config.to}`,
      `Subject: ${config.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      config.body,
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage).toString('base64url');

    try {
      const res = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw: encodedMessage },
        },
      });
      return {
        success: true,
        data: { draftId: res.data.id, to: config.to, subject: config.subject },
        summary: `Draft created: "${config.subject}" to ${config.to} (draft ID: ${res.data.id})`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Gmail draft failed: ${err.message}` };
    }
  },
};
