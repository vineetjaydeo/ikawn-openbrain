const { Router } = require('express');
const { requireAuthOrApiKey } = require('../auth');
const { pool } = require('../db');
const { captureMessage } = require('../utils/capture');

const router = Router();

const IKAWN_API_URL = process.env.IKAWN_API_URL || 'https://os.ikawn.com';
const IKAWN_API_KEY = process.env.IKAWN_API_KEY;

router.post('/api/actions/trigger', requireAuthOrApiKey, async (req, res) => {
  try {
    const { action, agent, prompt, options, callbackUrl } = req.body;

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required' });
    }

    if (action === 'generate') {
      if (!IKAWN_API_KEY) {
        return res.status(500).json({ error: 'IKAWN_API_KEY not configured' });
      }
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required for generate action' });
      }

      const validAgents = ['genie', 'remix', 'prism', 'lazarus'];
      const selectedAgent = agent || 'genie';
      if (!validAgents.includes(selectedAgent)) {
        return res.status(400).json({ error: `agent must be one of: ${validAgents.join(', ')}` });
      }

      const response = await fetch(`${IKAWN_API_URL}/api/external/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${IKAWN_API_KEY}`,
        },
        body: JSON.stringify({
          agent: selectedAgent,
          prompt,
          ...(options || {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: 'ikawn generate failed', details: data });
      }

      res.json({ success: true, ...data });
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}. Supported: generate` });
    }
  } catch (err) {
    console.error('Action trigger error:', err);
    res.status(500).json({ error: 'Failed to trigger action' });
  }
});

router.get('/api/actions/status/:id', requireAuthOrApiKey, async (req, res) => {
  try {
    if (!IKAWN_API_KEY) {
      return res.status(500).json({ error: 'IKAWN_API_KEY not configured' });
    }

    const response = await fetch(`${IKAWN_API_URL}/api/external/generations/${req.params.id}`, {
      headers: { 'Authorization': `Bearer ${IKAWN_API_KEY}` },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch status', details: data });
    }

    res.json(data);
  } catch (err) {
    console.error('Action status error:', err);
    res.status(500).json({ error: 'Failed to fetch action status' });
  }
});

// POST /api/actions/complete — webhook from ikawn OS when generation finishes
router.post('/api/actions/complete', requireAuthOrApiKey, async (req, res) => {
  try {
    const { generationId, status, urls, metadata } = req.body;

    if (!generationId) {
      return res.status(400).json({ error: 'generationId is required' });
    }

    await pool.query(`
      UPDATE generations SET
        status = $1,
        output_urls = $2,
        output_metadata = $3,
        callback_received = true
      WHERE ikawn_generation_id = $4
    `, [status || 'completed', urls || [], JSON.stringify(metadata || {}), generationId]);

    // Capture to memories so it's searchable
    if (status === 'completed' && urls && urls.length > 0) {
      captureMessage({
        brand_id: 'ikawn',
        channel: 'api',
        direction: 'outbound',
        content: `Generation completed. Agent: ${metadata?.agent || 'unknown'}. URLs: ${urls.join(', ')}`,
        source_ref: `generation_complete_${generationId}`
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Actions] Complete error:', err);
    res.status(500).json({ error: 'Failed to record generation completion' });
  }
});

module.exports = router;
