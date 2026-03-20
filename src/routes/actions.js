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

      // Genie and Remix return 4 images per call; Prism returns 1; Lazarus returns 1 video
      const batchSize = ['genie', 'remix'].includes(selectedAgent) ? 4 : 1;

      // Record generation in OpenBrain DB with batch_size
      if (data.generationId) {
        pool.query(`
          INSERT INTO generations (brand_id, agent_name, prompt, output_type, status, ikawn_generation_id, batch_size)
          VALUES ($1, $2, $3, $4, 'pending', $5, $6)
          ON CONFLICT DO NOTHING
        `, [req.brand_id, selectedAgent, prompt, selectedAgent === 'lazarus' ? 'video' : 'image', data.generationId, batchSize])
          .catch(err => console.warn('[Actions] Failed to record generation:', err.message));
      }

      res.json({ success: true, batch_size: batchSize, ...data });
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

    const outputUrls = urls || [];
    await pool.query(`
      UPDATE generations SET
        status = $1,
        output_urls = $2,
        output_metadata = $3,
        callback_received = true,
        output_count = $5
      WHERE ikawn_generation_id = $4
    `, [status || 'completed', outputUrls, JSON.stringify(metadata || {}), generationId, outputUrls.length]);

    // Capture ALL generation outcomes to memories (success, error, empty)
    const agent = metadata?.agent || 'unknown';
    const genStatus = status || 'completed';
    const urlList = outputUrls.length > 0 ? ` URLs: ${outputUrls.join(', ')}` : '';
    captureMessage({
      brand_id: req.brand_id,
      channel: 'api',
      direction: 'outbound',
      content: `Generation ${genStatus}. Agent: ${agent}.${urlList}`,
      source_ref: `generation_${genStatus}_${generationId}`
    });

    res.json({ ok: true, urls: outputUrls, output_count: outputUrls.length });
  } catch (err) {
    console.error('[Actions] Complete error:', err);
    res.status(500).json({ error: 'Failed to record generation completion' });
  }
});

// GET /api/gallery — unified gallery: ikawn OS generations + local chat attachments
router.get('/api/gallery', requireAuthOrApiKey, async (req, res) => {
  try {
    const userId = req.session?.user?.id || req.apiUser?.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const source = req.query.source; // 'generations', 'chat', or undefined (all)

    const images = [];

    // Fetch generations from ikawn OS (unless filtered to chat only)
    if (source !== 'chat' && IKAWN_API_KEY) {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (req.query.agent) params.set('agent', req.query.agent);
        const url = `${IKAWN_API_URL}/api/external/generations?${params}`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${IKAWN_API_KEY}` },
        });
        if (response.ok) {
          const data = await response.json();
          for (const gen of (data.generations || [])) {
            if (gen.status !== 'complete' || !gen.resultUrls?.length) continue;
            const thumbs = gen.thumbnailUrls || [];
            for (let i = 0; i < gen.resultUrls.length; i++) {
              images.push({
                url: gen.resultUrls[i],
                thumbnail: thumbs[i] || gen.resultUrls[i],
                filename: `${gen.agent}_${i + 1}`,
                source: 'generation',
                agent: gen.agent,
                date: gen.createdAt,
              });
            }
          }
        }
      } catch (err) {
        console.error('[Gallery] ikawn OS fetch error:', err.message);
      }
    }

    // Fetch local chat attachments (unless filtered to generations only)
    if (source !== 'generations' && userId) {
      try {
        const { rows } = await pool.query(
          `SELECT m.attachments, m.created_at, c.title AS conversation_title
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.user_id = $1
             AND m.attachments IS NOT NULL
             AND m.attachments != '[]'::jsonb
           ORDER BY m.created_at DESC
           LIMIT $2`,
          [userId, limit]
        );
        for (const row of rows) {
          const attachments = Array.isArray(row.attachments) ? row.attachments : [];
          for (const a of attachments) {
            if (a.type === 'image' && a.url) {
              images.push({
                url: a.url,
                thumbnail: a.url,
                filename: a.filename || 'image',
                source: 'chat',
                conversation: row.conversation_title,
                date: row.created_at,
              });
            }
          }
        }
      } catch (err) {
        console.error('[Gallery] Chat attachments error:', err.message);
      }
    }

    // Sort by date descending
    images.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ images });
  } catch (err) {
    console.error('[Gallery] Error:', err);
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

module.exports = router;
