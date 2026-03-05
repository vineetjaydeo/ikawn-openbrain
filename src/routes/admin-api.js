const { Router } = require('express');
const { requireAdmin } = require('../auth');
const { pool } = require('../db');

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// List all users
router.get('/admin/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, role, status, created_at, last_login FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Add a new user
router.post('/admin/api/users', async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !email.endsWith('@ikawn.com')) {
      return res.status(400).json({ error: 'Email must be @ikawn.com' });
    }
    const userRole = role === 'admin' ? 'admin' : 'user';
    const result = await pool.query(
      'INSERT INTO users (email, name, role, status) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, status, created_at',
      [email, name || null, userRole, 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    console.error('Admin add user error:', err);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Update a user
router.put('/admin/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, status } = req.body;

    // Prevent admin from demoting themselves
    if (parseInt(id) === req.session.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }

    const result = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, email, name, role, status, created_at, last_login`,
      [name || null, role || null, status || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
