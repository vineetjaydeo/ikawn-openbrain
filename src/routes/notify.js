const { Router } = require('express');
const { requireAuthOrApiKey } = require('../auth');

const router = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = '534771402'; // @ivineets

router.post('/api/notify/telegram', requireAuthOrApiKey, async (req, res) => {
  try {
    const { message, urgency, chat_id } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required and must be a string' });
    }

    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    }

    const validUrgencies = ['low', 'normal', 'high'];
    if (urgency && !validUrgencies.includes(urgency)) {
      return res.status(400).json({ error: 'urgency must be one of: low, normal, high' });
    }

    const prefix = urgency === 'high' ? '🔴 ' : urgency === 'low' ? '' : '';
    const text = `${prefix}${message}`;

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat_id || DEFAULT_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API error:', data);
      return res.status(502).json({ error: 'Failed to send Telegram message', details: data.description });
    }

    res.json({ success: true, message_id: data.result.message_id });
  } catch (err) {
    console.error('Notify telegram error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;
