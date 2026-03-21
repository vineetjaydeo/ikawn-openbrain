// @ts-check
'use strict';

const { pool } = require('../db');
const { captureEvent } = require('./capture');
const { INSTANCE_NAME } = require('./ruhi-assets');

/**
 * Action types that ALWAYS require human approval regardless of confidence.
 */
const ALWAYS_HUMAN_ACTIONS = ['run_campaign', 'update_shopify'];

/**
 * Default confidence thresholds (overridden per-brand from brand_budgets).
 */
const DEFAULT_THRESHOLDS = {
  auto_approve_above: 0.8,
  human_required_below: 0.6,
};

/**
 * Default expiry windows by action type (hours).
 */
const EXPIRY_HOURS = {
  post_instagram: 24,
  generate_content: 48,
  schedule_post: 24,
  run_campaign: 72,
  update_shopify: 48,
  send_message: 4,
  default: 24,
};

/**
 * Look up estimated cost from cost_catalog.
 * @param {string} actionType
 * @param {string} [subType]
 * @returns {Promise<number>}
 */
async function estimateCost(actionType, subType) {
  const { rows } = await pool.query(`
    SELECT cost_credits FROM cost_catalog
    WHERE action_type = $1
      AND ($2::text IS NULL OR sub_type = $2)
      AND effective_until IS NULL
    ORDER BY effective_from DESC
    LIMIT 1
  `, [actionType, subType || null]);

  return rows.length > 0 ? rows[0].cost_credits : 0;
}

/**
 * Atomically reserve budget. Returns success + warning status.
 * @param {string} brandId
 * @param {number} cost
 * @returns {Promise<{ success: boolean, reason?: string, warnTriggered?: boolean, percentUsed?: number }>}
 */
async function reserveBudget(brandId, cost) {
  // If cost is 0, always succeed (free actions like posting)
  if (cost === 0) return { success: true, warnTriggered: false };

  const { rows } = await pool.query(`
    UPDATE brand_budgets
    SET spent_monthly_credits = spent_monthly_credits + $1,
        updated_at = NOW()
    WHERE brand_id = $2
      AND spent_monthly_credits + $1 <= budget_monthly_credits
      AND status = 'active'
    RETURNING *,
      ROUND((spent_monthly_credits::float / NULLIF(budget_monthly_credits, 0)) * 100) AS percent_used
  `, [cost, brandId]);

  if (rows.length === 0) {
    // Check if brand has a budget at all
    const { rows: exists } = await pool.query(
      'SELECT status, spent_monthly_credits, budget_monthly_credits FROM brand_budgets WHERE brand_id = $1',
      [brandId]
    );
    if (exists.length === 0) {
      return { success: false, reason: 'No budget configured for this brand' };
    }
    if (exists[0].status !== 'active') {
      return { success: false, reason: `Budget is ${exists[0].status}` };
    }
    return { success: false, reason: `Insufficient credits (${exists[0].spent_monthly_credits}/${exists[0].budget_monthly_credits} spent, need ${cost})` };
  }

  const budget = rows[0];
  const percentUsed = parseInt(budget.percent_used) || 0;

  return {
    success: true,
    warnTriggered: percentUsed >= budget.warn_at_percent,
    percentUsed,
  };
}

/**
 * Refund budget reservation.
 * @param {string} brandId
 * @param {number} credits
 */
async function refundBudget(brandId, credits) {
  if (credits <= 0) return;
  await pool.query(`
    UPDATE brand_budgets
    SET spent_monthly_credits = GREATEST(spent_monthly_credits - $1, 0),
        updated_at = NOW()
    WHERE brand_id = $2
  `, [credits, brandId]);
}

/**
 * Get brand-specific thresholds, falling back to defaults.
 * @param {string} brandId
 * @returns {Promise<{ auto_approve_above: number, human_required_below: number }>}
 */
async function getBrandThresholds(brandId) {
  const { rows } = await pool.query(
    'SELECT auto_approve_above, human_required_below FROM brand_budgets WHERE brand_id = $1',
    [brandId]
  );
  if (rows.length === 0) return DEFAULT_THRESHOLDS;
  return {
    auto_approve_above: rows[0].auto_approve_above || DEFAULT_THRESHOLDS.auto_approve_above,
    human_required_below: rows[0].human_required_below || DEFAULT_THRESHOLDS.human_required_below,
  };
}

/**
 * Central governance gate. Every autonomous action flows through here.
 * Checks budget → confidence → approval. Inserts into action_queue.
 *
 * @param {Object} params
 * @param {string} params.brandId
 * @param {string} [params.userId]
 * @param {string} params.actionType
 * @param {string} [params.subType]
 * @param {Object} params.payload
 * @param {number} params.confidence
 * @param {string} params.reasoning
 * @param {string[]} [params.memoriesUsed]
 * @returns {Promise<{ actionQueueId: string, result: string, reason: string }>}
 */
async function governAction(params) {
  const {
    brandId, userId, actionType, subType,
    payload, confidence, reasoning, memoriesUsed = []
  } = params;

  // 1. Estimate cost from catalog
  const estimatedCost = await estimateCost(actionType, subType);

  // 2. Calculate expiry
  const expiryHours = EXPIRY_HOURS[actionType] || EXPIRY_HOURS.default;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // 3. Budget check — atomic reservation
  const budgetResult = await reserveBudget(brandId, estimatedCost);

  if (!budgetResult.success) {
    // Budget blocked — insert record but don't reserve
    const { rows: [action] } = await pool.query(`
      INSERT INTO action_queue
        (brand_id, user_id, action_type, sub_type, payload, estimated_cost_credits,
         confidence, reasoning, memories_used, governance_result, governance_reason, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'budget_blocked', $10, $11)
      RETURNING id
    `, [brandId, userId, actionType, subType, JSON.stringify(payload), estimatedCost,
        confidence, reasoning, memoriesUsed, budgetResult.reason, expiresAt]);

    // Signal the budget exhaustion
    await captureEvent({
      brand_id: brandId,
      user_id: userId,
      event_type: 'signal',
      payload: { type: 'budget_blocked', action_type: actionType, estimated_cost: estimatedCost }
    });

    return { actionQueueId: action.id, result: 'budget_blocked', reason: budgetResult.reason };
  }

  // 4. Budget warning check
  if (budgetResult.warnTriggered) {
    await captureEvent({
      brand_id: brandId,
      event_type: 'signal',
      payload: {
        type: 'budget_warning',
        percent_used: budgetResult.percentUsed,
        message: `Brand ${brandId} has used ${budgetResult.percentUsed}% of monthly budget`
      }
    });
  }

  // 5. Confidence + Approval check
  const thresholds = await getBrandThresholds(brandId);
  let governanceResult;
  let governanceReason;

  if (ALWAYS_HUMAN_ACTIONS.includes(actionType)) {
    governanceResult = 'awaiting_human';
    governanceReason = `Action type "${actionType}" always requires human approval`;
  } else if (confidence >= thresholds.auto_approve_above) {
    governanceResult = 'auto_approved';
    governanceReason = `Confidence ${confidence} >= auto-approve threshold ${thresholds.auto_approve_above}`;
  } else if (confidence < thresholds.human_required_below) {
    governanceResult = 'awaiting_human';
    governanceReason = `Confidence ${confidence} < human-required threshold ${thresholds.human_required_below}`;
  } else {
    // Between thresholds — auto approve with delay
    governanceResult = 'auto_approved';
    governanceReason = `Confidence ${confidence} in delay zone (${thresholds.human_required_below}-${thresholds.auto_approve_above}). Auto-approved with override window.`;
  }

  // 6. Insert into action_queue
  const { rows: [action] } = await pool.query(`
    INSERT INTO action_queue
      (brand_id, user_id, action_type, sub_type, payload, estimated_cost_credits,
       confidence, reasoning, memories_used, governance_result, governance_reason, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [brandId, userId, actionType, subType, JSON.stringify(payload), estimatedCost,
      confidence, reasoning, memoriesUsed, governanceResult, governanceReason, expiresAt]);

  console.log(`[Governance] ${governanceResult}: ${actionType} for ${brandId} (confidence: ${confidence}, cost: ${estimatedCost})`);

  return { actionQueueId: action.id, result: governanceResult, reason: governanceReason };
}

/**
 * Execute an approved action. Called after auto_approved or human approved.
 *
 * @param {string} actionQueueId
 * @param {Function} orchestrateHandler - The actual function to execute
 * @returns {Promise<{ success: boolean, outcome?: Object }>}
 */
async function executeAction(actionQueueId, orchestrateHandler) {
  const { rows: [action] } = await pool.query(
    'SELECT * FROM action_queue WHERE id = $1',
    [actionQueueId]
  );

  if (!action) throw new Error(`Action ${actionQueueId} not found`);

  if (!['auto_approved', 'approved'].includes(action.governance_result)) {
    throw new Error(`Action ${actionQueueId} is ${action.governance_result}, cannot execute`);
  }

  try {
    // Execute the actual action
    const outcome = await orchestrateHandler(action);

    // Mark executed
    await pool.query(`
      UPDATE action_queue SET executed_at = NOW() WHERE id = $1
    `, [actionQueueId]);

    // Log to action_log
    const actualCost = outcome.actualCost || action.estimated_cost_credits;
    await pool.query(`
      INSERT INTO action_log
        (action_queue_id, brand_id, user_id, action_type, actual_cost_credits, cost_breakdown, outcome_status, outcome_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [actionQueueId, action.brand_id, action.user_id, action.action_type,
        actualCost, JSON.stringify(outcome.costBreakdown || {}),
        'success', JSON.stringify(outcome.details || {})]);

    // Adjust budget if actual cost differs from estimated
    const diff = actualCost - action.estimated_cost_credits;
    if (diff !== 0) {
      if (diff > 0) {
        await pool.query(`
          UPDATE brand_budgets SET spent_monthly_credits = spent_monthly_credits + $1, updated_at = NOW()
          WHERE brand_id = $2
        `, [diff, action.brand_id]);
      } else {
        await refundBudget(action.brand_id, Math.abs(diff));
      }
    }

    console.log(`[Governance] Executed: ${action.action_type} (${actionQueueId}), cost: ${actualCost} credits`);
    return { success: true, outcome };

  } catch (err) {
    // Mark failed
    await pool.query(`
      UPDATE action_queue SET governance_result = 'failed', governance_reason = $2 WHERE id = $1
    `, [actionQueueId, err.message]);

    // Refund budget
    await refundBudget(action.brand_id, action.estimated_cost_credits);

    // Log failure for learning
    await captureEvent({
      brand_id: action.brand_id,
      user_id: action.user_id,
      event_type: 'signal',
      payload: { type: 'action_failed', action_id: actionQueueId, error: err.message, action_type: action.action_type }
    });

    console.error(`[Governance] Failed: ${action.action_type} (${actionQueueId}):`, err.message);
    return { success: false };
  }
}

/**
 * Human reviews a pending action.
 *
 * @param {Object} params
 * @param {string} params.actionQueueId
 * @param {'approved' | 'rejected' | 'revision_requested'} params.decision
 * @param {string} params.reviewedBy
 * @param {string} [params.feedback]
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function reviewAction(params) {
  const { actionQueueId, decision, reviewedBy, feedback } = params;

  const { rows: [action] } = await pool.query(
    'SELECT * FROM action_queue WHERE id = $1',
    [actionQueueId]
  );

  if (!action) return { success: false, message: 'Action not found' };
  if (action.governance_result !== 'awaiting_human') {
    return { success: false, message: `Action is ${action.governance_result}, not awaiting review` };
  }

  if (decision === 'approved') {
    await pool.query(`
      UPDATE action_queue
      SET governance_result = 'approved', reviewed_by = $2, reviewed_at = NOW(), feedback = $3
      WHERE id = $1
    `, [actionQueueId, reviewedBy, feedback || null]);

    console.log(`[Governance] Approved by ${reviewedBy}: ${action.action_type} (${actionQueueId})`);
    return { success: true, message: 'Approved. Ready for execution.' };
  }

  if (decision === 'rejected') {
    // Refund budget
    await refundBudget(action.brand_id, action.estimated_cost_credits);

    // Update queue
    await pool.query(`
      UPDATE action_queue
      SET governance_result = 'rejected', reviewed_by = $2, reviewed_at = NOW(), feedback = $3
      WHERE id = $1
    `, [actionQueueId, reviewedBy, feedback || null]);

    // Log as learning signal — this is HIGH-VALUE training data
    await captureEvent({
      brand_id: action.brand_id,
      user_id: action.user_id,
      event_type: 'manual_override',
      payload: {
        type: 'action_rejected',
        action_id: actionQueueId,
        action_type: action.action_type,
        original_reasoning: action.reasoning,
        rejection_feedback: feedback,
        confidence_at_proposal: action.confidence,
      }
    });

    console.log(`[Governance] Rejected by ${reviewedBy}: ${action.action_type} (${actionQueueId})`);
    return { success: true, message: `Rejected. Budget refunded. ${INSTANCE_NAME} will learn from this.` };
  }

  if (decision === 'revision_requested') {
    // Refund budget (new action will reserve again)
    await refundBudget(action.brand_id, action.estimated_cost_credits);

    await pool.query(`
      UPDATE action_queue
      SET governance_result = 'revision_requested', reviewed_by = $2, reviewed_at = NOW(), feedback = $3
      WHERE id = $1
    `, [actionQueueId, reviewedBy, feedback || null]);

    console.log(`[Governance] Revision requested by ${reviewedBy}: ${action.action_type} (${actionQueueId})`);
    return { success: true, message: `Revision requested. ${INSTANCE_NAME} will revise and resubmit.` };
  }

  return { success: false, message: `Unknown decision: ${decision}` };
}

/**
 * Reset monthly budgets. Run daily.
 */
async function resetExpiredBudgets() {
  const { rowCount } = await pool.query(`
    UPDATE brand_budgets
    SET spent_monthly_credits = 0,
        current_period_start = date_trunc('month', NOW()),
        status = 'active',
        updated_at = NOW()
    WHERE current_period_start + INTERVAL '1 month' <= NOW()
  `);
  if (rowCount > 0) console.log(`[Governance] Reset ${rowCount} brand budgets`);
}

/**
 * Expire stale actions and refund budgets. Run daily.
 */
async function expireStaleActions() {
  const { rows } = await pool.query(`
    SELECT id, brand_id, estimated_cost_credits
    FROM action_queue
    WHERE governance_result IN ('pending', 'awaiting_human', 'auto_approved')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  `);

  for (const action of rows) {
    await pool.query(`
      UPDATE action_queue SET governance_result = 'expired' WHERE id = $1
    `, [action.id]);
    await refundBudget(action.brand_id, action.estimated_cost_credits);
    await captureEvent({
      brand_id: action.brand_id,
      event_type: 'signal',
      payload: { type: 'action_expired', action_id: action.id }
    });
  }

  if (rows.length > 0) console.log(`[Governance] Expired ${rows.length} stale actions`);
}

module.exports = {
  governAction,
  executeAction,
  reviewAction,
  reserveBudget,
  refundBudget,
  resetExpiredBudgets,
  expireStaleActions,
  estimateCost,
  ALWAYS_HUMAN_ACTIONS,
};
