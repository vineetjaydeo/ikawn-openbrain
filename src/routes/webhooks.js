const { Router } = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { handleUpdate, handleSelfReport } = require('../connectors/telegram');

const router = Router();

function verifyGitHubSignature(req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if no secret set
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(req.body));
  const expected = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

router.post('/webhooks/github', async (req, res) => {
  if (!verifyGitHubSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  try {
    if (event === 'push' && payload.commits) {
      for (const commit of payload.commits) {
        const content = [
          `[Commit] ${commit.message}`,
          `Author: ${commit.author?.name || 'unknown'}`,
          `Date: ${commit.timestamp || ''}`,
          `SHA: ${commit.id}`,
          `Repo: ${payload.repository?.name || ''}`,
          `Files: ${(commit.added || []).concat(commit.modified || []).join(', ').slice(0, 500)}`,
        ].join('\n');

        const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [commit.id]);
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO memories (content, source, memory_type, source_ref, source_url, project, author, access_level, brand_id, embedding_status)
             VALUES ($1, 'github', 'github_commit', $2, $3, $4, $5, 'internal', 'ikawn', 'pending')`,
            [content, commit.id, commit.url, payload.repository?.name || '', commit.author?.name || 'unknown']
          );
        }
      }
    }

    if (event === 'issues' && payload.issue) {
      const issue = payload.issue;
      const ref = `issue-${payload.repository?.name}-${issue.number}`;
      const content = [
        `[Issue] ${issue.title}`,
        `Action: ${payload.action}`,
        `Status: ${issue.state}`,
        `Labels: ${(issue.labels || []).map(l => l.name).join(', ') || 'none'}`,
        issue.body ? `\n${issue.body.slice(0, 1000)}` : '',
      ].join('\n');

      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [ref]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO memories (content, source, memory_type, source_ref, source_url, project, author, access_level, brand_id, embedding_status)
           VALUES ($1, 'github', 'github_issue', $2, $3, $4, $5, 'internal', 'ikawn', 'pending')`,
          [content, ref, issue.html_url, payload.repository?.name || '', issue.user?.login || 'unknown']
        );
      } else {
        // Update existing — re-queue for async embedding
        await pool.query(
          'UPDATE memories SET content = $1, embedding_status = $2 WHERE source_ref = $3',
          [content, 'pending', ref]
        );
      }
    }

    if (event === 'pull_request' && payload.pull_request) {
      const pr = payload.pull_request;
      const ref = `pr-${payload.repository?.name}-${pr.number}`;
      const content = [
        `[PR] ${pr.title}`,
        `Action: ${payload.action}`,
        `Status: ${pr.state}${pr.merged_at ? ' (merged)' : ''}`,
        `Author: ${pr.user?.login || 'unknown'}`,
        pr.body ? `\n${pr.body.slice(0, 1000)}` : '',
      ].join('\n');

      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [ref]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO memories (content, source, memory_type, source_ref, source_url, project, author, access_level, brand_id, embedding_status)
           VALUES ($1, 'github', 'github_pr', $2, $3, $4, $5, 'internal', 'ikawn', 'pending')`,
          [content, ref, pr.html_url, payload.repository?.name || '', pr.user?.login || 'unknown']
        );
      } else {
        // Update existing — re-queue for async embedding
        await pool.query(
          'UPDATE memories SET content = $1, embedding_status = $2 WHERE source_ref = $3',
          [content, 'pending', ref]
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('GitHub webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Telegram webhook — authenticated by bot token in URL path
// Captures message to OpenBrain DB, then forwards raw update to OpenClaw for response
router.post('/webhooks/telegram/:token', async (req, res) => {
  const expectedToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!expectedToken || req.params.token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Respond to Telegram immediately — processing happens async
  res.json({ ok: true });

  try {
    // Capture message to OpenBrain DB (real-time sync)
    await handleUpdate(req.body);
  } catch (err) {
    console.error('Telegram webhook capture error:', err);
  }

  // Forward raw update to OpenClaw webhook listener for LLM processing + response
  const openclawWebhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
  const openclawWebhookSecret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (openclawWebhookUrl) {
    try {
      const forwardUrl = openclawWebhookUrl;
      const headers = { 'Content-Type': 'application/json' };
      if (openclawWebhookSecret) {
        headers['X-Telegram-Bot-Api-Secret-Token'] = openclawWebhookSecret;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      await fetch(forwardUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      console.log('[Telegram] Forwarded update to OpenClaw');
    } catch (err) {
      console.error('[Telegram] Failed to forward to OpenClaw:', err.message);
    }
  }
});

// OpenClaw self-report endpoint — API key auth
router.post('/api/ingest/openclaw', async (req, res) => {
  const apiKey = process.env.OPENBRAIN_API_KEY;
  const provided = req.headers['x-api-key'];
  if (!apiKey || provided !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  try {
    const result = await handleSelfReport(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('OpenClaw ingest error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
