// src/tools/campaigns.tool.js
'use strict';

const { getMetaClient, parseDateRange } = require('../connectors/meta-campaigns');
const { getCredentials } = require('../connectors/credential-store');

const META_API_VERSION = 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const INSIGHT_FIELDS = [
  'campaign_name',
  'campaign_id',
  'adset_name',
  'ad_name',
  'impressions',
  'clicks',
  'spend',
  'cpc',
  'cpm',
  'ctr',
  'reach',
  'frequency',
  'actions',
  'cost_per_action_type',
].join(',');

module.exports = {
  name: 'campaign_report',
  description: 'Fetch Meta (Facebook/Instagram) campaign performance data.',
  tier: 'direct',
  parameters: {
    date_range: { type: 'string', required: false, description: 'Date range like "last 7 days", "last 30 days", "2026-04-01 to 2026-04-15"' },
    level: { type: 'string', required: false, description: 'Reporting level: campaign, adset, or ad (default: campaign)' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';

    // Get credentials from credential-store
    const creds = await getCredentials(brandId, 'meta_campaigns');
    if (!creds || !creds.access_token) {
      return {
        success: false,
        data: null,
        summary: 'Meta Ads is not connected. Please set up the integration first.',
      };
    }

    const adAccountId = creds.ad_account_id;
    if (!adAccountId) {
      return {
        success: false,
        data: null,
        summary: 'Meta ad account ID is not configured. Update the integration settings.',
      };
    }

    const client = getMetaClient(creds);
    if (!client) {
      return {
        success: false,
        data: null,
        summary: 'Failed to create Meta API client. Check credentials.',
      };
    }

    const level = config.level || 'campaign';
    if (!['campaign', 'adset', 'ad'].includes(level)) {
      return {
        success: false,
        data: null,
        summary: 'Invalid level. Must be one of: campaign, adset, ad.',
      };
    }

    const dateConfig = parseDateRange(config.date_range);

    try {
      const cleanAccountId = adAccountId.replace(/^act_/, '');
      const params = {
        fields: INSIGHT_FIELDS,
        level,
        limit: '500',
      };

      if (dateConfig.datePreset) {
        params.date_preset = dateConfig.datePreset;
      } else if (dateConfig.timeRange) {
        params.time_range = dateConfig.timeRange;
      }

      const data = await client.apiGet(`/act_${cleanAccountId}/insights`, params);
      const rows = data.data || [];

      if (rows.length === 0) {
        return {
          success: true,
          data: { campaigns: [], period: config.date_range || 'last 7 days' },
          summary: 'No campaign data found for the specified date range.',
        };
      }

      // Process rows into structured campaign data
      const campaigns = rows.map(row => {
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const spend = Number(row.spend) || 0;
        const reach = Number(row.reach) || 0;

        // Extract conversions from actions array
        let conversions = 0;
        if (Array.isArray(row.actions)) {
          const convAction = row.actions.find(a =>
            a.action_type === 'offsite_conversion' ||
            a.action_type === 'purchase' ||
            a.action_type === 'lead'
          );
          if (convAction) conversions = Number(convAction.value) || 0;
        }

        // Cost per conversion
        let costPerConversion = null;
        if (Array.isArray(row.cost_per_action_type)) {
          const costAction = row.cost_per_action_type.find(a =>
            a.action_type === 'offsite_conversion' ||
            a.action_type === 'purchase' ||
            a.action_type === 'lead'
          );
          if (costAction) costPerConversion = Number(costAction.value) || null;
        }

        const entry = {
          campaignName: row.campaign_name || 'Unknown',
          campaignId: row.campaign_id,
          impressions,
          reach,
          clicks,
          ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0%',
          spend: spend.toFixed(2),
          cpc: clicks > 0 ? (spend / clicks).toFixed(2) : '0.00',
          conversions,
          costPerConversion: costPerConversion !== null ? costPerConversion.toFixed(2) : null,
          frequency: Number(row.frequency || 0).toFixed(2),
        };

        // Add adset/ad name if at those levels
        if (level === 'adset' && row.adset_name) entry.adsetName = row.adset_name;
        if (level === 'ad' && row.ad_name) entry.adName = row.ad_name;

        return entry;
      });

      // Calculate totals
      const totalSpend = campaigns.reduce((sum, c) => sum + parseFloat(c.spend), 0);
      const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
      const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
      const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);

      const resultData = {
        period: config.date_range || 'last 7 days',
        level,
        adAccountId: cleanAccountId,
        campaigns,
        totals: {
          spend: totalSpend.toFixed(2),
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : '0%',
          cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00',
        },
        campaignCount: campaigns.length,
      };

      // Build summary
      const summaryParts = [
        `Meta Ads (${resultData.period}):`,
        `${campaigns.length} ${level}(s)`,
        `${totalImpressions.toLocaleString()} impressions`,
        `${totalClicks.toLocaleString()} clicks`,
        `spend: ${totalSpend.toFixed(2)}`,
      ];
      if (totalConversions > 0) summaryParts.push(`${totalConversions} conversions`);
      if (campaigns.length > 0) summaryParts.push(`Top: ${campaigns[0].campaignName}`);

      return {
        success: true,
        data: resultData,
        summary: summaryParts.join(', '),
      };
    } catch (err) {
      // Handle specific Meta API errors
      if (err.message.includes('OAuthException') || err.message.includes('Session has expired')) {
        return {
          success: false,
          data: null,
          summary: 'Meta authentication has expired. Please reconnect the integration.',
        };
      }
      if (err.rateLimited) {
        return {
          success: false,
          data: null,
          summary: 'Meta API rate limit reached. Please try again in a few minutes.',
        };
      }
      return {
        success: false,
        data: null,
        summary: `Campaign report failed: ${err.message}`,
      };
    }
  },
};
