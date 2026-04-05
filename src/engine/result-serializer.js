'use strict';

/**
 * Result Serializer (Task 3.4)
 *
 * Distills a sub-agent's execution into a structured envelope
 * for the coordinator to consume.
 */

/**
 * Extract key findings from response text.
 * Splits by newlines, filters empty/trivial lines, returns first 10.
 */
function extractKeyFindings(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, 10);
}

/**
 * Extract absolute file paths from response text.
 * Matches patterns like /path/to/file.ext — deduplicates results.
 */
function extractFilePaths(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\/[^\s]+\.[a-z]+/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

/**
 * Serialize a reasoning loop result into a structured envelope.
 *
 * @param {Object} loopResult - Return from executeReasoningLoop
 * @param {Object} session    - Session row from DB
 * @param {Object} taskRun    - task_runs row from DB
 * @returns {Object} Structured result envelope
 */
function serializeResult(loopResult, session, taskRun) {
  const hasResponse = !!(loopResult && loopResult.response);
  const hasFatalError = !loopResult || (!loopResult.response && !loopResult.timedOut);
  const ok = hasResponse && !hasFatalError;

  const response = loopResult?.response || '';
  const truncated = response.includes('[Max iterations reached]');

  // Calculate duration from taskRun.started_at to now
  let durationMs = 0;
  if (taskRun && taskRun.started_at) {
    const startedAt = taskRun.started_at instanceof Date
      ? taskRun.started_at
      : new Date(taskRun.started_at);
    durationMs = Date.now() - startedAt.getTime();
  }

  // Determine if budget was exceeded — check for common budget-exceeded indicators
  const budgetExceeded = !!(
    loopResult?.gated ||
    (response && response.includes('[Budget exceeded]'))
  );

  return {
    ok,
    data: {
      response,
      findings: extractKeyFindings(response),
      filesModified: extractFilePaths(response),
    },
    error: ok ? null : (loopResult?.error || loopResult?.response || 'Unknown error'),
    metadata: {
      agentType: taskRun?.agent_slug || 'unknown',
      totalTokens: (loopResult?.totalTokensIn || 0) + (loopResult?.totalTokensOut || 0),
      totalCostUsd: loopResult?.totalCostUsd || 0,
      toolCallsMade: loopResult?.toolCallCount || 0,
      turnCount: loopResult?.turnCount || 0,
      durationMs,
      truncated,
      budgetExceeded,
      timedOut: !!(loopResult?.timedOut),
    },
  };
}

module.exports = {
  serializeResult,
  extractKeyFindings,
  extractFilePaths,
};
