'use strict';

/**
 * Result Notifier (Task 3.5)
 *
 * Near-instant notification when sub-agents complete.
 * Uses polling (not LISTEN/NOTIFY — Supabase pooler doesn't support it).
 */

let _pool = null;
function getPool() {
  if (!_pool) _pool = require('../db').pool;
  return _pool;
}
function _setPool(p) { _pool = p; }

const CHILD_QUERY = `
  SELECT st.id, st.last_status, tr.result, tr.error, tr.status AS run_status
  FROM scheduled_tasks st
  LEFT JOIN task_runs tr ON tr.task_id = st.id
  WHERE st.parent_session = $1
    AND st.task_type = 'sub_agent'
  ORDER BY tr.started_at DESC
`;

/**
 * Create a notifier that polls for child task completion.
 *
 * @param {string} parentSessionId - UUID of the parent session
 * @param {Object} [options]
 * @param {number} [options.pollIntervalMs=2000]  - Initial poll interval
 * @param {number} [options.maxWaitMs=300000]      - Max wait before timeout (5 min)
 * @param {number} [options.backoffCap=15000]      - Max poll interval after backoff
 * @returns {{ waitForChildren: Function, waitForAny: Function, stop: Function }}
 */
function createNotifier(parentSessionId, options = {}) {
  const {
    pollIntervalMs = 2000,
    maxWaitMs = 300000,
    backoffCap = 15000,
  } = options;

  let stopped = false;
  let currentInterval = pollIntervalMs;
  let timer = null;
  let externalStopResolve = null; // single resolver for external stop()

  function _clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function stop() {
    stopped = true;
    _clearTimer();
    // If a waiter is pending, resolve it with stopped flag
    if (externalStopResolve) {
      externalStopResolve();
      externalStopResolve = null;
    }
  }

  async function pollChildren() {
    const pool = getPool();
    const { rows } = await pool.query(CHILD_QUERY, [parentSessionId]);
    return rows;
  }

  function isTerminal(row) {
    return row.run_status === 'completed' || row.run_status === 'failed'
      || row.last_status === 'completed' || row.last_status === 'failed';
  }

  function formatResult(row) {
    return {
      taskId: row.id,
      status: row.run_status || row.last_status,
      result: row.result || null,
      error: row.error || null,
    };
  }

  /**
   * Wait until ALL children have completed or failed.
   * Resolves with array of results. Includes timeout flag if maxWaitMs exceeded.
   */
  function waitForChildren() {
    if (stopped) {
      return Promise.resolve({ results: [], timedOut: false, stopped: true });
    }

    return new Promise((resolve) => {
      const deadline = Date.now() + maxWaitMs;
      let lastSeen = 0;
      let resolved = false;

      function done(value) {
        if (resolved) return;
        resolved = true;
        externalStopResolve = null;
        resolve(value);
      }

      // Register external stop handler
      externalStopResolve = () => done({ results: [], timedOut: false, stopped: true });

      async function tick() {
        if (resolved) return;
        if (stopped) {
          done({ results: [], timedOut: false, stopped: true });
          return;
        }

        try {
          const rows = await pollChildren();

          if (resolved || stopped) return;

          if (rows.length > 0) {
            const allTerminal = rows.every(isTerminal);
            if (allTerminal) {
              stopped = true;
              _clearTimer();
              done({ results: rows.map(formatResult), timedOut: false, stopped: false });
              return;
            }
          }

          // Check progress for backoff reset
          const terminalCount = rows.filter(isTerminal).length;
          if (terminalCount > lastSeen) {
            currentInterval = pollIntervalMs;
            lastSeen = terminalCount;
          } else {
            currentInterval = Math.min(currentInterval * 1.5, backoffCap);
          }
        } catch (err) {
          currentInterval = Math.min(currentInterval * 1.5, backoffCap);
        }

        if (resolved || stopped) return;

        // Timeout check
        if (Date.now() >= deadline) {
          stopped = true;
          _clearTimer();
          try {
            const rows = await pollChildren();
            done({ results: rows.map(formatResult), timedOut: true, stopped: false });
          } catch {
            done({ results: [], timedOut: true, stopped: false });
          }
          return;
        }

        timer = setTimeout(tick, currentInterval);
      }

      tick();
    });
  }

  /**
   * Wait until ANY child has completed or failed.
   * Resolves with the first completed result.
   */
  function waitForAny() {
    if (stopped) {
      return Promise.resolve({ result: null, timedOut: false, stopped: true });
    }

    return new Promise((resolve) => {
      const deadline = Date.now() + maxWaitMs;
      let resolved = false;

      function done(value) {
        if (resolved) return;
        resolved = true;
        externalStopResolve = null;
        resolve(value);
      }

      externalStopResolve = () => done({ result: null, timedOut: false, stopped: true });

      async function tick() {
        if (resolved) return;
        if (stopped) {
          done({ result: null, timedOut: false, stopped: true });
          return;
        }

        try {
          const rows = await pollChildren();

          if (resolved || stopped) return;

          const terminal = rows.find(isTerminal);
          if (terminal) {
            stopped = true;
            _clearTimer();
            done({ result: formatResult(terminal), timedOut: false, stopped: false });
            return;
          }

          currentInterval = Math.min(currentInterval * 1.5, backoffCap);
        } catch {
          currentInterval = Math.min(currentInterval * 1.5, backoffCap);
        }

        if (resolved || stopped) return;

        if (Date.now() >= deadline) {
          stopped = true;
          _clearTimer();
          done({ result: null, timedOut: true, stopped: false });
          return;
        }

        timer = setTimeout(tick, currentInterval);
      }

      tick();
    });
  }

  return { waitForChildren, waitForAny, stop };
}

module.exports = {
  createNotifier,
  _setPool,
};
