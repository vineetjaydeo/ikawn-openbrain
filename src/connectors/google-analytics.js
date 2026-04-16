// src/connectors/google-analytics.js
'use strict';

const { google } = require('googleapis');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { getGoogleClient } = require('../utils/google-auth');
const { getCredentials, updateLastSync, markExpired } = require('./credential-store');

const DEFAULT_METRICS = [
  'sessions',
  'activeUsers',
  'screenPageViews',
  'bounceRate',
  'averageSessionDuration',
  'conversions',
];

const DEFAULT_DIMENSIONS = ['date', 'sessionSource', 'sessionMedium'];

/**
 * Get an authenticated GA4 Data API client for a brand.
 * Tries brand OAuth first, then falls back to credential-store.
 */
async function getAnalyticsClient(brandId) {
  // Try brand OAuth (same path as ga.tool.js)
  const auth = await getGoogleClient(brandId, ['analytics.readonly']);
  if (auth) {
    return google.analyticsdata({ version: 'v1beta', auth });
  }

  // Fallback: credential-store (service account or stored OAuth)
  const creds = await getCredentials(brandId, 'google_analytics');
  if (!creds) return null;

  if (creds.type === 'service_account' || creds.private_key) {
    const jwtAuth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const client = await jwtAuth.getClient();
    return google.analyticsdata({ version: 'v1beta', auth: client });
  }

  return null;
}

/**
 * Format seconds into human-readable duration (e.g. "2m 34s").
 */
function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

/**
 * Format a number with commas (e.g. 1234 -> "1,234").
 */
function formatNumber(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-US');
}

/**
 * Parse a date range string into GA4 startDate/endDate.
 * Supports: "last 7 days", "last 30 days", "2026-04-01 to 2026-04-15"
 */
function parseDateRange(dateRange) {
  if (!dateRange) {
    return { startDate: '7daysAgo', endDate: 'today' };
  }

  const lower = dateRange.toLowerCase().trim();

  // "last N days"
  const lastNMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNMatch) {
    return { startDate: `${lastNMatch[1]}daysAgo`, endDate: 'today' };
  }

  // "YYYY-MM-DD to YYYY-MM-DD"
  const rangeMatch = lower.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return { startDate: rangeMatch[1], endDate: rangeMatch[2] };
  }

  // Default fallback
  return { startDate: '7daysAgo', endDate: 'today' };
}

/**
 * Sync Google Analytics data for a brand and store as memories.
 *
 * @param {string} brandId - Brand identifier
 * @param {object} credentials - Not used directly (auth resolved via getAnalyticsClient)
 * @param {object} options
 * @param {string} options.propertyId - GA4 property ID (required)
 * @param {string} [options.dateRange] - Date range string
 * @param {string[]} [options.metrics] - Metric names
 * @param {string[]} [options.dimensions] - Dimension names
 * @returns {Promise<{success: boolean, added: number, error?: string}>}
 */
async function syncAnalyticsReport(brandId, credentials, options = {}) {
  const propertyId = options.propertyId || credentials?.propertyId || process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return { success: false, added: 0, error: 'GA4 property ID not configured' };
  }

  const client = await getAnalyticsClient(brandId);
  if (!client) {
    return { success: false, added: 0, error: 'Google Analytics not connected for this brand' };
  }

  const metrics = options.metrics || DEFAULT_METRICS;
  const dimensions = options.dimensions || DEFAULT_DIMENSIONS;
  const { startDate, endDate } = parseDateRange(options.dateRange);

  try {
    const response = await client.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: metrics.map(m => ({ name: m })),
        dimensions: dimensions.map(d => ({ name: d })),
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
        limit: 10000,
      },
    });

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      return { success: true, added: 0, error: 'No data returned for the specified date range' };
    }

    // Build metric/dimension name maps from response headers
    const metricHeaders = (response.data.metricHeaders || []).map(h => h.name);
    const dimensionHeaders = (response.data.dimensionHeaders || []).map(h => h.name);

    // Group rows by date
    const dateIndex = dimensionHeaders.indexOf('date');
    const sourceIndex = dimensionHeaders.indexOf('sessionSource');
    const mediumIndex = dimensionHeaders.indexOf('sessionMedium');

    const byDate = {};
    for (const row of rows) {
      const dimValues = row.dimensionValues || [];
      const metValues = row.metricValues || [];

      // Format date from YYYYMMDD to YYYY-MM-DD
      const rawDate = dimValues[dateIndex]?.value || 'unknown';
      const date = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;

      if (!byDate[date]) {
        byDate[date] = { totals: {}, sources: [] };
        for (let i = 0; i < metricHeaders.length; i++) {
          byDate[date].totals[metricHeaders[i]] = 0;
        }
      }

      // Accumulate totals
      for (let i = 0; i < metricHeaders.length; i++) {
        byDate[date].totals[metricHeaders[i]] += Number(metValues[i]?.value || 0);
      }

      // Track source/medium breakdown
      const source = sourceIndex >= 0 ? dimValues[sourceIndex]?.value : null;
      const medium = mediumIndex >= 0 ? dimValues[mediumIndex]?.value : null;
      if (source) {
        byDate[date].sources.push({
          source,
          medium: medium || '(none)',
          sessions: Number(metValues[metricHeaders.indexOf('sessions')]?.value || 0),
        });
      }
    }

    // Create one memory per date
    let added = 0;
    for (const [date, data] of Object.entries(byDate)) {
      const t = data.totals;

      // Sort sources by sessions descending, take top 10
      const topSources = data.sources
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10);

      const sourceLines = topSources.map(
        s => `- ${s.source} / ${s.medium}: ${formatNumber(s.sessions)} sessions`
      );

      const content = [
        `Google Analytics Report for ${date}`,
        `Property: ${propertyId}`,
        '',
        'Traffic Summary:',
        t.sessions !== undefined ? `- Sessions: ${formatNumber(t.sessions)}` : null,
        t.activeUsers !== undefined ? `- Active Users: ${formatNumber(t.activeUsers)}` : null,
        t.screenPageViews !== undefined ? `- Page Views: ${formatNumber(t.screenPageViews)}` : null,
        t.bounceRate !== undefined ? `- Bounce Rate: ${(t.bounceRate * 100 / (data.sources.length || 1)).toFixed(1)}%` : null,
        t.averageSessionDuration !== undefined ? `- Avg Session Duration: ${formatDuration(t.averageSessionDuration / (data.sources.length || 1))}` : null,
        t.conversions !== undefined ? `- Conversions: ${formatNumber(t.conversions)}` : null,
        '',
        sourceLines.length > 0 ? 'Top Sources:' : null,
        ...sourceLines,
      ].filter(Boolean).join('\n');

      const id = await captureMessage({
        brand_id: brandId,
        channel: 'google_analytics',
        direction: 'inbound',
        content,
        source_ref: `ga-${propertyId}-${date}`,
        access_level: 'internal',
        memory_type: 'analytics',
      });
      if (id) added++;
    }

    // Log ingestion
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('google_analytics', 'success', $1)`,
      [added]
    ).catch(err => console.error('[GA Sync] Ingestion log failed:', err.message));

    await updateLastSync(brandId, 'google_analytics').catch(() => {});

    console.log(`[GA Sync] Complete for brand ${brandId}: ${added} day(s) synced`);
    return { success: true, added };
  } catch (err) {
    console.error(`[GA Sync] Failed for brand ${brandId}:`, err.message);

    // Handle token expiry
    if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
      await markExpired(brandId, 'google_analytics').catch(() => {});
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('google_analytics', 'error', $1)`,
      [err.message]
    ).catch(() => {});

    return { success: false, added: 0, error: err.message };
  }
}

module.exports = { getAnalyticsClient, syncAnalyticsReport, parseDateRange };
