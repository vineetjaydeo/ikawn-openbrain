'use strict';

const { TurnEngine } = require('../src/engine/TurnEngine.js');
const { MemorySession } = require('../src/engine/session.js');
const { MemoryLearningSink } = require('../src/engine/learningSink.js');
const { MemoryProvider } = require('../src/engine/Provider.js');
const { ContextAssembler } = require('../src/engine/ContextAssembler.js');
const { ToolRegistry } = require('../src/tools/ToolRegistry.js');
const { createRunState } = require('../src/engine/runState.js');

function ctxFor(brand = 'acme', agent = 'general') {
  return {
    brandContext: {
      brand,
      brandRevision: 1,
      userId: 'u1',
      agent,
      authScope: 'agent',
      permissions: new Set(),
      isolationToken: 'tok',
      transitionDefault: false,
    },
    agentSystemPrompt: 'You are a helpful agent.',
    standingRules: 'Be concise.',
    deps: {},
  };
}

async function setupSession(brand = 'acme') {
  const session = new MemorySession();
  const state = createRunState({ conversationId: 'c1', userId: 'u1', brand, brandRevision: 1, agent: 'general' });
  await session.save(state);
  return session;
}

describe('TurnEngine simple text turn', () => {
  it('runs a turn that only yields assistant text and ends', async () => {
    const session = await setupSession();
    const learningSink = new MemoryLearningSink();
    const provider = new MemoryProvider({
      script: [
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ' world' },
        { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 4, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
      ],
    });
    const registry = new ToolRegistry();
    const assembler = new ContextAssembler({
      brandReader: async () => 'brand voice: friendly',
      lessonReader: async () => [],
      learningSink: new MemoryLearningSink(),
      agentConfig: () => ({ inputTokenBudget: 100000, maxRetrieval: 8 }),
      estimateTokens: (t) => Math.ceil((t || '').length / 4),
    });

    const engine = new TurnEngine({ session, learningSink, contextAssembler: assembler, provider, registry });

    const items = [];
    for await (const item of engine.submitMessage({ input: 'hi', ctx: { ...ctxFor(), conversationId: 'c1' } })) {
      items.push(item);
    }

    expect(items.find((i) => i.type === 'user_message').content).toBe('hi');
    const asst = items.find((i) => i.type === 'assistant_message');
    expect(asst.content).toBe('Hello world');
    const term = items[items.length - 1];
    expect(term).toEqual({ status: 'end_turn' });
  });

  it('throws BrandIsolationError-shaped error when ctx.brandContext is missing', async () => {
    const session = await setupSession();
    const provider = new MemoryProvider({ script: [] });
    const engine = new TurnEngine({
      session,
      learningSink: new MemoryLearningSink(),
      contextAssembler: new ContextAssembler({
        brandReader: async () => '',
        lessonReader: async () => [],
        learningSink: new MemoryLearningSink(),
        agentConfig: () => ({ inputTokenBudget: 100000, maxRetrieval: 8 }),
        estimateTokens: (t) => Math.ceil((t || '').length / 4),
      }),
      provider,
      registry: new ToolRegistry(),
    });
    await expect((async () => {
      for await (const _ of engine.submitMessage({ input: 'hi', ctx: { conversationId: 'c1' } })) { /* drain */ }
    })()).rejects.toThrow(/BrandContext/);
  });

  it('persists user_message and assistant_message via session.appendItem', async () => {
    const session = await setupSession();
    const appendSpy = vi.spyOn(session, 'appendItem');
    const provider = new MemoryProvider({
      script: [
        { type: 'text_delta', text: 'ok' },
        { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
      ],
    });
    const engine = new TurnEngine({
      session,
      learningSink: new MemoryLearningSink(),
      contextAssembler: new ContextAssembler({
        brandReader: async () => '',
        lessonReader: async () => [],
        learningSink: new MemoryLearningSink(),
        agentConfig: () => ({ inputTokenBudget: 100000, maxRetrieval: 8 }),
        estimateTokens: (t) => Math.ceil((t || '').length / 4),
      }),
      provider,
      registry: new ToolRegistry(),
    });
    for await (const _ of engine.submitMessage({ input: 'hi', ctx: { ...ctxFor(), conversationId: 'c1' } })) { /* drain */ }
    const calls = appendSpy.mock.calls.map((c) => c[1].type);
    expect(calls).toContain('user_message');
    expect(calls).toContain('assistant_message');
  });
});
