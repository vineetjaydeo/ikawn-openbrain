// src/connectors/outlook.js
'use strict';

const { Client } = require('@microsoft/microsoft-graph-client');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { getCredentials, updateLastSync, markExpired } = require('./credential-store');

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MS_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'https://ikawn-openbrain.fly.dev/auth/microsoft/callback';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

/**
 * Refresh an expired Microsoft OAuth token using the refresh_token grant.
 * Returns the new token set, or null on failure.
 */
async function refreshMicrosoftToken(brandId, credentials) {
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !credentials.refresh_token) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
      redirect_uri: MS_REDIRECT_URI,
    });

    const res = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Token refresh failed: ${res.status} ${errText}`);
    }

    const tokens = await res.json();
    const newCredentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || credentials.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };

    // Update stored credentials
    const { storeCredentials } = require('./credential-store');
    await storeCredentials(brandId, 'outlook', newCredentials);

    console.log(`[OutlookAuth] Refreshed token for brand ${brandId}`);
    return newCredentials;
  } catch (err) {
    console.error(`[OutlookAuth] Token refresh failed for brand ${brandId}:`, err.message);
    return null;
  }
}

/**
 * Build an authenticated Microsoft Graph client for a brand.
 * Auto-refreshes expired tokens.
 * Returns null if no credentials or refresh fails.
 */
async function getOutlookClient(brandId) {
  let credentials = await getCredentials(brandId, 'outlook');
  if (!credentials) {
    console.warn(`[OutlookAuth] No credentials for brand ${brandId}`);
    return null;
  }

  // Check if token is expired (5 min buffer)
  const expiresAt = credentials.expires_at ? new Date(credentials.expires_at).getTime() : 0;
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    credentials = await refreshMicrosoftToken(brandId, credentials);
    if (!credentials) {
      await markExpired(brandId, 'outlook');
      return null;
    }
  }

  const client = Client.init({
    authProvider: (done) => {
      done(null, credentials.access_token);
    },
  });

  return { client, credentials };
}

/**
 * Strip HTML tags from Outlook email body content.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sync Outlook messages for a brand.
 *
 * @param {string} brandId - Brand identifier
 * @param {object} [options]
 * @param {string} [options.since] - ISO date string, default last 24 hours
 * @param {number} [options.maxResults] - Max messages to fetch, default 50
 * @param {string} [options.userId] - User ID for memory scoping
 * @returns {{ total: number, error?: string }}
 */
async function syncEmails(brandId, options = {}) {
  const result = await getOutlookClient(brandId);
  if (!result) {
    console.warn(`[OutlookSync] No Outlook client for brand ${brandId}, skipping`);
    return { total: 0 };
  }

  const { client } = result;
  const since = options.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxResults = options.maxResults || 50;

  let added = 0;

  try {
    // Get the user's email for direction detection
    const me = await client.api('/me').select('mail,userPrincipalName').get();
    const userEmail = (me.mail || me.userPrincipalName || '').toLowerCase();

    // Fetch messages received since the given date
    const sinceDate = new Date(since).toISOString();
    const response = await client
      .api('/me/messages')
      .filter(`receivedDateTime ge ${sinceDate}`)
      .top(maxResults)
      .select('id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,categories')
      .orderby('receivedDateTime desc')
      .get();

    const messages = response.value || [];

    for (const msg of messages) {
      try {
        const fromEmail = (msg.from?.emailAddress?.address || '').toLowerCase();
        const fromName = msg.from?.emailAddress?.name || fromEmail;
        const toAddresses = (msg.toRecipients || [])
          .map(r => r.emailAddress?.address || '')
          .filter(Boolean)
          .join(', ');

        const direction = fromEmail === userEmail ? 'outbound' : 'inbound';

        // Prefer bodyPreview for short messages, otherwise strip HTML from full body
        let bodyText = '';
        if (msg.body?.contentType === 'text') {
          bodyText = msg.body.content || '';
        } else if (msg.body?.content) {
          bodyText = stripHtml(msg.body.content);
        }

        // Truncate very long emails
        if (bodyText.length > 5000) {
          bodyText = bodyText.slice(0, 5000) + '\n[truncated]';
        }

        const categories = (msg.categories || []).join(', ');
        const date = msg.receivedDateTime
          ? new Date(msg.receivedDateTime).toISOString().split('T')[0]
          : '';

        const content = [
          `From: ${fromName} <${fromEmail}>`,
          `To: ${toAddresses}`,
          `Subject: ${msg.subject || '(no subject)'}`,
          `Date: ${date}`,
          categories ? `Categories: ${categories}` : '',
          '',
          'Body:',
          bodyText,
        ].filter(line => line !== undefined).join('\n');

        const sourceRef = `outlook-${msg.id}`;

        const id = await captureMessage({
          brand_id: brandId,
          channel: 'outlook',
          direction,
          content,
          source_ref: sourceRef,
          user_id: options.userId || null,
          access_level: 'private',
          memory_type: 'email',
        });

        if (id) added++;
      } catch (msgErr) {
        console.error(`[OutlookSync] Failed to process message ${msg.id}:`, msgErr.message);
      }
    }

    // Log successful sync
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('outlook', 'success', $1)`,
      [added]
    );

    await updateLastSync(brandId, 'outlook');

    console.log(`[OutlookSync] Sync complete for brand ${brandId}: ${added} messages captured`);
    return { total: added };
  } catch (err) {
    console.error(`[OutlookSync] Sync error for brand ${brandId}:`, err.message);

    // If auth error, mark credentials as expired
    if (err.statusCode === 401 || err.statusCode === 403 || err.code === 'InvalidAuthenticationToken') {
      await markExpired(brandId, 'outlook');
      console.warn(`[OutlookSync] Marked Outlook credentials as expired for brand ${brandId}`);
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('outlook', 'error', $1)`,
      [err.message]
    );

    return { total: 0, error: err.message };
  }
}

/**
 * Create an Outlook draft for a brand.
 *
 * @param {string} brandId
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Plain text body
 * @param {string} [params.conversationId] - Conversation ID for reply threading
 * @returns {{ success: boolean, draftId?: string, error?: string }}
 */
async function sendDraft(brandId, params) {
  const result = await getOutlookClient(brandId);
  if (!result) {
    return { success: false, error: 'Outlook is not connected. Ask your admin to set up the integration.' };
  }

  const { client } = result;

  try {
    const message = {
      subject: params.subject,
      body: {
        contentType: 'text',
        content: params.body,
      },
      toRecipients: [
        {
          emailAddress: { address: params.to },
        },
      ],
    };

    if (params.conversationId) {
      message.conversationId = params.conversationId;
    }

    const res = await client.api('/me/messages').post(message);

    return { success: true, draftId: res.id };
  } catch (err) {
    console.error(`[OutlookDraft] Failed for brand ${brandId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncEmails, sendDraft, getOutlookClient };
