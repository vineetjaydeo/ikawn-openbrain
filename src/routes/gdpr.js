const { Router } = require('express');
const { pool } = require('../db');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

// DELETE /api/gdpr/brand/:brand_id — full GDPR erasure
router.delete('/api/gdpr/brand/:brand_id', requireAuthOrApiKey, async (req, res) => {
  // Require admin-level API key (check session or API key with admin flag)
  if (!req.apiClient && (!req.session?.user || req.session.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Admin access required for GDPR erasure' });
  }

  const { brand_id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Soft delete all memories
    await client.query(
      `UPDATE memories SET deleted_at = NOW(), content = '[GDPR ERASED]', embedding = NULL WHERE brand_id = $1 AND deleted_at IS NULL`,
      [brand_id]
    );

    // Soft delete edit deltas
    await client.query(
      `UPDATE edit_deltas SET deleted_at = NOW() WHERE brand_id = $1 AND deleted_at IS NULL`,
      [brand_id]
    );

    // Soft delete generations
    await client.query(
      `UPDATE generations SET deleted_at = NOW() WHERE brand_id = $1 AND deleted_at IS NULL`,
      [brand_id]
    );

    // Update brand status
    await client.query(
      `UPDATE brands SET status = 'erased', updated_at = NOW() WHERE brand_id = $1`,
      [brand_id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, brand_id, erased_at: new Date() });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[GDPR] Erasure failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
