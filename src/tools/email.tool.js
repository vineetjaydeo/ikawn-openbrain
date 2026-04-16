// src/tools/email.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');
const { getCredentials } = require('../connectors/credential-store');
const { getOutlookClient } = require('../connectors/outlook');
const { sendDraft: gmailSendDraft } = require('../connectors/gmail');
const { sendDraft: outlookSendDraft } = require('../connectors/outlook');

module.exports = {
  name: 'email_access',
  description: 'Read recent emails, search emails, or draft a response. Supports Gmail and Outlook.',
  tier: 'direct',
  parameters: {
    action: { type: 'string', required: true, description: 'read, search, or draft' },
    query: { type: 'string', required: false, description: 'Search query for emails (used with read and search actions)' },
    to: { type: 'string', required: false, description: 'Recipient email address (required for draft action)' },
    subject: { type: 'string', required: false, description: 'Subject line (required for draft action)' },
    body: { type: 'string', required: false, description: 'Email body text (required for draft action)' },
    max_results: { type: 'number', required: false, description: 'Max results to return (default: 10)' },
    provider: { type: 'string', required: false, description: 'Force a specific provider: gmail or outlook (auto-detected if omitted)' },
  },

  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';
    const action = (config.action || '').toLowerCase().trim();

    if (!['read', 'search', 'draft'].includes(action)) {
      return { success: false, data: null, summary: 'Invalid action. Use "read", "search", or "draft".' };
    }

    // Detect which provider is available
    const provider = await detectProvider(brandId, config.provider);
    if (!provider) {
      return {
        success: false,
        data: null,
        summary: 'No email provider connected. Ask your admin to connect Gmail or Outlook.',
      };
    }

    if (action === 'draft') {
      return await handleDraft(brandId, provider, config);
    }

    return await handleReadOrSearch(brandId, provider, config, action);
  },
};

/**
 * Detect which email provider is available for the brand.
 * Returns 'gmail', 'outlook', or null.
 */
async function detectProvider(brandId, forced) {
  if (forced) {
    const f = forced.toLowerCase().trim();
    if (f === 'gmail' || f === 'outlook') return f;
  }

  // Try Gmail first (uses brand_oauth_tokens via google-auth)
  const gmailAuth = await getGoogleClient(brandId, ['gmail.readonly']);
  if (gmailAuth) return 'gmail';

  // Try Outlook (uses ob_connector_credentials)
  const outlookCreds = await getCredentials(brandId, 'outlook');
  if (outlookCreds) return 'outlook';

  return null;
}

/**
 * Handle read and search actions.
 */
async function handleReadOrSearch(brandId, provider, config, action) {
  const maxResults = config.max_results || 10;
  const query = config.query || '';

  if (provider === 'gmail') {
    return await readGmail(brandId, query, maxResults, action);
  }
  return await readOutlook(brandId, query, maxResults, action);
}

/**
 * Read/search Gmail messages.
 */
async function readGmail(brandId, query, maxResults, action) {
  const auth = await getGoogleClient(brandId, ['gmail.readonly']);
  if (!auth) {
    return { success: false, data: null, summary: 'Gmail connection expired. Re-authenticate to continue.' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const searchQuery = query || (action === 'search' ? '' : 'is:unread in:inbox');
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults,
    });

    const messageIds = (listRes.data.messages || []).map(m => m.id);
    if (messageIds.length === 0) {
      return { success: true, data: { messages: [], count: 0 }, summary: 'No messages found.' };
    }

    const messages = [];
    for (const id of messageIds) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = msg.data.payload?.headers || [];
      messages.push({
        id: msg.data.id,
        threadId: msg.data.threadId,
        from: headers.find(h => h.name === 'From')?.value || '',
        to: headers.find(h => h.name === 'To')?.value || '',
        subject: headers.find(h => h.name === 'Subject')?.value || '',
        date: headers.find(h => h.name === 'Date')?.value || '',
        snippet: msg.data.snippet || '',
        provider: 'gmail',
      });
    }

    const summary = messages.length > 0
      ? `${messages.length} email(s) from Gmail: ${messages.slice(0, 3).map(m => m.subject).join(', ')}${messages.length > 3 ? '...' : ''}`
      : 'No messages found.';

    return { success: true, data: { messages, count: messages.length, provider: 'gmail' }, summary };
  } catch (err) {
    return { success: false, data: null, summary: `Gmail fetch failed: ${err.message}` };
  }
}

/**
 * Read/search Outlook messages.
 */
async function readOutlook(brandId, query, maxResults, action) {
  const result = await getOutlookClient(brandId);
  if (!result) {
    return { success: false, data: null, summary: 'Outlook connection expired. Re-authenticate to continue.' };
  }

  const { client } = result;

  try {
    let request = client.api('/me/messages').top(maxResults).select('id,subject,from,toRecipients,receivedDateTime,bodyPreview,conversationId');

    if (query) {
      // Use $search for free-text search
      request = request.query({ $search: `"${query}"` });
    } else if (action === 'read') {
      // Default: unread inbox
      request = request.filter('isRead eq false');
    }

    request = request.orderby('receivedDateTime desc');
    const response = await request.get();
    const msgs = response.value || [];

    if (msgs.length === 0) {
      return { success: true, data: { messages: [], count: 0 }, summary: 'No messages found.' };
    }

    const messages = msgs.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      from: msg.from?.emailAddress ? `${msg.from.emailAddress.name || ''} <${msg.from.emailAddress.address}>` : '',
      to: (msg.toRecipients || []).map(r => r.emailAddress?.address || '').join(', '),
      subject: msg.subject || '(no subject)',
      date: msg.receivedDateTime || '',
      snippet: msg.bodyPreview || '',
      provider: 'outlook',
    }));

    const summary = messages.length > 0
      ? `${messages.length} email(s) from Outlook: ${messages.slice(0, 3).map(m => m.subject).join(', ')}${messages.length > 3 ? '...' : ''}`
      : 'No messages found.';

    return { success: true, data: { messages, count: messages.length, provider: 'outlook' }, summary };
  } catch (err) {
    return { success: false, data: null, summary: `Outlook fetch failed: ${err.message}` };
  }
}

/**
 * Handle draft creation.
 */
async function handleDraft(brandId, provider, config) {
  if (!config.to || !config.subject || !config.body) {
    return { success: false, data: null, summary: 'Draft requires "to", "subject", and "body" parameters.' };
  }

  if (provider === 'gmail') {
    const result = await gmailSendDraft(brandId, {
      to: config.to,
      subject: config.subject,
      body: config.body,
      threadId: config.thread_id || null,
    });

    if (result.success) {
      return {
        success: true,
        data: { draftId: result.draftId, provider: 'gmail', to: config.to, subject: config.subject },
        summary: `Gmail draft created: "${config.subject}" to ${config.to} (draft ID: ${result.draftId})`,
      };
    }
    return { success: false, data: null, summary: `Gmail draft failed: ${result.error}` };
  }

  // Outlook
  const result = await outlookSendDraft(brandId, {
    to: config.to,
    subject: config.subject,
    body: config.body,
    conversationId: config.conversation_id || null,
  });

  if (result.success) {
    return {
      success: true,
      data: { draftId: result.draftId, provider: 'outlook', to: config.to, subject: config.subject },
      summary: `Outlook draft created: "${config.subject}" to ${config.to}`,
    };
  }
  return { success: false, data: null, summary: `Outlook draft failed: ${result.error}` };
}
