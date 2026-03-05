const { Router } = require('express');
const { verifyGoogleToken } = require('../auth');
const { pool } = require('../db');

const router = Router();

router.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    const { email, name, picture } = await verifyGoogleToken(credential);

    // Only allow @ikawn.com emails
    if (!email.endsWith('@ikawn.com')) {
      return res.status(403).json({ error: 'Only @ikawn.com emails are allowed' });
    }

    // Check if user exists
    let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (result.rows.length === 0) {
      // Auto-create user on first login
      result = await pool.query(
        'INSERT INTO users (email, name, role, status, last_login) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
        [email, name, 'user', 'active']
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];

      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact admin.' });
      }

      // Update last_login and name
      await pool.query('UPDATE users SET last_login = NOW(), name = $1 WHERE id = $2', [name, user.id]);
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      name: name || user.name,
      role: user.role,
      status: user.status,
      picture,
    };

    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Authentication failed' });
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
