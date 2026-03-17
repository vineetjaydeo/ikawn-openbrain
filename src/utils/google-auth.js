// src/utils/google-auth.js
'use strict';

const { google } = require('googleapis');
const { pool } = require('../db');
const { sendTelegramMessage } = require('./telegram');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://ikawn-openbrain.fly.dev/auth/google/callback';

/**
 * Get an authenticated Google API client for a brand.
 * Auto-refreshes expired tokens and updates DB.
 */
async function getGoogleClient(brandId, requiredScopes = []) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[GoogleAuth] OAuth not configured');
    return null;
  }

  const { rows } = await pool.query(
    'SELECT * FROM brand_oauth_tokens WHERE brand_id = $1 AND provider = $2',
    [brandId, 'google']
  );

  if (rows.length === 0) {
    console.warn(`[GoogleAuth] No OAuth token for brand ${brandId}`);
    return null;
  }

  const token = rows[0];
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: new Date(token.expires_at).getTime(),
  });

  // Auto-refresh if expired (5 min buffer)
  const expiresAt = new Date(token.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await pool.query(
        `UPDATE brand_oauth_tokens
         SET access_token = $1, expires_at = $2, updated_at = NOW()
         WHERE brand_id = $3 AND provider = 'google'`,
        [credentials.access_token, new Date(credentials.expiry_date), brandId]
      );
      console.log(`[GoogleAuth] Refreshed token for brand ${brandId}`);
    } catch (err) {
      console.error(`[GoogleAuth] Token refresh failed for brand ${brandId}:`, err.message);
      sendTelegramMessage(`Warning: Google OAuth refresh failed for ${brandId}: ${err.message}`);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Generate OAuth consent URL for a brand.
 */
function getAuthUrl(brandId, scopes) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.map(s => `https://www.googleapis.com/auth/${s}`),
    state: brandId,
  });
}

/**
 * Exchange authorization code for tokens and store in DB.
 */
async function handleCallback(code, brandId, scopes) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const { tokens } = await oauth2Client.getToken(code);

  await pool.query(`
    INSERT INTO brand_oauth_tokens (brand_id, provider, scopes, access_token, refresh_token, expires_at)
    VALUES ($1, 'google', $2, $3, $4, $5)
    ON CONFLICT (brand_id, provider) DO UPDATE SET
      scopes = $2, access_token = $3, refresh_token = COALESCE($4, brand_oauth_tokens.refresh_token),
      expires_at = $5, updated_at = NOW()
  `, [brandId, scopes, tokens.access_token, tokens.refresh_token, new Date(tokens.expiry_date)]);

  console.log(`[GoogleAuth] Stored tokens for brand ${brandId}`);
}

module.exports = { getGoogleClient, getAuthUrl, handleCallback };
