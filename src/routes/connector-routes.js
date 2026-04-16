// src/routes/connector-routes.js
'use strict';

const { Router } = require('express');
const { requireAuthOrApiKey } = require('../auth');
const {
  storeCredentials,
  getCredentials,
  listConnectors,
  revokeCredentials,
  updateLastSync,
} = require('../connectors/credential-store');

const router = Router();

// ── OAuth configuration from environment ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_OAUTH_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const BASE_URL = process.env.BASE_URL || 'https://ruhi.ikawn.in';

const VALID_CONNECTOR_TYPES = [
  'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
  'google_analytics', 'meta_campaigns',
];

// ── Sync function mapping ──
const SYNC_HANDLERS = {
  gmail: () => require('../connectors/gmail').syncEmails,
  outlook: () => require('../connectors/outlook').syncEmails,
  google_calendar: () => require('../connectors/gcal').syncCalendarEvents,
  outlook_calendar: () => require('../connectors/outlook-calendar').syncCalendarEvents,
  google_analytics: () => require('../connectors/google-analytics').syncAnalyticsReport,
  meta_campaigns: () => require('../connectors/meta-campaigns').syncCampaigns,
};

function validateConnectorType(type) {
  return VALID_CONNECTOR_TYPES.includes(type);
}

// ── 1. List connectors for the brand ──
router.get('/api/connectors', requireAuthOrApiKey, async (req, res) => {
  try {
    const brandId = req.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID required' });
    }
    const connectors = await listConnectors(brandId);
    res.json({ connectors });
  } catch (err) {
    console.error('[ConnectorRoutes] List error:', err.message);
    res.status(500).json({ error: 'Failed to list connectors' });
  }
});

// ── 2. Store connector credentials ──
router.post('/api/connectors/:type/credentials', requireAuthOrApiKey, async (req, res) => {
  try {
    const { type } = req.params;
    if (!validateConnectorType(type)) {
      return res.status(400).json({ error: `Invalid connector type: ${type}`, valid_types: VALID_CONNECTOR_TYPES });
    }

    const brandId = req.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID required' });
    }

    const { credentials, config } = req.body;
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ error: 'credentials object required in request body' });
    }

    // Merge config into credentials payload for storage
    const payload = { ...credentials };
    if (config && typeof config === 'object') {
      payload._config = config;
    }

    const id = await storeCredentials(brandId, type, payload);
    if (!id) {
      return res.status(500).json({ error: 'Failed to store credentials' });
    }

    res.json({ success: true, message: 'Connector configured' });
  } catch (err) {
    console.error('[ConnectorRoutes] Store credentials error:', err.message);
    res.status(500).json({ error: 'Failed to store credentials' });
  }
});

// ── 3. Revoke/disconnect a connector ──
router.delete('/api/connectors/:type', requireAuthOrApiKey, async (req, res) => {
  try {
    const { type } = req.params;
    if (!validateConnectorType(type)) {
      return res.status(400).json({ error: `Invalid connector type: ${type}` });
    }

    const brandId = req.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID required' });
    }

    const revoked = await revokeCredentials(brandId, type);
    if (!revoked) {
      return res.status(500).json({ error: 'Failed to revoke credentials' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[ConnectorRoutes] Revoke error:', err.message);
    res.status(500).json({ error: 'Failed to revoke connector' });
  }
});

// ── 4. Manually trigger sync ──
router.post('/api/connectors/:type/sync', requireAuthOrApiKey, async (req, res) => {
  try {
    const { type } = req.params;
    if (!validateConnectorType(type)) {
      return res.status(400).json({ error: `Invalid connector type: ${type}` });
    }

    const brandId = req.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID required' });
    }

    const credentials = await getCredentials(brandId, type);
    if (!credentials) {
      return res.status(404).json({ error: `No active credentials found for ${type}` });
    }

    const handlerFactory = SYNC_HANDLERS[type];
    if (!handlerFactory) {
      return res.status(400).json({ error: `Sync not supported for ${type}` });
    }

    const syncFn = handlerFactory();
    let result;

    // Different connector sync functions have different signatures
    if (type === 'gmail' || type === 'outlook') {
      // syncEmails(brandId, options)
      result = await syncFn(brandId, { maxResults: 50 });
    } else {
      // syncCalendarEvents/syncAnalyticsReport/syncCampaigns(brandId, credentials, options)
      result = await syncFn(brandId, credentials, {});
    }

    await updateLastSync(brandId, type);

    const recordsSynced = typeof result === 'number' ? result
      : (result && typeof result === 'object' && typeof result.count === 'number') ? result.count
      : (Array.isArray(result)) ? result.length
      : 0;

    res.json({ success: true, records_synced: recordsSynced });
  } catch (err) {
    console.error(`[ConnectorRoutes] Sync error for ${req.params.type}:`, err.message);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// ══════════════════════════════════════════════
// Google OAuth
// ══════════════════════════════════════════════

function getGoogleOAuth2Client(redirectUri) {
  const { google } = require('googleapis');
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

// ── 5. Start Google OAuth flow ──
router.get('/api/connectors/oauth/google/start', requireAuthOrApiKey, async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'OAuth not configured',
        message: 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables',
      });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/google/callback`;
    const oauth2Client = getGoogleOAuth2Client(redirectUri);

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/analytics.readonly',
    ];

    // Pass brand_id through state parameter
    const state = Buffer.from(JSON.stringify({
      brand_id: req.brand_id,
      user_id: req.session?.user?.id || req.userId || null,
    })).toString('base64url');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
    });

    res.json({ url });
  } catch (err) {
    console.error('[ConnectorRoutes] Google OAuth start error:', err.message);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// ── 6. Google OAuth callback ──
router.get('/api/connectors/oauth/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('[ConnectorRoutes] Google OAuth error:', oauthError);
      return res.redirect('/settings?error=google_oauth_denied');
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const brandId = stateData.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID not found in OAuth state' });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/google/callback`;
    const oauth2Client = getGoogleOAuth2Client(redirectUri);

    const { tokens } = await oauth2Client.getToken(code);
    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    // Determine which connectors to activate based on granted scopes
    const grantedScopes = (tokens.scope || '').split(' ');
    const storePromises = [];

    const hasGmail = grantedScopes.some(s => s.includes('gmail'));
    const hasCalendar = grantedScopes.some(s => s.includes('calendar'));
    const hasAnalytics = grantedScopes.some(s => s.includes('analytics'));

    if (hasGmail) {
      storePromises.push(storeCredentials(brandId, 'gmail', credentials));
    }
    if (hasCalendar) {
      storePromises.push(storeCredentials(brandId, 'google_calendar', credentials));
    }
    if (hasAnalytics) {
      storePromises.push(storeCredentials(brandId, 'google_analytics', credentials));
    }

    // If no specific scopes detected, store for all Google connectors
    if (storePromises.length === 0) {
      storePromises.push(
        storeCredentials(brandId, 'gmail', credentials),
        storeCredentials(brandId, 'google_calendar', credentials),
        storeCredentials(brandId, 'google_analytics', credentials),
      );
    }

    await Promise.all(storePromises);

    // Redirect to settings page with success indicator
    const connectedTypes = [
      hasGmail && 'gmail',
      hasCalendar && 'calendar',
      hasAnalytics && 'analytics',
    ].filter(Boolean).join(',') || 'google';

    res.redirect(`/settings?connected=${connectedTypes}`);
  } catch (err) {
    console.error('[ConnectorRoutes] Google OAuth callback error:', err.message);
    res.redirect('/settings?error=google_oauth_failed');
  }
});

// ══════════════════════════════════════════════
// Microsoft OAuth
// ══════════════════════════════════════════════

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0';

// ── 7. Start Microsoft OAuth flow ──
router.get('/api/connectors/oauth/microsoft/start', requireAuthOrApiKey, async (req, res) => {
  try {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'OAuth not configured',
        message: 'Set MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET environment variables',
      });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/microsoft/callback`;
    const scopes = ['Mail.Read', 'Mail.Send', 'Calendars.ReadWrite', 'offline_access'];

    const state = Buffer.from(JSON.stringify({
      brand_id: req.brand_id,
      user_id: req.session?.user?.id || req.userId || null,
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      response_mode: 'query',
    });

    const url = `${MICROSOFT_AUTH_URL}/authorize?${params.toString()}`;
    res.json({ url });
  } catch (err) {
    console.error('[ConnectorRoutes] Microsoft OAuth start error:', err.message);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// ── 8. Microsoft OAuth callback ──
router.get('/api/connectors/oauth/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      console.error('[ConnectorRoutes] Microsoft OAuth error:', oauthError, error_description);
      return res.redirect('/settings?error=microsoft_oauth_denied');
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const brandId = stateData.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID not found in OAuth state' });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/microsoft/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(`${MICROSOFT_AUTH_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[ConnectorRoutes] Microsoft token exchange failed:', errBody);
      return res.redirect('/settings?error=microsoft_oauth_failed');
    }

    const tokens = await tokenResponse.json();
    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    // Store for both Outlook and Outlook Calendar
    await Promise.all([
      storeCredentials(brandId, 'outlook', credentials),
      storeCredentials(brandId, 'outlook_calendar', credentials),
    ]);

    res.redirect('/settings?connected=outlook,calendar');
  } catch (err) {
    console.error('[ConnectorRoutes] Microsoft OAuth callback error:', err.message);
    res.redirect('/settings?error=microsoft_oauth_failed');
  }
});

// ══════════════════════════════════════════════
// Meta OAuth
// ══════════════════════════════════════════════

// ── 9. Start Meta OAuth flow ──
router.get('/api/connectors/oauth/meta/start', requireAuthOrApiKey, async (req, res) => {
  try {
    if (!META_APP_ID || !META_APP_SECRET) {
      return res.status(503).json({
        error: 'OAuth not configured',
        message: 'Set META_APP_ID and META_APP_SECRET environment variables',
      });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/meta/callback`;
    const scopes = ['ads_read', 'ads_management', 'pages_read_engagement'];

    const state = Buffer.from(JSON.stringify({
      brand_id: req.brand_id,
      user_id: req.session?.user?.id || req.userId || null,
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: redirectUri,
      scope: scopes.join(','),
      state,
      response_type: 'code',
    });

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    res.json({ url });
  } catch (err) {
    console.error('[ConnectorRoutes] Meta OAuth start error:', err.message);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// ── 10. Meta OAuth callback ──
router.get('/api/connectors/oauth/meta/callback', async (req, res) => {
  try {
    const { code, state, error_reason } = req.query;

    if (error_reason) {
      console.error('[ConnectorRoutes] Meta OAuth denied:', error_reason);
      return res.redirect('/settings?error=meta_oauth_denied');
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const brandId = stateData.brand_id;
    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID not found in OAuth state' });
    }

    const redirectUri = `${BASE_URL}/api/connectors/oauth/meta/callback`;

    // Exchange code for short-lived token
    const tokenParams = new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    });

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`
    );

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[ConnectorRoutes] Meta token exchange failed:', errBody);
      return res.redirect('/settings?error=meta_oauth_failed');
    }

    const shortLivedToken = await tokenResponse.json();

    // Exchange for long-lived token
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: shortLivedToken.access_token,
    });

    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${longLivedParams.toString()}`
    );

    let credentials;
    if (longLivedResponse.ok) {
      const longLivedToken = await longLivedResponse.json();
      credentials = {
        access_token: longLivedToken.access_token,
        token_type: longLivedToken.token_type || 'bearer',
        expires_in: longLivedToken.expires_in,
      };
    } else {
      // Fall back to short-lived token
      console.warn('[ConnectorRoutes] Long-lived token exchange failed, using short-lived token');
      credentials = {
        access_token: shortLivedToken.access_token,
        token_type: shortLivedToken.token_type || 'bearer',
        expires_in: shortLivedToken.expires_in,
      };
    }

    await storeCredentials(brandId, 'meta_campaigns', credentials);

    res.redirect('/settings?connected=meta');
  } catch (err) {
    console.error('[ConnectorRoutes] Meta OAuth callback error:', err.message);
    res.redirect('/settings?error=meta_oauth_failed');
  }
});

module.exports = router;
