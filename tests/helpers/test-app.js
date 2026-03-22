const express = require('express');

/**
 * Creates a minimal Express app with the given router mounted.
 * Injects mock session and brand_id middleware.
 */
function createTestApp(router, { userId = 1, role = 'user', brandId = 'ikawn' } = {}) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Inject mock session
  app.use((req, _res, next) => {
    req.session = {
      user: { id: userId, role, email: `user${userId}@test.com` },
    };
    req.brand_id = brandId;
    next();
  });

  app.use(router);
  return app;
}

module.exports = { createTestApp };
