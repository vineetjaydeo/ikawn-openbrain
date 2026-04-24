const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format an ISO timestamp as a coarse relative string ("just now",
 * "5 minutes ago", "yesterday", "3 days ago"). Falls back to the local date
 * once we cross a week, where "X days ago" stops being readable.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diff < 2 * DAY) return 'yesterday';
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return `${days} days ago`;
  }
  return new Date(iso).toLocaleDateString();
}
