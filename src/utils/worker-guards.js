// @ts-check
'use strict';

/**
 * Shared worker infrastructure: cost guardrails, circuit breaker, rate limiting.
 * Every intelligence worker MUST use these guards.
 *
 * Usage:
 *   const guard = createWorkerGuard('distillation');
 *   if (!guard.canRun()) return;
 *   guard.startRun();
 *   try {
 *     // ... do work, calling guard.trackLLMCall() per call ...
 *     guard.endRun(true);
 *   } catch (err) {
 *     guard.endRun(false);
 *   }
 */

/** @type {number} */
const MAX_LLM_CALLS_PER_RUN = parseInt(process.env.WORKER_MAX_LLM_CALLS || '20', 10);
/** @type {number} */
const MAX_DAILY_COST_DOLLARS = parseFloat(process.env.WORKER_MAX_DAILY_COST || '5');
/** @type {number} */
const MAX_CONSECUTIVE_FAILURES = 3;
/** @type {number} */
const BACKOFF_BASE_MS = 1000;
/** @type {number} */
const BACKOFF_MAX_MS = 30000;

/**
 * Estimated cost per LLM call by model (input + output, rough average).
 * Used for daily cost ceiling estimation only — not billing.
 */
const COST_PER_CALL = {
  'claude-haiku-4-5-20251001': 0.002,
  'claude-sonnet-4-6': 0.015,
  'gpt-4o-mini': 0.001,
  'gpt-4o': 0.01,
};

/** @type {Map<string, { llmCallsToday: number, estimatedCostToday: number, dayStart: string, consecutiveFailures: number, disabled: boolean, isRunning: boolean, lastBackoffMs: number }>} */
const workerStates = new Map();

/**
 * @param {string} workerName
 */
function getState(workerName) {
  const today = new Date().toISOString().slice(0, 10);
  let state = workerStates.get(workerName);
  if (!state || state.dayStart !== today) {
    state = {
      llmCallsToday: 0,
      estimatedCostToday: 0,
      dayStart: today,
      consecutiveFailures: state ? state.consecutiveFailures : 0,
      disabled: state ? state.disabled : false,
      isRunning: false,
      lastBackoffMs: 0,
    };
    workerStates.set(workerName, state);
  }
  return state;
}

/**
 * Create a guard instance for a specific worker.
 * @param {string} workerName
 */
function createWorkerGuard(workerName) {
  let runCallCount = 0;

  return {
    /**
     * Check if the worker can start a new run.
     * @returns {{ allowed: boolean, reason?: string }}
     */
    canRun() {
      const state = getState(workerName);
      if (state.disabled) {
        return { allowed: false, reason: `[${workerName}] Circuit breaker open (${state.consecutiveFailures} consecutive failures). Manual re-enable required.` };
      }
      if (state.isRunning) {
        return { allowed: false, reason: `[${workerName}] Already running` };
      }
      if (state.estimatedCostToday >= MAX_DAILY_COST_DOLLARS) {
        return { allowed: false, reason: `[${workerName}] Daily cost ceiling reached ($${state.estimatedCostToday.toFixed(2)} / $${MAX_DAILY_COST_DOLLARS})` };
      }
      return { allowed: true };
    },

    /** Mark the start of a worker run */
    startRun() {
      const state = getState(workerName);
      state.isRunning = true;
      runCallCount = 0;
    },

    /**
     * Track an LLM call. Returns false if per-run cap exceeded.
     * @param {string} [model] - Model used, for cost estimation
     * @returns {boolean} true if call is allowed, false if cap hit
     */
    trackLLMCall(model) {
      const state = getState(workerName);
      runCallCount++;
      state.llmCallsToday++;
      const cost = COST_PER_CALL[model] || 0.005;
      state.estimatedCostToday += cost;

      if (runCallCount > MAX_LLM_CALLS_PER_RUN) {
        console.warn(`[${workerName}] Per-run LLM call cap (${MAX_LLM_CALLS_PER_RUN}) exceeded. Stopping run.`);
        return false;
      }
      if (state.estimatedCostToday >= MAX_DAILY_COST_DOLLARS) {
        console.warn(`[${workerName}] Daily cost ceiling reached ($${state.estimatedCostToday.toFixed(2)}). Pausing all workers.`);
        return false;
      }
      return true;
    },

    /**
     * Mark end of run. Updates circuit breaker state.
     * @param {boolean} success
     */
    endRun(success) {
      const state = getState(workerName);
      state.isRunning = false;
      if (success) {
        state.consecutiveFailures = 0;
        state.lastBackoffMs = 0;
      } else {
        state.consecutiveFailures++;
        if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          state.disabled = true;
          console.error(`[${workerName}] CIRCUIT BREAKER OPEN: ${state.consecutiveFailures} consecutive failures. Worker disabled.`);
        }
      }
    },

    /**
     * Get backoff delay for rate limit errors (429). Exponential with cap.
     * @returns {number} milliseconds to wait
     */
    getBackoffMs() {
      const state = getState(workerName);
      const backoff = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, state.consecutiveFailures),
        BACKOFF_MAX_MS
      );
      state.lastBackoffMs = backoff;
      return backoff;
    },

    /**
     * Manually re-enable a worker after circuit breaker trips.
     */
    reset() {
      const state = getState(workerName);
      state.consecutiveFailures = 0;
      state.disabled = false;
      state.isRunning = false;
      console.log(`[${workerName}] Worker guard reset`);
    },

    /** Get current state for monitoring */
    getStatus() {
      return { ...getState(workerName), runCallCount };
    },
  };
}

/**
 * Get status of all workers. For admin/monitoring endpoints.
 * @returns {Record<string, any>}
 */
function getAllWorkerStatus() {
  const status = {};
  for (const [name, state] of workerStates) {
    status[name] = { ...state };
  }
  return status;
}

module.exports = { createWorkerGuard, getAllWorkerStatus };
