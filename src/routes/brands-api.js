// @ts-check
'use strict';

const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// POST /api/brands/setup — Idempotent brand provisioning
// Called by ikawn-v3 when a new brand is created in the org model.
// Inserts brand + brand_context + brand_budgets if not already present.
router.post('/api/brands/setup', async (req, res) => {
  try {
    const { brand_id, name, industry, tone_of_voice, org_id } = req.body;

    if (!brand_id || !name) {
      return res.status(400).json({ error: 'brand_id and name are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert brand
      await client.query(`
        INSERT INTO brands (brand_id, name, tier, status, org_id)
        VALUES ($1, $2, 'starter', 'active', $3)
        ON CONFLICT (brand_id) DO UPDATE SET org_id = COALESCE(EXCLUDED.org_id, brands.org_id)
      `, [brand_id, name, org_id || null]);

      // 2. Upsert brand_context with optional fields
      await client.query(`
        INSERT INTO brand_context (brand_id, industry, tone_of_voice)
        VALUES ($1, $2, $3)
        ON CONFLICT (brand_id) DO NOTHING
      `, [brand_id, industry || null, tone_of_voice || null]);

      // 3. Upsert brand_budgets with defaults
      await client.query(`
        INSERT INTO brand_budgets (brand_id, budget_monthly_credits, warn_at_percent, auto_pause_at_percent)
        VALUES ($1, 1000, 80, 100)
        ON CONFLICT (brand_id) DO NOTHING
      `, [brand_id]);

      await client.query('COMMIT');

      res.status(201).json({
        ok: true,
        brand_id,
        message: 'Brand provisioned successfully',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[BrandsAPI] Setup error:', err.message);
    res.status(500).json({ error: 'Failed to provision brand' });
  }
});

module.exports = router;
