const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const router = Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !email.endsWith('@ikawn.com')) {
      return res.status(403).json({ error: 'Only @ikawn.com emails allowed' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    }
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Password not set. Ask admin to set your password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json(req.session.user);
  }
  res.status(401).json({ error: 'Not authenticated' });
});

// Change own password
router.post('/auth/change-password', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.user.id]);
    const user = result.rows[0];

    if (user.password_hash) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
