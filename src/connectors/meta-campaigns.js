// src/connectors/meta-campaigns.js
'use strict';

const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');
const { getCredentials, updateLastSync, markExpired } = require('./credential-store');

const META_API_VERSION = 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const DEFAULT_FIELDS = [
  'campaign_name',
  'campaign_id',
  'impressions',
  'clicks',
  'spend',
  'cpc',
  'cpm',
  'ctr',
  'conversions',
  'cost_per_action_type',
  'reach',
  'frequency',
].join(',');

/**
 * Create a Meta Marketing API helper from credentials.
 * Expects { access_token, ad_account_id } in credential-store.
 */
function getMetaClient(credentials) {
  if (!credentials || !credentials.access_token) {
    return null;
  }

  const accessToken = credentials.access_token;

  async function apiGet(path, params = {}) {
    const url = new URL(`${META_BASE_URL}${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val));
      }
    }

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ikawn-openbrain/1.0' },
    });

    if (!res.ok) {
      const body = await res.text();
      let errorMsg = `Meta API ${res.status}: ${res.statusText}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed.error?.message) {
          errorMsg = `Meta API error: ${parsed.error.message} (code ${parsed.error.code || res.status})`;
        }
      } catch (_) {}

      // Detect rate limiting
      if (res.status === 429 || (res.status === 400 && body.includes('too many calls'))) {
        const err = new Error(errorMsg);
        err.rateLimited = true;
        throw err;
      }

      throw new Error(errorMsg);
    }

    return res.json();
  }

  return { apiGet, accessToken };
}

/**
 * Format a number with commas.
 */
function formatNumber(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-US');
}

/**
 * Parse a date range string into Meta API time_range or date_preset.
 * Returns { datePreset } or { timeRange: { since, until } }.
 */
function parseDateRange(dateRange) {
  if (!dateRange) {
    return { datePreset: 'last_7d' };
  }

  const lower = dateRange.toLowerCase().trim();

  // "last N days" -> map to Meta presets where possible
  const lastNMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNMatch) {
    const days = parseInt(lastNMatch[1], 10);
    const presetMap = { 7: 'last_7d', 14: 'last_14d', 28: 'last_28d', 30: 'last_30d', 90: 'last_90d' };
    if (presetMap[days]) return { datePreset: presetMap[days] };
    // Custom range for non-standard day counts
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    return { timeRange: JSON.stringify({ since, until }) };
  }

  // "YYYY-MM-DD to YYYY-MM-DD"
  const rangeMatch = lower.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return { timeRange: JSON.stringify({ since: rangeMatch[1], until: rangeMatch[2] }) };
  }

  return { datePreset: 'last_7d' };
}

/**
 * Extract cost per conversion from the cost_per_action_type array.
 * Meta returns this as an array of { action_type, value } objects.
 */
function extractCostPerConversion(costPerActionType) {
  if (!Array.isArray(costPerActionType)) return null;
  // Prefer offsite_conversion, then any conversion action
  const offsite = costPerActionType.find(a =>
    a.action_type === 'offsite_conversion' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
  );
  if (offsite) return Number(offsite.value) || 0;
  // Fallback to first action
  return costPerActionType.length > 0 ? (Number(costPerActionType[0].value) || 0) : null;
}

/**
 * Extract total conversions from the actions array if present,
 * or from the conversions field directly.
 */
function extractConversions(row) {
  if (row.conversions) return Number(row.conversions) || 0;
  if (Array.isArray(row.actions)) {
    const conv = row.actions.find(a =>
      a.action_type === 'offsite_conversion' || a.action_type === 'purchase'
    );
    return conv ? (Number(conv.value) || 0) : 0;
  }
  return 0;
}

/**
 * Sync Meta campaign data for a brand and store as memories.
 *
 * @param {string} brandId - Brand identifier
 * @param {object} credentials - From credential-store (access_token, ad_account_id)
 * @param {object} options
 * @param {string} [options.adAccountId] - Override ad account ID
 * @param {string} [options.dateRange] - Date range string
 * @param {string} [options.level] - 'campaign', 'adset', or 'ad' (default: 'campaign')
 * @returns {Promise<{success: boolean, added: number, campaigns: number, error?: string}>}
 */
async function syncCampaigns(brandId, credentials, options = {}) {
  const adAccountId = options.adAccountId || credentials?.ad_account_id;
  if (!adAccountId) {
    return { success: false, added: 0, campaigns: 0, error: 'Meta ad account ID not configured' };
  }

  const creds = credentials || await getCredentials(brandId, 'meta_campaigns');
  if (!creds) {
    return { success: false, added: 0, campaigns: 0, error: 'Meta credentials not found for this brand' };
  }

  const client = getMetaClient(creds);
  if (!client) {
    return { success: false, added: 0, campaigns: 0, error: 'Invalid Meta credentials (missing access_token)' };
  }

  const level = options.level || 'campaign';
  const dateConfig = parseDateRange(options.dateRange);

  try {
    const params = {
      fields: DEFAULT_FIELDS,
      level,
      limit: '500',
    };

    if (dateConfig.datePreset) {
      params.date_preset = dateConfig.datePreset;
    } else if (dateConfig.timeRange) {
      params.time_range = dateConfig.timeRange;
    }

    // Clean account ID (remove "act_" prefix if already present)
    const cleanAccountId = adAccountId.replace(/^act_/, '');
    const data = await client.apiGet(`/act_${cleanAccountId}/insights`, params);

    const rows = data.data || [];
    if (rows.length === 0) {
      return { success: true, added: 0, campaigns: 0, error: 'No campaign data returned for the specified date range' };
    }

    // Group by campaign
    const byCampaign = {};
    for (const row of rows) {
      const campaignId = row.campaign_id || 'unknown';
      const campaignName = row.campaign_name || 'Unnamed Campaign';
      const key = `${campaignId}`;

      if (!byCampaign[key]) {
        byCampaign[key] = {
          campaignId,
          campaignName,
          impressions: 0,
          reach: 0,
          clicks: 0,
          spend: 0,
          cpc: 0,
          cpm: 0,
          ctr: 0,
          conversions: 0,
          costPerConversion: null,
          frequency: 0,
          rowCount: 0,
        };
      }

      const c = byCampaign[key];
      c.impressions += Number(row.impressions) || 0;
      c.reach += Number(row.reach) || 0;
      c.clicks += Number(row.clicks) || 0;
      c.spend += Number(row.spend) || 0;
      c.conversions += extractConversions(row);
      c.frequency = Number(row.frequency) || c.frequency;
      c.rowCount++;

      const costPerConv = extractCostPerConversion(row.cost_per_action_type);
      if (costPerConv !== null) {
        c.costPerConversion = (c.costPerConversion || 0) + costPerConv;
      }
    }

    // Create one memory per campaign
    let added = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const [key, c] of Object.entries(byCampaign)) {
      // Calculate averages for rate metrics
      const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100) : 0;
      const cpc = c.clicks > 0 ? (c.spend / c.clicks) : 0;
      const avgCostPerConv = c.conversions > 0 ? (c.spend / c.conversions) : null;

      const content = [
        `Meta Campaign Report for ${today}`,
        `Ad Account: ${cleanAccountId}`,
        '',
        `Campaign: ${c.campaignName}`,
        `- Impressions: ${formatNumber(c.impressions)}`,
        `- Reach: ${formatNumber(c.reach)}`,
        `- Clicks: ${formatNumber(c.clicks)}`,
        `- CTR: ${ctr.toFixed(2)}%`,
        `- Spend: ${c.spend.toFixed(2)}`,
        `- CPC: ${cpc.toFixed(2)}`,
        `- Conversions: ${formatNumber(c.conversions)}`,
        avgCostPerConv !== null ? `- Cost per Conversion: ${avgCostPerConv.toFixed(2)}` : null,
        `- Frequency: ${c.frequency.toFixed(2)}`,
      ].filter(Boolean).join('\n');

      const id = await captureMessage({
        brand_id: brandId,
        channel: 'meta_campaigns',
        direction: 'inbound',
        content,
        source_ref: `meta-${c.campaignId}-${today}`,
        access_level: 'internal',
        memory_type: 'campaign',
      });
      if (id) added++;
    }

    // Log ingestion
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('meta_campaigns', 'success', $1)`,
      [added]
    ).catch(err => console.error('[Meta Sync] Ingestion log failed:', err.message));

    await updateLastSync(brandId, 'meta_campaigns').catch(() => {});

    console.log(`[Meta Sync] Complete for brand ${brandId}: ${added} campaign(s) synced`);
    return { success: true, added, campaigns: Object.keys(byCampaign).length };
  } catch (err) {
    console.error(`[Meta Sync] Failed for brand ${brandId}:`, err.message);

    // Handle expired tokens
    if (err.message.includes('OAuthException') || err.message.includes('Session has expired') ||
        err.message.includes('Error validating access token')) {
      await markExpired(brandId, 'meta_campaigns').catch(() => {});
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('meta_campaigns', 'error', $1)`,
      [err.message]
    ).catch(() => {});

    return { success: false, added: 0, campaigns: 0, error: err.message };
  }
}

module.exports = { getMetaClient, syncCampaigns, parseDateRange };
