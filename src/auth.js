const crypto = require('crypto');
const { pool } = require('./db');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.status === 'suspended') {
      req.session = null;
      return res.status(403).json({ error: 'Account suspended' });
    }
    return next();
  }
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireAuthOrApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return requireAuth(req, res, next);
  }

  // 1. Check legacy env var first (backward compat)
  if (process.env.OPENBRAIN_API_KEY && apiKey === process.env.OPENBRAIN_API_KEY) {
    req.apiClient = true;
    return next();
  }

  // 2. Check DB-managed keys
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  pool.query(
    `SELECT id, name, user_id, org_id, expires_at, revoked_at FROM api_keys WHERE key_hash = $1`,
    [keyHash]
  ).then(result => {
    const key = result.rows[0];
    if (!key) {
      // API key was explicitly provided but invalid — never redirect, always 401
      return res.status(401).json({ error: 'Invalid API key' });
    }
    if (key.revoked_at) {
      return res.status(401).json({ error: 'API key has been revoked' });
    }
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key has expired' });
    }

    req.apiClient = true;
    req.apiKeyId = key.id;
    req.apiKeyName = key.name;
    req.userId = key.user_id || null;
    req.orgId = key.org_id || null;

    // Update last_used_at + log usage (fire-and-forget)
    pool.query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [key.id]).catch(() => {});
    pool.query(
      `INSERT INTO api_key_usage (api_key_id, endpoint, method, ip_address) VALUES ($1, $2, $3, $4)`,
      [key.id, req.path, req.method, req.ip]
    ).catch(() => {});

    return next();
  }).catch(err => {
    console.error('API key DB lookup error:', err.message);
    // API key was provided but DB lookup failed — 500, not redirect
    return res.status(500).json({ error: 'API key validation failed' });
  });
}

function requireBrand(req, res, next) {
  // Set brand_id from session, header, or default to 'ikawn'
  req.brand_id = req.headers['x-brand-id'] || req.session?.brand_id || 'ikawn';
  next();
}

module.exports = { requireAuth, requireAdmin, requireAuthOrApiKey, requireBrand };
