const { google } = require('googleapis');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

async function getCalendarClient() {
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

async function syncCalendar() {
  const calendar = await getCalendarClient();
  if (!calendar) {
    console.warn('GOOGLE_CALENDAR_CREDENTIALS not set, skipping calendar sync');
    return { total: 0 };
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const now = new Date();
  const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let added = 0;

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: past7.toISOString(),
      timeMax: future30.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = res.data.items || [];

    for (const event of events) {
      const sourceRef = `gcal-${event.id}`;
      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [sourceRef]);
      if (existing.rows.length > 0) continue;

      const attendees = (event.attendees || []).map(a => a.email).join(', ');
      const isTeamEvent = (event.attendees || []).length > 1;

      const content = [
        `[Calendar] ${event.summary || 'No title'}`,
        `When: ${event.start?.dateTime || event.start?.date || ''} - ${event.end?.dateTime || event.end?.date || ''}`,
        attendees ? `Attendees: ${attendees}` : '',
        event.description ? `Description: ${event.description.slice(0, 500)}` : '',
        event.hangoutLink ? `Meeting link: ${event.hangoutLink}` : '',
      ].filter(Boolean).join('\n');

      const embedding = await getEmbedding(content);
      await pool.query(
        `INSERT INTO memories (content, embedding, source, memory_type, source_ref, source_url, author, access_level)
         VALUES ($1, $2, 'calendar', 'calendar_event', $3, $4, 'vineet', $5)`,
        [
          content,
          embedding,
          sourceRef,
          event.htmlLink || null,
          isTeamEvent ? 'management' : 'private',
        ]
      );
      added++;
    }

    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('calendar', 'success', $1)`,
      [added]
    );

    console.log(`Calendar sync complete: ${added} new events`);
    return { total: added };
  } catch (err) {
    console.error('Calendar sync error:', err.message);
    await pool.query(
      `INSERT INTO ob_ingestion_log (source, status, error_message) VALUES ('calendar', 'error', $1)`,
      [err.message]
    );
    return { total: 0, error: err.message };
  }
}

module.exports = { syncCalendar };
