// src/utils/schedule.js
'use strict';

const { Cron } = require('croner');

/**
 * Calculate the next run time for a task based on its schedule type.
 * @param {object} task - scheduled_tasks row
 * @returns {Date|null} next run time, or null if task should not run again
 */
function calculateNextRun(task) {
  switch (task.schedule_type) {
    case 'cron': {
      if (!task.cron_expression) return null;
      const job = new Cron(task.cron_expression, { timezone: task.timezone || 'Asia/Calcutta' });
      const next = job.nextRun();
      return next || null;
    }
    case 'interval': {
      if (!task.interval_minutes) return null;
      const base = task.last_run_at ? new Date(task.last_run_at) : new Date();
      return new Date(base.getTime() + task.interval_minutes * 60 * 1000);
    }
    case 'once': {
      if (task.run_count > 0) return null;
      return task.run_after ? new Date(task.run_after) : new Date();
    }
    case 'trigger': {
      return null;
    }
    default:
      return null;
  }
}

/**
 * Check if current time is within the task's active window.
 * @param {object} task - scheduled_tasks row
 * @returns {boolean}
 */
function isInActiveWindow(task) {
  if (!task.active_window_start || !task.active_window_end) return true;

  const tz = task.timezone || 'Asia/Calcutta';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const nowMinutes = hour * 60 + minute;

  const [startH, startM] = task.active_window_start.split(':').map(Number);
  const [endH, endM] = task.active_window_end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

module.exports = { calculateNextRun, isInActiveWindow };
