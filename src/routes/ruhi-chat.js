const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { buildSystemPrompt } = require('../ruhi/persona');

const router = Router();

let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

async function searchMemory(query, accessLevels, limit = 10) {
  const embedding = await getEmbedding(query);

  // Build access level filter
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
  // Use ob_conversations for Ruhi chats
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

    // Validate user against ob_users
    const userResult = await pool.query('SELECT * FROM ob_users WHERE email = $1', [userEmail]);
    const obUser = userResult.rows[0];
    if (!obUser) {
      return res.status(403).json({ error: 'User not registered in OpenBrain' });
    }

    const userAccessLevels = obUser.access_levels || ['public'];

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const convResult = await pool.query(
        `INSERT INTO ob_conversations (title, group_id, access_level, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ['New conversation', group_id || null, access_level || 'private', obUser.name.toLowerCase()]
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
    const systemPrompt = buildSystemPrompt(obUser.name, obUser.role, memoryContext);

    // Build messages for Claude
    const claudeMessages = [
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Call Claude with streaming
    const client = getAnthropicClient();
    let fullResponse = '';

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
    });

    stream.on('text', (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
    });

    await stream.finalMessage();

    // Save user message to memories
    const userEmbedding = await getEmbedding(message);
    await pool.query(
      `INSERT INTO memories (content, embedding, source, memory_type, access_level, group_id, conversation_id, author)
       VALUES ($1, $2, 'chat', 'discussion', $3, $4, $5, $6)`,
      [message, userEmbedding, access_level || 'private', group_id || null, convId, obUser.name.toLowerCase()]
    );

    // Save Ruhi's response to memories
    const ruhiEmbedding = await getEmbedding(fullResponse.slice(0, 8000));
    await pool.query(
      `INSERT INTO memories (content, embedding, source, memory_type, access_level, group_id, conversation_id, author)
       VALUES ($1, $2, 'chat', 'discussion', $3, $4, $5, 'ruhi')`,
      [fullResponse, ruhiEmbedding, access_level || 'private', group_id || null, convId]
    );

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
