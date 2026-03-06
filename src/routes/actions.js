const { Router } = require('express');
const { requireAuthOrApiKey } = require('../auth');

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

module.exports = router;
