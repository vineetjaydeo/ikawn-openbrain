const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { streamChatAnthropic } = require('../utils/llm');
const { buildSystemPrompt } = require('../ruhi/persona');
const { captureMessage } = require('../utils/capture');

const router = Router();

async function searchMemory(query, accessLevels, limit = 10) {
  const embedding = await getEmbedding(query);

  const placeholders = accessLevels.map((_, i) => `$${i + 2}`).join(', ');
  const result = await pool.query(
    `SELECT id, content, memory_type, project, hashtags, author, created_at, cosine_similarity(embedding, $1) AS similarity
     FROM memories
     WHERE embedding IS NOT NULL
       AND (archived IS NULL OR archived = false)
       AND (access_level IS NULL OR access_level IN (${placeholders}))
     ORDER BY cosine_similarity(embedding, $1) DESC
     LIMIT $${accessLevels.length + 2}`,
    [embedding, ...accessLevels, limit]
  );

  return result.rows;
}

async function getConversationHistory(conversationId, limit = 10) {
  const result = await pool.query(
    `SELECT content, memory_type, author, created_at FROM memories
     WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse();
}

router.post('/chat', async (req, res) => {
  try {
    const { message, user, conversation_id, access_level, group_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const userEmail = user || 'vineet@ikawn.com';

    // Validate user against ob_users (try both login email and ob_users email)
    let userResult = await pool.query('SELECT * FROM ob_users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) {
      // Fallback: match by name from session user
      const sessionName = req.session?.user?.name;
      if (sessionName) {
        userResult = await pool.query('SELECT * FROM ob_users WHERE LOWER(name) = LOWER($1)', [sessionName]);
      }
    }
    const obUser = userResult.rows[0];
    if (!obUser) {
      // Admin users get full access even without ob_users entry
      const isAdmin = req.session?.user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ error: 'User not registered in OpenBrain' });
      }
    }

    const userAccessLevels = obUser?.access_levels || (req.session?.user?.role === 'admin'
      ? ['private', 'management', 'internal', 'advisors', 'investors', 'public']
      : ['public']);

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const convResult = await pool.query(
        `INSERT INTO ob_conversations (title, group_id, access_level, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ['New conversation', group_id || null, access_level || 'private', (obUser?.name || req.session?.user?.name || 'user').toLowerCase()]
      );
      convId = convResult.rows[0].id;
    }

    // Search memory for context (RAG)
    const memoryResults = await searchMemory(message, userAccessLevels, 10);
    let memoryContext = '';
    if (memoryResults.length > 0) {
      memoryContext = memoryResults.map((m, i) => {
        const date = new Date(m.created_at).toLocaleDateString();
        const type = m.memory_type || 'note';
        return `[${i + 1}] (${type}, ${date}) ${m.content.slice(0, 500)}`;
      }).join('\n\n');
    }

    // Get conversation history
    const history = await getConversationHistory(convId, 10);
    const historyMessages = history.map(h => ({
      role: h.author === 'ruhi' ? 'assistant' : 'user',
      content: h.content,
    }));

    // Build system prompt with Ruhi persona
    const userName = obUser?.name || req.session?.user?.name || 'User';
    const userRole = obUser?.role || req.session?.user?.role || 'user';
    const systemPrompt = buildSystemPrompt(userName, userRole, memoryContext);

    // Build OpenAI messages array
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullResponse = '';

    await streamChatAnthropic(openaiMessages, {
      model: 'claude-sonnet-4-6',
      onChunk: (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      },
    });

    // Save both sides to memories via captureMessage (idempotent, proper metadata)
    const authorName = (obUser?.name || req.session?.user?.name || 'user').toLowerCase();
    captureMessage({
      brand_id: 'ikawn',
      channel: 'ruhi-chat',
      direction: 'inbound',
      content: message,
      source_ref: `ruhi_in_${convId}_${Date.now()}`,
      metadata: { project: 'ruhi-chat' }
    });
    captureMessage({
      brand_id: 'ikawn',
      channel: 'ruhi-chat',
      direction: 'outbound',
      content: fullResponse,
      source_ref: `ruhi_out_${convId}_${Date.now()}`,
      metadata: { project: 'ruhi-chat' }
    });

    // Update conversation last_activity
    await pool.query(
      'UPDATE ob_conversations SET last_activity = NOW() WHERE id = $1',
      [convId]
    );

    // Send done event
    res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: convId })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Ruhi chat error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Chat failed' });
    }
  }
});

module.exports = router;
