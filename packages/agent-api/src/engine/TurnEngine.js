'use strict';

const { appendItem } = require('./runState.js');
const { StreamingToolExecutor } = require('../tools/StreamingToolExecutor.js');

class TurnEngine {
  constructor({ session, learningSink, contextAssembler, provider, registry }) {
    if (!session) throw new Error('TurnEngine requires { session }');
    if (!learningSink) throw new Error('TurnEngine requires { learningSink }');
    if (!contextAssembler) throw new Error('TurnEngine requires { contextAssembler }');
    if (!provider) throw new Error('TurnEngine requires { provider }');
    if (!registry) throw new Error('TurnEngine requires { registry }');
    this._session = session;
    this._learningSink = learningSink;
    this._assembler = contextAssembler;
    this._provider = provider;
    this._registry = registry;
  }

  async *submitMessage({ input, ctx }) {
    this._brandContextGuard(ctx);
    if (!ctx.conversationId) throw new Error('ctx.conversationId required');

    let state = await this._session.load(ctx.conversationId);
    if (!state) throw new Error(`no such conversation: ${ctx.conversationId}`);

    const ts = Date.now();
    const userItem = { type: 'user_message', content: input, ts };
    state = appendItem(state, userItem);
    await this._session.appendItem(ctx.conversationId, userItem);
    yield userItem;

    const executor = new StreamingToolExecutor({
      registry: this._registry,
      canUseTool: ctx.canUseTool || (async () => true),
    });

    const usageAccum = { inputTokens: 0, outputTokens: 0, cacheReads: 0, cacheWrites: 0 };
    let safety = 0;
    while (safety++ < 10) {
      const assembled = await this._assembler.compose({ ctx, state, turnInput: input });
      const providerArgs = {
        systemPrompt: assembled.systemPrompt,
        messages: assembled.messages,
        tools: this._registry.list().map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema })),
        cacheBreakpoints: assembled.cacheBreakpoints,
        model: ctx.model,
      };

      let assistantText = '';
      const pendingToolUses = [];
      let stopReason = null;
      for await (const chunk of this._provider.invoke(providerArgs)) {
        if (chunk.type === 'text_delta') {
          assistantText += chunk.text;
        } else if (chunk.type === 'tool_use') {
          // Plan 01's StreamingToolExecutor reads `toolUse.id`. The provider yields
          // `toolUseId`. Normalize at the engine boundary so executor + RunItem fields
          // both work.
          pendingToolUses.push({ type: 'tool_use', id: chunk.toolUseId, toolUseId: chunk.toolUseId, name: chunk.name, input: chunk.input });
        } else if (chunk.type === 'message_stop') {
          stopReason = chunk.stopReason;
          if (chunk.usage) {
            usageAccum.inputTokens += chunk.usage.inputTokens || 0;
            usageAccum.outputTokens += chunk.usage.outputTokens || 0;
            usageAccum.cacheReads += chunk.usage.cacheReadInputTokens || 0;
            usageAccum.cacheWrites += chunk.usage.cacheCreationInputTokens || 0;
          }
        }
      }

      if (assistantText.length > 0) {
        const asstItem = { type: 'assistant_message', content: assistantText, ts: Date.now() };
        state = appendItem(state, asstItem);
        await this._session.appendItem(ctx.conversationId, asstItem);
        yield asstItem;
      }

      if (pendingToolUses.length === 0) {
        break;
      }

      for (const tu of pendingToolUses) {
        const callItem = { type: 'tool_call', toolUseId: tu.toolUseId, name: tu.name, input: tu.input, ts: Date.now() };
        state = appendItem(state, callItem);
        await this._session.appendItem(ctx.conversationId, callItem);
        yield callItem;
      }

      const results = await executor.dispatchBatch(pendingToolUses, ctx, state);
      for (const r of results) {
        state = appendItem(state, r);
        await this._session.appendItem(ctx.conversationId, r);
        yield r;
      }

      if (stopReason !== 'tool_use') break;
    }

    state = { ...state, currentStep: 'idle', usage: { ...(state.usage || {}), ...usageAccum } };
    await this._session.save(state);
    yield { status: 'end_turn' };
  }

  _brandContextGuard(ctx) {
    if (!ctx || !ctx.brandContext || !ctx.brandContext.brand) {
      const err = new Error('TurnEngine: BrandContext is missing or unbuilt');
      err.code = 'brand_context_missing';
      throw err;
    }
  }
}

module.exports = { TurnEngine };
