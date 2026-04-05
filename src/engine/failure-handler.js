'use strict';

/**
 * Failure Handler (Task 3.6)
 *
 * Centralized failure handling for Lucy v3 orchestration.
 * Returns DECISION objects — does NOT execute them (no DB writes, no kills).
 * Pure functions, no side effects, easy to test.
 */

const STUCK_TIMEOUT_MINUTES = 10;

/**
 * Token budget exceeded mid-loop — return partial results.
 *
 * @param {Object} loopResult - The reasoning loop result (may have partial response)
 * @param {Object} session - Session row from DB
 * @returns {Object} Decision: partial_result
 */
function handleTokenBudgetExceeded(loopResult, session) {
  return {
    action: 'partial_result',
    truncated: true,
    data: {
      response: loopResult?.response || '',
      partialResults: true,
    },
  };
}

/**
 * Dollar cap exceeded — stop the session.
 *
 * @param {Object} session - Session row from DB
 * @param {number} spent - Total USD spent
 * @param {number} cap - Dollar cap
 * @returns {Object} Decision: stop
 */
function handleDollarCapExceeded(session, spent, cap) {
  return {
    action: 'stop',
    budgetExceeded: true,
    data: {
      spent,
      cap,
      breakdown: 'see cost_events',
    },
  };
}

/**
 * Tool execution failed after retries — decide based on tool category.
 *
 * @param {Object} envelope - Result envelope from tool-executor (has .error, .suspend, .hotl)
 * @param {Object} tool - Tool definition (has .category)
 * @param {Object} session - Session row from DB
 * @returns {Object} Decision varies by category
 */
function handleToolFailure(envelope, tool, session) {
  const category = tool?.category;
  const error = envelope?.error || 'Unknown tool error';

  if (category === 'create' || category === 'execute') {
    return { action: 'suspend', error, suspend: true };
  }

  if (category === 'ship') {
    return { action: 'hotl_required', error, hotl: true };
  }

  // observe, analyze, communicate — keep going
  return { action: 'continue', error };
}

/**
 * Task has been running too long with no progress.
 *
 * @param {Object} taskRun - task_runs row from DB
 * @param {Object} session - Session row from DB
 * @returns {Object} Decision: kill
 */
function handleTaskTimeout(taskRun, session) {
  return {
    action: 'kill',
    error: `Task stuck for ${STUCK_TIMEOUT_MINUTES}+ minutes with no progress`,
    lastCheckpoint: session?.working_memory || null,
  };
}

/**
 * Coordinator's own budget exceeded — cascade kill all children.
 *
 * @param {Object} session - Coordinator session row
 * @param {Object[]} children - Array of child status objects (must have .id)
 * @returns {Object} Decision: cascade_kill with alert
 */
function handleCoordinatorCapExceeded(session, children) {
  return {
    action: 'cascade_kill',
    error: 'Coordinator budget exceeded',
    childrenToKill: (children || []).map(c => c.id),
    alert: true,
  };
}

/**
 * Check if majority of child sub-agents have failed.
 *
 * @param {string} parentSessionId - UUID of the coordinator session
 * @param {Object[]} childStatuses - Array from getChildStatus() (has .last_status or .run_status)
 * @returns {Object} Decision: hotl_escalate or continue
 */
function handleMajorityChildFailure(parentSessionId, childStatuses) {
  const statuses = childStatuses || [];
  const totalCount = statuses.length;

  if (totalCount === 0) {
    return { action: 'continue' };
  }

  const failedAgents = statuses.filter(
    c => c.last_status === 'failed' || c.run_status === 'failed'
  );
  const failedCount = failedAgents.length;

  if (failedCount > totalCount / 2) {
    return {
      action: 'hotl_escalate',
      failedCount,
      totalCount,
      failedAgents: failedAgents.map(a => a.agent_slug || a.id),
      error: 'Majority of sub-agents failed',
    };
  }

  return { action: 'continue' };
}

/**
 * Build an HTML-formatted Telegram alert message for critical failures.
 *
 * @param {string} failureType - e.g. 'coordinator_cap', 'majority_failure'
 * @param {Object} session - Session row
 * @param {Object} details - Additional context (spent, cap, failedAgents, etc.)
 * @returns {string} HTML-formatted message
 */
function buildAlertMessage(failureType, session, details) {
  const sessionId = session?.id || 'unknown';
  const agent = session?.agent_slug || 'unknown';
  const parts = [];

  parts.push(`<b>ALERT: ${failureType.replace(/_/g, ' ').toUpperCase()}</b>`);
  parts.push(`Session: <code>${sessionId}</code>`);
  parts.push(`Agent: ${agent}`);

  if (details?.spent != null) {
    parts.push(`Spent: $${Number(details.spent).toFixed(4)}`);
  }
  if (details?.cap != null) {
    parts.push(`Cap: $${Number(details.cap).toFixed(4)}`);
  }
  if (details?.failedAgents && details.failedAgents.length > 0) {
    parts.push(`Failed agents: ${details.failedAgents.join(', ')}`);
  }
  if (details?.failedCount != null && details?.totalCount != null) {
    parts.push(`Failed: ${details.failedCount}/${details.totalCount}`);
  }
  if (details?.error) {
    parts.push(`Error: ${details.error}`);
  }

  return parts.join('\n');
}

module.exports = {
  handleTokenBudgetExceeded,
  handleDollarCapExceeded,
  handleToolFailure,
  handleTaskTimeout,
  handleCoordinatorCapExceeded,
  handleMajorityChildFailure,
  buildAlertMessage,
};
