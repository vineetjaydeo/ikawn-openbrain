// src/tools/analytics.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');
const { syncAnalyticsReport, parseDateRange } = require('../connectors/google-analytics');
const { getCredentials } = require('../connectors/credential-store');

module.exports = {
  name: 'analytics_report',
  description: 'Fetch Google Analytics data for a brand. Returns traffic, user, and conversion metrics.',
  tier: 'direct',
  parameters: {
    date_range: { type: 'string', required: false, description: 'Date range like "last 7 days", "last 30 days", "2026-04-01 to 2026-04-15"' },
    metrics: { type: 'string', required: false, description: 'Comma-separated metrics (e.g. sessions,activeUsers,screenPageViews)' },
    dimensions: { type: 'string', required: false, description: 'Comma-separated dimensions (e.g. date,sessionSource,sessionMedium)' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';

    // Resolve property ID: config > credential-store > env
    let propertyId = config.property_id;
    if (!propertyId) {
      const creds = await getCredentials(brandId, 'google_analytics');
      propertyId = creds?.propertyId || creds?.property_id || process.env.GA4_PROPERTY_ID;
    }

    if (!propertyId) {
      return {
        success: false,
        data: null,
        summary: 'Google Analytics is not connected. No GA4 property ID configured for this brand.',
      };
    }

    // Check we have auth
    const auth = await getGoogleClient(brandId, ['analytics.readonly']);
    if (!auth) {
      return {
        success: false,
        data: null,
        summary: 'Google Analytics is not connected yet. Ask your admin to set up the integration.',
      };
    }

    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const { startDate, endDate } = parseDateRange(config.date_range);

    // Parse comma-separated metrics/dimensions or use defaults
    const metrics = config.metrics
      ? config.metrics.split(',').map(m => m.trim()).filter(Boolean)
      : ['sessions', 'activeUsers', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'conversions'];

    const dimensions = config.dimensions
      ? config.dimensions.split(',').map(d => d.trim()).filter(Boolean)
      : ['date', 'sessionSource', 'sessionMedium'];

    try {
      const response = await analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: metrics.map(m => ({ name: m })),
          dimensions: dimensions.map(d => ({ name: d })),
          orderBys: [{ dimension: { dimensionName: dimensions[0] || 'date' }, desc: true }],
          limit: 10000,
        },
      });

      const rows = response.data.rows || [];
      const metricHeaders = (response.data.metricHeaders || []).map(h => h.name);
      const dimensionHeaders = (response.data.dimensionHeaders || []).map(h => h.name);

      if (rows.length === 0) {
        return {
          success: true,
          data: { rows: [], period: `${startDate} to ${endDate}` },
          summary: 'No analytics data found for the specified date range.',
        };
      }

      // Compute totals across all rows
      const totals = {};
      for (const metric of metricHeaders) {
        totals[metric] = 0;
      }
      for (const row of rows) {
        const metValues = row.metricValues || [];
        for (let i = 0; i < metricHeaders.length; i++) {
          totals[metricHeaders[i]] += Number(metValues[i]?.value || 0);
        }
      }

      // Collect top sources (group by source/medium)
      const sourceIndex = dimensionHeaders.indexOf('sessionSource');
      const mediumIndex = dimensionHeaders.indexOf('sessionMedium');
      const sessionsMetricIdx = metricHeaders.indexOf('sessions');

      const sourceMap = {};
      if (sourceIndex >= 0 && sessionsMetricIdx >= 0) {
        for (const row of rows) {
          const source = row.dimensionValues[sourceIndex]?.value || '(direct)';
          const medium = mediumIndex >= 0 ? (row.dimensionValues[mediumIndex]?.value || '(none)') : '(none)';
          const key = `${source} / ${medium}`;
          sourceMap[key] = (sourceMap[key] || 0) + Number(row.metricValues[sessionsMetricIdx]?.value || 0);
        }
      }
      const topSources = Object.entries(sourceMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, sessions]) => ({ name, sessions }));

      // Format duration
      const avgDuration = totals.averageSessionDuration !== undefined
        ? Math.round(totals.averageSessionDuration / Math.max(rows.length, 1))
        : null;
      const durationStr = avgDuration !== null
        ? (avgDuration >= 60 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : `${avgDuration}s`)
        : null;

      // Calculate average bounce rate
      const avgBounce = totals.bounceRate !== undefined
        ? (totals.bounceRate / Math.max(rows.length, 1) * 100).toFixed(1)
        : null;

      const data = {
        period: `${startDate} to ${endDate}`,
        propertyId,
        sessions: Math.round(totals.sessions || 0),
        activeUsers: Math.round(totals.activeUsers || 0),
        pageViews: Math.round(totals.screenPageViews || 0),
        bounceRate: avgBounce ? `${avgBounce}%` : null,
        avgSessionDuration: durationStr,
        conversions: Math.round(totals.conversions || 0),
        topSources,
        totalRows: rows.length,
      };

      // Build summary
      const summaryParts = [
        `Analytics (${startDate} to ${endDate}):`,
        `${data.sessions.toLocaleString()} sessions`,
        `${data.activeUsers.toLocaleString()} users`,
      ];
      if (data.pageViews) summaryParts.push(`${data.pageViews.toLocaleString()} page views`);
      if (data.bounceRate) summaryParts.push(`${data.bounceRate} bounce rate`);
      if (data.conversions) summaryParts.push(`${data.conversions.toLocaleString()} conversions`);
      if (topSources.length > 0) summaryParts.push(`Top source: ${topSources[0].name}`);

      return {
        success: true,
        data,
        summary: summaryParts.join(', '),
      };
    } catch (err) {
      // Handle specific error cases
      if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
        return {
          success: false,
          data: null,
          summary: 'Google Analytics authentication has expired. Please reconnect the integration.',
        };
      }
      if (err.code === 403) {
        return {
          success: false,
          data: null,
          summary: 'Access denied to Google Analytics. Check that the property ID is correct and permissions are granted.',
        };
      }
      return {
        success: false,
        data: null,
        summary: `Analytics report failed: ${err.message}`,
      };
    }
  },
};
