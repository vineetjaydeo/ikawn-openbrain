'use strict';

const { z } = require('zod');

const { MemorySession } = require('../../src/engine/session.js');
const { MemoryLearningSink } = require('../../src/engine/learningSink.js');
const { buildBrandContext } = require('../../src/engine/brandContext.js');
const { ContextAssembler } = require('../../src/engine/ContextAssembler.js');
const { ToolRegistry } = require('../../src/tools/ToolRegistry.js');
const { StreamingToolExecutor } = require('../../src/tools/StreamingToolExecutor.js');
const { defineTool } = require('../../src/tools/defineTool.js');
const { createRunState, appendItem } = require('../../src/engine/runState.js');

function fakeAuthDeps() {
  return {
    getUser: async (id) => (id === 'u1' ? { id } : null),
    isBrandMember: async () => true,
    isAgentAllowed: async () => true,
    resolvePermissions: async () => new Set(['read', 'write']),
  };
}

function makeRegistry() {
  const r = new ToolRegistry();
  r.register(
    defineTool({
      name: 'echo_safe',
      description: 'echo (safe)',
      parameters: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      concurrency: 'safe',
      async execute(input) { return { msg: input.msg }; },
    }),
    defineTool({
      name: 'mark_exclusive',
      description: 'mark (exclusive)',
      parameters: z.object({ tag: z.string() }),
      output: z.object({ tag: z.string(), at: z.number() }),
      concurrency: 'exclusive',
      async execute(input) { return { tag: input.tag, at: Date.now() }; },
    }),
  );
  return r;
}

describe('pseudo-turn integration', () => {
  it('executes a realistic turn skeleton through every primitive', async () => {
    // 1. Build BrandContext from a principal
    const brandContext = await buildBrandContext({
      authPrincipal: { userId: 'u1', brandAllowlist: ['ikawn'], agentAllowlist: ['ruhi'] },
      requestedBrand: 'ikawn',
      agent: 'ruhi',
      brandRevision: 1,
      deps: fakeAuthDeps(),
    });
    expect(brandContext.brand).toBe('ikawn');
    expect(brandContext.transitionDefault).toBe(false);

    // 2. Initialize Session and seed RunState
    const session = new MemorySession();
    let state = createRunState({
      conversationId: 'c1',
      userId: 'u1',
      brand: 'ikawn',
      brandRevision: 1,
      agent: 'ruhi',
    });
    await session.save(state);

    // 3. Seed LearningSink with a couple lessons
    const sink = new MemoryLearningSink();
    await sink.writeLesson({ brand: 'ikawn' }, {
      id: 'l1', agent: 'ruhi', topic: 'tone', text: 'be concise',
      embedding: [], quality_score: 0.7, created_at: Date.now(),
    });

    // 4. Compose context
    const assembler = new ContextAssembler({
      learningSink: sink,
      brandReader: async (brand) => `Brand=${brand} guideline text`,
      agentConfig: () => ({
        inputTokenBudget: 200000,
        maxRetrieval: 5,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: ['echo_safe', 'mark_exclusive'],
      }),
      estimateTokens: (t) => (typeof t === 'string' ? t.length / 4 : 10),
      similarityFn: () => 0.6,
    });
    const ctx = {
      brandContext,
      deps: {},
      agentSystemPrompt: 'You are Ruhi.',
      standingRules: 'Brand voice: confident, useful.',
    };
    const assembled = await assembler.compose({
      ctx,
      state,
      turnInput: [{ type: 'text', text: 'summarize the brand and tag the moment' }],
    });
    expect(assembled.lessonsApplied.length).toBe(1);
    expect(assembled.budget.estimatedInputTokens).toBeGreaterThan(0);

    // 5. Append the user_message to state (the engine would do this in Plan 02)
    state = appendItem(state, {
      type: 'user_message',
      content: [{ type: 'text', text: 'summarize the brand and tag the moment' }],
      ts: Date.now(),
    });
    await session.save(state);

    // 6. Simulate the model returning two tool_use blocks (one safe, one exclusive)
    const registry = makeRegistry();
    const executor = new StreamingToolExecutor({ registry, canUseTool: () => true });
    const toolUses = [
      { id: 't_use_1', name: 'echo_safe', input: { msg: 'concise' } },
      { id: 't_use_2', name: 'mark_exclusive', input: { tag: 'moment' } },
    ];
    const results = await executor.dispatchBatch(toolUses, ctx, state);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.type).toBe('tool_result');
      expect(r.output.ok).not.toBe(false);
    }

    // 7. Append tool_call + tool_result items, validating the turn lifecycle order
    for (const tu of toolUses) {
      state = appendItem(state, {
        type: 'tool_call',
        toolName: tu.name,
        toolUseId: tu.id,
        input: tu.input,
        ts: Date.now(),
      });
    }
    for (const r of results) {
      state = appendItem(state, r);
    }
    await session.save(state);

    // 8. Capture a fake tool_outcome learning signal
    await sink.recordToolOutcome('ikawn', 'turn_1', { toolUseId: 't_use_1', positive: true });
    const signals = await sink.readSignals('ikawn');
    expect(signals.some((s) => s.kind === 'tool_outcome')).toBe(true);

    // 9. Reload state from session and verify durability
    const loaded = await session.load('c1');
    expect(loaded.items.length).toBe(5); // user_message + 2 tool_call + 2 tool_result
    expect(loaded.brand).toBe('ikawn');
  });

  it('rejects a tool dispatch when ctx.brandContext.brand differs from state.brand', async () => {
    const session = new MemorySession();
    const state = createRunState({
      conversationId: 'c1',
      userId: 'u1',
      brand: 'ikawn',
      brandRevision: 1,
      agent: 'ruhi',
    });
    await session.save(state);

    const registry = makeRegistry();
    const executor = new StreamingToolExecutor({ registry, canUseTool: () => true });

    const wrongCtx = {
      brandContext: {
        brand: 'maxfashion', // mismatch with state.brand=ikawn
        brandRevision: 1, userId: 'u1', agent: 'ruhi', isolationToken: 't', permissions: new Set(),
      },
      deps: {},
    };
    const result = await executor.dispatchToolUse(
      { id: 't1', name: 'echo_safe', input: { msg: 'x' } },
      wrongCtx, state,
    );
    expect(result.output.kind).toBe('isolation_violation');
  });
});
