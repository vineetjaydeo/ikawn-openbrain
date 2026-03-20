// @ts-check
'use strict';

/**
 * Brand Analysis Headless API
 *
 * Public endpoints for brand analysis — no auth required, rate-limited by IP.
 * Designed for liftmy.shop and other external consumers.
 *
 * POST /api/brand/analyze  — Full pipeline (SSE stream)
 * GET  /api/brand/analyze/:hash — Cached result lookup
 */

const { Router } = require('express');
const crypto = require('crypto');

const router = Router();

// ── Skill modules ──
const crawlPipeline = require('../skills/crawl-pipeline');
const chunker = require('../skills/chunker');
const classifier = require('../skills/classifier');
const brandAnalysis = require('../skills/brand-analysis');
const brandCleaner = require('../skills/brand-cleaner');
const socialDiscovery = require('../skills/social-discovery');
const competitorDiscovery = require('../skills/competitor-discovery');

// ── In-memory cache (URL hash → result, 24h TTL) ──
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(url) {
  const normalized = url.replace(/\/+$/, '').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function getCached(hash) {
  const entry = cache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(hash);
    return null;
  }
  return entry.data;
}

function setCache(hash, data) {
  cache.set(hash, { data, ts: Date.now() });
  // Evict old entries if cache grows too large
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 100; i++) cache.delete(oldest[i][0]);
  }
}

// ── Rate limiter (IP-based, in-memory) ──
const rateLimits = new Map();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_HOUR = 3;
const MAX_PER_DAY = 20;

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry) {
    entry = { hourStart: now, hourCount: 0, dayStart: now, dayCount: 0 };
    rateLimits.set(ip, entry);
  }

  // Reset windows
  if (now - entry.hourStart > HOUR_MS) {
    entry.hourStart = now;
    entry.hourCount = 0;
  }
  if (now - entry.dayStart > DAY_MS) {
    entry.dayStart = now;
    entry.dayCount = 0;
  }

  if (entry.hourCount >= MAX_PER_HOUR) {
    const retryAfter = Math.ceil((entry.hourStart + HOUR_MS - now) / 1000);
    return { allowed: false, retryAfter, reason: 'Hourly limit reached (3/hour)' };
  }
  if (entry.dayCount >= MAX_PER_DAY) {
    const retryAfter = Math.ceil((entry.dayStart + DAY_MS - now) / 1000);
    return { allowed: false, retryAfter, reason: 'Daily limit reached (20/day)' };
  }

  entry.hourCount++;
  entry.dayCount++;
  return { allowed: true };
}

// Clean up stale rate limit entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now - entry.dayStart > DAY_MS) rateLimits.delete(ip);
  }
}, HOUR_MS);

// ── SSE helper ──
function emitSSE(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) {}
}

// ── POST /api/brand/analyze — Full pipeline SSE stream ──
router.post('/api/brand/analyze', async (req, res) => {
  const { url, brand_type } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  const normalizedUrl = parsedUrl.href;

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip;
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: limit.reason, retry_after_seconds: limit.retryAfter });
  }

  // Check cache
  const hash = cacheKey(normalizedUrl);
  const cached = getCached(hash);
  if (cached) {
    // Return cached result as instant SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    emitSSE(res, { stage: 'complete', progress: 1.0, cached: true, data: cached });
    return res.end();
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch (_) {}
  }, 15000);

  let closed = false;
  req.on('close', () => { closed = true; clearInterval(heartbeat); });

  const emit = (stage, progress, extra = {}) => {
    if (closed) return;
    emitSSE(res, { stage, progress, ...extra });
  };

  try {
    // ── Stage 1: Crawl ──
    emit('crawling', 0.1, { message: `Scanning ${parsedUrl.hostname}...` });

    const crawlResult = await crawlPipeline.crawlWebsite(normalizedUrl, { maxPages: 15 });
    if (!crawlResult.pages.length) {
      emit('error', 0, { message: 'Could not scan this website. The site may block automated access.' });
      clearInterval(heartbeat);
      return res.end();
    }

    emit('crawling', 0.15, { pages_found: crawlResult.pages.length, method: crawlResult.method });
    if (closed) { clearInterval(heartbeat); return res.end(); }

    // ── Stage 2: Chunk + Classify ──
    emit('analyzing', 0.2, { message: 'Reading brand content...' });

    const chunks = chunker.chunkPages(crawlResult.pages);

    let classifiedChunks = chunks;
    try {
      const classifications = await classifier.classifyPages(chunks);
      const typeMap = new Map(classifications.map(c => [c.page_url, c.page_type]));
      classifiedChunks = chunks.map(chunk => ({
        ...chunk,
        page_type: typeMap.get(chunk.page_url) || 'other',
      }));
    } catch (err) {
      console.error('[brand-api] Classification failed, continuing:', err.message);
      classifiedChunks = chunks.map(c => ({ ...c, page_type: 'other' }));
    }

    emit('analyzing', 0.3, { chunks: classifiedChunks.length });
    if (closed) { clearInterval(heartbeat); return res.end(); }

    // ── Stage 3: Brand DNA Extraction ──
    emit('extracting', 0.4, { message: 'Building Brand DNA...' });

    // Infer brand_type if not provided
    const brandType = brand_type || 'product';

    const analysisResult = await brandAnalysis.analyzeBrand({
      brandType,
      url: normalizedUrl,
      chunks: classifiedChunks,
    });

    // Auto-clean
    if (analysisResult.brand_dna) {
      analysisResult.brand_dna = brandCleaner.cleanBrandDna(analysisResult.brand_dna, brandType);
    }

    emit('extracting', 0.6, { confidence: analysisResult.brand_dna_confidence });
    if (closed) { clearInterval(heartbeat); return res.end(); }

    // ── Stage 4: Social + Competitor Discovery (parallel) ──
    emit('discovering', 0.7, { message: 'Finding social presence & competitors...' });

    const brandName = analysisResult.brand_dna?.core_identity?.brand_name?.value || '';

    const [socialProfiles, competitors] = await Promise.all([
      socialDiscovery.discoverSocialProfiles({
        brandName,
        brandUrl: normalizedUrl,
        pages: crawlResult.pages,
      }).catch(err => {
        console.error('[brand-api] Social discovery failed:', err.message);
        return {};
      }),
      competitorDiscovery.discoverCompetitors({
        brandName,
        brandType,
        industry: analysisResult.brand_dna?.market_context?.industry?.value || '',
        positioning: analysisResult.brand_dna?.market_context?.positioning?.value || '',
        offerings: analysisResult.brand_dna?.core_identity?.offerings?.value || [],
        brandUrl: normalizedUrl,
      }).catch(err => {
        console.error('[brand-api] Competitor discovery failed:', err.message);
        return [];
      }),
    ]);

    emit('discovering', 0.9, {
      social_count: Object.keys(socialProfiles).length,
      competitor_count: competitors.length,
    });

    // ── Complete ──
    const result = {
      brand_dna: analysisResult.brand_dna,
      confidence: analysisResult.brand_dna_confidence,
      insights: analysisResult.brand_insights,
      social_profiles: socialProfiles,
      competitors,
      brand_type_mismatch: analysisResult.brand_type_mismatch,
      source: {
        url: normalizedUrl,
        pages_crawled: crawlResult.pages.length,
        crawl_method: crawlResult.method,
        chunks_analyzed: classifiedChunks.length,
      },
      analyzed_at: new Date().toISOString(),
    };

    // Cache result
    setCache(hash, result);

    emit('complete', 1.0, { data: result });

  } catch (err) {
    console.error('[brand-api] Pipeline error:', err);
    emit('error', 0, { message: 'Analysis failed. Please try again.' });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

// ── GET /api/brand/analyze/:hash — Cached result lookup ──
router.get('/api/brand/analyze/:hash', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const result = getCached(req.params.hash);
  if (!result) {
    return res.status(404).json({ error: 'Result not found or expired' });
  }
  res.json(result);
});

// ── OPTIONS for CORS preflight ──
router.options('/api/brand/analyze', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

router.options('/api/brand/analyze/:hash', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

module.exports = router;
