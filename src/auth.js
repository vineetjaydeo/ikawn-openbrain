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
  // Check API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey && process.env.OPENBRAIN_API_KEY && apiKey === process.env.OPENBRAIN_API_KEY) {
    req.apiClient = true;
    return next();
  }
  // Fall through to session auth
  return requireAuth(req, res, next);
}

module.exports = { requireAuth, requireAdmin, requireAuthOrApiKey };
