const express = require('express');
const cookieSession = require('cookie-session');
const { initSchema } = require('./db');
const { requireAuth } = require('./auth');
const authRoutes = require('./routes/auth-routes');
const adminApi = require('./routes/admin-api');
const pages = require('./routes/pages');
const chatPage = require('./routes/chat-page');
const chatApi = require('./routes/chat-api');
const uploadRoute = require('./routes/upload');
const captureRoute = require('./routes/capture');
const searchRoute = require('./routes/search');
const recentRoute = require('./routes/recent');
const statsRoute = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

app.use(cookieSession({
  name: 'ob_session',
  keys: [process.env.SESSION_SECRET || 'openbrain-dev-secret-change-me'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
}));

// Health check — no auth
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes — no auth required
app.use(authRoutes);

// Login/admin/settings pages — no auth on login, auth on others
app.use(pages);

// Chat UI at / — requires auth
app.use(chatPage);

// Chat API + upload — requires auth
app.use(requireAuth, chatApi);
app.use(requireAuth, uploadRoute);

// Memory API — requires auth
app.use(requireAuth, captureRoute);
app.use(requireAuth, searchRoute);
app.use(requireAuth, recentRoute);
app.use(requireAuth, statsRoute);

// Admin API
app.use(adminApi);

async function start() {
  try {
    await initSchema();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`OpenBrain running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
