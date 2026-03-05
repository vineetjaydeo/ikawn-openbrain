const { syncAll: syncGitHub } = require('./connectors/github');
const { syncCalendar } = require('./connectors/gcal');

let githubInterval = null;
let calendarInterval = null;

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

  console.log('Scheduler started: GitHub every 30min, Calendar every 2hr');
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
}

module.exports = { startScheduler, triggerSync, stopScheduler };
