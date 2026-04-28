'use strict';

const { ContextAssembler } = require('../src/engine/ContextAssembler.js');
const { MemoryLearningSink } = require('../src/engine/learningSink.js');
const { createRunState, appendItem } = require('../src/engine/runState.js');
const { BudgetExceededError } = require('../src/errors.js');

function fakeBrandReader() {
  return async (brand) => `brand context for ${brand}`;
}

function baseCtx() {
  return {
    brandContext: {
      brand: 'ikawn', brandRevision: 1, userId: 'u1', agent: 'ruhi',
      isolationToken: 't', permissions: new Set(['read']),
    },
    deps: {},
    agentSystemPrompt: 'You are Ruhi.',
    standingRules: 'Be concise.',
  };
}

function baseState() {
  return createRunState({
    conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
  });
}

describe('ContextAssembler composition', () => {
  it('produces system + brand + lessons + history + turn input in order', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 200000, maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      // No tokenizer in Plan 01 — proxy with word count
      estimateTokens: (text) => text.split(/\s+/).length,
    });
    const turnInput = [{ type: 'text', text: 'hello world' }];
    const out = await assembler.compose({
      ctx: baseCtx(), state: baseState(), turnInput,
    });
    expect(out.systemPrompt).toContain('You are Ruhi');
    expect(out.systemPrompt).toContain('Be concise');
    // messages should at minimum include the brand context, history (empty here), and turn input
    expect(out.messages.length).toBeGreaterThan(0);
    const last = out.messages[out.messages.length - 1];
    expect(last.content).toEqual(turnInput);
    expect(out.cacheBreakpoints).toBeDefined();
    expect(Array.isArray(out.cacheBreakpoints)).toBe(true);
  });

  it('includes brand context after system prompt', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 200000, maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 10,
    });
    const out = await assembler.compose({
      ctx: baseCtx(),
      state: baseState(),
      turnInput: [{ type: 'text', text: 'q' }],
    });
    const brandMsg = out.messages.find((m) => m.role === 'system' && /brand context/.test(JSON.stringify(m.content)));
    expect(brandMsg).toBeDefined();
  });

  it('projects RunState items as conversation history', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 200000, maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 10,
    });
    let state = baseState();
    state = appendItem(state, {
      type: 'user_message', content: [{ type: 'text', text: 'prev user' }], ts: 1,
    });
    state = appendItem(state, {
      type: 'assistant_message', content: [{ type: 'text', text: 'prev asst' }], ts: 2,
    });
    const out = await assembler.compose({
      ctx: baseCtx(), state, turnInput: [{ type: 'text', text: 'now' }],
    });
    const userMsgs = out.messages.filter((m) => m.role === 'user');
    expect(userMsgs.length).toBeGreaterThanOrEqual(2); // prev + now
  });

  it('skips items before the most recent compaction_boundary', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 200000, maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 10,
    });
    let state = baseState();
    state = appendItem(state, {
      type: 'user_message', content: [{ type: 'text', text: 'old1' }], ts: 1,
    });
    state = appendItem(state, {
      type: 'compaction_boundary', summary: 'older messages summarized', ts: 2,
    });
    state = appendItem(state, {
      type: 'user_message', content: [{ type: 'text', text: 'recent' }], ts: 3,
    });
    const out = await assembler.compose({
      ctx: baseCtx(), state, turnInput: [{ type: 'text', text: 'now' }],
    });
    const json = JSON.stringify(out.messages);
    expect(json).toContain('older messages summarized');
    expect(json).not.toContain('"old1"');
    expect(json).toContain('"recent"');
  });
});

describe('ContextAssembler budget gating', () => {
  function smallBudgetCtx() {
    return baseCtx();
  }

  it('passes when under budget', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 100,
        maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 5,
    });
    const out = await assembler.compose({
      ctx: smallBudgetCtx(), state: baseState(), turnInput: [{ type: 'text', text: 'q' }],
    });
    expect(out.budget.estimatedInputTokens).toBeLessThanOrEqual(100);
  });

  it('drops lowest-scoring lessons when over budget', async () => {
    const sink = new MemoryLearningSink();
    for (let i = 0; i < 5; i++) {
      await sink.writeLesson({ brand: 'ikawn' }, {
        id: `l${i}`, agent: 'ruhi', topic: 't', text: `lesson ${i} ${'x'.repeat(50)}`,
        embedding: [], quality_score: i / 10, created_at: i,
      });
    }
    let callCount = 0;
    const assembler = new ContextAssembler({
      learningSink: sink,
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 60, // forces drops
        maxRetrieval: 8,
        lessonInjectionWeights: { similarity: 0, recency: 0, quality_score: 1 }, // pure quality
        toolAllowlist: [],
      }),
      estimateTokens: () => { callCount++; return 10; },
    });
    const out = await assembler.compose({
      ctx: smallBudgetCtx(), state: baseState(), turnInput: [{ type: 'text', text: 'q' }],
    });
    // Should have dropped some lessons
    expect(out.lessonsApplied.length).toBeLessThan(5);
  });

  it('throws BudgetExceededError when no lessons can be dropped further', async () => {
    const assembler = new ContextAssembler({
      learningSink: new MemoryLearningSink(),
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 5, // impossibly small
        maxRetrieval: 0,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 100,
    });
    await expect(assembler.compose({
      ctx: smallBudgetCtx(), state: baseState(), turnInput: [{ type: 'text', text: 'q' }],
    })).rejects.toThrow(BudgetExceededError);
  });
});
