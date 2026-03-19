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

/**
 * Write an SSE event to the response.
 * @param {import('express').Response} res
 * @param {string} event
 * @param {object} data
 */
function emitSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
      // Path A: URL-based onboarding (Drop 1 scaffold -- crawl pipeline is Drop 2)
      emitSSE(res, 'step', { step: 'crawling', message: 'Scanning your website...', sessionId });
      await updateSession(sessionId, 'crawling', { url });

      // Drop 1: emit placeholder and await input (crawl pipeline not yet built)
      emitSSE(res, 'await_input', { input_type: 'url_crawl_pending', step: 'crawling', sessionId });

    } else if (manual_data && typeof manual_data === 'object') {
      // Path B: Manual entry
      const validation = validateManualData(manual_data);

      if (validation.valid) {
        // Manual data is complete -- run the save flow
        emitSSE(res, 'step', { step: 'manual_entry', message: 'Got it. Saving your brand details.', sessionId });
        await updateSession(sessionId, 'saving', { manual_data });

        // Emit complete with full brand data -- frontend handles the actual save
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

      } else {
        // Manual data is incomplete -- ask for more info
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
      // No URL or manual data provided -- ask how they want to proceed
      emitSSE(res, 'step', { step: 'url_input', message: 'Do you have a website for your brand?', sessionId });
      await updateSession(sessionId, 'url_input', {});
      emitSSE(res, 'await_input', { input_type: 'url', step: 'url_input', sessionId });
    }

    // For the SSE paths that await input, keep connection alive for client to read events.
    // The heartbeat handles keep-alive. The client will close when it has what it needs.
    // For the 'complete' path, we can end right away.
    if (manual_data && validateManualData(manual_data).valid) {
      if (heartbeat) clearInterval(heartbeat);
      res.end();
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
      // Manual entry completion -- validate and emit complete
      const validation = validateManualData(data);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Missing required brand fields',
          missing: validation.missing,
        });
      }

      const brandType = session.state_data.brand_type || 'product';

      // Update session with final data
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

    // Store user input in session state
    await updateSession(sessionId, session.current_step, {
      [`${input_type}_response`]: data,
    });

    res.json({ ok: true, sessionId, received: input_type });

  } catch (err) {
    console.error('[skills/onboard-brand] Input error:', err);
    res.status(500).json({ error: 'Failed to process input' });
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
