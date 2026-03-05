const { OAuth2Client } = require('google-auth-library');
const { pool } = require('./db');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return { email: payload.email, name: payload.name, picture: payload.picture };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.status === 'suspended') {
      req.session = null;
      return res.status(403).json({ error: 'Account suspended' });
    }
    return next();
  }
  // For API calls, return 401 JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // For browser requests, redirect to login
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

module.exports = { verifyGoogleToken, requireAuth, requireAdmin };
