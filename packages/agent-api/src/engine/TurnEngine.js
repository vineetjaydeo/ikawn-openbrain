'use strict';

const { appendItem } = require('./runState.js');

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

    const assembled = await this._assembler.compose({ ctx, state, turnInput: input });

    let assistantText = '';
    const providerArgs = {
      systemPrompt: assembled.systemPrompt,
      messages: assembled.messages,
      tools: this._registry.list().map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema })),
      cacheBreakpoints: assembled.cacheBreakpoints,
      model: ctx.model,
    };
    let lastStop;
    for await (const chunk of this._provider.invoke(providerArgs)) {
      if (chunk.type === 'text_delta') {
        assistantText += chunk.text;
      } else if (chunk.type === 'tool_use') {
        // Tool dispatch implemented in Task 8.
        throw new Error('tool_use dispatch not implemented in TurnEngine skeleton');
      } else if (chunk.type === 'message_stop') {
        lastStop = chunk;
      }
    }

    if (assistantText.length > 0) {
      const asstItem = { type: 'assistant_message', content: assistantText, ts: Date.now() };
      state = appendItem(state, asstItem);
      await this._session.appendItem(ctx.conversationId, asstItem);
      yield asstItem;
    }

    if (lastStop && lastStop.usage) {
      state = {
        ...state,
        usage: {
          inputTokens: (state.usage?.inputTokens || 0) + lastStop.usage.inputTokens,
          outputTokens: (state.usage?.outputTokens || 0) + lastStop.usage.outputTokens,
          cacheReads: (state.usage?.cacheReads || 0) + lastStop.usage.cacheReadInputTokens,
          cacheWrites: (state.usage?.cacheWrites || 0) + lastStop.usage.cacheCreationInputTokens,
        },
      };
    }

    state = { ...state, currentStep: 'idle' };
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
