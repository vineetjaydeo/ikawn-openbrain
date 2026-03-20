// src/tools/calendar.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'calendar_read',
  description: 'Fetch upcoming Google Calendar events for the next N hours',
  tier: 'direct',
  parameters: {
    hours: { type: 'number', required: false, description: 'Hours ahead to fetch (default: 24)' },
    calendar_id: { type: 'string', required: false, description: 'Calendar ID (default: primary)' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['calendar.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Google Calendar is not connected yet. Ask your admin to set up the integration.' };

    const calendar = google.calendar({ version: 'v3', auth });
    const hours = config.hours || 24;
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    try {
      const res = await calendar.events.list({
        calendarId: config.calendar_id || 'primary',
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20,
      });
      const events = (res.data.items || []).map(e => ({
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        attendees: (e.attendees || []).map(a => a.email).join(', '),
        location: e.location,
        meetLink: e.hangoutLink,
      }));
      return {
        success: true,
        data: { events, count: events.length },
        summary: events.length > 0
          ? `${events.length} event(s) in next ${hours}h: ${events.map(e => e.summary).join(', ')}`
          : `No events in the next ${hours}h.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Calendar fetch failed: ${err.message}` };
    }
  },
};
