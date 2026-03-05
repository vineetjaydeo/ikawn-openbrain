const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.endsWith('@ikawn.com')) {
      return res.status(403).json({ error: 'Only @ikawn.com emails allowed' });
    }

    // Check if user exists
    let result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    let user;

    if (result.rows.length === 0) {
      // Auto-create on first login
      result = await pool.query(
        'INSERT INTO users (email, role, status, last_login) VALUES ($1, $2, $3, NOW()) RETURNING *',
        [email.toLowerCase(), 'user', 'active']
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact admin.' });
      }
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    }

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

module.exports = router;
