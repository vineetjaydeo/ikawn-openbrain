'use strict';

const { createEnvelope, PROTECTED_TABLES } = require('./tool-interface');
const { getDomainForTool, determineOutcome, logTrustEvent } = require('./trust-ledger');
const { checkImmediateDemotion } = require('./trust-scorer');

// Permission hierarchy: auto < confirm < review
const TRUST_LEVELS = { auto: 0, confirm: 1, review: 2 };

// Dependency injection for cost logging (default: real logToolCall)
let _logToolCall = null;
function getLogToolCall() {
  if (!_logToolCall) _logToolCall = require('./cost-tracker').logToolCall;
  return _logToolCall;
}
function _setLogToolCall(fn) { _logToolCall = fn; }

// Dependency injection for trust level lookup (default: real getTrustLevel)
let _getTrustLevel = null;
function getGetTrustLevel() {
  if (!_getTrustLevel) _getTrustLevel = require('./trust-scorer').getTrustLevel;
  return _getTrustLevel;
}
function _setGetTrustLevel(fn) { _getTrustLevel = fn; }

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify a tool execution failure by error type.
 * Used to apply nuanced trust scoring penalties.
 *
 * @param {Error|{message: string}} error
 * @returns {string} One of: 'EXTERNAL', 'NEGLIGENCE', 'CONFIGURATION', 'UNKNOWN'
 */
function classifyFailure(error) {
  const msg = (error?.message || '').toLowerCase();
  if (/econnrefused|etimedout|timeout|network|socket hang up|enotfound/i.test(msg)) return 'EXTERNAL';
  if (/approval|permission|forbidden|unauthorized/i.test(msg)) return 'NEGLIGENCE';
  if (/config|not configured|missing|undefined.*key|env.*not.*set/i.test(msg)) return 'CONFIGURATION';
  return 'UNKNOWN';
}

/**
 * Central tool dispatch + retry engine.
 *
 * @param {string} toolName
 * @param {object} input
 * @param {object} context - { sessionId, brandId, userId, workingMemory, costTracker, trustLevel }
 * @param {object} registry - { lookupTool(name) }
 * @returns {Promise<object>} envelope
 */
async function executeTool(toolName, input, context, registry) {
  const trustLevel = context.trustLevel || 'auto';

  // 1. Look up tool
  const tool = registry.lookupTool(toolName);
  if (!tool) {
    return createEnvelope(false, null, `Tool "${toolName}" not found`, { tool: toolName });
  }

  // 2. Permission check — trust-score-aware
  const domain = getDomainForTool(toolName);
  const baseTier = tool.permissionTier || 'auto';
  let effectiveTier = baseTier; // start with tool's base tier

  // Consult trust scores to potentially promote or demote
  let domainTrust = null;
  try {
    if (context.brandId) {
      domainTrust = await getGetTrustLevel()(context.brandId, domain);

      // client_facing tools ALWAYS require review regardless of trust score
      if (domain === 'client_facing') {
        effectiveTier = 'review';
      } else if (domainTrust === 'auto' && baseTier === 'confirm') {
        // Trust promotion: auto trust + confirm tool → skip gate
        effectiveTier = 'auto';
      } else if (domainTrust === 'review') {
        // Trust demotion: enforce review even if tool only requires confirm
        effectiveTier = 'review';
      }
      // Otherwise: use tool's base tier (no trust override)
    }
  } catch (_) {
    // Best-effort trust lookup — fall back to tool's base tier
  }

  const effectiveToolTier = TRUST_LEVELS[effectiveTier] ?? 0;
  const contextTier = TRUST_LEVELS[trustLevel] ?? 0;

  if (effectiveToolTier > contextTier) {
    const envelope = createEnvelope(false, null, 'Insufficient permission', {
      tool: toolName,
      effectiveTier,
    });
    envelope.gated = true;
    envelope.approvalRequired = effectiveTier;
    return envelope;
  }

  // 3. Protected table check
  const inputStr = JSON.stringify(input).toLowerCase();
  for (const table of PROTECTED_TABLES) {
    if (inputStr.includes(table.toLowerCase())) {
      return createEnvelope(false, null, `Access to protected table "${table}" is forbidden`, { tool: toolName });
    }
  }

  // 4. Execute with retry (context-aware: skip backoff if fromHOTLApproval)
  const { maxRetries, backoff, timeoutMs } = tool.retryPolicy;
  const totalAttempts = maxRetries + 1;
  const skipBackoff = !!(context.fromHOTLApproval);
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const start = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timed out')), timeoutMs);
      });

      const result = await Promise.race([
        tool.execute(input, context),
        timeoutPromise,
      ]);

      const durationMs = Date.now() - start;
      const costUsd = result?.metadata?.cost_usd ?? 0;

      // 5. Log to cost_events
      if (context.sessionId) {
        try {
          await getLogToolCall()(context.sessionId, null, context.brandId, toolName, costUsd);
        } catch (_) { /* best-effort logging */ }
      }

      // 6. Return success envelope
      const successEnvelope = createEnvelope(true, result.data ?? result, null, {
        tool: toolName,
        duration_ms: durationMs,
        attempt: attempt + 1,
        truncated: result?.metadata?.truncated ?? false,
        cost_usd: costUsd,
        effectiveTier,
      });

      // 6b. Log to trust ledger (best-effort)
      try {
        const outcome = determineOutcome(successEnvelope);
        await logTrustEvent({
          brandId: context.brandId,
          domain,
          actionType: toolName,
          outcome,
          sessionId: context.sessionId,
          toolName,
          detail: 'Tool executed successfully',
        });
      } catch (_) { /* best-effort trust logging */ }

      return successEnvelope;
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - start;

      // Log failed attempt
      if (context.sessionId) {
        try {
          await getLogToolCall()(context.sessionId, null, context.brandId, toolName, 0);
        } catch (_) { /* best-effort logging */ }
      }

      // If retries remaining, wait and retry (skip backoff if HOTL-approved)
      if (attempt < totalAttempts - 1) {
        if (!skipBackoff) {
          const waitMs = backoff[attempt] ?? backoff[backoff.length - 1] ?? 1000;
          await sleep(waitMs);
        }
      }
    }
  }

  // All attempts exhausted — category-based failure handling
  const errorMsg = lastError?.message ?? 'Unknown error';
  const failureType = classifyFailure(lastError);
  const envelope = createEnvelope(false, null, errorMsg, {
    tool: toolName,
    attempt: totalAttempts,
    effectiveTier,
    failureType,
  });

  // Log failure to trust ledger + check for immediate demotion (best-effort)
  try {
    const outcome = determineOutcome(envelope);
    await logTrustEvent({
      brandId: context.brandId,
      domain,
      actionType: toolName,
      outcome,
      sessionId: context.sessionId,
      toolName,
      detail: errorMsg,
    });
    if (outcome === 'failure' && context.brandId) {
      await checkImmediateDemotion(context.brandId, domain, failureType);
    }
  } catch (_) { /* best-effort trust logging */ }

  const category = tool.category;
  if (category === 'create' || category === 'execute') {
    envelope.suspend = true;
  } else if (category === 'ship') {
    envelope.hotl = true;
  }
  // observe, analyze, communicate: plain error envelope (no extra flags)

  return envelope;
}

module.exports = { executeTool, classifyFailure, _setLogToolCall, _setGetTrustLevel };
