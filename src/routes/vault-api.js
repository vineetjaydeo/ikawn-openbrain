const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ---------------------------------------------------------------------------
// GET /api/vault — List vault items with dynamic filtering
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const brandId = req.brand_id;
    const userId = req.session.user.id;

    const conditions = ['brand_id = $1', 'user_id = $2', 'deleted_at IS NULL'];
    const params = [brandId, userId];
    let paramIndex = 3;

    // Folder filter
    if (req.query.folder) {
      conditions.push(`folder = $${paramIndex++}`);
      params.push(req.query.folder);
    }

    // File type filter (comma-separated)
    if (req.query.type) {
      const types = req.query.type.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        conditions.push(`file_type = ANY($${paramIndex++})`);
        params.push(types);
      }
    }

    // Source filter (comma-separated)
    if (req.query.source) {
      const sources = req.query.source.split(',').map(s => s.trim()).filter(Boolean);
      if (sources.length > 0) {
        conditions.push(`source = ANY($${paramIndex++})`);
        params.push(sources);
      }
    }

    // Search by filename
    if (req.query.q) {
      conditions.push(`filename ILIKE $${paramIndex++}`);
      params.push(`%${req.query.q}%`);
    }

    // Starred filter
    if (req.query.starred === 'true') {
      conditions.push('starred = true');
    }

    // Sorting
    const allowedSort = ['created_at', 'updated_at', 'filename', 'file_size', 'file_type'];
    const sort = allowedSort.includes(req.query.sort) ? req.query.sort : 'created_at';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    // Pagination
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const whereClause = conditions.join(' AND ');
    const sql = `
      SELECT id, filename, file_url, file_key, file_type, mime_type, file_size,
             source, source_ref, folder, tags, metadata, starred, created_at, updated_at
      FROM vault_items
      WHERE ${whereClause}
      ORDER BY ${sort} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    // Run count and data queries in parallel
    const countSql = `SELECT COUNT(*) FROM vault_items WHERE ${whereClause}`;
    const countParams = params.slice(0, params.length - 2);

    const [dataResult, countResult] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, countParams),
    ]);

    res.json({
      items: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('vault list error:', err);
    res.status(500).json({ error: 'Failed to list vault items' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vault/stats — Aggregate stats for the user's vault
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const brandId = req.brand_id;
    const userId = req.session.user.id;

    const [totalRes, typeRes, sourceRes, starredRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total FROM vault_items
         WHERE brand_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [brandId, userId]
      ),
      pool.query(
        `SELECT COALESCE(file_type, 'unknown') AS file_type, COUNT(*) AS count
         FROM vault_items
         WHERE brand_id = $1 AND user_id = $2 AND deleted_at IS NULL
         GROUP BY file_type`,
        [brandId, userId]
      ),
      pool.query(
        `SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS count
         FROM vault_items
         WHERE brand_id = $1 AND user_id = $2 AND deleted_at IS NULL
         GROUP BY source`,
        [brandId, userId]
      ),
      pool.query(
        `SELECT COUNT(*) AS starred FROM vault_items
         WHERE brand_id = $1 AND user_id = $2 AND deleted_at IS NULL AND starred = true`,
        [brandId, userId]
      ),
    ]);

    const byType = {};
    for (const row of typeRes.rows) {
      byType[row.file_type] = parseInt(row.count, 10);
    }

    const bySource = {};
    for (const row of sourceRes.rows) {
      bySource[row.source] = parseInt(row.count, 10);
    }

    res.json({
      total: parseInt(totalRes.rows[0].total, 10),
      byType,
      bySource,
      starred: parseInt(starredRes.rows[0].starred, 10),
    });
  } catch (err) {
    console.error('vault stats error:', err);
    res.status(500).json({ error: 'Failed to fetch vault stats' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vault/folders — List folders
// ---------------------------------------------------------------------------
router.get('/folders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, parent_folder, color, icon, created_at
       FROM vault_folders
       WHERE brand_id = $1 AND user_id = $2
       ORDER BY name ASC`,
      [req.brand_id, req.session.user.id]
    );
    res.json({ folders: result.rows });
  } catch (err) {
    console.error('vault folders list error:', err);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vault/folders — Create a folder
// ---------------------------------------------------------------------------
router.post('/folders', async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const result = await pool.query(
      `INSERT INTO vault_folders (brand_id, user_id, name, color, icon)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (brand_id, user_id, name) DO NOTHING
       RETURNING *`,
      [req.brand_id, req.session.user.id, name.trim(), color || null, icon || null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Folder already exists' });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('vault folder create error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/vault/folders/:id — Update a folder
// ---------------------------------------------------------------------------
router.patch('/folders/:id', async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    const sets = [];
    const params = [req.params.id, req.brand_id, req.session.user.id];
    let paramIndex = 4;

    if (name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (color !== undefined) {
      sets.push(`color = $${paramIndex++}`);
      params.push(color);
    }
    if (icon !== undefined) {
      sets.push(`icon = $${paramIndex++}`);
      params.push(icon);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await pool.query(
      `UPDATE vault_folders SET ${sets.join(', ')}
       WHERE id = $1 AND brand_id = $2 AND user_id = $3
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('vault folder update error:', err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/vault/folders/:id — Delete a folder, move items to All Files
// ---------------------------------------------------------------------------
router.delete('/folders/:id', async (req, res) => {
  try {
    const folderId = req.params.id;
    const brandId = req.brand_id;
    const userId = req.session.user.id;

    // Move items in this folder back to 'All Files'
    await pool.query(
      `UPDATE vault_items SET folder = 'All Files', updated_at = NOW()
       WHERE brand_id = $1 AND user_id = $2
         AND folder = (SELECT name FROM vault_folders WHERE id = $3 AND brand_id = $1 AND user_id = $2)`,
      [brandId, userId, folderId]
    );

    const result = await pool.query(
      `DELETE FROM vault_folders WHERE id = $1 AND brand_id = $2 AND user_id = $3 RETURNING id`,
      [folderId, brandId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('vault folder delete error:', err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vault/bulk — Bulk operations on vault items
// ---------------------------------------------------------------------------
router.post('/bulk', async (req, res) => {
  try {
    const { action, ids, folder, tags } = req.body;
    const brandId = req.brand_id;
    const userId = req.session.user.id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let result;

    switch (action) {
      case 'move':
        if (!folder) {
          return res.status(400).json({ error: 'folder is required for move action' });
        }
        result = await pool.query(
          `UPDATE vault_items SET folder = $1, updated_at = NOW()
           WHERE id = ANY($2) AND brand_id = $3 AND user_id = $4 AND deleted_at IS NULL`,
          [folder, ids, brandId, userId]
        );
        break;

      case 'tag':
        if (!Array.isArray(tags) || tags.length === 0) {
          return res.status(400).json({ error: 'tags array is required for tag action' });
        }
        result = await pool.query(
          `UPDATE vault_items SET tags = COALESCE(tags, '{}') || $1, updated_at = NOW()
           WHERE id = ANY($2) AND brand_id = $3 AND user_id = $4 AND deleted_at IS NULL`,
          [tags, ids, brandId, userId]
        );
        break;

      case 'delete':
        result = await pool.query(
          `UPDATE vault_items SET deleted_at = NOW()
           WHERE id = ANY($1) AND brand_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
          [ids, brandId, userId]
        );
        break;

      case 'star':
        result = await pool.query(
          `UPDATE vault_items SET starred = true, updated_at = NOW()
           WHERE id = ANY($1) AND brand_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
          [ids, brandId, userId]
        );
        break;

      default:
        return res.status(400).json({ error: 'Invalid action. Must be: move, tag, delete, or star' });
    }

    res.json({ affected: result.rowCount });
  } catch (err) {
    console.error('vault bulk error:', err);
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vault/:id — Single vault item
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, file_url, file_key, file_type, mime_type, file_size,
              source, source_ref, folder, tags, metadata, starred, created_at, updated_at
       FROM vault_items
       WHERE id = $1 AND brand_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [req.params.id, req.brand_id, req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('vault get item error:', err);
    res.status(500).json({ error: 'Failed to fetch vault item' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/vault/:id — Update a vault item
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const { filename, folder, tags, starred, metadata } = req.body;
    const sets = [];
    const params = [req.params.id, req.brand_id, req.session.user.id];
    let paramIndex = 4;

    if (filename !== undefined) {
      sets.push(`filename = $${paramIndex++}`);
      params.push(filename);
    }
    if (folder !== undefined) {
      sets.push(`folder = $${paramIndex++}`);
      params.push(folder);
    }
    if (tags !== undefined) {
      sets.push(`tags = $${paramIndex++}`);
      params.push(tags);
    }
    if (starred !== undefined) {
      sets.push(`starred = $${paramIndex++}`);
      params.push(starred);
    }
    if (metadata !== undefined) {
      sets.push(`metadata = $${paramIndex++}`);
      params.push(JSON.stringify(metadata));
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE vault_items SET ${sets.join(', ')}
       WHERE id = $1 AND brand_id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, filename, file_url, file_key, file_type, mime_type, file_size,
                 source, source_ref, folder, tags, metadata, starred, created_at, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('vault update item error:', err);
    res.status(500).json({ error: 'Failed to update vault item' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/vault/:id — Soft delete a vault item
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE vault_items SET deleted_at = NOW()
       WHERE id = $1 AND brand_id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.brand_id, req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('vault delete item error:', err);
    res.status(500).json({ error: 'Failed to delete vault item' });
  }
});

module.exports = router;
