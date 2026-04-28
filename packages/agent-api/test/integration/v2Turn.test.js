'use strict';

const {
  TurnEngine,
  PgSession,
  PgLearningSink,
  ContextAssembler,
  ToolRegistry,
  vectorSearch,
  brandContextRead,
  webSearch,
  buildBrandContext,
  createRunState,
  SCHEMA_VERSION,
} = require('../../src/index.js');

function makePool() {
  const calls = [];
  let storedState = null;
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT state, schema_version FROM agent_run_states/i.test(sql)) {
        return storedState ? { rows: [{ state: storedState, schema_version: SCHEMA_VERSION }] } : { rows: [] };
      }
      if (/INSERT INTO agent_run_states/i.test(sql)) {
        storedState = params[5];
        return { rows: [] };
      }
      if (/INSERT INTO learning_signals/i.test(sql)) return { rows: [] };
      if (/SELECT.*FROM lessons/i.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
}

describe('v2 end-to-end turn', () => {
  it('runs a full turn: load → compose → invoke → tool dispatch → save → end_turn', async () => {
    const pool = makePool();
    const captureMessage = vi.fn(async () => 12345);

    let providerCalls = 0;
    const provider = {
      invoke: async function* () {
        providerCalls++;
        if (providerCalls === 1) {
          yield { type: 'tool_use', toolUseId: 'tu_1', name: 'vector_search', input: { query: 'design tokens', limit: 5 } };
          yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 100, outputTokens: 30, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
        } else {
          yield { type: 'text_delta', text: 'I found 1 result.' };
          yield { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 110, outputTokens: 8, cacheReadInputTokens: 80, cacheCreationInputTokens: 0 } };
        }
      },
    };

    // Pre-seed an initial state so PgSession.appendItem doesn't throw on cold load.
    const initialState = createRunState({
      conversationId: 'c1',
      userId: 'u1',
      brand: 'acme',
      brandRevision: 1,
      agent: 'general',
    });
    // First load: storedState is null. Save the initial state first.
    const session = new PgSession({ pool, captureMessage });
    await session.save(initialState);

    const learningSink = new PgLearningSink({ pool });

    const registry = new ToolRegistry();
    registry.register(vectorSearch, brandContextRead, webSearch);

    const assembler = new ContextAssembler({
      learningSink,
      brandReader: async () => 'brand: acme, tone: bold',
      agentConfig: () => ({
        inputTokenBudget: 200000,
        maxRetrieval: 5,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: ['vector_search', 'brand_context_read', 'web_search'],
      }),
      estimateTokens: (t) => (typeof t === 'string' ? t.length / 4 : 10),
      similarityFn: () => 0.6,
    });

    const engine = new TurnEngine({ session, learningSink, contextAssembler: assembler, provider, registry });

    const ctx = {
      brandContext: {
        brand: 'acme',
        brandRevision: 1,
        userId: 'u1',
        agent: 'general',
        authScope: 'agent',
        permissions: new Set(),
        isolationToken: 'tok',
        transitionDefault: false,
      },
      conversationId: 'c1',
      agentSystemPrompt: 'You are an agent.',
      standingRules: 'Be concise.',
      deps: {
        vectorSearch: {
          getEmbedding: async () => [0.1, 0.2, 0.3],
          query: async () => ({ rows: [{ id: 'm1', similarity: 0.9, content: 'design system v1' }] }),
        },
      },
      canUseTool: async () => true,
    };

    const items = [];
    for await (const item of engine.submitMessage({ input: 'find design tokens', ctx })) items.push(item);

    const types = items.map((i) => i.type || i.status);
    expect(types).toEqual(['user_message', 'tool_call', 'tool_result', 'assistant_message', 'end_turn']);

    // captureMessage called twice: inbound user, outbound assistant
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage.mock.calls[0][0].direction).toBe('inbound');
    expect(captureMessage.mock.calls[1][0].direction).toBe('outbound');

    // agent_run_states upsert called at least 2x: initial save + appendItem(user) + appendItem(tool_call) + ... + final save.
    const upsertCalls = pool.calls.filter((c) => /INSERT INTO agent_run_states/i.test(c.sql));
    expect(upsertCalls.length).toBeGreaterThanOrEqual(2);

    // Final upsert recorded current_step='idle'
    const finalUpsert = upsertCalls[upsertCalls.length - 1];
    expect(finalUpsert.params[2]).toBe('idle');

    expect(providerCalls).toBe(2);
  });
});
