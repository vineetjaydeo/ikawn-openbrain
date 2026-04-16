// src/connectors/gmail.js
'use strict';

const { google } = require('googleapis');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { getGoogleClient } = require('../utils/google-auth');
const { updateLastSync, markExpired } = require('./credential-store');

/**
 * Build an authenticated Gmail API client for a brand.
 * Uses the shared google-auth utility which handles token refresh.
 * Returns null if no credentials or refresh fails.
 */
async function getGmailClient(brandId) {
  const auth = await getGoogleClient(brandId, ['gmail.readonly']);
  if (!auth) return null;
  return google.gmail({ version: 'v1', auth });
}

/**
 * Extract the email address from a From/To header value.
 * "John Doe <john@example.com>" -> "john@example.com"
 * "john@example.com" -> "john@example.com"
 */
function extractEmail(headerValue) {
  if (!headerValue) return '';
  const match = headerValue.match(/<([^>]+)>/);
  return match ? match[1] : headerValue.trim();
}

/**
 * Decode base64url encoded content from Gmail API payloads.
 */
function decodeBase64Url(encoded) {
  if (!encoded) return '';
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract plain text body from a Gmail message payload.
 * Prefers text/plain, falls back to text/html with tag stripping.
 */
function extractBody(payload) {
  if (!payload) return '';

  // Simple message with body data directly on the payload
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') return decoded;
    if (payload.mimeType === 'text/html') return stripHtml(decoded);
  }

  // Multipart message: walk parts looking for text/plain first
  const parts = payload.parts || [];
  let plainText = '';
  let htmlText = '';

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlText = decodeBase64Url(part.body.data);
    } else if (part.parts) {
      // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  if (plainText) return plainText;
  if (htmlText) return stripHtml(htmlText);
  return '';
}

/**
 * Strip HTML tags and decode common entities.
 * Produces readable plain text from HTML email bodies.
 */
function stripHtml(html) {
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
 * Get a header value from a Gmail message payload.
 */
function getHeader(payload, name) {
  const headers = payload?.headers || [];
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Sync Gmail messages for a brand.
 *
 * @param {string} brandId - Brand identifier
 * @param {object} [options]
 * @param {string} [options.since] - ISO date string, default last 24 hours
 * @param {number} [options.maxResults] - Max messages to fetch, default 50
 * @param {string[]} [options.labels] - Label IDs to filter, default ['INBOX']
 * @param {string} [options.userId] - User ID for memory scoping
 * @returns {{ total: number, error?: string }}
 */
async function syncEmails(brandId, options = {}) {
  const gmail = await getGmailClient(brandId);
  if (!gmail) {
    console.warn(`[GmailSync] No Gmail client for brand ${brandId}, skipping`);
    return { total: 0 };
  }

  const since = options.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxResults = options.maxResults || 50;
  const labels = options.labels || ['INBOX'];

  // Build Gmail search query with date filter
  const sinceDate = new Date(since);
  const year = sinceDate.getFullYear();
  const month = String(sinceDate.getMonth() + 1).padStart(2, '0');
  const day = String(sinceDate.getDate()).padStart(2, '0');
  const afterQuery = `after:${year}/${month}/${day}`;

  let added = 0;

  try {
    // Get the user's email for direction detection
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress || '';

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: afterQuery,
      maxResults,
      labelIds: labels,
    });

    const messageIds = (listRes.data.messages || []).map(m => m.id);

    for (const msgId of messageIds) {
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        });

        const payload = msg.data.payload;
        const from = getHeader(payload, 'From');
        const to = getHeader(payload, 'To');
        const subject = getHeader(payload, 'Subject');
        const date = getHeader(payload, 'Date');
        const msgLabels = (msg.data.labelIds || []).join(', ');

        const body = extractBody(payload);
        // Truncate very long emails to prevent memory bloat
        const truncatedBody = body.length > 5000 ? body.slice(0, 5000) + '\n[truncated]' : body;

        const fromEmail = extractEmail(from);
        const direction = fromEmail.toLowerCase() === userEmail.toLowerCase() ? 'outbound' : 'inbound';

        const content = [
          `From: ${from}`,
          `To: ${to}`,
          `Subject: ${subject}`,
          `Date: ${date}`,
          msgLabels ? `Labels: ${msgLabels}` : '',
          '',
          'Body:',
          truncatedBody,
        ].filter(line => line !== undefined).join('\n');

        const sourceRef = `gmail-${msgId}`;

        const id = await captureMessage({
          brand_id: brandId,
          channel: 'gmail',
          direction,
          content,
          source_ref: sourceRef,
          user_id: options.userId || null,
          access_level: 'private',
          memory_type: 'email',
        });

        if (id) added++;
      } catch (msgErr) {
        console.error(`[GmailSync] Failed to process message ${msgId}:`, msgErr.message);
      }
    }

    // Log successful sync
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('gmail', 'success', $1)`,
      [added]
    );

    await updateLastSync(brandId, 'gmail');

    console.log(`[GmailSync] Sync complete for brand ${brandId}: ${added} messages captured`);
    return { total: added };
  } catch (err) {
    console.error(`[GmailSync] Sync error for brand ${brandId}:`, err.message);

    // If auth error, mark credentials as expired
    if (err.code === 401 || err.code === 403 || err.message.includes('invalid_grant')) {
      await markExpired(brandId, 'gmail');
      console.warn(`[GmailSync] Marked Gmail credentials as expired for brand ${brandId}`);
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('gmail', 'error', $1)`,
      [err.message]
    );

    return { total: 0, error: err.message };
  }
}

/**
 * Create a Gmail draft for a brand.
 * Returns the draft ID on success.
 *
 * @param {string} brandId
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Plain text body
 * @param {string} [params.threadId] - Thread ID for reply threading
 * @returns {{ success: boolean, draftId?: string, error?: string }}
 */
async function sendDraft(brandId, params) {
  const auth = await getGoogleClient(brandId, ['gmail.compose']);
  if (!auth) {
    return { success: false, error: 'Gmail is not connected. Ask your admin to set up the integration.' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.body,
  ].join('\n');

  const encodedMessage = Buffer.from(rawMessage).toString('base64url');

  try {
    const requestBody = {
      message: { raw: encodedMessage },
    };
    if (params.threadId) {
      requestBody.message.threadId = params.threadId;
    }

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody,
    });

    return { success: true, draftId: res.data.id };
  } catch (err) {
    console.error(`[GmailDraft] Failed for brand ${brandId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncEmails, sendDraft, getGmailClient };
