const express = require('express');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { initSchema } = require('./db');
const { requireAuth, requireAuthOrApiKey } = require('./auth');
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
const decisionsRoute = require('./routes/decisions');
const ruhiChatRoute = require('./routes/ruhi-chat');
const webhooksRoute = require('./routes/webhooks');
const notifyRoute = require('./routes/notify');
const actionsRoute = require('./routes/actions');
const editDeltasRoute = require('./routes/edit-deltas');
const generationsRoute = require('./routes/generations');
const gdprRoute = require('./routes/gdpr');
const brainHealthRoute = require('./routes/brain-health');
const adminCostsRoute = require('./routes/admin-costs');
const adminApiKeysRoute = require('./routes/admin-api-keys');
const sharedRoute = require('./routes/shared');
const recallRoute = require('./routes/recall');
const governanceRoute = require('./routes/governance');
const brandsApiRoute = require('./routes/brands-api');
const skillsRoute = require('./routes/skills');
const intelligenceRoute = require('./routes/intelligence');
const missionControlRoute = require('./routes/mission-control');
const { startScheduler, triggerSync } = require('./scheduler');
const { seedAgents } = require('./agents/seed-all');
const { loadTools } = require('./tools/registry');
const { startEmbeddingWorker } = require('./workers/embedding-worker');
const { startModerationWorker } = require('./workers/moderation-worker');
const { startMothershipWorker } = require('./workers/mothership-worker');
const { startDistillationWorker } = require('./workers/distillation-worker');
const { startIntelligenceWorker } = require('./workers/intelligence-worker');

// Load Ruhi knowledge base at startup
const docsDir = path.join(__dirname, '..', 'docs');
const ruhiKnowledge = {};
for (const file of ['soul.md', 'memory.md', 'tools.md', 'user.md']) {
  const filePath = path.join(docsDir, file);
  try {
    ruhiKnowledge[file.replace('.md', '')] = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`Warning: Could not load ${filePath}:`, err.message);
    ruhiKnowledge[file.replace('.md', '')] = '';
  }
}
// Expose globally for chat-api
global.ruhiKnowledge = ruhiKnowledge;

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '15mb' }));

app.use(cookieSession({
  name: 'ob_session',
  keys: [process.env.SESSION_SECRET || 'openbrain-dev-secret-change-me'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  secureProxy: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
}));

// ── Rate Limiting (skip for API key authenticated requests) ──
const skipIfApiKey = (req) => !!req.headers['x-api-key'];
app.use('/capture',             rateLimit({ windowMs: 60000, max: 60,  message: 'Capture rate limit exceeded', skip: skipIfApiKey }));
app.use('/search',              rateLimit({ windowMs: 60000, max: 120, message: 'Search rate limit exceeded', skip: skipIfApiKey }));
app.use('/api/chat',            rateLimit({ windowMs: 60000, max: 20,  message: 'Chat rate limit exceeded' }));
app.use('/auth/login',          rateLimit({ windowMs: 60000, max: 5,   message: 'Too many login attempts', skipSuccessfulRequests: true }));
app.use('/api/actions/trigger',  rateLimit({ windowMs: 60000, max: 10,  message: 'Generation rate limit exceeded', skip: skipIfApiKey }));

// robots.txt — block all crawlers from the entire site
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// Favicon
const faviconPath = path.join(__dirname, '..', 'docs', 'ruhi-favicon-64.png');
let faviconBuf;
try { faviconBuf = fs.readFileSync(faviconPath); } catch (e) {}
app.get('/favicon.png', (req, res) => {
  if (!faviconBuf) return res.status(404).end();
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' }).send(faviconBuf);
});
app.get('/favicon.ico', (req, res) => {
  if (!faviconBuf) return res.status(404).end();
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' }).send(faviconBuf);
});

// Health check — no auth
const appVersion = require('../package.json').version;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: appVersion, timestamp: new Date().toISOString() });
});

// Public shared conversations — no auth required
app.use(sharedRoute);


// GitHub webhook — no session auth (uses signature verification)
app.use(webhooksRoute);

// Auth routes — no auth required
app.use(authRoutes);

// Login/admin/settings pages — no auth on login, auth on others
app.use(pages);

// Memory API — requires auth or API key (MUST be before chatApi to avoid requireAuth interception)
app.use(requireAuthOrApiKey, captureRoute);
app.use(requireAuthOrApiKey, searchRoute);
app.use(requireAuthOrApiKey, recentRoute);
app.use(requireAuthOrApiKey, statsRoute);
app.use(requireAuthOrApiKey, decisionsRoute);
app.use(requireAuthOrApiKey, editDeltasRoute);
app.use(requireAuthOrApiKey, generationsRoute);
app.use(notifyRoute);
app.use(actionsRoute);
app.use(requireAuthOrApiKey, gdprRoute);
app.use(requireAuthOrApiKey, brainHealthRoute);
app.use(requireAuthOrApiKey, recallRoute);
app.use(requireAuthOrApiKey, governanceRoute);
app.use(requireAuthOrApiKey, brandsApiRoute);
app.use(skillsRoute);

// Chat UI at / — requires auth
app.use(chatPage);

// Mission Control API — requires auth
app.use(missionControlRoute);

// Chat API + upload — requires auth
app.use(requireAuth, chatApi);
app.use(requireAuth, uploadRoute);
app.use(requireAuth, ruhiChatRoute);

// Admin API
app.use(adminApi);
app.use(adminCostsRoute);
app.use(adminApiKeysRoute);
app.use(intelligenceRoute);

// Admin sync endpoint — owner only
app.post('/admin/sync/:source', requireAuth, async (req, res) => {
  // Simple admin check
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const result = await triggerSync(req.params.source);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Manual sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  try {
    await initSchema();
    await seedAgents();
    loadTools();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`OpenBrain running on port ${PORT}`);
      // Start ingestion scheduler
      startScheduler();
      // Start v3 workers
      startEmbeddingWorker();
      startModerationWorker();
      startMothershipWorker();
      startDistillationWorker();
      startIntelligenceWorker();
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
