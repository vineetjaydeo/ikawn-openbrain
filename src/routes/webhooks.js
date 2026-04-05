const { Router } = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { handleUpdate, handleSelfReport } = require('../connectors/telegram');
const { sendTelegramMessage, sendChatAction } = require('../utils/telegram');
const { buildSystemPrompt } = require('../ruhi/persona');
const { captureMessage } = require('../utils/capture');
const { getTool, getToolSchemas } = require('../tools/registry');

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

        // captureMessage handles ON CONFLICT by source_ref (idempotent upsert)
        await captureMessage({
          brand_id: req.brand_id,
          channel: 'github',
          direction: 'inbound',
          content,
          source_ref: commit.id,
          access_level: 'internal',
          metadata: { project: payload.repository?.name || '' },
        });
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

      // captureMessage handles ON CONFLICT by source_ref — upserts content + re-queues embedding
      await captureMessage({
        brand_id: req.brand_id,
        channel: 'github',
        direction: 'inbound',
        content,
        source_ref: ref,
        access_level: 'internal',
        metadata: { project: payload.repository?.name || '' },
      });
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

      // captureMessage handles ON CONFLICT by source_ref — upserts content + re-queues embedding
      await captureMessage({
        brand_id: req.brand_id,
        channel: 'github',
        direction: 'inbound',
        content,
        source_ref: ref,
        access_level: 'internal',
        metadata: { project: payload.repository?.name || '' },
      });
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

  // Send typing indicator immediately so user knows the bot is working
  const chatId = body.message?.chat?.id || body.edited_message?.chat?.id;
  if (chatId) {
    sendChatAction('typing', { chatId: String(chatId), botToken: req.params.token });
  }

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
    await handleUpdate(body, { brandId: req.brand_id });
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

  // Handle callback queries (approval buttons) inline
  if (body.callback_query) {
    const cq = body.callback_query;
    const cqChatId = String(cq.message?.chat?.id || '');
    const data = cq.data || '';
    try {
      const [action, runIdStr] = data.split(':');
      const runId = parseInt(runIdStr, 10);
      if (runId && (action === 'approve' || action === 'reject')) {
        const { rows: [run] } = await pool.query(
          `SELECT tr.*, st.name AS task_name, st.agent_slug
           FROM task_runs tr JOIN scheduled_tasks st ON st.id = tr.task_id
           WHERE tr.id = $1 AND st.brand_id = $2`, [runId, req.brand_id]
        );
        if (run) {
          if (action === 'approve') {
            await pool.query("UPDATE task_runs SET status = 'approved', approved_by = 'telegram', approved_at = NOW() WHERE id = $1 AND brand_id = $2", [runId, req.brand_id]);
            await sendTelegramMessage(`\u2705 Approved: "${run.task_name}"`, { chatId: cqChatId });
          } else {
            await pool.query("UPDATE task_runs SET status = 'rejected', approved_by = 'telegram', approved_at = NOW() WHERE id = $1 AND brand_id = $2", [runId, req.brand_id]);
            captureMessage({
              brand_id: req.brand_id, channel: 'agent', direction: 'inbound',
              content: `[CORRECTION] Task "${run.task_name}" (${run.agent_slug}) rejected via Telegram. Action: ${run.result?.summary || 'unknown'}`,
              source_ref: `correction_${runId}`,
              metadata: { project: 'agent-platform', memory_type: 'CORRECTION' },
            });
            await sendTelegramMessage(`\u274c Rejected: "${run.task_name}". Feedback captured.`, { chatId: cqChatId });
          }
        }
        await fetch(`https://api.telegram.org/bot${req.params.token}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: cq.id }),
        });
      }
    } catch (cbErr) { console.error('[IntelBot] Callback error:', cbErr.message); }
    res.json({ ok: true });
    return;
  }

  const message = body.message;

  // Must have either text or photo
  if (!message?.text && !message?.photo && !message?.caption) {
    res.json({ ok: true });
    return;
  }

  const chatId = String(message.chat.id);
  const userName = message.from?.first_name || 'User';

  // Build user content — text, photo, or photo+caption
  let userText = message.text || message.caption || '';
  let imageBase64 = null;
  let imageMediaType = 'image/jpeg';

  if (message.photo && message.photo.length > 0) {
    // Get highest resolution photo (last in array), download as base64
    const bestPhoto = message.photo[message.photo.length - 1];
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${req.params.token}/getFile?file_id=${bestPhoto.file_id}`);
      const fileData = await fileRes.json();
      if (fileData.ok && fileData.result.file_path) {
        const fileUrl = `https://api.telegram.org/file/bot${req.params.token}/${fileData.result.file_path}`;
        const imgRes = await fetch(fileUrl);
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        imageBase64 = imgBuffer.toString('base64');
        // Detect media type from file path
        const fp = fileData.result.file_path.toLowerCase();
        if (fp.endsWith('.png')) imageMediaType = 'image/png';
        else if (fp.endsWith('.webp')) imageMediaType = 'image/webp';
        else if (fp.endsWith('.gif')) imageMediaType = 'image/gif';
      }
    } catch (err) {
      console.warn('[IntelBot] Failed to download photo:', err.message);
    }
    if (!userText) userText = 'What do you see in this image?';
  }

  // Typing indicator — repeat every 4s to keep it alive during long API calls
  sendChatAction('typing', { chatId });
  const typingInterval = setInterval(() => sendChatAction('typing', { chatId }), 4000);

  console.log(`[IntelBot] Message from ${userName} (${chatId}): ${userText.slice(0, 100)}${imageBase64 ? ' [+image]' : ''}`);

  try {
    // 0. Find or create daily conversation in DB (so it appears on ruhi.ikawn.in)
    // One conversation per calendar day per Telegram chat
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const sourceKey = `telegram:${chatId}:${today}`;

    // Look up V's user_id (admin user)
    const userResult = await pool.query("SELECT id FROM users WHERE email = 'v@ikawn.com'");
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      console.error('[IntelBot] Admin user not found in DB');
      await sendTelegramMessage('System error — admin user not configured.', { chatId });
      res.json({ ok: true });
      return;
    }

    // Find today's conversation for this Telegram chat, or create one
    let convResult = await pool.query(
      'SELECT id, uuid FROM conversations WHERE source = $1 AND user_id = $2',
      [sourceKey, userId]
    );
    let convId, convUuid;
    if (convResult.rows.length > 0) {
      convId = convResult.rows[0].id;
      convUuid = convResult.rows[0].uuid;
    } else {
      const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const newConv = await pool.query(
        `INSERT INTO conversations (user_id, title, source, brand_id)
         VALUES ($1, $2, $3, $4) RETURNING id, uuid`,
        [userId, `Telegram — ${dateLabel}`, sourceKey, req.brand_id]
      );
      convId = newConv.rows[0].id;
      convUuid = newConv.rows[0].uuid;
      console.log(`[IntelBot] Created conversation ${convUuid} for ${sourceKey}`);
    }

    // Save user message to messages table
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content, brand_id) VALUES ($1, $2, $3, $4)',
      [convId, 'user', userText, req.brand_id]
    );

    // 1. RAG — search memory for relevant context (scoped to this user)
    let memoryContext = '';
    try {
      const embedding = await getEmbedding(userText);
      const vectorStr = `[${embedding.join(',')}]`;
      const memResult = await pool.query(
        `SELECT content, memory_type, project, author, created_at,
                1 - (embedding <=> $1::vector) AS similarity
         FROM memories
         WHERE embedding IS NOT NULL
           AND (archived IS NULL OR archived = false)
           AND brand_id = $2
           AND (user_id = $3 OR access_level NOT IN ('private') OR user_id IS NULL)
         ORDER BY embedding <=> $1::vector
         LIMIT 10`,
        [vectorStr, req.brand_id, userId]
      );
      if (memResult.rows.length > 0) {
        memoryContext = memResult.rows.map((m, i) => {
          const date = new Date(m.created_at).toLocaleDateString();
          const type = m.memory_type || 'note';
          const by = m.author ? `, by ${m.author}` : '';
          return `[${i + 1}] (${type}, ${date}${by}) ${m.content.slice(0, 500)}`;
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
    const systemPrompt = await buildSystemPrompt(userName, 'admin', memoryContext + intelContext, null, req.brand_id);

    // 4. Get conversation history for context (last 20 messages)
    const historyResult = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20',
      [convId]
    );
    const historyMessages = historyResult.rows.reverse().map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // If current message has an image, replace the last user message with multimodal content
    if (imageBase64 && historyMessages.length > 0) {
      const lastMsg = historyMessages[historyMessages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = [
          { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageBase64 } },
          { type: 'text', text: userText },
        ];
      }
    }

    // 5. Call Anthropic with web search + all registry tools
    const Anthropic = require('@anthropic-ai/sdk');
    const { formatSystemForCaching } = require('../utils/llm');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build tool definitions — all registry tools + web_search (gated by intent)
    const { getTools: getAllTools } = require('../tools/registry');
    const allRegistryTools = getAllTools();
    const registrySchemas = getToolSchemas([...allRegistryTools.keys()]);
    const allTools = [...registrySchemas];

    // Only attach web_search when the message likely needs it (saves tokens)
    const _needsSearch = (() => {
      if (!userText) return false;
      const lower = userText.toLowerCase().trim();
      if (lower.includes('?')) return true;
      if (/^(what|who|where|when|why|how|is|are|do|does|can|will|should|which)\b/.test(lower)) return true;
      return /\b(search|find|look up|lookup|latest|current|news|today|recent|update|price|weather|stock)\b/.test(lower);
    })();
    if (_needsSearch) {
      allTools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
    }

    // Multi-turn loop: Claude may call manage_task, we execute and feed result back
    let messages = [...historyMessages];
    let ruhiReply = '';
    const MAX_ROUNDS = 5;
    const TOOL_TIMEOUT_MS = 30000;
    const MAX_TOOL_FAILURES = 2;
    const toolFailureCounts = {};

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: formatSystemForCaching(systemPrompt),
        messages,
        tools: allTools,
      });

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use' && b.name !== 'web_search');
      const textBlocks = response.content.filter(b => b.type === 'text');

      if (toolUseBlocks.length === 0) {
        // No more tool calls — extract final text
        ruhiReply = textBlocks.map(b => b.text).join('\n') || 'I couldn\'t generate a response right now.';
        break;
      }

      // Execute tool calls and feed results back
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const tool = getTool(toolBlock.name);
        let result;
        if (!tool) {
          result = { success: false, data: null, summary: `Unknown tool: ${toolBlock.name}` };
        } else if ((toolFailureCounts[toolBlock.name] || 0) >= MAX_TOOL_FAILURES) {
          result = { success: false, data: null, summary: `Tool ${toolBlock.name} disabled after ${MAX_TOOL_FAILURES} failures` };
        } else {
          try {
            result = await Promise.race([
              tool.execute(toolBlock.input || {}, { brandId: req.brand_id, userId, conversationId: String(chatId), pool }),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${toolBlock.name} timed out after 30s`)), TOOL_TIMEOUT_MS))
            ]);
          } catch (err) {
            toolFailureCounts[toolBlock.name] = (toolFailureCounts[toolBlock.name] || 0) + 1;
            console.error(`[Telegram] Tool ${toolBlock.name} failed (${toolFailureCounts[toolBlock.name]}/${MAX_TOOL_FAILURES}):`, err.message);
            result = { success: false, data: null, summary: `Tool error: ${err.message}` };
          }
        }
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (!ruhiReply) ruhiReply = 'I ran out of processing rounds. Let me know if you need anything else.';

    // 6. Save assistant reply to messages table + update conversation
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content, model, brand_id) VALUES ($1, 'assistant', $2, $3, $4)",
      [convId, ruhiReply, 'claude-sonnet-4-6', req.brand_id]
    );
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [convId]
    );

    // 7. Send reply via Telegram — split if > 4096 chars
    const chunks = splitTelegramMessage(ruhiReply);
    for (const chunk of chunks) {
      await sendTelegramMessage(chunk, { chatId });
    }

    // 8. Capture both messages to memories for RAG (fire-and-forget, user-scoped)
    captureMessage({
      brand_id: req.brand_id,
      channel: 'telegram-ruhi',
      direction: 'inbound',
      content: userText,
      source_ref: `tg_ruhi_in_${chatId}_${message.message_id}`,
      metadata: { project: 'ruhi-telegram', author: userName },
      user_id: userId
    });
    captureMessage({
      brand_id: req.brand_id,
      channel: 'telegram-ruhi',
      direction: 'outbound',
      content: ruhiReply,
      source_ref: `tg_ruhi_out_${chatId}_${message.message_id}`,
      metadata: { project: 'ruhi-telegram' },
      user_id: userId
    });

    console.log(`[IntelBot] Replied to ${userName} (${ruhiReply.length} chars, conv ${convUuid})`);
  } catch (err) {
    console.error('[IntelBot] Error:', err);
    try {
      const debugMsg = process.env.NODE_ENV === 'production'
        ? `Something went wrong on my end (${err.message?.slice(0, 100) || 'unknown'}). Try again in a moment.`
        : `Error: ${err.message}`;
      await sendTelegramMessage(debugMsg, { chatId });
    } catch (_) {}
  } finally {
    clearInterval(typingInterval);
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

// ── Telegram Callback Query Handler (approval buttons) ──
router.post('/webhooks/intelligence-telegram-callback/:token', async (req, res) => {
  const expectedToken = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
  if (!expectedToken || req.params.token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const callbackQuery = req.body.callback_query;
  if (!callbackQuery) {
    res.json({ ok: true });
    return;
  }

  const chatId = String(callbackQuery.message?.chat?.id || '');
  const data = callbackQuery.data || '';

  try {
    const [action, runIdStr] = data.split(':');
    const runId = parseInt(runIdStr, 10);
    if (!runId || (action !== 'approve' && action !== 'reject')) {
      await sendTelegramMessage('Invalid callback data.', { chatId });
      res.json({ ok: true });
      return;
    }

    // Fetch the task run (brand-scoped to prevent cross-brand approval)
    const { rows: [run] } = await pool.query(
      `SELECT tr.*, st.name AS task_name, st.agent_slug
       FROM task_runs tr
       JOIN scheduled_tasks st ON st.id = tr.task_id
       WHERE tr.id = $1 AND st.brand_id = $2`,
      [runId, req.brand_id]
    );

    if (!run) {
      await sendTelegramMessage('Task run not found.', { chatId });
      res.json({ ok: true });
      return;
    }

    if (action === 'approve') {
      await pool.query(
        "UPDATE task_runs SET status = 'approved', approved_by = 'telegram', approved_at = NOW() WHERE id = $1 AND brand_id = $2",
        [runId, req.brand_id]
      );
      await sendTelegramMessage(`\u2705 Approved: "${run.task_name}"`, { chatId });
    } else {
      await pool.query(
        "UPDATE task_runs SET status = 'rejected', approved_by = 'telegram', approved_at = NOW() WHERE id = $1 AND brand_id = $2",
        [runId, req.brand_id]
      );
      // Capture rejection as CORRECTION memory for future learning
      captureMessage({
        brand_id: req.brand_id,
        channel: 'agent',
        direction: 'inbound',
        content: `[CORRECTION] Task "${run.task_name}" (${run.agent_slug}) rejected by user via Telegram. Action was: ${run.result?.summary || 'unknown'}`,
        source_ref: `correction_${runId}`,
        metadata: { project: 'agent-platform', memory_type: 'CORRECTION' },
      });
      await sendTelegramMessage(`\u274c Rejected: "${run.task_name}". Feedback captured.`, { chatId });
    }

    // Answer the callback query to remove the loading state
    const token = process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQuery.id }),
    });
  } catch (err) {
    console.error('[CallbackQuery] Error:', err);
  }

  res.json({ ok: true });
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
