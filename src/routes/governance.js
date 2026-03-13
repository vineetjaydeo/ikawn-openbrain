// @ts-check
'use strict';

const { Router } = require('express');
const { pool } = require('../db');
const { reviewAction } = require('../utils/governance');

const router = Router();

// Review an action — POST /api/actions/review
router.post('/api/actions/review', async (req, res) => {
  try {
    const { action_id, decision, feedback } = req.body;
    if (!action_id || !decision) {
      return res.status(400).json({ error: 'action_id and decision are required' });
    }
    if (!['approved', 'rejected', 'revision_requested'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be: approved, rejected, or revision_requested' });
    }

    const result = await reviewAction({
      actionQueueId: action_id,
      decision,
      reviewedBy: req.userId || req.brandId || 'api',
      feedback,
    });

    res.json(result);
  } catch (err) {
    console.error('[GovernanceAPI] Review error:', err.message);
    res.status(500).json({ error: 'Review failed' });
  }
});

// Pending actions — GET /api/actions/pending
router.get('/api/actions/pending', async (req, res) => {
  try {
    const brandId = req.query.brand_id || req.brandId;
    const { rows } = await pool.query(`
      SELECT id, brand_id, user_id, action_type, sub_type, payload,
             estimated_cost_credits, confidence, reasoning, governance_result,
             governance_reason, expires_at, created_at
      FROM action_queue
      WHERE ($1::text IS NULL OR brand_id = $1)
        AND governance_result IN ('pending', 'awaiting_human')
      ORDER BY created_at DESC
      LIMIT 50
    `, [brandId || null]);

    res.json({ actions: rows });
  } catch (err) {
    console.error('[GovernanceAPI] Pending error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
});

// Action history — GET /api/actions/history
router.get('/api/actions/history', async (req, res) => {
  try {
    const brandId = req.query.brand_id || req.brandId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(`
      SELECT q.id, q.brand_id, q.user_id, q.action_type, q.payload,
             q.estimated_cost_credits, q.confidence, q.reasoning,
             q.governance_result, q.governance_reason, q.feedback,
             q.reviewed_by, q.reviewed_at, q.executed_at, q.created_at,
             l.actual_cost_credits, l.cost_breakdown, l.outcome_status, l.outcome_details
      FROM action_queue q
      LEFT JOIN action_log l ON l.action_queue_id = q.id
      WHERE ($1::text IS NULL OR q.brand_id = $1)
      ORDER BY q.created_at DESC
      LIMIT $2
    `, [brandId || null, limit]);

    res.json({ actions: rows });
  } catch (err) {
    console.error('[GovernanceAPI] History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch action history' });
  }
});

// Budget status — GET /api/budgets
router.get('/api/budgets', async (req, res) => {
  try {
    const brandId = req.query.brand_id || req.brandId;
    const { rows } = await pool.query(`
      SELECT * FROM brand_budgets WHERE ($1::text IS NULL OR brand_id = $1)
    `, [brandId || null]);

    res.json({ budgets: rows });
  } catch (err) {
    console.error('[GovernanceAPI] Budgets error:', err.message);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// Update budget — PUT /api/budgets/:brandId
router.put('/api/budgets/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const budget_monthly_credits = req.body.budget_monthly_credits ?? 0;
    const warn_at_percent = req.body.warn_at_percent ?? 80;
    const auto_pause_at_percent = req.body.auto_pause_at_percent ?? 100;
    const auto_approve_above = req.body.auto_approve_above ?? 0.8;
    const human_required_below = req.body.human_required_below ?? 0.6;

    const { rows } = await pool.query(`
      INSERT INTO brand_budgets (brand_id, budget_monthly_credits, warn_at_percent, auto_pause_at_percent, auto_approve_above, human_required_below)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (brand_id) DO UPDATE SET
        budget_monthly_credits = $2,
        warn_at_percent = $3,
        auto_pause_at_percent = $4,
        auto_approve_above = $5,
        human_required_below = $6,
        updated_at = NOW()
      RETURNING *
    `, [brandId, budget_monthly_credits, warn_at_percent, auto_pause_at_percent,
        auto_approve_above, human_required_below]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[GovernanceAPI] Budget update error:', err.message);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

module.exports = router;
