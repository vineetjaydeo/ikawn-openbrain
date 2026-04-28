'use strict';

const express = require('express');
const { TurnEngine } = require('../engine/TurnEngine.js');
const { PgSession } = require('../engine/PgSession.js');
const { PgLearningSink } = require('../engine/PgLearningSink.js');
const { ContextAssembler } = require('../engine/ContextAssembler.js');
const { ToolRegistry } = require('../tools/ToolRegistry.js');
const { vectorSearch } = require('../tools/vectorSearch.js');
const { brandContextRead } = require('../tools/brandContextRead.js');
const { webSearch } = require('../tools/webSearch.js');
const { createRunState } = require('../engine/runState.js');
const { BrandIsolationError } = require('../errors.js');

function createLegacyHttpRouter(deps) {
  const {
    pool,
    captureMessage,
    buildBrandContext,
    provider,
    toolDeps = {},
    agentSystemPrompt = 'You are a helpful agent.',
    standingRules = 'Be concise. Use tools when they help.',
    brandReader = async () => '',
  } = deps;

  if (!pool) throw new Error('legacyHttp: deps.pool required');
  if (!captureMessage) throw new Error('legacyHttp: deps.captureMessage required');
  if (!buildBrandContext) throw new Error('legacyHttp: deps.buildBrandContext required');
  if (!provider) throw new Error('legacyHttp: deps.provider required');

  const router = express.Router();

  router.post('/api/chat/send', async (req, res) => {
    const { conversation_id, content } = req.body || {};
    if (!conversation_id || !content) {
      return res.status(400).json({ error: 'conversation_id and content are required' });
    }

    let brandContext;
    try {
      brandContext = await buildBrandContext(req);
    } catch (e) {
      if (e instanceof BrandIsolationError) {
        return res.status(403).json({ error: 'forbidden' });
      }
      throw e;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let clientDisconnected = false;
    req.on('close', () => { clientDisconnected = true; });
    const heartbeat = setInterval(() => {
      if (!clientDisconnected && !res.writableEnded) res.write(':ping\n\n');
    }, 15000);

    const writeEvent = (obj) => {
      if (clientDisconnected || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const session = new PgSession({ pool, captureMessage });
      const learningSink = new PgLearningSink({ pool });

      // Cold-start path: if session.load returns null, createRunState then save BEFORE
      // submitMessage, so PgSession.appendItem inside submitMessage finds an existing row.
      let state = await session.load(conversation_id);
      if (!state) {
        state = createRunState({
          conversationId: conversation_id,
          userId: brandContext.userId,
          brand: brandContext.brand,
          brandRevision: brandContext.brandRevision,
          agent: brandContext.agent,
        });
        await session.save(state);
      }

      const registry = new ToolRegistry();
      registry.register(vectorSearch, brandContextRead, webSearch);

      // ContextAssembler actual signature: { learningSink, brandReader, agentConfig, estimateTokens, similarityFn }
      // agentConfig is a fn (agent, brand) => { inputTokenBudget, maxRetrieval, ... }
      // estimateTokens is a fn (text) => number — plan's defaultInputTokenBudget is handled here
      const assembler = new ContextAssembler({
        learningSink,
        brandReader,
        agentConfig: (_agent, _brand) => ({ inputTokenBudget: 80000, maxRetrieval: 8 }),
        estimateTokens: (t) => Math.ceil((t || '').length / 4),
      });

      const engine = new TurnEngine({
        session,
        learningSink,
        contextAssembler: assembler,
        provider,
        registry,
      });

      const ctx = {
        brandContext,
        conversationId: conversation_id,
        agentSystemPrompt,
        standingRules,
        deps: toolDeps,
        canUseTool: async () => true,
      };

      // Track tool_call items by toolUseId so we can name tool_result events.
      // Plan 02 simplification: assistant_message is BUFFERED in the engine (text_delta
      // accumulates into one assistant_message item). legacyHttp emits ONE `chunk` event
      // per assistant_message. Plan 03 will switch to per-delta streaming.
      const toolCallsByUseId = new Map();
      let assistantMemoryId = null;

      for await (const item of engine.submitMessage({ input: content, ctx })) {
        if (item.type === 'user_message') {
          // Already captured by appendItem inside the engine — no SSE event needed.
          continue;
        }

        if (item.type === 'assistant_message') {
          writeEvent({ type: 'chunk', text: item.content });
          if (item.memoryId) assistantMemoryId = item.memoryId;
          continue;
        }

        if (item.type === 'tool_call') {
          // Record mapping so tool_result can reference the tool name.
          toolCallsByUseId.set(item.toolUseId, item.name);
          writeEvent({ type: 'tool_start', tool: item.name, detail: item.input });
          continue;
        }

        if (item.type === 'tool_result') {
          const toolName = toolCallsByUseId.get(item.toolUseId) || 'unknown';
          const success = !(item.output && item.output.ok === false);
          const evt = { type: 'tool_done', tool: toolName, success };
          if (!success) evt.error = item.output && item.output.message;
          writeEvent(evt);
          continue;
        }

        if (item.type === 'denial') {
          writeEvent({ type: 'tool_done', tool: item.toolName || 'unknown', success: false, error: 'permission denied' });
          continue;
        }

        if (item.status === 'end_turn') {
          writeEvent({ type: 'done', message_id: assistantMemoryId, conversation_id, context_summary: null });
        } else if (item.status === 'awaiting_approval') {
          writeEvent({ type: 'done', message_id: assistantMemoryId, conversation_id, context_summary: null, suspended: 'awaiting_approval' });
        } else if (item.status === 'awaiting_job') {
          writeEvent({ type: 'done', message_id: assistantMemoryId, conversation_id, context_summary: null, suspended: 'awaiting_job' });
        }
      }
    } catch (err) {
      console.error('[legacyHttp] turn failed:', err);
      writeEvent({ type: 'error', error: err.message || 'turn failed' });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}

module.exports = { createLegacyHttpRouter };
