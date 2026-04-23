const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { pool } = require('../db');

const router = Router();

// In-memory reset codes (email -> {code, expires})
const resetCodes = new Map();
let resendClient = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '@ikawn.com').split(',');
    if (!email || !allowedDomains.some(d => email.endsWith(d.trim()))) {
      return res.status(403).json({ error: 'Email domain not allowed' });
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

// Request password reset — sends 6-digit code via email
router.post('/auth/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.endsWith('@ikawn.com')) {
      return res.status(400).json({ error: 'Valid @ikawn.com email required' });
    }
    const result = await pool.query('SELECT id FROM users WHERE email = $1 AND status = $2', [email.toLowerCase(), 'active']);
    if (result.rows.length === 0) {
      // Don't reveal if user exists
      return res.json({ ok: true });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(email.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000 });

    const resend = getResend();
    if (resend) {
      await resend.emails.send({
        from: 'iKawn <noreply@notifications.ikawn.com>',
        to: email.toLowerCase(),
        subject: 'iKawn OpenBrain — Password Reset Code',
        html: `<p>Your password reset code is: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } else {
      console.log(`[RESET CODE] ${email}: ${code}`);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Request reset error:', err);
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

// Verify code and reset password
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ error: 'Email, code, and new password required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const stored = resetCodes.get(email.toLowerCase());
    if (!stored || stored.code !== code || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    resetCodes.delete(email.toLowerCase());

    const hash = await bcrypt.hash(new_password, 10);
    const result = await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id', [hash, email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
