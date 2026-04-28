# OpenBrain Agent-API — Plan 01: Foundation Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational primitives of `packages/agent-api/` — `RunState`, `Session`, `BrandContext`, `LearningSink`, `ToolRegistry`, `defineTool`, `StreamingToolExecutor` (sync path only), `ContextAssembler` — with no engine, no live model calls, no Postgres. End state: an in-memory pseudo-turn integration test exercises every primitive together.

**Architecture:** A new npm workspace package at `/Users/vineet/ikawn-openbrain/packages/agent-api/` containing pure modules with no I/O dependencies. All persistence and providers are interfaces; in-memory implementations are provided for tests. The `TurnEngine` class is built in Plan 02 and consumes these primitives. Async tools, MCP transports, the real `PgSession`, and the reflection worker are out of scope here.

**Tech Stack:** Node.js (CommonJS, matching existing OpenBrain), `vitest`, `zod`, `zod-to-json-schema`. No new runtime dependencies for OpenBrain itself.

**Spec source:** `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-04-27-openbrain-agent-api-foundation-design-v2.1.md` (delta against v2: `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-04-27-openbrain-agent-api-foundation-design-v2.md`)

**Plan family:** This is Plan 01 of 5. Subsequent plans (out of scope here):
- Plan 02: TurnEngine + first tools + legacy HTTP transport + PgSession
- Plan 03: Remaining tools + MCP stdio + MCP HTTP + existing-server absorption + Slack bridge cutover
- Plan 04: Async tools + approvals + compression + Lucy approval UI
- Plan 05: Learning loop + edit-delta capture + Lucy/Ruhi cutover + v1 deletion

---

## File map

All paths absolute.

**Created:**
- `/Users/vineet/ikawn-openbrain/packages/agent-api/package.json`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/vitest.config.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/README.md`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/index.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/errors.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/runState.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/session.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/brandContext.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/learningSink.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/ContextAssembler.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/defineTool.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/ToolRegistry.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/StreamingToolExecutor.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/smoke.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/errors.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/runState.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/session.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/brandContext.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/learningSink.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/contextAssembler.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/defineTool.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/registry.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/executor.test.js`
- `/Users/vineet/ikawn-openbrain/packages/agent-api/test/integration/pseudoTurn.test.js`

**Modified:**
- `/Users/vineet/ikawn-openbrain/package.json` (add `workspaces` field)

---

## Tasks

### Task 0: Workspace scaffold

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/package.json`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/package.json`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/vitest.config.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/index.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/smoke.test.js`

- [ ] **Step 1: Add `workspaces` field to root `package.json`**

Edit `/Users/vineet/ikawn-openbrain/package.json`. Insert `"workspaces": ["packages/*"],` immediately after the `"main"` field. The complete root file should now begin:

```json
{
  "name": "ikawn-openbrain",
  "version": "3.0.5",
  "description": "iKawn's Enterprise AI Intelligence Layer — memory, RAG, chat, agent platform",
  "main": "src/index.js",
  "workspaces": ["packages/*"],
  "scripts": {
    ...
```

- [ ] **Step 2: Create `packages/agent-api/package.json`**

```json
{
  "name": "@ikawn/agent-api",
  "version": "0.1.0",
  "description": "OpenBrain agent runtime: TurnEngine, ToolRegistry, ContextAssembler, RunState",
  "main": "src/index.js",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 3: Create `packages/agent-api/vitest.config.js`**

```js
module.exports = {
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
};
```

- [ ] **Step 4: Create `packages/agent-api/src/index.js`** (empty for now; populated in Task 13)

```js
module.exports = {};
```

- [ ] **Step 5: Create smoke test `packages/agent-api/test/smoke.test.js`**

```js
const { describe, it, expect } = require('vitest');
const pkg = require('../src/index.js');

describe('package loads', () => {
  it('exports an object', () => {
    expect(typeof pkg).toBe('object');
  });
});
```

- [ ] **Step 6: Install workspace dependencies**

Run from `/Users/vineet/ikawn-openbrain/`:

```bash
npm install
```

Expected: workspaces detected, `@ikawn/agent-api` symlinked into root `node_modules`, `zod`, `zod-to-json-schema`, and `vitest` resolved without error.

- [ ] **Step 7: Run smoke test**

```bash
npm test --workspace=@ikawn/agent-api
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

- [ ] **Step 8: Commit**

```bash
cd /Users/vineet/ikawn-openbrain
git add package.json package-lock.json packages/agent-api/
git commit -m "feat(agent-api): scaffold workspace package"
```

---

### Task 1: Errors module

Three error shapes used across the package: `ToolError` (envelope, returned not thrown), `BrandIsolationError` (thrown by `BrandContext` construction, caught at transport), `BudgetExceededError` (thrown by `ContextAssembler`).

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/errors.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/errors.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/errors.test.js`:

```js
const { describe, it, expect } = require('vitest');
const {
  ToolError,
  BrandIsolationError,
  BudgetExceededError,
  TOOL_ERROR_KINDS,
} = require('../src/errors.js');

describe('ToolError', () => {
  it('builds a non-throwable envelope', () => {
    const err = ToolError({ kind: 'validation', message: 'bad input' });
    expect(err).toEqual({
      ok: false,
      kind: 'validation',
      message: 'bad input',
      detail: undefined,
    });
  });

  it('preserves detail field', () => {
    const err = ToolError({ kind: 'runtime', message: 'boom', detail: { stack: 'x' } });
    expect(err.detail).toEqual({ stack: 'x' });
  });

  it('rejects unknown kind', () => {
    expect(() => ToolError({ kind: 'oops', message: 'x' })).toThrow(/unknown ToolError kind/);
  });

  it('exposes the full kind set', () => {
    expect(TOOL_ERROR_KINDS.has('isolation_violation')).toBe(true);
    expect(TOOL_ERROR_KINDS.has('async_timeout')).toBe(true);
    expect(TOOL_ERROR_KINDS.has('output_invalid')).toBe(true);
  });
});

describe('BrandIsolationError', () => {
  it('is throwable with brand and reason', () => {
    const err = new BrandIsolationError('access denied', {
      brand: 'maxfashion',
      reason: 'not in allowlist',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrandIsolationError');
    expect(err.brand).toBe('maxfashion');
    expect(err.reason).toBe('not in allowlist');
  });
});

describe('BudgetExceededError', () => {
  it('carries budget and estimate', () => {
    const err = new BudgetExceededError('over budget', { budget: 100000, estimated: 120000 });
    expect(err.budget).toBe(100000);
    expect(err.estimated).toBe(120000);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/errors.test.js
```

Expected: FAIL with `Cannot find module '../src/errors.js'`.

- [ ] **Step 3: Implement errors module**

Create `packages/agent-api/src/errors.js`:

```js
const TOOL_ERROR_KINDS = new Set([
  'validation',
  'output_invalid',
  'timeout',
  'runtime',
  'denied',
  'not_found',
  'isolation_violation',
  'connector_unavailable',
  'async_timeout',
]);

function ToolError({ kind, message, detail }) {
  if (!TOOL_ERROR_KINDS.has(kind)) {
    throw new Error(`unknown ToolError kind: ${kind}`);
  }
  return { ok: false, kind, message, detail };
}

class BrandIsolationError extends Error {
  constructor(message, { brand, reason }) {
    super(message);
    this.name = 'BrandIsolationError';
    this.brand = brand;
    this.reason = reason;
  }
}

class BudgetExceededError extends Error {
  constructor(message, { budget, estimated }) {
    super(message);
    this.name = 'BudgetExceededError';
    this.budget = budget;
    this.estimated = estimated;
  }
}

module.exports = {
  ToolError,
  BrandIsolationError,
  BudgetExceededError,
  TOOL_ERROR_KINDS,
};
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/errors.test.js
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/errors.js packages/agent-api/test/errors.test.js
git commit -m "feat(agent-api): error envelope + isolation + budget errors"
```

---

### Task 2: RunState

Serializable, version-pinned snapshot of a conversation turn. Append-only items log. Schema version constant. (de)serializer rejects unknown versions explicitly.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/runState.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/runState.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/runState.test.js`:

```js
const { describe, it, expect } = require('vitest');
const {
  SCHEMA_VERSION,
  createRunState,
  appendItem,
  serializeRunState,
  deserializeRunState,
  RUN_ITEM_TYPES,
} = require('../src/engine/runState.js');

describe('createRunState', () => {
  it('produces a state with required fields and defaults', () => {
    const state = createRunState({
      conversationId: 'c1',
      userId: 'u1',
      brand: 'ikawn',
      brandRevision: 1,
      agent: 'ruhi',
    });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.conversationId).toBe('c1');
    expect(state.brand).toBe('ikawn');
    expect(state.items).toEqual([]);
    expect(state.currentStep).toBe('idle');
    expect(state.pendingApprovals).toEqual([]);
    expect(state.pendingJobs).toEqual([]);
    expect(state.usage).toEqual({
      inputTokens: 0, outputTokens: 0, cacheReads: 0, cacheWrites: 0,
    });
  });

  it('throws if brand is missing', () => {
    expect(() => createRunState({
      conversationId: 'c1', userId: 'u1', brandRevision: 1, agent: 'ruhi',
    })).toThrow(/brand is required/);
  });
});

describe('appendItem', () => {
  it('returns a new state with item appended (immutable)', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    const item = { type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1000 };
    const next = appendItem(state, item);
    expect(next.items).toHaveLength(1);
    expect(state.items).toHaveLength(0); // original unchanged
    expect(next.items[0]).toBe(item);
  });

  it('rejects unknown item type', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    expect(() => appendItem(state, { type: 'bogus', ts: 1 })).toThrow(/unknown RunItem type/);
  });
});

describe('serialize / deserialize', () => {
  it('round-trips a state with items', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    const withItem = appendItem(state, {
      type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1000,
    });
    const json = serializeRunState(withItem);
    const restored = deserializeRunState(json);
    expect(restored).toEqual(withItem);
  });

  it('rejects a payload with unknown schemaVersion', () => {
    const json = JSON.stringify({ schemaVersion: '0.9' });
    expect(() => deserializeRunState(json)).toThrow(/unsupported schemaVersion/);
  });
});

describe('RUN_ITEM_TYPES', () => {
  it('includes all v2.1 item types', () => {
    [
      'user_message', 'assistant_message',
      'tool_call', 'tool_result', 'tool_async_pending',
      'denial', 'approval_pending', 'compaction_boundary',
      'reasoning', 'edit_delta', 'learn_signal',
    ].forEach((t) => {
      expect(RUN_ITEM_TYPES.has(t)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/runState.test.js
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement runState**

Create `packages/agent-api/src/engine/runState.js`:

```js
const SCHEMA_VERSION = '1.0';

const RUN_ITEM_TYPES = new Set([
  'user_message',
  'assistant_message',
  'tool_call',
  'tool_result',
  'tool_async_pending',
  'denial',
  'approval_pending',
  'compaction_boundary',
  'reasoning',
  'edit_delta',
  'learn_signal',
]);

function createRunState({ conversationId, userId, brand, brandRevision, agent }) {
  if (!brand) throw new Error('brand is required');
  if (!conversationId) throw new Error('conversationId is required');
  if (!userId) throw new Error('userId is required');
  if (typeof brandRevision !== 'number') throw new Error('brandRevision must be a number');
  if (!agent) throw new Error('agent is required');
  return {
    schemaVersion: SCHEMA_VERSION,
    conversationId,
    userId,
    brand,
    brandRevision,
    agent,
    items: [],
    currentStep: 'idle',
    pendingApprovals: [],
    pendingJobs: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReads: 0, cacheWrites: 0 },
    spanContext: null,
    metadata: {},
  };
}

function appendItem(state, item) {
  if (!item || typeof item.type !== 'string') {
    throw new Error('item must have a type');
  }
  if (!RUN_ITEM_TYPES.has(item.type)) {
    throw new Error(`unknown RunItem type: ${item.type}`);
  }
  return { ...state, items: [...state.items, item] };
}

function serializeRunState(state) {
  return JSON.stringify(state);
}

function deserializeRunState(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion: ${parsed.schemaVersion}`);
  }
  return parsed;
}

module.exports = {
  SCHEMA_VERSION,
  RUN_ITEM_TYPES,
  createRunState,
  appendItem,
  serializeRunState,
  deserializeRunState,
};
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/runState.test.js
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/runState.js packages/agent-api/test/runState.test.js
git commit -m "feat(agent-api): RunState shape, append, serialize"
```

---

### Task 3: Session interface + MemorySession

Persistence hook for `RunState`. Memory implementation for tests; `PgSession` lives in Plan 02.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/session.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/session.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/session.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { MemorySession } = require('../src/engine/session.js');
const { createRunState, appendItem } = require('../src/engine/runState.js');

function fixtureState(conversationId = 'c1') {
  return createRunState({
    conversationId, userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
  });
}

describe('MemorySession', () => {
  it('returns null on load for missing conversation', async () => {
    const s = new MemorySession();
    expect(await s.load('missing')).toBeNull();
  });

  it('round-trips save and load', async () => {
    const s = new MemorySession();
    const state = fixtureState();
    await s.save(state);
    const loaded = await s.load('c1');
    expect(loaded).toEqual(state);
  });

  it('isolates by conversationId', async () => {
    const s = new MemorySession();
    await s.save(fixtureState('c1'));
    await s.save(fixtureState('c2'));
    expect((await s.load('c1')).conversationId).toBe('c1');
    expect((await s.load('c2')).conversationId).toBe('c2');
  });

  it('appendItem mutates the stored state', async () => {
    const s = new MemorySession();
    await s.save(fixtureState());
    const item = { type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1 };
    await s.appendItem('c1', item);
    const loaded = await s.load('c1');
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]).toEqual(item);
  });

  it('appendItem on missing conversation throws', async () => {
    const s = new MemorySession();
    const item = { type: 'user_message', content: [], ts: 1 };
    await expect(s.appendItem('missing', item)).rejects.toThrow(/no such conversation/);
  });

  it('appendItem accepts lateSignal opt without breaking', async () => {
    const s = new MemorySession();
    await s.save(fixtureState());
    await s.appendItem('c1', {
      type: 'edit_delta', original: [], edited: [], dimensions: ['tone'], ts: 1,
    }, { lateSignal: true });
    const loaded = await s.load('c1');
    expect(loaded.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/session.test.js
```

- [ ] **Step 3: Implement MemorySession**

Create `packages/agent-api/src/engine/session.js`:

```js
const { appendItem } = require('./runState.js');

class MemorySession {
  constructor() {
    this._states = new Map();
  }

  async load(conversationId) {
    const s = this._states.get(conversationId);
    return s ? structuredClone(s) : null;
  }

  async save(state) {
    this._states.set(state.conversationId, structuredClone(state));
  }

  async appendItem(conversationId, item, _opts) {
    const current = this._states.get(conversationId);
    if (!current) {
      throw new Error(`no such conversation: ${conversationId}`);
    }
    const next = appendItem(current, item);
    this._states.set(conversationId, next);
  }
}

module.exports = { MemorySession };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/session.test.js
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/session.js packages/agent-api/test/session.test.js
git commit -m "feat(agent-api): Session interface + MemorySession"
```

---

### Task 4: BrandContext + buildBrandContext

The load-bearing tenant-isolation primitive. Constructed once per inbound request, validated at four checkpoints, threaded into every `ctx`. Includes the v2.1 `transitionDefault` fallback for legacy single-brand keys.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/brandContext.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/brandContext.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/brandContext.test.js`:

```js
const { describe, it, expect, beforeEach } = require('vitest');
const { buildBrandContext } = require('../src/engine/brandContext.js');
const { BrandIsolationError } = require('../src/errors.js');

function fakeDeps(overrides = {}) {
  return {
    getUser: async (id) => (id === 'u1' ? { id: 'u1' } : null),
    isBrandMember: async (userId, brand) => userId === 'u1' && ['ikawn', 'maxfashion'].includes(brand),
    isAgentAllowed: async (userId, brand, agent) =>
      userId === 'u1' && agent === 'ruhi',
    resolvePermissions: async (userId, brand, agent) =>
      new Set(['read', 'write']),
    ...overrides,
  };
}

const principal = (over = {}) => ({
  userId: 'u1',
  brandAllowlist: ['ikawn', 'maxfashion'],
  agentAllowlist: ['ruhi', 'lucy'],
  ...over,
});

describe('buildBrandContext', () => {
  it('builds a context for a valid principal+brand+agent', async () => {
    const ctx = await buildBrandContext({
      authPrincipal: principal(),
      requestedBrand: 'maxfashion',
      agent: 'ruhi',
      deps: fakeDeps(),
    });
    expect(ctx.brand).toBe('maxfashion');
    expect(ctx.userId).toBe('u1');
    expect(ctx.agent).toBe('ruhi');
    expect(ctx.permissions.has('read')).toBe(true);
    expect(ctx.transitionDefault).toBe(false);
    expect(typeof ctx.isolationToken).toBe('string');
  });

  it('throws BrandIsolationError when user is unknown', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal({ userId: 'u_missing' }),
      requestedBrand: 'maxfashion',
      agent: 'ruhi',
      deps: fakeDeps(),
    })).rejects.toThrow(BrandIsolationError);
  });

  it('throws when brand is not in user membership', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal({ brandAllowlist: ['shubhkart'] }),
      requestedBrand: 'shubhkart',
      agent: 'ruhi',
      deps: fakeDeps(),
    })).rejects.toThrow(/not a member/);
  });

  it('throws when agent is not allowed for user/brand', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal(),
      requestedBrand: 'ikawn',
      agent: 'leadspark',
      deps: fakeDeps(),
    })).rejects.toThrow(/agent not allowed/);
  });

  it('falls back to transitionDefault when principal lacks brand allowlist', async () => {
    const ctx = await buildBrandContext({
      authPrincipal: { userId: 'u1' }, // legacy key, no claims
      requestedBrand: undefined,
      agent: 'ruhi',
      deps: fakeDeps(),
    });
    expect(ctx.brand).toBe('ikawn');
    expect(ctx.transitionDefault).toBe(true);
  });

  it('produces a stable isolationToken for same brand+revision', async () => {
    const deps = fakeDeps();
    const ctxA = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    const ctxB = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    expect(ctxA.isolationToken).toBe(ctxB.isolationToken);
  });

  it('produces a different isolationToken when brandRevision changes', async () => {
    const deps = fakeDeps();
    const ctxA = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    const ctxB = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 8,
    });
    expect(ctxA.isolationToken).not.toBe(ctxB.isolationToken);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/brandContext.test.js
```

- [ ] **Step 3: Implement BrandContext**

Create `packages/agent-api/src/engine/brandContext.js`:

```js
const crypto = require('crypto');
const { BrandIsolationError } = require('../errors.js');

const LEGACY_DEFAULT_BRAND = 'ikawn';

async function buildBrandContext({
  authPrincipal,
  requestedBrand,
  agent,
  deps,
  brandRevision = 0,
}) {
  if (!authPrincipal || !authPrincipal.userId) {
    throw new BrandIsolationError('missing auth principal', { brand: null, reason: 'no userId' });
  }
  const user = await deps.getUser(authPrincipal.userId);
  if (!user) {
    throw new BrandIsolationError('unknown user', {
      brand: requestedBrand, reason: `user ${authPrincipal.userId} not found`,
    });
  }

  const hasNewClaims = Array.isArray(authPrincipal.brandAllowlist);
  let brand;
  let transitionDefault = false;

  if (!hasNewClaims) {
    brand = LEGACY_DEFAULT_BRAND;
    transitionDefault = true;
  } else {
    brand = requestedBrand || authPrincipal.brandAllowlist[0];
    if (!authPrincipal.brandAllowlist.includes(brand)) {
      throw new BrandIsolationError('brand not in principal allowlist', {
        brand, reason: 'principal brand allowlist',
      });
    }
    const member = await deps.isBrandMember(authPrincipal.userId, brand);
    if (!member) {
      throw new BrandIsolationError('user is not a member of brand', {
        brand, reason: 'membership check',
      });
    }
  }

  const allowed = await deps.isAgentAllowed(authPrincipal.userId, brand, agent);
  if (!allowed) {
    throw new BrandIsolationError('agent not allowed for user/brand', {
      brand, reason: `agent ${agent}`,
    });
  }

  const permissions = await deps.resolvePermissions(authPrincipal.userId, brand, agent);
  const agentAllowlist = authPrincipal.agentAllowlist || null;
  const intersected = agentAllowlist
    ? new Set([...permissions].filter(() => agentAllowlist.includes(agent)))
    : permissions;

  const isolationToken = crypto
    .createHash('sha256')
    .update(`${brand}|${brandRevision}`)
    .digest('hex');

  return {
    brand,
    brandRevision,
    userId: authPrincipal.userId,
    agent,
    authScope: hasNewClaims ? 'agent' : 'user',
    permissions: intersected,
    isolationToken,
    transitionDefault,
  };
}

module.exports = { buildBrandContext, LEGACY_DEFAULT_BRAND };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/brandContext.test.js
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/brandContext.js packages/agent-api/test/brandContext.test.js
git commit -m "feat(agent-api): BrandContext + buildBrandContext + transition fallback"
```

---

### Task 5: defineTool factory

Tools are declared with one factory call. Zod input + output schemas drive validation. JSON schema is derived from the input Zod schema. Reliability profile fields (`mode`, `concurrency`, `needsApproval`, `timeoutMs`, `retry`, `idempotencyKey`) are validated at registration.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/defineTool.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/defineTool.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/defineTool.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { z } = require('zod');
const { defineTool } = require('../src/tools/defineTool.js');

function baseSpec(overrides = {}) {
  return {
    name: 'echo',
    description: 'Echoes input',
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
    ...overrides,
  };
}

describe('defineTool', () => {
  it('returns a tool with derived JSON schema', () => {
    const tool = defineTool(baseSpec());
    expect(tool.name).toBe('echo');
    expect(tool.jsonSchema).toBeDefined();
    expect(tool.jsonSchema.type).toBe('object');
    expect(tool.jsonSchema.properties.msg).toBeDefined();
  });

  it('validates input via Zod', () => {
    const tool = defineTool(baseSpec());
    const ok = tool.validateInput({ msg: 'hi' });
    expect(ok.success).toBe(true);
    const fail = tool.validateInput({ msg: 42 });
    expect(fail.success).toBe(false);
    expect(fail.error.issues[0].path).toEqual(['msg']);
  });

  it('validates output via Zod', () => {
    const tool = defineTool(baseSpec());
    const ok = tool.validateOutput({ msg: 'hi' });
    expect(ok.success).toBe(true);
    const fail = tool.validateOutput({ msg: 42 });
    expect(fail.success).toBe(false);
  });

  it('rejects spec without required fields', () => {
    expect(() => defineTool({ ...baseSpec(), name: undefined })).toThrow(/name is required/);
    expect(() => defineTool({ ...baseSpec(), parameters: undefined })).toThrow(/parameters is required/);
    expect(() => defineTool({ ...baseSpec(), output: undefined })).toThrow(/output is required/);
    expect(() => defineTool({ ...baseSpec(), execute: undefined })).toThrow(/execute is required/);
  });

  it('rejects unknown mode and concurrency', () => {
    expect(() => defineTool({ ...baseSpec(), mode: 'bogus' })).toThrow(/invalid mode/);
    expect(() => defineTool({ ...baseSpec(), concurrency: 'bogus' })).toThrow(/invalid concurrency/);
  });

  it('requires idempotencyKey when retry > 0 AND tool has side-effect-style name flag', () => {
    expect(() => defineTool({
      ...baseSpec(),
      retry: { maxAttempts: 1 },
      sideEffect: true,
    })).toThrow(/idempotencyKey is required/);
  });

  it('accepts idempotencyKey when retry > 0 with side effects', () => {
    const tool = defineTool({
      ...baseSpec(),
      retry: { maxAttempts: 1 },
      sideEffect: true,
      idempotencyKey: (input, ctx) => `${ctx.turnId}:${input.msg}`,
    });
    expect(typeof tool.idempotencyKey).toBe('function');
  });

  it('preserves async mode', () => {
    const tool = defineTool({ ...baseSpec(), mode: 'async' });
    expect(tool.mode).toBe('async');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/defineTool.test.js
```

- [ ] **Step 3: Implement defineTool**

Create `packages/agent-api/src/tools/defineTool.js`:

```js
const { zodToJsonSchema } = require('zod-to-json-schema');

const VALID_MODES = new Set(['sync', 'async']);
const VALID_CONCURRENCY = new Set(['safe', 'exclusive']);

function defineTool(spec) {
  if (!spec || !spec.name) throw new Error('name is required');
  if (!spec.description) throw new Error('description is required');
  if (!spec.parameters) throw new Error('parameters is required');
  if (!spec.output) throw new Error('output is required');
  if (typeof spec.execute !== 'function') throw new Error('execute is required');

  const mode = spec.mode || 'sync';
  if (!VALID_MODES.has(mode)) throw new Error(`invalid mode: ${mode}`);

  const concurrency = spec.concurrency || 'safe';
  if (!VALID_CONCURRENCY.has(concurrency)) {
    throw new Error(`invalid concurrency: ${concurrency}`);
  }

  const retry = spec.retry || { maxAttempts: 0 };
  const sideEffect = !!spec.sideEffect;
  if (retry.maxAttempts > 0 && sideEffect && typeof spec.idempotencyKey !== 'function') {
    throw new Error('idempotencyKey is required for retried side-effect tools');
  }

  const jsonSchema = zodToJsonSchema(spec.parameters, { target: 'jsonSchema7' });

  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: spec.output,
    jsonSchema,
    mode,
    concurrency,
    needsApproval: !!spec.needsApproval,
    timeoutMs: spec.timeoutMs || 5000,
    retry,
    sideEffect,
    idempotencyKey: spec.idempotencyKey || null,
    execute: spec.execute,
    validateInput(value) {
      return spec.parameters.safeParse(value);
    },
    validateOutput(value) {
      return spec.output.safeParse(value);
    },
  };
}

module.exports = { defineTool, VALID_MODES, VALID_CONCURRENCY };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/defineTool.test.js
```

Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/tools/defineTool.js packages/agent-api/test/defineTool.test.js
git commit -m "feat(agent-api): defineTool factory with Zod schemas + reliability config"
```

---

### Task 6: ToolRegistry

In-memory registry of defined tools. Supports register, lookup, list, and per-call allowlist filtering.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/ToolRegistry.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/registry.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/registry.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { z } = require('zod');
const { ToolRegistry } = require('../src/tools/ToolRegistry.js');
const { defineTool } = require('../src/tools/defineTool.js');

function fakeTool(name) {
  return defineTool({
    name,
    description: name,
    parameters: z.object({}),
    output: z.object({}),
    async execute() { return {}; },
  });
}

describe('ToolRegistry', () => {
  it('registers and looks up tools by name', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'));
    expect(r.get('a').name).toBe('a');
    expect(r.get('b').name).toBe('b');
  });

  it('returns undefined for unknown name', () => {
    const r = new ToolRegistry();
    expect(r.get('missing')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'));
    expect(() => r.register(fakeTool('a'))).toThrow(/already registered/);
  });

  it('lists all tools', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'), fakeTool('c'));
    expect(r.list().map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  it('filters via allowlist', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'), fakeTool('c'));
    const filtered = r.allowlist(['a', 'c']);
    expect(filtered.map((t) => t.name)).toEqual(['a', 'c']);
  });

  it('allowlist silently drops unknown names', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'));
    expect(r.allowlist(['a', 'missing']).map((t) => t.name)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/registry.test.js
```

- [ ] **Step 3: Implement ToolRegistry**

Create `packages/agent-api/src/tools/ToolRegistry.js`:

```js
class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(...tools) {
    for (const tool of tools) {
      if (this._tools.has(tool.name)) {
        throw new Error(`tool already registered: ${tool.name}`);
      }
      this._tools.set(tool.name, tool);
    }
  }

  get(name) {
    return this._tools.get(name);
  }

  list() {
    return Array.from(this._tools.values());
  }

  allowlist(names) {
    return names
      .map((n) => this._tools.get(n))
      .filter(Boolean);
  }
}

module.exports = { ToolRegistry };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/registry.test.js
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/tools/ToolRegistry.js packages/agent-api/test/registry.test.js
git commit -m "feat(agent-api): ToolRegistry with allowlist filter"
```

---

### Task 7: StreamingToolExecutor (sync path)

Dispatches tool_use blocks. Validates input, checks permission, asserts brand isolation, runs the tool, validates output, returns a `tool_result` `RunItem` (or `denial` `RunItem`, or `tool_result` carrying a `ToolError` envelope). Concurrency: `safe` parallel batch; `exclusive` runs after the safe batch drains. Async mode is stubbed (returns NOT_IMPLEMENTED `ToolError`) until Plan 04.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/tools/StreamingToolExecutor.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/executor.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/executor.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { z } = require('zod');
const { StreamingToolExecutor } = require('../src/tools/StreamingToolExecutor.js');
const { ToolRegistry } = require('../src/tools/ToolRegistry.js');
const { defineTool } = require('../src/tools/defineTool.js');

function makeExecutor({ tools, canUseTool = () => true }) {
  const registry = new ToolRegistry();
  registry.register(...tools);
  return new StreamingToolExecutor({ registry, canUseTool });
}

const baseCtx = {
  brandContext: { brand: 'ikawn', isolationToken: 't', userId: 'u1', agent: 'ruhi' },
  turnId: 't1',
  deps: {},
};
const baseState = { brand: 'ikawn' };

describe('StreamingToolExecutor', () => {
  it('returns tool_result on happy path', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async execute(input) { return { msg: input.msg }; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: { msg: 'hi' } },
      baseCtx, baseState,
    );
    expect(item.type).toBe('tool_result');
    expect(item.toolUseId).toBe('u1');
    expect(item.output).toEqual({ msg: 'hi' });
  });

  it('returns ToolError envelope when tool missing', async () => {
    const exec = makeExecutor({ tools: [] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'missing', input: {} },
      baseCtx, baseState,
    );
    expect(item.type).toBe('tool_result');
    expect(item.output.ok).toBe(false);
    expect(item.output.kind).toBe('not_found');
  });

  it('returns ToolError envelope on input validation failure', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async execute(input) { return { msg: input.msg }; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: { msg: 42 } },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('validation');
  });

  it('returns denial RunItem when permission denied', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({}),
      output: z.object({}),
      async execute() { return {}; },
    });
    const exec = makeExecutor({
      tools: [echo],
      canUseTool: () => false,
    });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: {} },
      baseCtx, baseState,
    );
    expect(item.type).toBe('denial');
    expect(item.toolName).toBe('echo');
  });

  it('returns isolation_violation when ctx brand != state brand', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({}),
      output: z.object({}),
      async execute() { return {}; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: {} },
      { ...baseCtx, brandContext: { ...baseCtx.brandContext, brand: 'maxfashion' } },
      baseState,
    );
    expect(item.output.kind).toBe('isolation_violation');
  });

  it('returns output_invalid when execute returns wrong shape', async () => {
    const bad = defineTool({
      name: 'bad',
      description: 'bad',
      parameters: z.object({}),
      output: z.object({ msg: z.string() }),
      async execute() { return { msg: 42 }; },
    });
    const exec = makeExecutor({ tools: [bad] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'bad', input: {} },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('output_invalid');
  });

  it('returns NOT_IMPLEMENTED for async tools (Plan 04)', async () => {
    const slow = defineTool({
      name: 'slow',
      description: 'slow',
      parameters: z.object({}),
      output: z.object({}),
      mode: 'async',
      async execute() { return {}; },
    });
    const exec = makeExecutor({ tools: [slow] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'slow', input: {} },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('runtime');
    expect(item.output.message).toMatch(/async tools not implemented in Plan 01/);
  });

  it('runs safe-concurrency tools in parallel via dispatchBatch', async () => {
    const calls = [];
    function makeTool(name, delayMs) {
      return defineTool({
        name,
        description: name,
        parameters: z.object({}),
        output: z.object({ name: z.string() }),
        concurrency: 'safe',
        async execute() {
          calls.push(`start ${name}`);
          await new Promise((r) => setTimeout(r, delayMs));
          calls.push(`end ${name}`);
          return { name };
        },
      });
    }
    const exec = makeExecutor({ tools: [makeTool('a', 30), makeTool('b', 5)] });
    const items = await exec.dispatchBatch(
      [
        { id: 'u1', name: 'a', input: {} },
        { id: 'u2', name: 'b', input: {} },
      ],
      baseCtx, baseState,
    );
    expect(items).toHaveLength(2);
    // b should finish before a because they run in parallel and b is shorter
    expect(calls.indexOf('end b')).toBeLessThan(calls.indexOf('end a'));
  });

  it('runs exclusive tools after safe batch drains', async () => {
    const order = [];
    const safeTool = defineTool({
      name: 'safe1',
      description: 's',
      parameters: z.object({}),
      output: z.object({}),
      concurrency: 'safe',
      async execute() { order.push('safe1'); return {}; },
    });
    const excTool = defineTool({
      name: 'exc1',
      description: 'e',
      parameters: z.object({}),
      output: z.object({}),
      concurrency: 'exclusive',
      async execute() { order.push('exc1'); return {}; },
    });
    const exec = makeExecutor({ tools: [safeTool, excTool] });
    await exec.dispatchBatch(
      [
        { id: 'u1', name: 'exc1', input: {} },
        { id: 'u2', name: 'safe1', input: {} },
      ],
      baseCtx, baseState,
    );
    expect(order).toEqual(['safe1', 'exc1']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/executor.test.js
```

- [ ] **Step 3: Implement StreamingToolExecutor**

Create `packages/agent-api/src/tools/StreamingToolExecutor.js`:

```js
const { ToolError } = require('../errors.js');

class StreamingToolExecutor {
  constructor({ registry, canUseTool }) {
    this._registry = registry;
    this._canUseTool = canUseTool || (() => true);
  }

  async dispatchToolUse(toolUse, ctx, state) {
    const { id: toolUseId, name, input } = toolUse;
    const ts = Date.now();

    const tool = this._registry.get(name);
    if (!tool) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'not_found', message: `tool not found: ${name}`,
      }), ts);
    }

    const validated = tool.validateInput(input);
    if (!validated.success) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'validation', message: 'input validation failed', detail: validated.error.issues,
      }), ts);
    }

    const allowed = await Promise.resolve(this._canUseTool(tool, validated.data, ctx));
    if (!allowed) {
      return {
        type: 'denial',
        toolName: name,
        reason: 'permission denied',
        ts,
      };
    }

    if (ctx.brandContext.brand !== state.brand) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'isolation_violation',
        message: `ctx brand ${ctx.brandContext.brand} does not match state brand ${state.brand}`,
      }), ts);
    }

    if (tool.mode === 'async') {
      return this._resultItem(toolUseId, ToolError({
        kind: 'runtime',
        message: 'async tools not implemented in Plan 01',
      }), ts);
    }

    let raw;
    try {
      raw = await tool.execute(validated.data, ctx);
    } catch (e) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'runtime', message: e.message, detail: { stack: e.stack },
      }), ts);
    }

    const out = tool.validateOutput(raw);
    if (!out.success) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'output_invalid', message: 'output validation failed', detail: out.error.issues,
      }), ts);
    }

    return this._resultItem(toolUseId, out.data, ts);
  }

  async dispatchBatch(toolUses, ctx, state) {
    const safeBatch = [];
    const exclusiveBatch = [];
    for (const tu of toolUses) {
      const tool = this._registry.get(tu.name);
      if (tool && tool.concurrency === 'exclusive') {
        exclusiveBatch.push(tu);
      } else {
        safeBatch.push(tu);
      }
    }
    const safeResults = await Promise.all(
      safeBatch.map((tu) => this.dispatchToolUse(tu, ctx, state)),
    );
    const exclusiveResults = [];
    for (const tu of exclusiveBatch) {
      exclusiveResults.push(await this.dispatchToolUse(tu, ctx, state));
    }
    return [...safeResults, ...exclusiveResults];
  }

  _resultItem(toolUseId, output, ts) {
    return { type: 'tool_result', toolUseId, output, ts };
  }
}

module.exports = { StreamingToolExecutor };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/executor.test.js
```

Expected: 9 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/tools/StreamingToolExecutor.js packages/agent-api/test/executor.test.js
git commit -m "feat(agent-api): StreamingToolExecutor sync dispatch + concurrency + isolation"
```

---

### Task 8: LearningSink interface + MemoryLearningSink

In-memory implementation of the four learning signal capture methods plus the lesson read/write interface. `PgLearningSink` lives in Plan 02.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/learningSink.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/learningSink.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/agent-api/test/learningSink.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { MemoryLearningSink } = require('../src/engine/learningSink.js');

describe('MemoryLearningSink', () => {
  it('records and reads back signals by brand', async () => {
    const s = new MemoryLearningSink();
    await s.recordEditDelta('ikawn', 't1', {
      original: [{ type: 'text', text: 'hi' }],
      edited: [{ type: 'text', text: 'hello' }],
      dimensions: ['tone'],
    });
    const signals = await s.readSignals('ikawn');
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe('edit_delta');
  });

  it('isolates signals by brand', async () => {
    const s = new MemoryLearningSink();
    await s.recordToolOutcome('ikawn', 't1', { toolUseId: 'u1', positive: true });
    await s.recordToolOutcome('maxfashion', 't2', { toolUseId: 'u2', positive: false });
    expect(await s.readSignals('ikawn')).toHaveLength(1);
    expect(await s.readSignals('maxfashion')).toHaveLength(1);
  });

  it('writes and reads lessons by brand+agent', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l1', agent: 'ruhi', topic: 'tone', text: 'be concise',
      embedding: [0.1, 0.2], quality_score: 0.8, created_at: 1,
    });
    const lessons = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].id).toBe('l1');
  });

  it('readLessons filters by agent', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l1', agent: 'ruhi', topic: 't', text: 'x',
      embedding: [], quality_score: 0.5, created_at: 1,
    });
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l2', agent: 'lucy', topic: 't', text: 'y',
      embedding: [], quality_score: 0.5, created_at: 2,
    });
    const ruhiLessons = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(ruhiLessons.map((l) => l.id)).toEqual(['l1']);
  });

  it('records approval and denial signals', async () => {
    const s = new MemoryLearningSink();
    await s.recordApproval('ikawn', 't1', { toolUseId: 'u1', decision: 'approve' });
    await s.recordApproval('ikawn', 't1', { toolUseId: 'u2', decision: 'reject' });
    const signals = await s.readSignals('ikawn');
    expect(signals.map((s) => s.detail.decision)).toEqual(['approve', 'reject']);
  });

  it('writes cross-brand lessons separately', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ crossBrand: true }, {
      id: 'cb1', agent: 'ruhi', topic: 'patterns', text: 'distilled',
      embedding: [], quality_score: 0.7, created_at: 1,
    });
    const cb = await s.readCrossBrandLessons({ agent: 'ruhi' }, 10);
    expect(cb).toHaveLength(1);
    expect(cb[0].id).toBe('cb1');
    // Brand-scoped read should NOT return cross-brand
    const bs = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(bs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/learningSink.test.js
```

- [ ] **Step 3: Implement MemoryLearningSink**

Create `packages/agent-api/src/engine/learningSink.js`:

```js
class MemoryLearningSink {
  constructor() {
    this._signals = new Map();      // brand -> array of signals
    this._lessons = new Map();      // brand -> array of lessons
    this._crossBrandLessons = [];   // array
  }

  async recordEditDelta(brand, turnId, delta) {
    this._appendSignal(brand, { kind: 'edit_delta', turnId, detail: delta, ts: Date.now() });
  }

  async recordToolOutcome(brand, turnId, signal) {
    this._appendSignal(brand, { kind: 'tool_outcome', turnId, detail: signal, ts: Date.now() });
  }

  async recordApproval(brand, turnId, decision) {
    this._appendSignal(brand, { kind: 'approval', turnId, detail: decision, ts: Date.now() });
  }

  async writeLesson(scope, lesson) {
    if (scope.crossBrand) {
      this._crossBrandLessons.push({ ...lesson });
      return;
    }
    if (!scope.brand) throw new Error('writeLesson requires scope.brand or scope.crossBrand');
    const arr = this._lessons.get(scope.brand) || [];
    arr.push({ ...lesson });
    this._lessons.set(scope.brand, arr);
  }

  async readLessons({ brand, agent, topic }, limit) {
    const all = this._lessons.get(brand) || [];
    return all
      .filter((l) => (!agent || l.agent === agent) && (!topic || l.topic === topic))
      .slice(0, limit);
  }

  async readCrossBrandLessons({ agent, topic }, limit) {
    return this._crossBrandLessons
      .filter((l) => (!agent || l.agent === agent) && (!topic || l.topic === topic))
      .slice(0, limit);
  }

  async readSignals(brand) {
    return this._signals.get(brand) || [];
  }

  _appendSignal(brand, signal) {
    const arr = this._signals.get(brand) || [];
    arr.push(signal);
    this._signals.set(brand, arr);
  }
}

module.exports = { MemoryLearningSink };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/learningSink.test.js
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/learningSink.js packages/agent-api/test/learningSink.test.js
git commit -m "feat(agent-api): LearningSink interface + MemoryLearningSink"
```

---

### Task 9: ContextAssembler — composition

The five-stage assembler (system / brand / lessons / history / turn input) without budget gating yet. Returns the deterministic context package with cache breakpoints positioned at stage boundaries.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/ContextAssembler.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/contextAssembler.test.js`

- [ ] **Step 1: Write failing tests for composition only**

Create `packages/agent-api/test/contextAssembler.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { ContextAssembler } = require('../src/engine/ContextAssembler.js');
const { MemoryLearningSink } = require('../src/engine/learningSink.js');
const { createRunState, appendItem } = require('../src/engine/runState.js');

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
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

- [ ] **Step 3: Implement ContextAssembler (composition only)**

Create `packages/agent-api/src/engine/ContextAssembler.js`:

```js
const { BudgetExceededError } = require('../errors.js');

class ContextAssembler {
  constructor({ learningSink, brandReader, agentConfig, estimateTokens }) {
    this._learningSink = learningSink;
    this._brandReader = brandReader;
    this._agentConfig = agentConfig;
    this._estimateTokens = estimateTokens;
  }

  async compose({ ctx, state, turnInput }) {
    const config = this._agentConfig(ctx.brandContext.agent, ctx.brandContext.brand);
    const messages = [];
    const cacheBreakpoints = [];
    let estimatedInputTokens = 0;

    // Stage 1: system prompt (cached)
    const systemPrompt = `${ctx.agentSystemPrompt}\n\n${ctx.standingRules}`;
    cacheBreakpoints.push({ position: 0, kind: 'system' });
    estimatedInputTokens += this._estimateTokens(systemPrompt);

    // Stage 2: brand context (cached at brandRevision)
    const brandText = await this._brandReader(
      ctx.brandContext.brand, ctx.brandContext.isolationToken,
    );
    messages.push({
      role: 'system',
      content: [{ type: 'text', text: `Brand context:\n${brandText}` }],
    });
    cacheBreakpoints.push({ position: messages.length, kind: 'brand' });
    estimatedInputTokens += this._estimateTokens(brandText);

    // Stage 3: lessons (cached per brandRevision)
    const lessons = await this._readAndRankLessons({ ctx, state, turnInput, config });
    if (lessons.length > 0) {
      const lessonText = lessons.map((l) => `- ${l.text}`).join('\n');
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: `Lessons:\n${lessonText}` }],
      });
      cacheBreakpoints.push({ position: messages.length, kind: 'lessons' });
      estimatedInputTokens += this._estimateTokens(lessonText);
    }

    // Stage 4: history since last compaction_boundary
    const history = this._historySinceLastBoundary(state.items);
    for (const item of history) {
      const msg = this._itemToMessage(item);
      if (msg) {
        messages.push(msg);
        estimatedInputTokens += this._estimateTokens(JSON.stringify(msg.content));
      }
    }
    cacheBreakpoints.push({ position: messages.length, kind: 'history' });

    // Stage 5: turn input (uncached, last)
    messages.push({ role: 'user', content: turnInput });
    estimatedInputTokens += this._estimateTokens(JSON.stringify(turnInput));

    return {
      systemPrompt,
      messages,
      tools: [], // populated by engine in Plan 02 with tool_allowlist resolution
      cacheBreakpoints,
      budget: {
        inputTokenBudget: config.inputTokenBudget,
        estimatedInputTokens,
        cacheableTokens: 0, // computed in Plan 02 once tokenizer is wired
      },
      lessonsApplied: lessons.map((l) => ({ id: l.id, score: l._score })),
    };
  }

  // Lesson ranking is wired in Task 11; for Task 9 it returns the unranked top-N.
  async _readAndRankLessons({ ctx, config }) {
    const candidates = await this._learningSink.readLessons(
      { brand: ctx.brandContext.brand, agent: ctx.brandContext.agent },
      config.maxRetrieval || 8,
    );
    return candidates.map((c) => ({ ...c, _score: 0 }));
  }

  _historySinceLastBoundary(items) {
    let lastBoundaryIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === 'compaction_boundary') {
        lastBoundaryIdx = i;
        break;
      }
    }
    if (lastBoundaryIdx === -1) return items;
    return items.slice(lastBoundaryIdx);
  }

  _itemToMessage(item) {
    switch (item.type) {
      case 'user_message': return { role: 'user', content: item.content };
      case 'assistant_message': return { role: 'assistant', content: item.content };
      case 'compaction_boundary':
        return { role: 'system', content: [{ type: 'text', text: `Earlier conversation summary:\n${item.summary}` }] };
      case 'tool_call':
        return { role: 'assistant', content: [{ type: 'tool_use', id: item.toolUseId, name: item.toolName, input: item.input }] };
      case 'tool_result':
        return { role: 'user', content: [{ type: 'tool_result', tool_use_id: item.toolUseId, content: JSON.stringify(item.output) }] };
      case 'denial':
      case 'approval_pending':
      case 'tool_async_pending':
      case 'edit_delta':
      case 'learn_signal':
      case 'reasoning':
        return null; // engine-internal; not sent to model
      default: return null;
    }
  }
}

module.exports = { ContextAssembler };
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/ContextAssembler.js packages/agent-api/test/contextAssembler.test.js
git commit -m "feat(agent-api): ContextAssembler 5-stage composition"
```

---

### Task 10: ContextAssembler — budget gating

Add the budget check after composition. If estimate exceeds the budget: drop lowest-scoring lessons one by one; if still over, throw `BudgetExceededError` with a callback hook for compression (compression is implemented in Plan 04).

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/ContextAssembler.js`
- Modify: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/contextAssembler.test.js`

- [ ] **Step 1: Add failing tests for budget gating**

Append to `packages/agent-api/test/contextAssembler.test.js`:

```js
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
```

Add the import at the top of the test file:

```js
const { BudgetExceededError } = require('../src/errors.js');
```

- [ ] **Step 2: Run, expect new failures (3 fail, others pass)**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

- [ ] **Step 3: Add budget gating to ContextAssembler.compose**

Replace the `compose` method in `packages/agent-api/src/engine/ContextAssembler.js` with:

```js
  async compose({ ctx, state, turnInput }) {
    const config = this._agentConfig(ctx.brandContext.agent, ctx.brandContext.brand);
    const messages = [];
    const cacheBreakpoints = [];

    const systemPrompt = `${ctx.agentSystemPrompt}\n\n${ctx.standingRules}`;
    cacheBreakpoints.push({ position: 0, kind: 'system' });
    const systemTokens = this._estimateTokens(systemPrompt);

    const brandText = await this._brandReader(
      ctx.brandContext.brand, ctx.brandContext.isolationToken,
    );
    const brandMsg = {
      role: 'system',
      content: [{ type: 'text', text: `Brand context:\n${brandText}` }],
    };
    messages.push(brandMsg);
    cacheBreakpoints.push({ position: messages.length, kind: 'brand' });
    const brandTokens = this._estimateTokens(brandText);

    let lessons = await this._readAndRankLessons({ ctx, state, turnInput, config });

    const history = this._historySinceLastBoundary(state.items);
    const historyMsgs = [];
    let historyTokens = 0;
    for (const item of history) {
      const msg = this._itemToMessage(item);
      if (msg) {
        historyMsgs.push(msg);
        historyTokens += this._estimateTokens(JSON.stringify(msg.content));
      }
    }

    const turnTokens = this._estimateTokens(JSON.stringify(turnInput));
    const fixedTokens = systemTokens + brandTokens + historyTokens + turnTokens;

    while (true) {
      const lessonText = lessons.length > 0
        ? lessons.map((l) => `- ${l.text}`).join('\n')
        : '';
      const lessonTokens = lessonText ? this._estimateTokens(lessonText) : 0;
      const total = fixedTokens + lessonTokens;
      if (total <= config.inputTokenBudget) break;
      if (lessons.length === 0) {
        throw new BudgetExceededError('context exceeds budget after dropping all lessons', {
          budget: config.inputTokenBudget, estimated: total,
        });
      }
      lessons.sort((a, b) => (a._score || 0) - (b._score || 0));
      lessons.shift();
    }

    if (lessons.length > 0) {
      const lessonText = lessons.map((l) => `- ${l.text}`).join('\n');
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: `Lessons:\n${lessonText}` }],
      });
      cacheBreakpoints.push({ position: messages.length, kind: 'lessons' });
    }

    for (const m of historyMsgs) {
      messages.push(m);
    }
    cacheBreakpoints.push({ position: messages.length, kind: 'history' });

    messages.push({ role: 'user', content: turnInput });

    const lessonText = lessons.length > 0 ? lessons.map((l) => `- ${l.text}`).join('\n') : '';
    const lessonTokens = lessonText ? this._estimateTokens(lessonText) : 0;
    const estimatedInputTokens = systemTokens + brandTokens + lessonTokens + historyTokens + turnTokens;

    return {
      systemPrompt,
      messages,
      tools: [],
      cacheBreakpoints,
      budget: {
        inputTokenBudget: config.inputTokenBudget,
        estimatedInputTokens,
        cacheableTokens: 0,
      },
      lessonsApplied: lessons.map((l) => ({ id: l.id, score: l._score || 0 })),
    };
  }
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

Expected: 7 passing tests (4 from Task 9 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/ContextAssembler.js packages/agent-api/test/contextAssembler.test.js
git commit -m "feat(agent-api): ContextAssembler budget gating with lesson drop"
```

---

### Task 11: ContextAssembler — lesson ranking

Add weighted ranking using the v2.1 formula: `0.5 * similarity + 0.3 * recency + 0.2 * quality_score`. Per-agent override via `agentConfig.lessonInjectionWeights`. For Plan 01 the similarity input is supplied by the caller (real embedding similarity wires in Plan 02); this task tests the ranking math.

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/engine/ContextAssembler.js`
- Modify: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/contextAssembler.test.js`

- [ ] **Step 1: Add failing tests for ranking**

Append to `packages/agent-api/test/contextAssembler.test.js`:

```js
describe('ContextAssembler lesson ranking', () => {
  it('selects top-N by weighted score using default weights', async () => {
    const sink = new MemoryLearningSink();
    const now = Date.now();
    await sink.writeLesson({ brand: 'ikawn' }, {
      id: 'low', agent: 'ruhi', topic: 't', text: 'low score lesson',
      embedding: [], quality_score: 0.1, created_at: now - 10_000_000,
    });
    await sink.writeLesson({ brand: 'ikawn' }, {
      id: 'high', agent: 'ruhi', topic: 't', text: 'high score lesson',
      embedding: [], quality_score: 0.9, created_at: now,
    });
    const assembler = new ContextAssembler({
      learningSink: sink,
      brandReader: fakeBrandReader(),
      agentConfig: () => ({
        inputTokenBudget: 200000,
        maxRetrieval: 1,
        lessonInjectionWeights: { similarity: 0.5, recency: 0.3, quality_score: 0.2 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 5,
      similarityFn: () => 0.5, // constant
    });
    const out = await assembler.compose({
      ctx: baseCtx(), state: baseState(), turnInput: [{ type: 'text', text: 'q' }],
    });
    // Top 1 should be the high-quality, more-recent lesson
    expect(out.lessonsApplied.map((l) => l.id)).toEqual(['high']);
  });

  it('respects per-agent weight overrides', async () => {
    const sink = new MemoryLearningSink();
    const now = Date.now();
    await sink.writeLesson({ brand: 'ikawn' }, {
      id: 'recent_low_quality', agent: 'ruhi', topic: 't', text: 'r',
      embedding: [], quality_score: 0.0, created_at: now,
    });
    await sink.writeLesson({ brand: 'ikawn' }, {
      id: 'old_high_quality', agent: 'ruhi', topic: 't', text: 'o',
      embedding: [], quality_score: 1.0, created_at: now - 1_000_000_000,
    });
    const assembler = new ContextAssembler({
      learningSink: sink,
      brandReader: fakeBrandReader(),
      // Pure quality weighting -> old_high_quality wins
      agentConfig: () => ({
        inputTokenBudget: 200000,
        maxRetrieval: 1,
        lessonInjectionWeights: { similarity: 0, recency: 0, quality_score: 1 },
        toolAllowlist: [],
      }),
      estimateTokens: () => 5,
      similarityFn: () => 0.5,
    });
    const out = await assembler.compose({
      ctx: baseCtx(), state: baseState(), turnInput: [{ type: 'text', text: 'q' }],
    });
    expect(out.lessonsApplied[0].id).toBe('old_high_quality');
  });
});
```

- [ ] **Step 2: Run, expect new failures**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

- [ ] **Step 3: Add ranking to ContextAssembler**

In `packages/agent-api/src/engine/ContextAssembler.js`, modify the constructor to accept `similarityFn` and replace `_readAndRankLessons` with the weighted implementation:

Constructor signature update:

```js
  constructor({ learningSink, brandReader, agentConfig, estimateTokens, similarityFn }) {
    this._learningSink = learningSink;
    this._brandReader = brandReader;
    this._agentConfig = agentConfig;
    this._estimateTokens = estimateTokens;
    this._similarityFn = similarityFn || (() => 0);
  }
```

Replace `_readAndRankLessons`:

```js
  async _readAndRankLessons({ ctx, turnInput, config }) {
    const candidates = await this._learningSink.readLessons(
      { brand: ctx.brandContext.brand, agent: ctx.brandContext.agent },
      Math.max(config.maxRetrieval * 2, 0), // pull a wider pool, then rank
    );
    if (candidates.length === 0) return [];
    const weights = config.lessonInjectionWeights || {
      similarity: 0.5, recency: 0.3, quality_score: 0.2,
    };
    const now = Date.now();
    const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
    const ranked = candidates.map((c) => {
      const sim = this._similarityFn(c, turnInput);
      const ageMs = Math.max(now - (c.created_at || 0), 0);
      const recency = Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
      const quality = c.quality_score || 0;
      const score = weights.similarity * sim
                  + weights.recency * recency
                  + weights.quality_score * quality;
      return { ...c, _score: score };
    });
    ranked.sort((a, b) => b._score - a._score);
    return ranked.slice(0, config.maxRetrieval || 8);
  }
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/contextAssembler.test.js
```

Expected: 9 passing tests (7 from Tasks 9-10 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-api/src/engine/ContextAssembler.js packages/agent-api/test/contextAssembler.test.js
git commit -m "feat(agent-api): weighted lesson ranking with per-agent overrides"
```

---

### Task 12: Pseudo-turn integration test

Compose every primitive: `MemorySession`, `MemoryLearningSink`, `buildBrandContext`, `ToolRegistry` with two fake tools, `StreamingToolExecutor`, `ContextAssembler`. Walk a realistic turn skeleton without invoking a model. This is the demoable proof that Plan 01 hangs together.

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/test/integration/pseudoTurn.test.js`

- [ ] **Step 1: Write the full pseudo-turn test**

Create `packages/agent-api/test/integration/pseudoTurn.test.js`:

```js
const { describe, it, expect } = require('vitest');
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
```

- [ ] **Step 2: Run integration test, expect pass**

```bash
npm test --workspace=@ikawn/agent-api -- test/integration/pseudoTurn.test.js
```

Expected: 2 passing tests.

- [ ] **Step 3: Run the full suite, expect all green**

```bash
npm test --workspace=@ikawn/agent-api
```

Expected: every test file passing. Approximate count: smoke (1) + errors (6) + runState (6) + session (6) + brandContext (7) + defineTool (8) + registry (6) + executor (9) + learningSink (6) + contextAssembler (9) + integration (2) = ~66 tests passing.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-api/test/integration/pseudoTurn.test.js
git commit -m "test(agent-api): pseudo-turn integration exercises every primitive"
```

---

### Task 13: Public exports + README

Wire the public API surface in `src/index.js` and document it in `README.md`.

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/packages/agent-api/src/index.js`
- Create: `/Users/vineet/ikawn-openbrain/packages/agent-api/README.md`

- [ ] **Step 1: Update `src/index.js` exports**

Replace `packages/agent-api/src/index.js` with:

```js
const errors = require('./errors.js');
const runState = require('./engine/runState.js');
const session = require('./engine/session.js');
const brandContext = require('./engine/brandContext.js');
const learningSink = require('./engine/learningSink.js');
const contextAssembler = require('./engine/ContextAssembler.js');
const defineTool = require('./tools/defineTool.js');
const registry = require('./tools/ToolRegistry.js');
const executor = require('./tools/StreamingToolExecutor.js');

module.exports = {
  // errors
  ToolError: errors.ToolError,
  BrandIsolationError: errors.BrandIsolationError,
  BudgetExceededError: errors.BudgetExceededError,
  TOOL_ERROR_KINDS: errors.TOOL_ERROR_KINDS,

  // engine state
  SCHEMA_VERSION: runState.SCHEMA_VERSION,
  RUN_ITEM_TYPES: runState.RUN_ITEM_TYPES,
  createRunState: runState.createRunState,
  appendItem: runState.appendItem,
  serializeRunState: runState.serializeRunState,
  deserializeRunState: runState.deserializeRunState,

  // session
  MemorySession: session.MemorySession,

  // brand context
  buildBrandContext: brandContext.buildBrandContext,
  LEGACY_DEFAULT_BRAND: brandContext.LEGACY_DEFAULT_BRAND,

  // learning
  MemoryLearningSink: learningSink.MemoryLearningSink,

  // context assembly
  ContextAssembler: contextAssembler.ContextAssembler,

  // tools
  defineTool: defineTool.defineTool,
  VALID_MODES: defineTool.VALID_MODES,
  VALID_CONCURRENCY: defineTool.VALID_CONCURRENCY,
  ToolRegistry: registry.ToolRegistry,
  StreamingToolExecutor: executor.StreamingToolExecutor,
};
```

- [ ] **Step 2: Update smoke test to assert exports**

Replace `packages/agent-api/test/smoke.test.js` with:

```js
const { describe, it, expect } = require('vitest');
const pkg = require('../src/index.js');

describe('package exports', () => {
  it('exposes the Plan 01 public surface', () => {
    [
      'ToolError', 'BrandIsolationError', 'BudgetExceededError', 'TOOL_ERROR_KINDS',
      'SCHEMA_VERSION', 'RUN_ITEM_TYPES', 'createRunState', 'appendItem',
      'serializeRunState', 'deserializeRunState',
      'MemorySession',
      'buildBrandContext', 'LEGACY_DEFAULT_BRAND',
      'MemoryLearningSink',
      'ContextAssembler',
      'defineTool', 'VALID_MODES', 'VALID_CONCURRENCY',
      'ToolRegistry', 'StreamingToolExecutor',
    ].forEach((sym) => {
      expect(pkg[sym], `expected export ${sym}`).toBeDefined();
    });
  });
});
```

- [ ] **Step 3: Run smoke test**

```bash
npm test --workspace=@ikawn/agent-api -- test/smoke.test.js
```

Expected: 1 passing test.

- [ ] **Step 4: Create README**

Create `packages/agent-api/README.md`:

```markdown
# @ikawn/agent-api

OpenBrain agent runtime primitives: TurnEngine (Plan 02), ToolRegistry, ContextAssembler, RunState, BrandContext, LearningSink. Built per `docs/superpowers/specs/2026-04-27-openbrain-agent-api-foundation-design-v2.1.md`.

## Status

- **Plan 01 (this commit):** foundational primitives, in-memory implementations only. No engine, no Postgres, no MCP.
- **Plan 02:** TurnEngine class, real Claude provider, three pioneer tools (`vector_search`, `brand_context_read`, `web_search`), `legacyHttp.js` transport behind `OPENBRAIN_BRAIN=v2`, `PgSession` and `PgLearningSink`.
- **Plan 03:** Remaining 9 tools, MCP stdio + HTTP, absorption of `src/mcp/server.js`, Slack bridge cutover.
- **Plan 04:** Async tools (`generate_pptx`, `generate_video`, `manage_automation`), approval flow, compression.
- **Plan 05:** Reflection worker, edit-delta capture, Lucy and Ruhi cutover.

## Layout

```
src/
  errors.js                     ToolError envelope, BrandIsolationError, BudgetExceededError
  engine/
    runState.js                 RunState shape, append, serialize/deserialize
    session.js                  Session interface + MemorySession
    brandContext.js             buildBrandContext + transition fallback
    learningSink.js             LearningSink interface + MemoryLearningSink
    ContextAssembler.js         5-stage composition + budget gating + ranking
  tools/
    defineTool.js               Zod schemas -> tool definition
    ToolRegistry.js             register, lookup, allowlist
    StreamingToolExecutor.js    sync dispatch, isolation, concurrency
test/
  *.test.js                     Per-module unit tests
  integration/pseudoTurn.test.js  End-to-end exercise of every primitive
```

## Hard contracts (locked in Plan 01)

- Turns are model-call boundaries, not message boundaries (Agents SDK contract).
- Permission denial is non-fatal — recorded as a `denial` `RunItem`, the model adapts.
- Brand isolation is asserted *before* every tool execution; mismatch returns `ToolError(kind: 'isolation_violation')` and the engine aborts the turn (Plan 02).
- Async tools are not implemented in Plan 01; dispatcher returns `ToolError(kind: 'runtime')` until Plan 04.

## Running tests

```bash
npm test --workspace=@ikawn/agent-api
```
```

- [ ] **Step 5: Final full suite run**

```bash
npm test --workspace=@ikawn/agent-api
```

Expected: every test still green.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-api/src/index.js packages/agent-api/test/smoke.test.js packages/agent-api/README.md
git commit -m "feat(agent-api): public exports + README for Plan 01 surface"
```

---

## Plan 01 acceptance criteria

The following must all be true at the end of Plan 01:

1. `npm install` from `/Users/vineet/ikawn-openbrain/` succeeds and resolves the new workspace package.
2. `npm test --workspace=@ikawn/agent-api` runs and passes ~66 tests across 11 test files.
3. `packages/agent-api/src/index.js` exports the symbols listed in the smoke test.
4. The pseudo-turn integration test exercises every primitive together without using a real model, real Postgres, or any network call.
5. No file in `/Users/vineet/ikawn-openbrain/src/` has been modified (Plan 01 is purely additive).
6. The existing `npm test` at the OpenBrain root still passes (existing 41 tests untouched).

## Pre-handoff sanity check (perform before declaring Plan 01 done)

- [ ] Run `npm test` at the root to confirm OpenBrain's existing 41 tests still pass.
- [ ] Run `npm run lint` at the root and confirm no new lint errors are introduced.
- [ ] Run `git log --oneline | head -15` and verify each task produced a single, focused commit.
- [ ] Confirm there are no `TODO`, `FIXME`, or `XXX` markers in any file under `packages/agent-api/`.

---

## What this plan deliberately does NOT build (deferred to later plans)

- `TurnEngine` class. Lives in Plan 02. The engine consumes everything Plan 01 builds.
- Async tool support. Stubbed; built in Plan 04.
- Compression. Will be a forked engine in Plan 04.
- Approval suspend/resume. Plan 04.
- MCP transports. Plan 03.
- `PgSession`, `PgLearningSink`, `agent_run_states` migration. Plan 02.
- Real Claude provider. Plan 02.
- Reflection worker. Plan 05.
- Real edit-delta capture wiring in Lucy/Ruhi UI. Plan 05.

If the engineer is tempted to build any of the above during Plan 01, stop. Each is intentionally separated into a later plan with its own design surface and review checkpoint.
