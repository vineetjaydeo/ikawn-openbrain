const { Router } = require('express');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

const OPENCLAW_GATEWAY_URL = 'http://72.60.203.110:46533';
const OPENCLAW_AUTH_TOKEN = 'gSDVB49ChsSZlDNJdkp9IWrJP18vxaS3';

router.post('/api/notify/telegram', requireAuthOrApiKey, async (req, res) => {
  try {
    const { message, urgency } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required and must be a string' });
    }

    const validUrgencies = ['low', 'normal', 'high'];
    if (urgency && !validUrgencies.includes(urgency)) {
      return res.status(400).json({ error: 'urgency must be one of: low, normal, high' });
    }

    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/agent/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        message,
        channel: 'telegram',
        ...(urgency && { urgency }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`OpenClaw gateway error: ${response.status} ${errorText}`);
      return res.status(502).json({
        error: 'Failed to deliver message via OpenClaw gateway',
        gateway_status: response.status,
      });
    }

    const data = await response.json().catch(() => ({}));
    res.json({ success: true, gateway_response: data });
  } catch (err) {
    console.error('Notify telegram error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;
