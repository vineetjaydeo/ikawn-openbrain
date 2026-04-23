'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();
const { requireAuth } = require('../auth');

const DIST_DIR = path.join(__dirname, '..', 'design-app-dist');

// Serve static assets from the built React app
router.use('/design/assets', express.static(path.join(DIST_DIR, 'assets'), {
  maxAge: '30d',
  immutable: true,
}));

// Serve the SPA for /design and all sub-routes
router.get('/design', requireAuth, (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

router.get('/design/*', requireAuth, (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

module.exports = router;
