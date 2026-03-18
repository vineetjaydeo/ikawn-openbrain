const { Router } = require('express');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { streamChatAnthropic } = require('../utils/llm');
const { buildSystemPrompt } = require('../ruhi/persona');
const { captureMessage } = require('../utils/capture');
const { getTool, getTools } = require('../tools/registry');

const router = Router();

async function searchMemory(query, accessLevels, limit = 10, userId = null) {
  const embedding = await getEmbedding(query);

  const placeholders = accessLevels.map((_, i) => `$${i + 2}`).join(', ');
  // User isolation: show user's own memories + shared memories at their access level (excluding other users' private memories)
  const userFilter = userId
    ? ` AND (user_id = $${accessLevels.length + 3} OR access_level NOT IN ('private') OR user_id IS NULL)`
    : '';
  const params = userId
    ? [embedding, ...accessLevels, limit, userId]
    : [embedding, ...accessLevels, limit];

  const result = await pool.query(
    `SELECT id, content, memory_type, project, hashtags, author, created_at, cosine_similarity(embedding, $1) AS similarity
     FROM memories
     WHERE embedding IS NOT NULL
       AND (archived IS NULL OR archived = false)
       AND (access_level IS NULL OR access_level IN (${placeholders}))
       ${userFilter}
     ORDER BY cosine_similarity(embedding, $1) DESC
     LIMIT $${accessLevels.length + 2}`,
    params
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

    const currentUserId = req.session?.user?.id || null;

    // ── /skill shortcut: direct tool invocation ──
    const skillMatch = message.match(/^\/(\w+)(?:\s+(.*))?$/s);
    if (skillMatch) {
      const toolName = skillMatch[1];
      const toolArgs = (skillMatch[2] || '').trim();
      const tool = getTool(toolName);

      if (tool) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        try {
          const result = await tool.execute(
            toolArgs ? { query: toolArgs, prompt: toolArgs } : {},
            { brandId: 'ikawn', userId: currentUserId, pool }
          );

          const summary = result?.summary || JSON.stringify(result?.data || result, null, 2);
          const formatted = `**/${toolName}** result:\n\n${summary}`;

          // Stream as chunks for consistent UX
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: formatted })}\n\n`);

          // Save to conversation
          const authorName = (obUser?.name || req.session?.user?.name || 'user').toLowerCase();
          captureMessage({ brand_id: 'ikawn', channel: 'ruhi-chat', direction: 'inbound', content: message, source_ref: `ruhi_in_${convId}_${Date.now()}`, metadata: { project: 'ruhi-chat' }, user_id: currentUserId });
          captureMessage({ brand_id: 'ikawn', channel: 'ruhi-chat', direction: 'outbound', content: formatted, source_ref: `ruhi_out_${convId}_${Date.now()}`, metadata: { project: 'ruhi-chat', tool: toolName }, user_id: currentUserId });
          await pool.query('UPDATE ob_conversations SET last_activity = NOW() WHERE id = $1', [convId]);

          res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: convId })}\n\n`);
          return res.end();
        } catch (err) {
          const errMsg = `**/${toolName}** failed: ${err.message}`;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: errMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: convId })}\n\n`);
          return res.end();
        }
      }
      // If tool not found, fall through to normal Ruhi chat (Ruhi can explain the available skills)
    }

    // Search memory for context (RAG) — scoped to requesting user
    const memoryResults = await searchMemory(message, userAccessLevels, 10, currentUserId);
    let memoryContext = '';
    if (memoryResults.length > 0) {
      memoryContext = memoryResults.map((m, i) => {
        const date = new Date(m.created_at).toLocaleDateString();
        const type = m.memory_type || 'note';
        const by = m.author ? `, by ${m.author}` : '';
        return `[${i + 1}] (${type}, ${date}${by}) ${m.content.slice(0, 500)}`;
      }).join('\n\n');
    }

    // Get conversation history
    const history = await getConversationHistory(convId, 10);
    const historyMessages = history.map(h => ({
      role: h.author === 'ruhi' ? 'assistant' : 'user',
      content: h.content,
    }));

    // Inject latest intelligence snapshot into context
    let intelContext = '';
    try {
      const latestIntel = await pool.query(
        `SELECT summary, data FROM intelligence_snapshots
         WHERE snapshot_type = 'cohort_analysis'
         ORDER BY created_at DESC LIMIT 1`
      );
      if (latestIntel.rows[0]) {
        intelContext = `\n\nCURRENT PLATFORM INTELLIGENCE:\n${latestIntel.rows[0].summary}\n\nCohort data: ${JSON.stringify(latestIntel.rows[0].data)}`;
      }
    } catch (intelErr) {
      console.warn('[RuhiChat] Intelligence injection failed:', intelErr.message);
    }

    // Fetch user's custom instructions
    let customInstructions = '';
    if (currentUserId) {
      const ciResult = await pool.query('SELECT custom_instructions FROM users WHERE id = $1', [currentUserId]);
      customInstructions = ciResult.rows[0]?.custom_instructions || '';
    }

    // Build system prompt with Ruhi persona
    const userName = obUser?.name || req.session?.user?.name || 'User';
    const userRole = obUser?.role || req.session?.user?.role || 'user';
    const systemPrompt = buildSystemPrompt(userName, userRole, memoryContext + intelContext, customInstructions);

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

    // Save both sides to memories via captureMessage (idempotent, proper metadata, user-scoped)
    const authorName = (obUser?.name || req.session?.user?.name || 'user').toLowerCase();
    captureMessage({
      brand_id: 'ikawn',
      channel: 'ruhi-chat',
      direction: 'inbound',
      content: message,
      source_ref: `ruhi_in_${convId}_${Date.now()}`,
      metadata: { project: 'ruhi-chat' },
      user_id: currentUserId
    });
    captureMessage({
      brand_id: 'ikawn',
      channel: 'ruhi-chat',
      direction: 'outbound',
      content: fullResponse,
      source_ref: `ruhi_out_${convId}_${Date.now()}`,
      metadata: { project: 'ruhi-chat' },
      user_id: currentUserId
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
