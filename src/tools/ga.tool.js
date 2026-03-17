// src/tools/ga.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'ga_report',
  description: 'Fetch Google Analytics 4 summary: sessions, top pages, traffic sources',
  tier: 'direct',
  parameters: {
    days: { type: 'number', required: false, description: 'Days of data (default: 7)' },
    property_id: { type: 'string', required: false, description: 'GA4 property ID' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['analytics.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Google Analytics not connected.' };

    const propertyId = config.property_id || process.env.GA4_PROPERTY_ID;
    if (!propertyId) return { success: false, data: null, summary: 'GA4 property ID not configured.' };

    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const days = config.days || 7;

    try {
      const [sessionsReport, pagesReport] = await Promise.all([
        analyticsdata.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
          },
        }),
        analyticsdata.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 10,
          },
        }),
      ]);

      const metrics = sessionsReport.data.rows?.[0]?.metricValues || [];
      const topPages = (pagesReport.data.rows || []).map(r => ({
        page: r.dimensionValues[0]?.value,
        views: parseInt(r.metricValues[0]?.value || '0', 10),
      }));

      const data = {
        period: `Last ${days} days`,
        sessions: parseInt(metrics[0]?.value || '0', 10),
        activeUsers: parseInt(metrics[1]?.value || '0', 10),
        bounceRate: parseFloat(metrics[2]?.value || '0').toFixed(1) + '%',
        avgSessionDuration: parseFloat(metrics[3]?.value || '0').toFixed(0) + 's',
        topPages,
      };

      return {
        success: true,
        data,
        summary: `Last ${days}d: ${data.sessions} sessions, ${data.activeUsers} users, ${data.bounceRate} bounce. Top: ${topPages[0]?.page || 'N/A'}`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `GA report failed: ${err.message}` };
    }
  },
};
