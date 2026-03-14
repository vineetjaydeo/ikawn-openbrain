const { Router } = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { handleUpdate, handleSelfReport } = require('../connectors/telegram');
const { sendTelegramMessage } = require('../utils/telegram');
const { buildSystemPrompt } = require('../ruhi/persona');
const { captureMessage } = require('../utils/capture');

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
// Forwards to OpenClaw first (user-facing), then captures to OpenBrain DB
router.post('/webhooks/telegram/:token', async (req, res) => {
  const expectedToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!expectedToken || req.params.token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const body = req.body;

  // Forward to OpenClaw FIRST — this is the critical path for user response.
  // Must happen before res.json() to avoid Fly.io killing async continuation.
  const openclawWebhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
  const openclawWebhookSecret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (openclawWebhookUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (openclawWebhookSecret) {
        headers['X-Telegram-Bot-Api-Secret-Token'] = openclawWebhookSecret;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      await fetch(openclawWebhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      console.log('[Telegram] Forwarded update to OpenClaw');
    } catch (err) {
      console.error('[Telegram] Failed to forward to OpenClaw:', err.message);
    }
  } else {
    console.warn('[Telegram] OPENCLAW_WEBHOOK_URL not set, skipping forward');
  }

  // Respond to Telegram — forwarding is done, capture can happen async
  res.json({ ok: true });

  // Capture message to OpenBrain DB (async, non-blocking for user)
  try {
    await handleUpdate(body);
  } catch (err) {
    console.error('Telegram webhook capture error:', err);
  }
});

// ── Intelligence Telegram Bot (@OpenBrain_Ruhi_bot) ──
// Responds as Ruhi with full RAG + intelligence context. No forwarding to OpenClaw.
// All work MUST complete before res.json() — Fly.io kills async after response.
router.post('/webhooks/intelligence-telegram/:token', async (req, res) => {
  const expectedToken = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
  if (!expectedToken || req.params.token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const body = req.body;
  const message = body.message;

  // Only handle text messages
  if (!message?.text) {
    res.json({ ok: true });
    return;
  }

  const chatId = String(message.chat.id);
  const userText = message.text;
  const userName = message.from?.first_name || 'User';

  console.log(`[IntelBot] Message from ${userName} (${chatId}): ${userText.slice(0, 100)}`);

  try {
    // 1. RAG — search memory for relevant context
    let memoryContext = '';
    try {
      const embedding = await getEmbedding(userText);
      const memResult = await pool.query(
        `SELECT content, memory_type, project, created_at,
                cosine_similarity(embedding, $1) AS similarity
         FROM memories
         WHERE embedding IS NOT NULL
           AND (archived IS NULL OR archived = false)
         ORDER BY cosine_similarity(embedding, $1) DESC
         LIMIT 10`,
        [embedding]
      );
      if (memResult.rows.length > 0) {
        memoryContext = memResult.rows.map((m, i) => {
          const date = new Date(m.created_at).toLocaleDateString();
          const type = m.memory_type || 'note';
          return `[${i + 1}] (${type}, ${date}) ${m.content.slice(0, 500)}`;
        }).join('\n\n');
      }
    } catch (ragErr) {
      console.warn('[IntelBot] RAG search failed:', ragErr.message);
    }

    // 2. Inject latest intelligence snapshot
    let intelContext = '';
    try {
      const latestIntel = await pool.query(
        `SELECT summary, data FROM intelligence_snapshots
         WHERE snapshot_type = 'cohort_analysis'
         ORDER BY created_at DESC LIMIT 1`
      );
      if (latestIntel.rows[0]) {
        intelContext = `\n\nCURRENT PLATFORM INTELLIGENCE:\n${latestIntel.rows[0].summary}`;
      }
    } catch (intelErr) {
      console.warn('[IntelBot] Intelligence injection failed:', intelErr.message);
    }

    // 3. Build system prompt — full Ruhi persona + memory + intelligence
    const systemPrompt = buildSystemPrompt(userName, 'admin', memoryContext + intelContext);

    // 4. Call Anthropic (non-streaming — Telegram doesn't support SSE)
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    });

    const ruhiReply = response.content.find(b => b.type === 'text')?.text || 'I couldn\'t generate a response right now.';

    // 5. Send reply via Telegram — split if > 4096 chars
    const chunks = splitTelegramMessage(ruhiReply);
    for (const chunk of chunks) {
      await sendTelegramMessage(chunk, { chatId });
    }

    // 6. Capture both messages to memory
    captureMessage({
      brand_id: 'ikawn',
      channel: 'telegram-ruhi',
      direction: 'inbound',
      content: userText,
      source_ref: `tg_ruhi_in_${chatId}_${message.message_id}`,
      metadata: { project: 'ruhi-telegram', author: userName }
    });
    captureMessage({
      brand_id: 'ikawn',
      channel: 'telegram-ruhi',
      direction: 'outbound',
      content: ruhiReply,
      source_ref: `tg_ruhi_out_${chatId}_${message.message_id}`,
      metadata: { project: 'ruhi-telegram' }
    });

    console.log(`[IntelBot] Replied to ${userName} (${ruhiReply.length} chars)`);
  } catch (err) {
    console.error('[IntelBot] Error:', err);
    // Try to send error message to user
    try {
      await sendTelegramMessage('Something went wrong on my end. Try again in a moment.', { chatId });
    } catch (_) {}
  }

  res.json({ ok: true });
});

/**
 * Split a message into chunks that fit Telegram's 4096 char limit.
 * Tries to break at paragraph boundaries, then sentence boundaries.
 */
function splitTelegramMessage(text, maxLen = 4096) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at last paragraph boundary within limit
    let breakAt = remaining.lastIndexOf('\n\n', maxLen);
    if (breakAt < maxLen * 0.3) {
      // Too far back — try single newline
      breakAt = remaining.lastIndexOf('\n', maxLen);
    }
    if (breakAt < maxLen * 0.3) {
      // Still too far — try sentence boundary
      breakAt = remaining.lastIndexOf('. ', maxLen);
      if (breakAt > 0) breakAt += 1; // include the period
    }
    if (breakAt < maxLen * 0.3) {
      // Hard cut
      breakAt = maxLen;
    }

    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  return chunks;
}

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
