/**
 * Ring buffer of recent user actions (last ~60 s / 40 entries).
 *
 * Populated by hooks at user-facing action boundaries: prompt submit,
 * cancel, provider switch, skill toggle, design export, connection test.
 * Snapshots are included in bug reports so maintainers see the 60 s
 * leading up to a crash without having to ask the user to reconstruct steps.
 *
 * Schema forbids prompt text, file paths, and URLs — only the action type
 * and small scalar metadata. That invariant keeps reports shareable.
 */

export interface ActionTimelineEntry {
  ts: number;
  type:
    | 'prompt.submit'
    | 'prompt.cancel'
    | 'prompt.retry'
    | 'provider.switch'
    | 'skill.toggle'
    | 'design.open'
    | 'design.export'
    | 'connection.test'
    | 'onboarding.complete';
  data?: Record<string, unknown>;
}

const CAPACITY = 40;
const WINDOW_MS = 60_000;

let buffer: ActionTimelineEntry[] = [];

export function recordAction(entry: Omit<ActionTimelineEntry, 'ts'>): void {
  buffer.push({ ts: Date.now(), ...entry });
  if (buffer.length > CAPACITY) buffer = buffer.slice(-CAPACITY);
  const cutoff = Date.now() - WINDOW_MS;
  buffer = buffer.filter((e) => e.ts >= cutoff);
}

export function snapshotTimeline(): ActionTimelineEntry[] {
  const cutoff = Date.now() - WINDOW_MS;
  return buffer.filter((e) => e.ts >= cutoff).slice();
}

export function resetTimeline(): void {
  buffer = [];
}
