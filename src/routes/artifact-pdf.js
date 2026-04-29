'use strict';

// Renders an HTML artifact (already uploaded to R2 by generate_html) to PDF
// using puppeteer-core against the system Chromium installed in the Docker image.
//
// POST /api/artifacts/pdf
//   body: { url: string, title?: string }
//
// Returns: application/pdf stream with Content-Disposition: attachment.
//
// Notes:
// - We deliberately launch + close a Chromium instance per request. Fedfina runs on
//   a 1GB Fly machine; keeping a persistent browser warm risks OOM and tying up
//   memory between rare PDF requests. Demo cadence is one-per-minute, so cold-start
//   cost is acceptable.
// - We pass --no-sandbox / --disable-setuid-sandbox / --disable-dev-shm-usage to
//   make Chromium boot inside the constrained Fly VM.

const express = require('express');

const router = express.Router();

// Lazy-require puppeteer-core so the route file can load even if the dep is not
// yet installed in dev — the actual call will throw a clear error.
function getPuppeteer() {
  return require('puppeteer-core');
}

function resolveChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  // Alpine default
  return '/usr/bin/chromium-browser';
}

function safeFilename(title) {
  const cleaned = String(title || 'artifact').replace(/[^\w\-. ]+/g, '_').trim();
  return (cleaned || 'artifact').slice(0, 80);
}

router.post('/api/artifacts/pdf', async (req, res) => {
  const { url, title } = req.body || {};
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Missing or invalid `url`' });
  }

  const puppeteer = getPuppeteer();
  const executablePath = resolveChromiumPath();

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });
    const page = await browser.newPage();

    // Force a print-friendly viewport before navigation
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    // Give web fonts / late JS a beat to finish layout
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename(title)}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[artifact-pdf] Render failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: `PDF render failed: ${err.message}` });
    }
    return res.end();
  } finally {
    if (browser) {
      browser.close().catch(() => {});
    }
  }
});

module.exports = router;
