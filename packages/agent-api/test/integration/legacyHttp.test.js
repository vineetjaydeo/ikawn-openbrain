'use strict';

const express = require('express');
const request = require('supertest');
const { createLegacyHttpRouter } = require('../../src/transports/legacyHttp.js');
const { SCHEMA_VERSION, serializeRunState } = require('../../src/engine/runState.js');

// Stateful pool mock: tracks agent_run_states saves so subsequent loads see the saved row.
function makeStatefulPool() {
  const stateStore = new Map(); // conversationId -> serialized state JSON

  const pool = {
    query: vi.fn(async (sql, params) => {
      const s = sql.trim();
      if (/SELECT state, schema_version FROM agent_run_states/i.test(s)) {
        const convId = params && params[0];
        const saved = stateStore.get(convId);
        if (saved) {
          return { rows: [{ state: saved, schema_version: SCHEMA_VERSION }] };
        }
        return { rows: [] }; // cold start
      }
      if (/INSERT INTO agent_run_states/i.test(s)) {
        // params: [conversationId, brand, currentStep, pendingApprovalCount, pendingJobCount, state, schemaVersion]
        const convId = params && params[0];
        const stateJson = params && params[5];
        if (convId && stateJson) stateStore.set(convId, stateJson);
        return { rows: [] };
      }
      if (/INSERT INTO learning_signals/i.test(s)) return { rows: [] };
      if (/SELECT.*FROM lessons/i.test(s)) return { rows: [] };
      if (/SELECT.*FROM agent_configs/i.test(s)) return { rows: [] };
      return { rows: [] };
    }),
    _stateStore: stateStore,
  };
  return pool;
}

function makeDeps({ scriptedProviderEvents }) {
  const captureMessage = vi.fn(async () => 999);
  const pool = makeStatefulPool();
  const provider = {
    invoke: async function* () {
      for (const ev of scriptedProviderEvents) yield ev;
    },
  };
  const buildBrandContext = vi.fn(async () => ({
    brand: 'acme',
    brandRevision: 1,
    userId: 'u1',
    agent: 'general',
    authScope: 'agent',
    permissions: new Set(),
    isolationToken: 'tok',
    transitionDefault: false,
  }));
  return { captureMessage, pool, provider, buildBrandContext };
}

function makeApp(deps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: { id: 'u1' } }; req.brand_id = 'acme'; next(); });
  app.use(createLegacyHttpRouter(deps));
  return app;
}

describe('legacyHttp POST /api/chat/send', () => {
  it('emits chunk + done events for a plain text turn (SSE)', async () => {
    const deps = makeDeps({ scriptedProviderEvents: [
      { type: 'text_delta', text: 'Hi' },
      { type: 'text_delta', text: ' there' },
      { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 2, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    ] });

    const app = makeApp(deps);
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversation_id: 'c1', content: 'hello' })
      .buffer(true)
      .parse((response, cb) => {
        const data = [];
        response.on('data', (chunk) => data.push(chunk));
        response.on('end', () => cb(null, Buffer.concat(data).toString('utf8')));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.body;
    // Plan 02 simplification: the engine buffers all text_delta events into a single
    // assistant_message before yielding. legacyHttp emits ONE chunk per assistant_message.
    // Plan 03 will switch to per-delta streaming for true real-time UX.
    expect(body).toMatch(/data: \{"type":"chunk","text":"Hi there"\}/);
    expect(body).toMatch(/"type":"done"/);
    expect(body).toMatch(/"conversation_id":"c1"/);
  });

  it('returns 400 when conversation_id is missing', async () => {
    const deps = makeDeps({ scriptedProviderEvents: [] });
    const app = makeApp(deps);
    const res = await request(app).post('/api/chat/send').send({ content: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when buildBrandContext throws BrandIsolationError', async () => {
    const { BrandIsolationError } = require('../../src/errors.js');
    const deps = makeDeps({ scriptedProviderEvents: [] });
    deps.buildBrandContext.mockImplementationOnce(async () => {
      // BrandIsolationError constructor: (message, { brand, reason })
      throw new BrandIsolationError('not a member', { brand: 'evil', reason: 'not a member' });
    });
    const app = makeApp(deps);
    const res = await request(app).post('/api/chat/send').send({ conversation_id: 'c1', content: 'hi' });
    expect(res.status).toBe(403);
  });

  it('emits tool_start + tool_done events around a vector_search dispatch', async () => {
    const deps = makeDeps({ scriptedProviderEvents: [] });
    let providerCalls = 0;
    deps.provider.invoke = async function* () {
      providerCalls++;
      if (providerCalls === 1) {
        yield { type: 'tool_use', toolUseId: 'tu_1', name: 'vector_search', input: { query: 'foo', limit: 5 } };
        yield { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      } else {
        yield { type: 'text_delta', text: 'done' };
        yield { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
      }
    };
    deps.toolDeps = {
      vectorSearch: { getEmbedding: async () => [0.1], query: async () => ({ rows: [{ id: 'm1', similarity: 0.9, content: 'r1' }] }) },
      brandContextRead: { getBrandProfile: async () => null },
      webSearch: { searchWeb: async () => [] },
    };
    const app = makeApp(deps);
    const res = await request(app).post('/api/chat/send').send({ conversation_id: 'c1', content: 'find foo' })
      .buffer(true)
      .parse((response, cb) => {
        const data = [];
        response.on('data', (c) => data.push(c));
        response.on('end', () => cb(null, Buffer.concat(data).toString('utf8')));
      });
    expect(res.body).toMatch(/"type":"tool_start","tool":"vector_search"/);
    expect(res.body).toMatch(/"type":"tool_done","tool":"vector_search","success":true/);
  });
});
