const { syncAll: syncGitHub } = require('./connectors/github');
const { syncCalendar } = require('./connectors/gcal');
const { registerWebhook, startFlushTimer, stopFlushTimer } = require('./connectors/telegram');
const { pool } = require('./db');

let githubInterval = null;
let calendarInterval = null;
let retentionInterval = null;

const BASE_URL = process.env.BASE_URL || 'https://ikawn-openbrain.fly.dev';

function startScheduler() {
  console.log('Starting ingestion scheduler...');

  // GitHub sync: every 30 minutes
  githubInterval = setInterval(async () => {
    try {
      await syncGitHub();
    } catch (err) {
      console.error('Scheduled GitHub sync failed:', err.message);
    }
  }, 30 * 60 * 1000);

  // Calendar sync: every 2 hours
  calendarInterval = setInterval(async () => {
    try {
      await syncCalendar();
    } catch (err) {
      console.error('Scheduled Calendar sync failed:', err.message);
    }
  }, 2 * 60 * 60 * 1000);

  // Telegram webhook DISABLED — OpenClaw owns inbound Telegram via polling.
  // OpenBrain only sends outbound via Bot API (notify route).
  // startFlushTimer() also disabled — no inbound messages to buffer.

  // Data retention cron: daily — soft-delete expired memories
  retentionInterval = setInterval(async () => {
    try {
      const result = await pool.query(`
        UPDATE memories m SET deleted_at = NOW(), content = '[RETENTION EXPIRED]'
        FROM brands b
        WHERE m.brand_id = b.brand_id
          AND m.deleted_at IS NULL
          AND m.created_at < NOW() - INTERVAL '1 day' * b.data_retention_days
      `);
      if (result.rowCount > 0) {
        console.log(`[Retention] Expired ${result.rowCount} memories`);
      }
    } catch (err) {
      console.error('Retention cron failed:', err.message);
    }
  }, 24 * 60 * 60 * 1000);

  console.log('Scheduler started: GitHub every 30min, Calendar every 2hr, Retention daily');
}

async function triggerSync(source) {
  switch (source) {
    case 'github':
      return await syncGitHub();
    case 'calendar':
      return await syncCalendar();
    case 'all':
      const github = await syncGitHub();
      const calendar = await syncCalendar();
      return { github, calendar };
    default:
      throw new Error(`Unknown sync source: ${source}`);
  }
}

function stopScheduler() {
  if (githubInterval) clearInterval(githubInterval);
  if (calendarInterval) clearInterval(calendarInterval);
  if (retentionInterval) clearInterval(retentionInterval);
  stopFlushTimer();
}

module.exports = { startScheduler, triggerSync, stopScheduler };
