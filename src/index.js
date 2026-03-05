const express = require('express');
const { initSchema } = require('./db');
const captureRoute = require('./routes/capture');
const searchRoute = require('./routes/search');
const recentRoute = require('./routes/recent');
const statsRoute = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(captureRoute);
app.use(searchRoute);
app.use(recentRoute);
app.use(statsRoute);

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
