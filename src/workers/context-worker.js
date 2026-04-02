const { pool } = require('../db');
const { callReflectionLLM } = require('../utils/llm');

const INTERVAL_MS = 30000; // Check every 30s
const MSG_THRESHOLD = 3;   // Summarize after every 3 user messages since last summary

let intervalId = null;
const failedConvs = new Map(); // uuid -> { count, backoffUntil }
const MAX_RETRIES = 3;

async function processContextSummaries() {
  try {
    // Find conversations with enough new messages since last summary
    const { rows: conversations } = await pool.query(`
      SELECT c.id, c.uuid, c.context_summary, c.context_msg_count
      FROM conversations c
      WHERE EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = c.id AND m.role = 'user'
      )
      AND (
        SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = c.id AND m.role = 'user'
      ) >= COALESCE(c.context_msg_count, 0) + $1
      ORDER BY c.updated_at DESC
      LIMIT 5
    `, [MSG_THRESHOLD]);

    if (conversations.length === 0) return;

    for (const conv of conversations) {
      const fail = failedConvs.get(conv.uuid);
      if (fail) {
        if (fail.count >= MAX_RETRIES) continue; // stop retrying after 3 failures
        if (Date.now() < fail.backoffUntil) continue; // respect backoff
      }
      try {
        await summarizeConversation(conv);
        failedConvs.delete(conv.uuid); // success — clear failure state
      } catch (err) {
        const count = (fail?.count || 0) + 1;
        const backoffMs = count * 60000; // 1min, 2min, 3min then stop
        failedConvs.set(conv.uuid, { count, backoffUntil: Date.now() + backoffMs });
        console.error(`[ContextWorker] Failed to summarize conv ${conv.uuid} (attempt ${count}/${MAX_RETRIES}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[ContextWorker] Error:', err.message);
  }
}

async function summarizeConversation(conv) {
  // Fetch recent messages (last 30 for context)
  const { rows: messages } = await pool.query(
    'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 30',
    [conv.id]
  );
  messages.reverse();

  if (messages.length < MSG_THRESHOLD) return;

  const transcript = messages.map(m => {
    const ts = new Date(m.created_at).toISOString().slice(0, 16);
    return `[${ts}] ${m.role}: ${(m.content || '').slice(0, 500)}`;
  }).join('\n');

  const existing = conv.context_summary ? JSON.stringify(conv.context_summary) : 'None';

  const result = await callReflectionLLM(
    'session_summary',
    `You are a conversation summarizer. Analyze the conversation and produce a structured JSON summary.
Output ONLY valid JSON with this exact schema:
{
  "topic": "1-line summary of what this conversation is about",
  "complexity": "casual" | "standard" | "complex",
  "bullets": [{ "ts": "ISO timestamp", "text": "key point discussed" }],
  "decisions": ["decision 1", "decision 2"],
  "open_questions": ["question 1"]
}

Complexity guide:
- "casual": greetings, small talk, quick confirmations, simple questions
- "standard": general questions, product discussion, brainstorming, architecture overview
- "complex": deep debugging, security review, multi-step technical analysis, legal/compliance, investor-grade analysis

Keep bullets to max 8 most important points. Keep decisions and open_questions to max 5 each.
Previous summary (update, don't start from scratch): ${existing}`,
    `Conversation transcript:\n${transcript}`
  );

  // Parse JSON from LLM response
  let summary;
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    summary = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error(`[ContextWorker] JSON parse failed for conv ${conv.uuid}:`, parseErr.message);
    return;
  }

  // Validate required fields
  if (!summary.topic || !summary.complexity) return;
  if (!['casual', 'standard', 'complex'].includes(summary.complexity)) {
    summary.complexity = 'standard';
  }

  // Count current user messages
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1 AND role = $2',
    [conv.id, 'user']
  );
  const userMsgCount = parseInt(countRows[0].cnt, 10);

  await pool.query(
    'UPDATE conversations SET context_summary = $1, context_msg_count = $2, updated_at = NOW() WHERE id = $3',
    [JSON.stringify(summary), userMsgCount, conv.id]
  );

  console.log(`[ContextWorker] Updated conv ${conv.uuid}: topic="${summary.topic}" complexity=${summary.complexity}`);
}

function startContextWorker() {
  console.log('[ContextWorker] Started (interval: 30s)');
  intervalId = setInterval(processContextSummaries, INTERVAL_MS);
  // Run once on start after a brief delay
  setTimeout(processContextSummaries, 5000);
}

function stopContextWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startContextWorker, stopContextWorker };
