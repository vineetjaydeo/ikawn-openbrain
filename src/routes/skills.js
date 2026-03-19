// @ts-check
'use strict';

/**
 * Skill routes for brand onboarding wizard.
 *
 * POST /skills/onboard-brand         — Start skill, returns SSE stream
 * POST /skills/onboard-brand/:id/input — Receive user input mid-session
 * GET  /skills/onboard-brand/:id      — Get current session state
 */

const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../auth');
const {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  validateManualData,
} = require('../skills/onboard-brand');

// Pipeline modules (Drop 2)
let crawlPipeline, chunker, classifier, brandAnalysis, brandCleaner, socialDiscovery, competitorDiscovery, creativeGenerator;

try {
  crawlPipeline = require('../skills/crawl-pipeline');
  chunker = require('../skills/chunker');
  classifier = require('../skills/classifier');
  brandAnalysis = require('../skills/brand-analysis');
  brandCleaner = require('../skills/brand-cleaner');
  socialDiscovery = require('../skills/social-discovery');
  competitorDiscovery = require('../skills/competitor-discovery');
  creativeGenerator = require('../skills/creative-generator');
} catch (err) {
  console.warn('[skills] Some pipeline modules not yet available:', err.message);
}

/**
 * Write an SSE event to the response.
 * @param {import('express').Response} res
 * @param {string} event
 * @param {object} data
 */
function emitSSE(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    // Connection closed
  }
}

/**
 * Run the full URL-based onboarding pipeline (Path A).
 * Emits SSE events at each stage.
 * @param {import('express').Response} res
 * @param {string} sessionId
 * @param {object} params
 * @param {string} params.url
 * @param {string} params.brandType
 * @param {string} params.orgId
 * @param {string} params.userId
 */
async function runUrlPipeline(res, sessionId, params) {
  const { url, brandType, orgId, userId } = params;
  const emit = (/** @type {string} */ event, /** @type {object} */ data) => emitSSE(res, event, data);

  // ── Step 1: Crawl ──
  emit('step', { step: 'crawling', message: 'Scanning your website...', sessionId });
  await updateSession(sessionId, 'crawling', { url });

  let crawlResult;
  if (crawlPipeline) {
    crawlResult = await crawlPipeline.crawlWebsite(url, { maxPages: 15 });
  } else {
    crawlResult = { pages: [], method: 'none', error: 'Crawl pipeline not available' };
  }

  if (!crawlResult.pages.length) {
    // Crawl failed — route to manual entry (Path C)
    emit('error', {
      code: 'CRAWL_FAILED',
      message: 'We could not scan your website. You can enter your brand details manually.',
      fallback: 'manual',
      sessionId,
    });
    await updateSession(sessionId, 'url_input', { crawl_error: crawlResult.error });
    return;
  }

  await updateSession(sessionId, 'crawling', { crawl_method: crawlResult.method, pages_count: crawlResult.pages.length });

  // ── Step 2: Chunk + Classify ──
  emit('step', { step: 'analyzing', message: 'Reading your brand story...', sessionId });
  await updateSession(sessionId, 'analyzing', {});

  let chunks = [];
  if (chunker) {
    chunks = chunker.chunkPages(crawlResult.pages);
  }

  // Classify pages
  let classifiedChunks = chunks;
  if (classifier && chunks.length > 0) {
    try {
      const classifications = await classifier.classifyPages(chunks);
      const typeMap = new Map(classifications.map((/** @type {any} */ c) => [c.page_url, c.page_type]));
      classifiedChunks = chunks.map((/** @type {any} */ chunk) => ({
        ...chunk,
        page_type: typeMap.get(chunk.page_url) || 'other',
      }));
    } catch (err) {
      console.error('[skills] Classification failed:', err.message);
      classifiedChunks = chunks.map((/** @type {any} */ c) => ({ ...c, page_type: 'other' }));
    }
  }

  // ── Step 3: Brand Analysis ──
  emit('step', { step: 'synthesis', message: 'Building your Brand DNA...', sessionId });
  await updateSession(sessionId, 'synthesis', {});

  let analysisResult;
  if (brandAnalysis) {
    analysisResult = await brandAnalysis.analyzeBrand({
      brandType,
      url,
      chunks: classifiedChunks,
    });
  } else {
    // Fallback: minimal analysis
    analysisResult = {
      brand_dna: {},
      brand_dna_confidence: 0.3,
      brand_insights: { positioning_label: 'Analysis pipeline not yet configured', contradictions: [], competitive_insight: null, opinion: null },
      extraction_sources: { pages_crawled: crawlResult.pages.map((/** @type {any} */ p) => ({ url: p.url, title: p.title })), external_signals: [], crawl_method: crawlResult.method },
      brand_type_mismatch: null,
      social_profiles: {},
      competitors: [],
    };
  }

  // Auto-clean
  if (brandCleaner && analysisResult.brand_dna) {
    analysisResult.brand_dna = brandCleaner.cleanBrandDna(analysisResult.brand_dna, brandType);
  }

  await updateSession(sessionId, 'dna_ready', { brand_dna: analysisResult.brand_dna });

  // Emit Brand DNA to frontend
  emit('brand_dna', {
    brand_dna: analysisResult.brand_dna,
    brand_dna_confidence: analysisResult.brand_dna_confidence,
    brand_insights: analysisResult.brand_insights,
    extraction_sources: analysisResult.extraction_sources,
    brand_type_mismatch: analysisResult.brand_type_mismatch,
    sessionId,
  });

  // ── Step 4: Social + Competitor Discovery (parallel) ──
  emit('step', { step: 'social_discovery', message: 'Finding your social presence...', sessionId });

  const brandName = analysisResult.brand_dna?.core_identity?.brand_name?.value || '';

  const [socialProfiles, competitors] = await Promise.all([
    socialDiscovery
      ? socialDiscovery.discoverSocialProfiles({ brandName, brandUrl: url, pages: crawlResult.pages })
      : Promise.resolve({}),
    competitorDiscovery
      ? competitorDiscovery.discoverCompetitors({
          brandName,
          brandType,
          industry: analysisResult.brand_dna?.market_context?.industry?.value || '',
          positioning: analysisResult.brand_dna?.market_context?.positioning?.value || '',
          offerings: analysisResult.brand_dna?.core_identity?.offerings?.value || [],
          brandUrl: url,
        })
      : Promise.resolve([]),
  ]);

  await updateSession(sessionId, 'market_context', { social_profiles: socialProfiles, competitors });

  // Emit market context
  emit('market_context', {
    social_profiles: socialProfiles,
    competitors,
    sessionId,
  });

  // ── Pause for user review (DNA + Market) ──
  emit('await_input', { input_type: 'dna_review', step: 'await_dna_review', sessionId });

  // The pipeline pauses here. When the user confirms (via the /input endpoint),
  // the frontend will call the separate creative generation endpoint.
  // For the SSE flow, we keep the connection alive via heartbeat.
  // The creative generation will be triggered by user confirmation.
}

// ── POST /skills/onboard-brand — Start skill, returns SSE stream ──

router.post('/skills/onboard-brand', requireAuthOrApiKey, async (req, res) => {
  const { org_id, user_id, brand_type, url, manual_data } = req.body;

  if (!org_id || !user_id) {
    return res.status(400).json({ error: 'org_id and user_id are required' });
  }

  if (!brand_type) {
    return res.status(400).json({ error: 'brand_type is required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  /** @type {ReturnType<typeof setInterval> | null} */
  let heartbeat = null;

  try {
    const sessionId = await createSession(org_id, user_id);

    // Heartbeat every 15 seconds
    heartbeat = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch (_) {
        // Connection already closed
      }
    }, 15000);

    req.on('close', () => {
      if (heartbeat) clearInterval(heartbeat);
    });

    // Step 1: Confirm brand type
    emitSSE(res, 'step', { step: 'brand_type_confirmed', brand_type, sessionId });
    await updateSession(sessionId, 'brand_type', { brand_type });

    if (url) {
      // Path A: URL-based onboarding — full pipeline
      await runUrlPipeline(res, sessionId, { url, brandType: brand_type, orgId: org_id, userId: user_id });

      // Keep connection alive for user input (heartbeat handles it)
      // Connection will be closed by client after receiving all events

    } else if (manual_data && typeof manual_data === 'object') {
      // Path B: Manual entry
      const validation = validateManualData(manual_data);

      if (validation.valid) {
        emitSSE(res, 'step', { step: 'manual_entry', message: 'Got it. Saving your brand details.', sessionId });
        await updateSession(sessionId, 'saving', { manual_data });

        emitSSE(res, 'complete', {
          sessionId,
          brand_data: {
            name: manual_data.name,
            brand_type,
            industry: manual_data.industry,
            industry_custom: manual_data.industry_custom || null,
            description: manual_data.description || null,
            tagline: manual_data.tagline || null,
            offerings: manual_data.offerings || [],
            colors: manual_data.colors || {},
            logo_url: manual_data.logo_url || null,
            tone_of_voice: manual_data.tone_of_voice || {},
            target_audience: manual_data.target_audience || {},
            brand_url: manual_data.brand_url || null,
          },
          message: 'Your brand is ready.',
        });

        await updateSession(sessionId, 'complete', { completed_at: new Date().toISOString() });

        if (heartbeat) clearInterval(heartbeat);
        res.end();

      } else {
        emitSSE(res, 'step', { step: 'manual_entry', message: 'No problem. Tell me about your brand.', sessionId });
        await updateSession(sessionId, 'manual_entry', { partial_data: manual_data });
        emitSSE(res, 'await_input', {
          input_type: 'manual_entry',
          step: 'manual_entry',
          sessionId,
          missing_fields: validation.missing,
        });
      }

    } else {
      emitSSE(res, 'step', { step: 'url_input', message: 'Do you have a website for your brand?', sessionId });
      await updateSession(sessionId, 'url_input', {});
      emitSSE(res, 'await_input', { input_type: 'url', step: 'url_input', sessionId });
    }

  } catch (err) {
    console.error('[skills/onboard-brand] Start error:', err);
    emitSSE(res, 'error', { code: 'SKILL_ERROR', message: err.message || 'Failed to start onboarding' });
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  }
});

// ── POST /skills/onboard-brand/:sessionId/input — Receive user input ──

router.post('/skills/onboard-brand/:sessionId/input', requireAuthOrApiKey, async (req, res) => {
  const { sessionId } = req.params;
  const { input_type, data } = req.body;

  if (!input_type) {
    return res.status(400).json({ error: 'input_type is required' });
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (input_type === 'manual_complete' && data && typeof data === 'object') {
      const validation = validateManualData(data);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Missing required brand fields',
          missing: validation.missing,
        });
      }

      const brandType = session.state_data.brand_type || 'product';

      await updateSession(sessionId, 'complete', {
        manual_data: data,
        completed_at: new Date().toISOString(),
      });

      return res.json({
        ok: true,
        sessionId,
        received: input_type,
        brand_data: {
          name: data.name,
          brand_type: brandType,
          industry: data.industry,
          industry_custom: data.industry_custom || null,
          description: data.description || null,
          tagline: data.tagline || null,
          offerings: data.offerings || [],
          colors: data.colors || {},
          logo_url: data.logo_url || null,
          tone_of_voice: data.tone_of_voice || {},
          target_audience: data.target_audience || {},
          brand_url: data.brand_url || null,
        },
      });
    }

    if (input_type === 'dna_review' && data) {
      // User confirmed or edited Brand DNA
      await updateSession(sessionId, 'await_market_confirm', {
        dna_approved: data.approved || false,
        dna_edits: data.edits || {},
        locked_fields: data.locked_fields || [],
      });

      return res.json({ ok: true, sessionId, received: input_type });
    }

    if (input_type === 'market_confirm' && data) {
      // User confirmed social profiles and competitors
      await updateSession(sessionId, 'generating_creatives', {
        social_confirmed: data.social_profiles || {},
        competitors_confirmed: data.competitors || {},
      });

      return res.json({ ok: true, sessionId, received: input_type });
    }

    if (input_type === 'mode_select' && data) {
      // User selected enforcement mode
      await updateSession(sessionId, 'saving', {
        enforcement_mode: data.enforcement_mode || 'medium',
      });

      return res.json({ ok: true, sessionId, received: input_type });
    }

    // Generic input storage
    await updateSession(sessionId, session.current_step, {
      [`${input_type}_response`]: data,
    });

    res.json({ ok: true, sessionId, received: input_type });

  } catch (err) {
    console.error('[skills/onboard-brand] Input error:', err);
    res.status(500).json({ error: 'Failed to process input' });
  }
});

// ── POST /skills/onboard-brand/:sessionId/generate-creatives — Trigger creative gen ──

router.post('/skills/onboard-brand/:sessionId/generate-creatives', requireAuthOrApiKey, async (req, res) => {
  const { sessionId } = req.params;

  // SSE for creative generation
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  /** @type {ReturnType<typeof setInterval> | null} */
  let heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch (_) {}
  }, 15000);

  req.on('close', () => {
    if (heartbeat) clearInterval(heartbeat);
  });

  try {
    const session = await getSession(sessionId);
    if (!session) {
      emitSSE(res, 'error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
      if (heartbeat) clearInterval(heartbeat);
      return res.end();
    }

    const brandDna = session.state_data.brand_dna || {};
    const brandType = session.state_data.brand_type || 'product';
    const orgId = session.org_id;

    // Build brand context for creative generation
    const brandContext = {
      name: brandDna.core_identity?.brand_name?.value || '',
      brandType,
      tagline: brandDna.core_identity?.tagline?.value || '',
      colors: brandDna.visual_language?.colors?.value || {},
      offerings: brandDna.core_identity?.offerings?.value || [],
      toneOfVoice: brandDna.brand_voice?.tone_traits?.value ? { traits: brandDna.brand_voice.tone_traits.value } : {},
      industry: brandDna.market_context?.industry?.value || '',
      positioning: brandDna.market_context?.positioning?.value || '',
    };

    emitSSE(res, 'step', { step: 'generating_creatives', message: "Here's what I'd create for your brand", sessionId });

    if (creativeGenerator) {
      const emit = (/** @type {string} */ event, /** @type {object} */ data) => emitSSE(res, event, { ...data, sessionId });
      const creatives = await creativeGenerator.generateSampleCreatives(brandContext, orgId, emit);
      await updateSession(sessionId, 'await_mode_select', { creatives });
    } else {
      // Creative generator not available — skip to mode select
      emitSSE(res, 'step', { step: 'creatives_skipped', message: 'Creative generation is not yet configured.', sessionId });
    }

    emitSSE(res, 'await_input', { input_type: 'mode_select', step: 'await_mode_select', sessionId });

  } catch (err) {
    console.error('[skills] Creative generation error:', err);
    emitSSE(res, 'error', { code: 'CREATIVE_ERROR', message: err.message || 'Failed to generate creatives' });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  }
});

// ── GET /skills/onboard-brand/:sessionId — Get current session state ──

router.get('/skills/onboard-brand/:sessionId', requireAuthOrApiKey, async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    console.error('[skills/onboard-brand] Get session error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

module.exports = router;
