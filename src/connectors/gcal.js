const { google } = require('googleapis');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');

/**
 * Create a Google Calendar client.
 * If credentials are provided (per-brand OAuth), use those.
 * Otherwise fall back to the hardcoded env var (ikawn default).
 */
async function getCalendarClient(credentials) {
  if (credentials) {
    // Per-brand OAuth credentials (access_token / refresh_token flow)
    const oauth2 = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri
    );
    oauth2.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expiry_date: credentials.expiry_date,
    });
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  // Fallback: hardcoded service account from env (existing ikawn behavior)
  const credsBase64 = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!credsBase64) return null;

  const creds = JSON.parse(Buffer.from(credsBase64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  const authClient = await auth.getClient();
  return google.calendar({ version: 'v3', auth: authClient });
}

/**
 * Format a single Google Calendar event into a readable content string.
 */
function formatEvent(event) {
  const attendees = (event.attendees || []).map(a => a.email).join(', ');
  const startStr = event.start?.dateTime || event.start?.date || '';
  const endStr = event.end?.dateTime || event.end?.date || '';

  return [
    `Event: ${event.summary || 'No title'}`,
    `Date: ${startStr} - ${endStr}`,
    event.location ? `Location: ${event.location}` : '',
    event.organizer?.email ? `Organizer: ${event.organizer.email}` : '',
    attendees ? `Attendees: ${attendees}` : '',
    event.status ? `Status: ${event.status}` : '',
    event.hangoutLink ? `Meeting link: ${event.hangoutLink}` : '',
    event.description ? `\nDescription:\n${event.description.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Sync calendar events for a specific brand using OAuth credentials.
 *
 * @param {string} brandId - Brand identifier
 * @param {object|null} credentials - OAuth credentials (null = use env fallback)
 * @param {object} options - Sync options
 * @param {string} options.since - ISO date, default last 7 days
 * @param {string} options.until - ISO date, default 30 days ahead
 * @param {number} options.maxResults - Max events, default 250
 * @param {string[]} options.calendarIds - Calendar IDs to sync (default: ['primary'])
 */
async function syncCalendarEvents(brandId, credentials, options = {}) {
  const calendar = await getCalendarClient(credentials);
  if (!calendar) {
    console.warn(`[GCal] No credentials for brand=${brandId}, skipping`);
    return { total: 0 };
  }

  const now = new Date();
  const since = options.since
    ? new Date(options.since)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const until = options.until
    ? new Date(options.until)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const maxResults = options.maxResults || 250;
  const calendarIds = options.calendarIds || ['primary'];

  let totalAdded = 0;

  for (const calendarId of calendarIds) {
    try {
      const res = await calendar.events.list({
        calendarId,
        timeMin: since.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults,
      });

      const events = res.data.items || [];

      for (const event of events) {
        const sourceRef = `gcal-${event.id}`;
        const isTeamEvent = (event.attendees || []).length > 1;
        const content = formatEvent(event);

        const id = await captureMessage({
          brand_id: brandId,
          channel: 'google_calendar',
          direction: 'inbound',
          content,
          source_ref: sourceRef,
          access_level: isTeamEvent ? 'management' : 'private',
          memory_type: 'calendar',
        });
        if (id) totalAdded++;
      }
    } catch (err) {
      console.error(`[GCal] Sync failed for calendar=${calendarId}, brand=${brandId}:`, err.message);
    }
  }

  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('google_calendar', 'success', $1)`,
    [totalAdded]
  ).catch(err => console.error('[GCal] Ingestion log failed:', err.message));

  console.log(`[GCal] Sync complete for brand=${brandId}: ${totalAdded} new events`);
  return { total: totalAdded };
}

/**
 * Original sync function (backward compatible).
 * Syncs the hardcoded ikawn calendar using env credentials.
 */
async function syncCalendar() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  return syncCalendarEvents('ikawn', null, { calendarIds: [calendarId] });
}

/**
 * List events from Google Calendar (for the chat tool).
 * Returns raw event objects for formatting by the caller.
 */
async function listEvents(credentials, options = {}) {
  const calendar = await getCalendarClient(credentials);
  if (!calendar) return [];

  const now = new Date();
  const since = options.since
    ? new Date(options.since)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const until = options.until
    ? new Date(options.until)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const calendarId = options.calendarId || 'primary';

  const res = await calendar.events.list({
    calendarId,
    timeMin: since.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: options.maxResults || 100,
    q: options.query || undefined,
  });

  return res.data.items || [];
}

/**
 * Create an event on Google Calendar.
 */
async function createEvent(credentials, eventData) {
  const calendar = await getCalendarClient(credentials);
  if (!calendar) throw new Error('No Google Calendar credentials available');

  const calendarId = eventData.calendarId || 'primary';

  const resource = {
    summary: eventData.title,
    description: eventData.description || '',
    start: { dateTime: eventData.start, timeZone: eventData.timeZone || 'Asia/Kolkata' },
    end: { dateTime: eventData.end, timeZone: eventData.timeZone || 'Asia/Kolkata' },
  };

  if (eventData.attendees) {
    resource.attendees = eventData.attendees.split(',').map(e => ({ email: e.trim() }));
  }

  if (eventData.location) {
    resource.location = eventData.location;
  }

  const res = await calendar.events.insert({ calendarId, resource, sendUpdates: 'all' });
  return res.data;
}

/**
 * Update an existing event on Google Calendar.
 */
async function updateEvent(credentials, eventId, eventData) {
  const calendar = await getCalendarClient(credentials);
  if (!calendar) throw new Error('No Google Calendar credentials available');

  const calendarId = eventData.calendarId || 'primary';

  const resource = {};
  if (eventData.title) resource.summary = eventData.title;
  if (eventData.description) resource.description = eventData.description;
  if (eventData.start) resource.start = { dateTime: eventData.start, timeZone: eventData.timeZone || 'Asia/Kolkata' };
  if (eventData.end) resource.end = { dateTime: eventData.end, timeZone: eventData.timeZone || 'Asia/Kolkata' };
  if (eventData.attendees) {
    resource.attendees = eventData.attendees.split(',').map(e => ({ email: e.trim() }));
  }
  if (eventData.location) resource.location = eventData.location;

  const res = await calendar.events.patch({
    calendarId,
    eventId,
    resource,
    sendUpdates: 'all',
  });
  return res.data;
}

/**
 * Cancel (delete) an event on Google Calendar.
 */
async function cancelEvent(credentials, eventId, calendarId = 'primary') {
  const calendar = await getCalendarClient(credentials);
  if (!calendar) throw new Error('No Google Calendar credentials available');

  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' });
  return { cancelled: true, eventId };
}

module.exports = {
  syncCalendar,
  syncCalendarEvents,
  getCalendarClient,
  listEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  formatEvent,
};
