// src/tools/calendar.tool.js
'use strict';

const gcal = require('../connectors/gcal');
const outlookCal = require('../connectors/outlook-calendar');
const { captureMessage } = require('../utils/capture');

/**
 * Attempt to load credentials from the credential store.
 * The store may not exist yet (another agent is building it),
 * so we gracefully handle the import failure.
 */
async function loadCredentials(brandId, connectorType) {
  try {
    const { getCredentials } = require('../connectors/credential-store');
    return await getCredentials(brandId, connectorType);
  } catch (_) {
    // Credential store not available yet; fall back to env-based auth
    return null;
  }
}

/**
 * Resolve which provider connector to use and load credentials.
 */
async function resolveProvider(provider, brandId) {
  const type = (provider || 'google').toLowerCase();

  if (type === 'outlook' || type === 'microsoft') {
    const creds = await loadCredentials(brandId, 'outlook_calendar');
    if (!creds) {
      return { error: 'No Outlook calendar credentials found for this brand. Connect Outlook first.' };
    }
    return { connector: outlookCal, credentials: creds, providerName: 'Outlook' };
  }

  // Default: Google Calendar
  const creds = await loadCredentials(brandId, 'google_calendar');
  // creds can be null; gcal falls back to env-based service account for ikawn
  return { connector: gcal, credentials: creds, providerName: 'Google Calendar' };
}

/**
 * Parse a date/time query string into since/until options.
 * Supports natural patterns like "today", "this week", "next week", "tomorrow",
 * or ISO date ranges like "2026-04-15 to 2026-04-20".
 */
function parseDateQuery(query) {
  if (!query) return {};

  const lower = query.toLowerCase().trim();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (lower === 'today') {
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return { since: today.toISOString(), until: tomorrow.toISOString() };
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    return { since: tomorrow.toISOString(), until: dayAfter.toISOString() };
  }

  if (lower === 'this week') {
    const dayOfWeek = today.getDay();
    const monday = new Date(today.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 24 * 60 * 60 * 1000);
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { since: monday.toISOString(), until: nextMonday.toISOString() };
  }

  if (lower === 'next week') {
    const dayOfWeek = today.getDay();
    const monday = new Date(today.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 24 * 60 * 60 * 1000);
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const mondayAfter = new Date(nextMonday.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { since: nextMonday.toISOString(), until: mondayAfter.toISOString() };
  }

  // Try ISO range: "2026-04-15 to 2026-04-20" or "2026-04-15/2026-04-20"
  const rangeMatch = lower.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|\/)\s*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return { since: new Date(rangeMatch[1]).toISOString(), until: new Date(rangeMatch[2]).toISOString() };
  }

  // Single date
  const singleMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
  if (singleMatch) {
    const date = new Date(singleMatch[1]);
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return { since: date.toISOString(), until: nextDay.toISOString() };
  }

  // Return as text query for search filtering
  return { query: query };
}

/**
 * Capture a newly created or updated event to memory.
 */
async function captureCalendarEvent(brandId, providerName, content, sourceRef, direction) {
  try {
    await captureMessage({
      brand_id: brandId,
      channel: providerName === 'Outlook' ? 'outlook_calendar' : 'google_calendar',
      direction: direction || 'outbound',
      content,
      source_ref: sourceRef,
      access_level: 'private',
      memory_type: 'calendar',
    });
  } catch (err) {
    console.error('[CalendarTool] Failed to capture event:', err.message);
  }
}

module.exports = {
  name: 'calendar_manage',
  description: 'Read, create, update, or cancel calendar events across Google Calendar and Outlook. Use for scheduling, viewing upcoming events, or managing meetings.',
  tier: 'direct',
  costTier: 'medium',
  parameters: {
    action: { type: 'string', required: true, description: 'list, create, update, or cancel' },
    query: { type: 'string', required: false, description: 'Search query or date range (e.g. "today", "this week", "2026-04-15 to 2026-04-20")' },
    event_id: { type: 'string', required: false, description: 'Event ID for update or cancel actions' },
    title: { type: 'string', required: false, description: 'Event title for create/update' },
    start: { type: 'string', required: false, description: 'Start time ISO string (e.g. 2026-04-16T10:00:00)' },
    end: { type: 'string', required: false, description: 'End time ISO string (e.g. 2026-04-16T10:30:00)' },
    attendees: { type: 'string', required: false, description: 'Comma-separated email addresses' },
    description: { type: 'string', required: false, description: 'Event description' },
    location: { type: 'string', required: false, description: 'Event location' },
    provider: { type: 'string', required: false, description: 'google or outlook (default: google)' },
  },

  async execute(config, context) {
    const action = (config.action || '').toLowerCase();
    const brandId = context.brandId || 'ikawn';

    const resolved = await resolveProvider(config.provider, brandId);
    if (resolved.error) {
      return { success: false, data: null, summary: resolved.error };
    }

    const { connector, credentials, providerName } = resolved;

    try {
      switch (action) {
        case 'list': {
          const dateOpts = parseDateQuery(config.query);
          const events = await connector.listEvents(credentials, {
            since: dateOpts.since,
            until: dateOpts.until,
            query: dateOpts.query,
            maxResults: 50,
          });

          if (events.length === 0) {
            return { success: true, data: [], summary: `No events found on ${providerName}.` };
          }

          const formatted = events.map(e => connector.formatEvent(e)).join('\n\n---\n\n');
          return {
            success: true,
            data: events.map(e => ({
              id: e.id,
              title: e.summary || e.subject || 'No title',
              start: e.start?.dateTime || e.start?.date || '',
              end: e.end?.dateTime || e.end?.date || '',
            })),
            summary: `Found ${events.length} event(s) on ${providerName}:\n\n${formatted}`,
          };
        }

        case 'create': {
          if (!config.title || !config.start || !config.end) {
            return {
              success: false,
              data: null,
              summary: 'Missing required fields: title, start, and end are required to create an event.',
            };
          }

          const created = await connector.createEvent(credentials, {
            title: config.title,
            start: config.start,
            end: config.end,
            attendees: config.attendees,
            description: config.description,
            location: config.location,
          });

          const content = connector.formatEvent(created);
          const eventId = created.id;
          const sourceRef = providerName === 'Outlook'
            ? `outlook-cal-${eventId}`
            : `gcal-${eventId}`;

          await captureCalendarEvent(brandId, providerName, content, sourceRef, 'outbound');

          return {
            success: true,
            data: { id: eventId, title: config.title, start: config.start, end: config.end },
            summary: `Event "${config.title}" created on ${providerName} (${config.start} to ${config.end}).`,
          };
        }

        case 'update': {
          if (!config.event_id) {
            return { success: false, data: null, summary: 'Missing required field: event_id is required for update.' };
          }

          const updated = await connector.updateEvent(credentials, config.event_id, {
            title: config.title,
            start: config.start,
            end: config.end,
            attendees: config.attendees,
            description: config.description,
            location: config.location,
          });

          const updatedTitle = config.title || updated.summary || updated.subject || 'Event';
          return {
            success: true,
            data: { id: config.event_id, title: updatedTitle },
            summary: `Event "${updatedTitle}" updated on ${providerName}.`,
          };
        }

        case 'cancel': {
          if (!config.event_id) {
            return { success: false, data: null, summary: 'Missing required field: event_id is required for cancel.' };
          }

          await connector.cancelEvent(credentials, config.event_id);

          return {
            success: true,
            data: { id: config.event_id, cancelled: true },
            summary: `Event ${config.event_id} cancelled on ${providerName}.`,
          };
        }

        default:
          return {
            success: false,
            data: null,
            summary: `Unknown action: "${action}". Use list, create, update, or cancel.`,
          };
      }
    } catch (err) {
      console.error(`[CalendarTool] ${action} failed for brand=${brandId}, provider=${providerName}:`, err.message);
      return { success: false, data: null, summary: `Calendar ${action} failed: ${err.message}` };
    }
  },
};
