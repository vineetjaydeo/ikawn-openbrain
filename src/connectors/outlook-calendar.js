const { Client } = require('@microsoft/microsoft-graph-client');
const { captureMessage } = require('../utils/capture');
const { pool } = require('../db');

/**
 * Create an authenticated Microsoft Graph client from OAuth credentials.
 *
 * @param {object} credentials - { access_token, refresh_token, client_id, client_secret, tenant_id }
 * @returns {Client}
 */
function getCalendarClient(credentials) {
  if (!credentials || !credentials.access_token) {
    throw new Error('Outlook calendar credentials missing or incomplete');
  }

  return Client.init({
    authProvider: (done) => {
      done(null, credentials.access_token);
    },
  });
}

/**
 * Format an Outlook calendar event into a readable content string.
 */
function formatEvent(event) {
  const startStr = event.start?.dateTime
    ? `${event.start.dateTime} (${event.start.timeZone || 'UTC'})`
    : '';
  const endStr = event.end?.dateTime
    ? `${event.end.dateTime} (${event.end.timeZone || 'UTC'})`
    : '';

  const attendees = (event.attendees || [])
    .map(a => a.emailAddress?.address)
    .filter(Boolean)
    .join(', ');

  const organizer = event.organizer?.emailAddress?.address || '';

  const responseStatus = event.responseStatus?.response || '';

  // Strip HTML from body if present
  let bodyText = '';
  if (event.body?.content) {
    bodyText = event.body.contentType === 'html'
      ? event.body.content.replace(/<[^>]*>/g, '').trim()
      : event.body.content.trim();
    if (bodyText.length > 500) bodyText = bodyText.slice(0, 500) + '...';
  }

  return [
    `Event: ${event.subject || 'No title'}`,
    `Date: ${startStr} - ${endStr}`,
    event.location?.displayName ? `Location: ${event.location.displayName}` : '',
    organizer ? `Organizer: ${organizer}` : '',
    attendees ? `Attendees: ${attendees}` : '',
    responseStatus ? `Status: ${responseStatus}` : '',
    event.onlineMeeting?.joinUrl ? `Meeting link: ${event.onlineMeeting.joinUrl}` : '',
    bodyText ? `\nDescription:\n${bodyText}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Sync Outlook calendar events for a brand.
 *
 * @param {string} brandId - Brand identifier
 * @param {object} credentials - OAuth credentials with access_token
 * @param {object} options
 * @param {string} options.since - ISO date, default last 7 days
 * @param {string} options.until - ISO date, default 30 days ahead
 * @param {number} options.maxResults - Max events, default 100
 */
async function syncCalendarEvents(brandId, credentials, options = {}) {
  const client = getCalendarClient(credentials);

  const now = new Date();
  const since = options.since
    ? new Date(options.since)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const until = options.until
    ? new Date(options.until)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const maxResults = options.maxResults || 100;

  let totalAdded = 0;

  try {
    const response = await client
      .api('/me/calendarview')
      .query({
        startDateTime: since.toISOString(),
        endDateTime: until.toISOString(),
      })
      .top(maxResults)
      .select('id,subject,start,end,location,organizer,attendees,body,responseStatus,onlineMeeting')
      .orderby('start/dateTime')
      .get();

    const events = response.value || [];

    for (const event of events) {
      const sourceRef = `outlook-cal-${event.id}`;
      const content = formatEvent(event);
      const isTeamEvent = (event.attendees || []).length > 1;

      const id = await captureMessage({
        brand_id: brandId,
        channel: 'outlook_calendar',
        direction: 'inbound',
        content,
        source_ref: sourceRef,
        access_level: isTeamEvent ? 'management' : 'private',
        memory_type: 'calendar',
      });
      if (id) totalAdded++;
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('outlook_calendar', 'success', $1)`,
      [totalAdded]
    ).catch(err => console.error('[OutlookCal] Ingestion log failed:', err.message));

    console.log(`[OutlookCal] Sync complete for brand=${brandId}: ${totalAdded} new events`);
    return { total: totalAdded };
  } catch (err) {
    console.error(`[OutlookCal] Sync failed for brand=${brandId}:`, err.message);
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('outlook_calendar', 'error', $1)`,
      [err.message]
    ).catch(() => {});
    return { total: 0, error: err.message };
  }
}

/**
 * List events from Outlook Calendar (for the chat tool).
 * Returns raw event objects.
 */
async function listEvents(credentials, options = {}) {
  const client = getCalendarClient(credentials);

  const now = new Date();
  const since = options.since
    ? new Date(options.since)
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const until = options.until
    ? new Date(options.until)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let request = client
    .api('/me/calendarview')
    .query({
      startDateTime: since.toISOString(),
      endDateTime: until.toISOString(),
    })
    .top(options.maxResults || 100)
    .select('id,subject,start,end,location,organizer,attendees,body,responseStatus,onlineMeeting')
    .orderby('start/dateTime');

  if (options.query) {
    request = request.filter(`contains(subject,'${options.query.replace(/'/g, "''")}')`);
  }

  const response = await request.get();
  return response.value || [];
}

/**
 * Create an event on Outlook Calendar.
 */
async function createEvent(credentials, eventData) {
  const client = getCalendarClient(credentials);

  const resource = {
    subject: eventData.title,
    body: eventData.description
      ? { contentType: 'text', content: eventData.description }
      : undefined,
    start: {
      dateTime: eventData.start,
      timeZone: eventData.timeZone || 'Asia/Kolkata',
    },
    end: {
      dateTime: eventData.end,
      timeZone: eventData.timeZone || 'Asia/Kolkata',
    },
  };

  if (eventData.attendees) {
    resource.attendees = eventData.attendees.split(',').map(email => ({
      emailAddress: { address: email.trim() },
      type: 'required',
    }));
  }

  if (eventData.location) {
    resource.location = { displayName: eventData.location };
  }

  const result = await client.api('/me/events').post(resource);
  return result;
}

/**
 * Update an existing event on Outlook Calendar.
 */
async function updateEvent(credentials, eventId, eventData) {
  const client = getCalendarClient(credentials);

  const resource = {};
  if (eventData.title) resource.subject = eventData.title;
  if (eventData.description) {
    resource.body = { contentType: 'text', content: eventData.description };
  }
  if (eventData.start) {
    resource.start = { dateTime: eventData.start, timeZone: eventData.timeZone || 'Asia/Kolkata' };
  }
  if (eventData.end) {
    resource.end = { dateTime: eventData.end, timeZone: eventData.timeZone || 'Asia/Kolkata' };
  }
  if (eventData.attendees) {
    resource.attendees = eventData.attendees.split(',').map(email => ({
      emailAddress: { address: email.trim() },
      type: 'required',
    }));
  }
  if (eventData.location) {
    resource.location = { displayName: eventData.location };
  }

  const result = await client.api(`/me/events/${eventId}`).patch(resource);
  return result;
}

/**
 * Cancel (delete) an event on Outlook Calendar.
 */
async function cancelEvent(credentials, eventId) {
  const client = getCalendarClient(credentials);
  await client.api(`/me/events/${eventId}`).delete();
  return { cancelled: true, eventId };
}

module.exports = {
  getCalendarClient,
  syncCalendarEvents,
  listEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  formatEvent,
};
