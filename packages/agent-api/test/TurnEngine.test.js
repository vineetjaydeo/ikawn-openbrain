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

const { defineTool } = require('../src/tools/defineTool.js');
const { StreamingToolExecutor } = require('../src/tools/StreamingToolExecutor.js');
const { z } = require('zod');

function makeEchoTool() {
  return defineTool({
    name: 'echo',
    description: 'echoes input',
    parameters: z.object({ msg: z.string() }),
    output: z.object({ msg: z.string() }),
    mode: 'sync',
    concurrency: 'safe',
    needsApproval: false,
    timeoutMs: 1000,
    retry: { maxAttempts: 0 },
    async execute(input) {
      return { msg: input.msg };
    },
  });
}

describe('TurnEngine tool_use dispatch', () => {
  it('dispatches a single tool_use, appends tool_call + tool_result, then ends after second provider call', async () => {
    const session = await setupSession();
    const echo = makeEchoTool();
    const registry = new ToolRegistry();
    registry.register(echo);

    const provider = new MemoryProvider({ script: [] });
    // First provider call: emit tool_use + stop_reason=tool_use
    // Second provider call: emit text + stop_reason=end_turn
    let callCount = 0;
    provider.invoke = async function* invokeFake(args) {
      this.calls.push(args);
      callCount++;
      if (callCount === 1) {
        yield { type: 'tool_use', toolUseId: 'tu_a', name: 'echo', input: { msg: 'pong' } };
        yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 5, outputTokens: 2, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      } else {
        yield { type: 'text_delta', text: 'echoed' };
        yield { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      }
    };

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
      registry,
    });

    const items = [];
    for await (const item of engine.submitMessage({ input: 'hi', ctx: { ...ctxFor(), conversationId: 'c1', deps: {} } })) {
      items.push(item);
    }

    const types = items.map((i) => i.type || i.status);
    expect(types).toEqual(['user_message', 'tool_call', 'tool_result', 'assistant_message', 'end_turn']);

    const toolResult = items.find((i) => i.type === 'tool_result');
    expect(toolResult.output).toEqual({ msg: 'pong' });
    expect(callCount).toBe(2); // provider called twice (initial + after tool result)
  });

  it('on permission denial, appends denial RunItem and continues without tool result', async () => {
    const session = await setupSession();
    const echo = makeEchoTool();
    const registry = new ToolRegistry();
    registry.register(echo);

    const provider = new MemoryProvider({ script: [] });
    let callCount = 0;
    provider.invoke = async function* invokeFake(args) {
      this.calls.push(args);
      callCount++;
      if (callCount === 1) {
        yield { type: 'tool_use', toolUseId: 'tu_b', name: 'echo', input: { msg: 'no' } };
        yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      } else {
        yield { type: 'text_delta', text: 'noted' };
        yield { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      }
    };

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
      registry,
    });

    const items = [];
    for await (const item of engine.submitMessage({
      input: 'hi',
      ctx: { ...ctxFor(), conversationId: 'c1', canUseTool: () => false },
    })) {
      items.push(item);
    }

    const types = items.map((i) => i.type || i.status);
    expect(types).toContain('denial');
    expect(types).not.toContain('tool_result');
    expect(types[types.length - 1]).toBe('end_turn');
  });
});

const { BudgetExceededError } = require('../src/errors.js');

describe('TurnEngine error surfaces', () => {
  it('aborts turn on isolation_violation tool_result', async () => {
    // brandContext.brand !== state.brand triggers isolation_violation in executor
    const session = new MemorySession();
    const state = createRunState({ conversationId: 'c1', userId: 'u1', brand: 'acme', brandRevision: 1, agent: 'general' });
    await session.save(state);

    const echo = makeEchoTool();
    const registry = new ToolRegistry();
    registry.register(echo);

    const provider = new MemoryProvider({ script: [] });
    provider.invoke = async function* (_args) {
      this.calls.push(_args);
      yield { type: 'tool_use', toolUseId: 'tu_x', name: 'echo', input: { msg: 'go' } };
      yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
    };

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
      registry,
    });

    const items = [];
    for await (const item of engine.submitMessage({
      input: 'hi',
      // Mismatched brand: ctx says 'evil', state was created with 'acme'
      ctx: { ...ctxFor('evil'), conversationId: 'c1' },
    })) {
      items.push(item);
    }

    const result = items.find((i) => i.type === 'tool_result');
    expect(result.output).toEqual(expect.objectContaining({ ok: false, kind: 'isolation_violation' }));
    expect(items[items.length - 1]).toEqual({ status: 'end_turn' });
    expect(provider.calls).toHaveLength(1); // engine did NOT loop after isolation_violation
  });

  it('surfaces BudgetExceededError as a controlled assistant message and ends', async () => {
    const session = await setupSession();
    const provider = new MemoryProvider({ script: [] });
    let composeCount = 0;
    const assembler = {
      compose: async () => {
        composeCount++;
        const err = new BudgetExceededError({ budget: 1000, estimated: 5000 });
        throw err;
      },
    };
    const engine = new TurnEngine({
      session,
      learningSink: new MemoryLearningSink(),
      contextAssembler: assembler,
      provider,
      registry: new ToolRegistry(),
    });

    const items = [];
    for await (const item of engine.submitMessage({ input: 'hi', ctx: { ...ctxFor(), conversationId: 'c1' } })) {
      items.push(item);
    }

    const asst = items.find((i) => i.type === 'assistant_message');
    expect(asst.content).toMatch(/context for this turn is too large/i);
    expect(items[items.length - 1]).toEqual({ status: 'end_turn' });
    expect(composeCount).toBe(1);
    expect(provider.calls).toHaveLength(0); // no provider call when budget exceeded
  });
});

describe('TurnEngine suspension stubs', () => {
  it('yields awaiting_approval terminal when an approval_pending item is produced', async () => {
    const session = await setupSession();
    // Stub registry/tool that returns approval_pending RunItem.
    const stubExecutorTool = defineTool({
      name: 'sensitive',
      description: 'd',
      parameters: z.object({}),
      output: z.object({ ok: z.boolean() }),
      mode: 'sync',
      concurrency: 'safe',
      needsApproval: true,
      timeoutMs: 1000,
      retry: { maxAttempts: 0 },
      async execute() {
        return { ok: true };
      },
    });
    const registry = new ToolRegistry();
    registry.register(stubExecutorTool);

    const provider = new MemoryProvider({ script: [] });
    provider.invoke = async function* () {
      yield { type: 'tool_use', toolUseId: 'tu_a', name: 'sensitive', input: {} };
      yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
    };

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
      registry,
    });

    const items = [];
    // canUseTool returns 'pending' to signal approval required (Plan 02 stub convention).
    for await (const item of engine.submitMessage({
      input: 'hi',
      ctx: { ...ctxFor(), conversationId: 'c1', canUseTool: async () => 'pending' },
    })) {
      items.push(item);
    }

    expect(items[items.length - 1]).toEqual({ status: 'awaiting_approval' });
  });
});
