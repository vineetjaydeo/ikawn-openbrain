const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { streamChat, chatCompletion } = require('../utils/llm');
const { searchWeb } = require('../utils/web-search');
const { readLink } = require('../utils/link-reader');
const { extractText } = require('../utils/doc-parser');

// ── Helpers ──

function requireAuth(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function requireAdmin(req, res) {
  if (!requireAuth(req, res)) return false;
  if (req.session.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ── 1. List conversations ──

router.get('/api/conversations', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { rows } = await pool.query(
      'SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2. Create conversation ──

router.post('/api/conversations', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const title = req.body.title || 'New conversation';
    const { rows } = await pool.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [req.session.user.id, title]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 3. Get conversation with messages ──

router.get('/api/conversations/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { rows: convRows } = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Not found' });
    if (convRows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { rows: messages } = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ ...convRows[0], messages });
  } catch (err) {
    console.error('GET /api/conversations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4. Delete conversation ──

router.delete('/api/conversations/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM conversations WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [req.params.id]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/conversations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5. Update conversation title ──

router.patch('/api/conversations/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM conversations WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { rows: updated } = await pool.query(
      'UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.title, req.params.id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('PATCH /api/conversations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 6. Send chat message (SSE streaming) ──

router.post('/api/chat/send', async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { conversation_id, content, attachments, use_secondary } = req.body;

  if (!conversation_id || !content) {
    return res.status(400).json({ error: 'conversation_id and content are required' });
  }

  try {
    // Verify conversation ownership
    const { rows: convRows } = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conversation_id]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Conversation not found' });
    if (convRows[0].user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Process attachments — resolve link content if needed
    const processedAttachments = [];
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        const processed = { ...att };
        if (att.type === 'link' && !att.extracted_text) {
          try {
            const linkData = await readLink(att.url);
            if (linkData) {
              processed.extracted_text = `[${linkData.title}]\n${linkData.content}`;
              processed.name = processed.name || linkData.title;
            } else {
              processed.extracted_text = '[Failed to read link content]';
            }
          } catch (err) {
            console.error('readLink error:', err);
            processed.extracted_text = '[Failed to read link content]';
          }
        }
        processedAttachments.push(processed);
      }
    }

    // Save user message to DB
    const { rows: userMsgRows } = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, attachments) VALUES ($1, $2, $3, $4) RETURNING *',
      [conversation_id, 'user', content, JSON.stringify(processedAttachments.length ? processedAttachments : [])]
    );

    // Update conversation updated_at
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation_id]);

    // Count existing messages to determine if this is the first user message
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1 AND role = 'user'",
      [conversation_id]
    );
    const isFirstUserMessage = parseInt(countRows[0].cnt) === 1;

    // Build OpenAI messages array from conversation history (last 50)
    const { rows: historyRows } = await pool.query(
      'SELECT role, content, attachments FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50',
      [conversation_id]
    );
    historyRows.reverse();

    const openaiMessages = historyRows.map((msg) => {
      if (msg.role === 'user' && msg.attachments && Array.isArray(msg.attachments)) {
        const contentParts = [];
        let textContent = msg.content;

        // Prepend document/link extracted text
        for (const att of msg.attachments) {
          if ((att.type === 'document' || att.type === 'link') && att.extracted_text) {
            textContent = `[Attached ${att.type}: ${att.name || att.url}]\n${att.extracted_text}\n\n${textContent}`;
          }
        }

        contentParts.push({ type: 'text', text: textContent });

        // Add image attachments as image_url content parts
        for (const att of msg.attachments) {
          if (att.type === 'image' && att.url) {
            contentParts.push({ type: 'image_url', image_url: { url: att.url } });
          }
        }

        return { role: 'user', content: contentParts };
      }
      return { role: msg.role, content: msg.content };
    });

    // Get model from settings
    const modelKey = use_secondary ? 'secondary_model' : 'primary_model';
    const { rows: settingsRows } = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [modelKey]
    );
    // JSONB value comes back as parsed JSON, so a stored '"gpt-4o"' returns the string 'gpt-4o'
    const model = settingsRows.length ? settingsRows[0].value : undefined;

    // Define web_search tool
    const tools = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current information',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            },
            required: ['query']
          }
        }
      }
    ];

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // First call: check if model wants to use tools
    let messagesForStream = [...openaiMessages];
    const toolCheckResult = await chatCompletion(openaiMessages, { model, tools });

    if (toolCheckResult.tool_calls && toolCheckResult.tool_calls.length > 0) {
      // Process tool calls
      messagesForStream.push(toolCheckResult);

      for (const toolCall of toolCheckResult.tool_calls) {
        if (toolCall.function.name === 'web_search') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const searchResults = await searchWeb(args.query);
            messagesForStream.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof searchResults === 'string' ? searchResults : JSON.stringify(searchResults)
            });
          } catch (err) {
            console.error('web_search error:', err);
            messagesForStream.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: '[Web search failed]'
            });
          }
        }
      }
    }

    // Stream the response
    let fullResponse = '';

    await streamChat(messagesForStream, {
      model,
      onChunk: (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      }
    });

    // Save assistant message to DB
    const { rows: assistantMsgRows } = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, model) VALUES ($1, $2, $3, $4) RETURNING *',
      [conversation_id, 'assistant', fullResponse, model]
    );

    // Send done event
    res.write(`data: ${JSON.stringify({ type: 'done', message_id: assistantMsgRows[0].id })}\n\n`);

    // Auto-generate title for first user message
    if (isFirstUserMessage) {
      try {
        const primaryModelRow = await pool.query("SELECT value FROM settings WHERE key = 'primary_model'");
        const primaryModel = primaryModelRow.rows.length ? primaryModelRow.rows[0].value : undefined;

        const titleResult = await chatCompletion(
          [
            { role: 'user', content: `Generate a 3-5 word title for this conversation. Respond with only the title, no quotes or punctuation.\n\nUser message: ${content}` }
          ],
          { model: primaryModel }
        );

        const title = (titleResult.content || titleResult).toString().trim().slice(0, 100);

        await pool.query(
          'UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2',
          [title, conversation_id]
        );

        res.write(`data: ${JSON.stringify({ type: 'title', title })}\n\n`);
      } catch (err) {
        console.error('Title generation error:', err);
      }
    }

    res.end();
  } catch (err) {
    console.error('POST /api/chat/send error:', err);
    // If headers already sent, just end the stream
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal server error' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ── 7. Get settings (admin only) ──

router.get('/api/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 8. Update settings (admin only) ──

router.put('/api/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { primary_model, secondary_model } = req.body;
    const updates = [];

    if (primary_model !== undefined) updates.push(['primary_model', primary_model]);
    if (secondary_model !== undefined) updates.push(['secondary_model', secondary_model]);

    for (const [key, value] of updates) {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, JSON.stringify(value)]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
