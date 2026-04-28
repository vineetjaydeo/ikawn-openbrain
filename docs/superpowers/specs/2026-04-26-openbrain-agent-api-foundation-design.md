# OpenBrain Agent-API Foundation

**Date:** 2026-04-26
**Status:** Approved (architecture). Implementation plan to follow via `writing-plans` skill.
**Owner:** V
**Scope:** OpenBrain (Lucy + Ruhi Brain). iKawn-v3 integration explicitly later.

---

## 1. Context & Motivation

OpenBrain today is the brain behind Lucy (`ikawn-openbrain` on Fly, ruhi.ikawn.in) and Ruhi Brain (`ruhi-os-brain` on Fly, powering os.ikawn.com/ruhi). One codebase, two deploys, two databases. The runtime is centered on `chat-api.js` with eleven tools, native tool_use, agent platform, mentions, scheduler, executor.

The orchestration layer is finally functional but not robust. The two pains driving this rewrite:

1. **Tool coupling.** Adding or swapping a tool means editing `chat-api.js`. No clean interface, hard to test in isolation, no concurrency model.
2. **State and session chaos.** Context handoff between turns, agents, and tools is held together with hope. There is no single answer to "what does the model know right now?"

The ambition is not a feature shop polish. iKawn OS is positioned as an *agentic orchestration platform for enterprises*, and OpenBrain is its brain. That positioning forces the foundation to expose itself the way the rest of the agent ecosystem talks: MCP, both inbound and outbound, with the loop ownership decided per consumer rather than baked in.

The design draws from two real systems read end to end during research:

- **LCC** (Claude Code internals at `/Users/vineet/ikawn-openbrain/lcc/`): class-based `QueryEngine`, `StreamingToolExecutor` with concurrency tags, pluggable permission model, compression as a forked agent, hard blocking limits before the API call, non-fatal permission denial.
- **OpenAI Agents JS** (at `/Users/vineet/ikawn-openbrain/references/openai-agents-js/`): Zod parameters auto-generating JSON schemas, turn-granular typed item stream, agents-as-tools (handoffs as sugar), per-layer tracing spans, server-managed conversation as an explicit option, approval gates as turn suspension, serializable `RunState` with schema versioning, the explicit contract that turns are model-call boundaries (not message boundaries).

We learn the patterns and re-implement; we do not copy code (per directive at `~/.claude/projects/-Users-vineet/memory/directive_architecture_learning.md`).

---

## 2. Goals & Non-Goals

### Goals

- A single, testable `TurnEngine` that is the *only* place a model is called.
- A clean `ToolRegistry` with Zod-defined parameters, concurrency tags, optional approval gates.
- A `RunState` snapshot that is serializable, version-pinned, and resumable mid-turn.
- A `Session` interface that wraps existing `captureMessage()` so the "all data through captureMessage" rule is preserved.
- Three external surfaces from day one: MCP stdio, MCP HTTP+SSE, legacy HTTP `/v1/turns`.
- Per-environment, per-app cutover via `OPENBRAIN_BRAIN=v2` env flag. Lucy first, Ruhi Brain after validation.
- Drift control: explicit policy that no new feature lands in `chat-api.js v1` once v2 ships in any environment.

### Non-Goals

- Metadata service layer (data-about-data registry). Worth doing later, especially for Leadspark; not foundational.
- iKawn-v3 actually consuming the new MCP surface. Brain becomes ready; integration is a separate effort.
- Replacing `captureMessage()`. The new `Session` adapter wraps it.
- Migrating to a different LLM provider abstraction layer than what already exists in OpenBrain.
- Replacing the existing scheduler / executor / agent platform. The brain refactor is upstream of these; they continue to work.
- Streaming UX changes for end users. Wire format stays compatible.

---

## 3. Architecture

### 3.1 Module layout

All new code lives in a single new module:

```
/Users/vineet/ikawn-openbrain/packages/agent-api/
  src/
    engine/
      TurnEngine.js              # class, async-generator entry
      runState.js                # RunState shape, version constant, (de)serialize
      session.js                 # Session interface + PgSession (captureMessage adapter) + MemorySession
      compressor.js              # forked-agent compression
    tools/
      ToolRegistry.js            # registration, lookup
      defineTool.js              # Zod -> JSON schema, definition factory
      StreamingToolExecutor.js   # concurrency-aware dispatch
      errors.js                  # ToolError envelope
    transports/
      mcpAdapter.js              # shared registry-to-MCP mapping (used by both MCP transports)
      mcpStdio.js                # MCP server over stdio
      mcpHttp.js                 # MCP server over HTTP+SSE
      legacyHttp.js              # POST /v1/turns shim
    tracing/
      spans.js                   # span types, helpers
      exporter.js                # captureMessage-backed exporter
    providers/
      claude.js                  # Claude provider (primary)
      gemini.js                  # Gemini provider (fallback)
      provider.js                # ModelProvider interface
    index.js                     # public exports
  test/
    engine/
    tools/
    transports/
  package.json
  README.md
```

OpenBrain's existing `chat-api.js` stays untouched in v1. The `legacyHttp.js` transport, when v2 is enabled, takes over the `POST /v1/turns` route.

### 3.2 The three internal primitives

**`TurnEngine` (class).** Adapted from LCC's `QueryEngine`. Stateful, one instance per conversation. Single entry: `async *submitMessage(input, ctx)` returns an async iterable of `RunItem` objects. The engine is the *only* thing that calls a model. Per-turn ephemeral state (scratchpad, tool result cache, file cache) is owned here; cross-turn state lives in the `Session`.

**`ToolRegistry` and `StreamingToolExecutor`.** Adapted from LCC's executor and the Agents SDK's tool definition. Tools are registered via `defineTool` (see Section 4). The executor dispatches tools as they arrive in the model stream, runs `safe` ones in parallel, blocks on `exclusive` ones. All tools speak this interface even when in-process; that uniformity is what makes "remote MCP tool" later a config swap, not a rewrite.

**`RunState` and `Session`.** Adapted from Agents SDK. `RunState` is the serializable, version-pinned snapshot of a turn. `Session` is the persistence hook. `PgSession` (default) wraps `captureMessage()` so the existing data path is preserved. `MemorySession` is for tests.

### 3.3 External surfaces

Three surfaces. Each is a thin transport adapter; none own logic.

1. **MCP server, stdio transport** (`transports/mcpStdio.js`). For Claude Code, in-process agents, dev tooling, anything spawning OpenBrain as a subprocess.
2. **MCP server, HTTP+SSE transport** (`transports/mcpHttp.js`). For Ruhi web, Lucy UI, mobile app, future Slack bridge, iKawn-v3 agents. Auth via existing `ik_*` API key pattern. SSE for streaming turn output.
3. **Legacy HTTP `POST /v1/turns`** (`transports/legacyHttp.js`). Same wire format as today's `chat-api.js`. Existing Telegram handler and any unmigrated client keep working unchanged.

Both MCP servers expose the same surface:

- All tools in `ToolRegistry` individually (each becomes an MCP tool the consumer can invoke directly).
- A high-level `send_turn(input, session_id?, agent?)` MCP tool that runs the full `TurnEngine`.

This dual-granularity design is deliberate: thin clients get one tool ("talk to Ruhi"); composing clients (iKawn-v3 agents, Cursor, Claude Code) get the raw tool palette.

---

## 4. Tool Interface

### 4.1 Authoring

Tools are declared with a single factory call. The Zod schema on `parameters` is the source of truth; the JSON schema is derived automatically.

```js
import { z } from 'zod';
import { defineTool } from '@ikawn/agent-api/tools';

export const vectorSearch = defineTool({
  name: 'vector_search',
  description: 'Search the user\'s memory for semantically related items.',
  parameters: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(10),
    user_scope: z.string().optional(),
  }),
  concurrency: 'safe',          // can run in parallel with other safe tools
  needsApproval: false,
  async execute(input, ctx) {
    return await ctx.deps.embeddings.search(input.query, input.limit, ctx.userId);
  },
});
```

`defineTool` handles JSON-schema generation (via `zod-to-json-schema`), name validation, and timeout wrapping. Tools never know about MCP, transports, or the engine; they take parsed input and a context object.

### 4.2 Registration

Tools register at startup against a single registry instance:

```js
import { ToolRegistry } from '@ikawn/agent-api/tools';
import { vectorSearch, brandContext, webSearch /* ... */ } from './tools';

const registry = new ToolRegistry();
registry.register(vectorSearch, brandContext, webSearch /* ... */);
```

There is one production registry. Per-agent tool subsets are expressed by passing an allowlist into `submitMessage`.

### 4.3 Dispatch and concurrency

`StreamingToolExecutor` reads tool_use blocks as they stream in from the model. For each block:

1. Look up the tool by name. Missing tool returns a `ToolError` envelope (does not throw).
2. Validate input against the Zod schema. Validation failure returns a `ToolError` envelope with the parsed Zod issue list.
3. Run the permission check (`canUseTool(tool, input, ctx)`, a dependency-injected function). Denial records a `RunDenialItem` and continues without invoking.
4. Dispatch:
   - `concurrency: 'safe'` tools run in parallel via `Promise.all` against the safe queue.
   - `concurrency: 'exclusive'` tools drain the safe queue first, then run alone.
5. On completion, the result becomes a `RunToolCallOutputItem` appended to `RunState.items` and yielded to the caller.

Permission denial is non-fatal. The model sees the next turn without the result, learns the tool was unavailable, and adapts (LCC pattern).

### 4.4 Approvals

Tools with `needsApproval: true` (or a function that decides per-input) suspend the turn. The executor:

1. Emits a `RunToolApprovalItem`.
2. Persists the partial `RunState`.
3. Returns control to the caller with `status: 'awaiting_approval'`.

The caller's UI surfaces the approval. On accept, `engine.resume(runState, decision)` continues. On reject, the same denial path runs. **Turn counter does not increment on resume.** Turns are model-call boundaries, not approval-decision boundaries (Agents SDK contract).

### 4.5 Error envelope

Tools never throw. Failures are returned as a typed envelope:

```js
{
  ok: false,
  kind: 'validation' | 'timeout' | 'runtime' | 'denied' | 'not_found',
  message: string,
  detail?: unknown
}
```

The envelope is fed back to the model as the tool result so the model can recover. Errors are also recorded in the tool span for observability.

### 4.6 MCP exposure

A small adapter in `transports/mcpStdio.js` and `transports/mcpHttp.js` walks the `ToolRegistry` and maps each tool to an MCP tool definition. Plus the high-level `send_turn` tool. The mapping is mechanical:

- `name` -> MCP tool name
- `description` -> MCP description
- JSON schema -> MCP input schema
- `execute(input, ctx)` -> wrapped MCP handler that constructs a synthetic `ctx` from the MCP session

Consumers (Claude Code, iKawn-v3 agents) see them as native MCP tools and run their own loop with them as primitives.

---

## 5. State Model

### 5.1 RunState shape

```ts
interface RunState {
  schemaVersion: '1.0';        // bump when item types change
  conversationId: string;
  userId: string;
  brand?: string;              // multi-tenant scope (Lucy = single, Ruhi = brand-scoped)
  agent: string;               // active agent name
  items: RunItem[];            // append-only typed log
  currentStep: 'idle' | 'in_turn' | 'awaiting_approval' | 'awaiting_resume';
  pendingApprovals: ApprovalRef[];
  usage: { inputTokens: number; outputTokens: number; cacheReads: number; cacheWrites: number };
  spanContext: SpanContext;
  metadata: Record<string, unknown>;
}

type RunItem =
  | { type: 'user_message'; content: ContentBlock[]; ts: number }
  | { type: 'assistant_message'; content: ContentBlock[]; ts: number }
  | { type: 'tool_call'; toolName: string; toolUseId: string; input: unknown; ts: number }
  | { type: 'tool_result'; toolUseId: string; output: unknown | ToolError; ts: number }
  | { type: 'denial'; toolName: string; reason: string; ts: number }
  | { type: 'approval_pending'; toolName: string; toolUseId: string; ts: number }
  | { type: 'compaction_boundary'; summary: string; ts: number }
  | { type: 'reasoning'; content: string; ts: number };
```

`schemaVersion` starts at `'1.0'`. Bump on any change to `RunItem` shape. Forward-compat reader rejects unknown versions explicitly.

### 5.2 Session interface

```ts
interface Session {
  load(conversationId: string): Promise<RunState | null>;
  save(state: RunState): Promise<void>;
  appendItem(conversationId: string, item: RunItem): Promise<void>;  // streaming write
}
```

Two implementations:

- `PgSession`: reads the existing `captureMessage()` data and projects it into `RunState.items` on `load`. Writes go through `captureMessage()` on `appendItem` so the existing rule (`ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL`) holds, with a new `RunState` snapshot row stored in a `agent_run_states` table for resumption (turn-in-progress, pending approvals).
- `MemorySession`: in-memory map, for tests.

### 5.3 Compression

When the assembled context approaches the model's blocking limit, `TurnEngine` invokes `compressor.compress(state)` *before* the model call (LCC pattern: hard blocking limit, not soft). Compression runs as a *forked* `TurnEngine` instance against a stripped-down tool subset (only `summarize`), produces a summary, replaces the compressed range in `items` with a `compaction_boundary` item, and returns the trimmed state.

The fork uses **Haiku** (per memory: `feedback_use_haiku_for_tasks.md`, "Always Haiku for background/scheduled tasks"). Compression never uses the conversation's primary model.

---

## 6. MCP Surfaces (detail)

### 6.1 Tool exposure

Both `mcpStdio.js` and `mcpHttp.js` use a shared `mcpAdapter.js` that:

1. Iterates `ToolRegistry.list()`.
2. For each tool, registers an MCP tool with name, description, JSON schema.
3. Implements the MCP `call_tool` handler by validating with the original Zod schema, building a synthetic engine context, invoking the tool, returning the result.

### 6.2 `send_turn` high-level tool

```
name: send_turn
description: Send a message to the iKawn brain and receive a full turn response.
parameters:
  input: string | ContentBlock[]
  session_id: string?
  agent: string?         // default 'ruhi'
  brand: string?         // default user's primary brand
```

Implementation: looks up or creates `RunState` via `Session`, instantiates `TurnEngine`, runs `submitMessage`, collects the item stream, returns the final assistant message plus the new `session_id`. Streaming variant available over SSE on the HTTP transport.

### 6.3 Auth

- HTTP transport: requires `Authorization: Bearer ik_*` header. Existing API key check reused.
- stdio transport: no transport-level auth; relies on process boundary. The MCP client process is trusted.

### 6.4 Discovery

The brain registers itself in a known location (env var `MCP_DISCOVERY_URL` if set, else logs the local stdio command on startup) so iKawn-v3 and other consumers can configure connection without hard-coding paths.

---

## 7. Turn Lifecycle

A single turn flows as follows. (This is the *contract* surface area; the implementation follows LCC's stream-and-dispatch pattern.)

```
1. caller -> TurnEngine.submitMessage(input, ctx)
2. TurnEngine:
     a. session.load(conversationId) -> state
     b. assemble context (system prompt + memory + tools allowed for ctx.agent)
     c. compressor.checkAndMaybeCompress(state)
     d. provider.invoke(messages, tools) -> stream
3. for each chunk in stream:
     a. if text: yield assistant_message item
     b. if tool_use: enqueue to StreamingToolExecutor
4. as tools complete:
     a. yield tool_result item (or denial / approval_pending)
     b. if approval_pending: persist state, return { status: 'awaiting_approval' }
5. if any tool ran: loop to step 2.d with new tool_result items
6. when stop_reason != 'tool_use':
     a. session.save(final state)
     b. yield { status: 'end_turn' }
```

Key invariants:

- Step 2.d is the *only* model call in the system.
- Step 4.b suspension is reversible via `engine.resume(state, decision)`. Resume re-enters at step 4.a with the approval applied.
- Step 5 loop count is the *internal* turn count for the engine; the *user-facing* turn counter increments only at step 1, not on resumes.

---

## 8. Tracing & Observability

Per-layer typed spans, exported via a hook so we don't pin to anyone's backend.

Span types:
- `agent` — agent boundary (name, brand, user)
- `generation` — model call (provider, model, inputTokens, outputTokens, cache stats)
- `tool` — single tool invocation (name, input hash, output kind, duration)
- `compaction` — forked compression run
- `approval` — approval gate event

Default exporter writes to a new `agent_spans` Postgres table and to `captureMessage()` for the high-level events (so admin observability per the IKAWN rule "per-user per-agent improvement logs" is preserved). Hook is pluggable; later we can add OTel without touching the engine.

---

## 9. Migration & Cutover

### 9.1 Build order

1. Module skeleton + `RunState` + `Session` + `MemorySession` + tests.
2. `defineTool` + `ToolRegistry` + `StreamingToolExecutor` + tests with fake provider.
3. `TurnEngine` with one provider (Claude) and three migrated tools (`vector_search`, `brand_context`, `web_search`). Tests.
4. `legacyHttp.js` transport. Behind `OPENBRAIN_BRAIN=v2` env flag. Wire-format-identical responses verified against v1.
5. `PgSession` adapter wrapping `captureMessage()`. Tests against staging DB.
6. Migrate remaining 8 tools, one PR per tool, each with parity test against v1.
7. `mcpStdio.js` + `mcpHttp.js` transports. End-to-end test from a synthetic MCP client.
8. `compressor.js` (forked Haiku). Tests against synthetic long conversations.
9. Approval flow end-to-end. Tests for suspend, persist, resume.
10. Lucy cutover: set `OPENBRAIN_BRAIN=v2` on Fly app `ikawn-openbrain`. Soak for one week.
11. Ruhi Brain cutover: set `OPENBRAIN_BRAIN=v2` on Fly app `ruhi-os-brain`. Requires V approval per directive at `~/.claude/projects/-Users-vineet/memory/feedback_lucy_first_ruhi_safe.md`.

### 9.2 Drift control

Mandatory rules during the migration window:

- **No new feature lands in `chat-api.js v1`** once v2 is enabled in any environment. Bug fixes only, and each must also land in v2.
- **Every tool migration is a single PR** that includes: defineTool conversion, parity test, removal of the v1 implementation only after v2 is enabled in Lucy.
- **The wire format is locked.** Any change to response shape requires a version bump (`/v2/turns`) and is out of scope for this phase.
- **Weekly diff audit** comparing v1 and v2 directories until v1 is removed.

### 9.3 Rollback

One env var per app: `OPENBRAIN_BRAIN=v1`. Roll back instantly. State written by v2 (the new `agent_run_states` table) is additive; v1 ignores it. Conversations started under v2 continue under v1 with degraded resumption (no in-flight approval recovery), but functional.

### 9.4 Deletion

Once Ruhi Brain has run on v2 for two weeks without regression, `chat-api.js`, the v1 tool handlers, and the legacy data path are deleted in one PR. No backwards-compat shims left behind (per directive).

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wire-format drift between v1 and v2 breaks a client | Medium | High | Parity test per tool; locked response shape; Telegram handler is unmigrated and uses legacy HTTP throughout |
| Streaming-vs-batch behavior differs subtly | Medium | Medium | Property-based test that the same input produces equivalent item streams under both v1 and v2 |
| `PgSession` performance regresses | Low | Medium | Bench against current `captureMessage` path before Lucy cutover; cache `RunState` reads in process for active conversations |
| Compression eats tokens on long conversations | Medium | Low | Haiku-only enforcement; budget cap per conversation per day; observability span on every compaction |
| MCP HTTP transport leaks per-tenant data | Low | Critical | Reuse the existing per-tenant scoping logic from `chat-api.js` via the shared context builder; integration test asserting cross-tenant isolation |
| Drift between v1 and v2 because both stay alive | High | Medium | Hard rule (Section 9.2). Weekly audit. Delete v1 within 4 weeks of Ruhi cutover |
| Approval flow corruption on resume | Low | High | `RunState.schemaVersion` strict validation; reject resume if state is from a different schema version |

---

## 11. Out of Scope

- **Metadata service layer.** Worth doing; not foundational. Defer.
- **iKawn-v3 actually consuming the MCP surface.** The brain becomes ready; integration is a separate phase planned over the same MCP that this design exposes.
- **Slack bridge.** Will plug in over MCP HTTP later. Not part of this phase.
- **Mobile app cutover from any direct-to-chat-api path.** Mobile app continues using HTTP `/v1/turns` until a separate effort migrates it to MCP HTTP.
- **Replacing the model provider abstraction.** Existing OpenBrain provider layer is reused.
- **New scheduler / executor work.** They sit upstream of the brain and continue to function.

---

## 12. Open Questions

These need an answer before the implementation plan is final:

1. **`agent_run_states` table shape.** Is a JSONB blob acceptable, or do we want columns for hot fields (`current_step`, `pending_approval_count`)? Recommendation: JSONB blob plus a small set of indexed columns.
2. **Does `send_turn` over MCP support streaming on stdio?** Recommendation: yes for HTTP+SSE, no for stdio (collect-and-return). Confirm.
3. **Per-agent tool allowlists: encoded where?** Recommendation: in agent config rows in Postgres, loaded by `ctx.agent` lookup at engine construction. Confirm.
4. **Approval UI on Lucy and Ruhi web: existing or new?** Lucy currently has none. Recommendation: add a minimal approval surface to Lucy as part of step 9 of the migration.
5. **Auth scope for MCP HTTP `send_turn`: per-user or per-org?** Recommendation: per-user, since `RunState.userId` is required.

---

## 13. References

### Codebases read

- LCC: `/Users/vineet/ikawn-openbrain/lcc/`
  - `src/QueryEngine.ts:209` (submitMessage entry)
  - `src/query.ts:554` (tool execution loop)
  - `src/services/tools/StreamingToolExecutor.ts:76` (tool queueing)
  - `src/services/compact/compact.ts` (forked-agent compression)
  - `src/Tool.ts:15-21` (tool schema interface)
- OpenAI Agents JS: `/Users/vineet/ikawn-openbrain/references/openai-agents-js/`
  - `packages/agents-core/src/run.ts:435` (Runner.run entry)
  - `packages/agents-core/src/runner/turnResolution.ts` (next-step decision)
  - `packages/agents-core/src/tool.ts` (tool definition + Zod schema)
  - `packages/agents-core/src/runState.ts` (serializable state, schema versioning)
  - `packages/agents-core/src/handoff.ts` (agents-as-tools)

### Standing directives consulted

- `~/.claude/projects/-Users-vineet/memory/feedback_lucy_first_ruhi_safe.md` (Lucy first, Ruhi requires V approval)
- `~/.claude/projects/-Users-vineet/memory/directive_architecture_learning.md` (learn patterns, do not copy)
- `~/.claude/projects/-Users-vineet/memory/feedback_use_haiku_for_tasks.md` (Haiku for background tasks)
- `~/.claude/projects/-Users-vineet/memory/feedback_claude_primary.md` (Claude primary, OpenAI failsafe only)
- `~/.claude/projects/-Users-vineet/memory/feedback_no_openai.md` (zero OpenAI in production runtime)
- `~/.claude/projects/-Users-vineet/memory/feedback_predeploy_checklist.md` (pre-deploy gates)
- `~/.claude/projects/-Users-vineet/memory/feedback_deploy_cwd.md` (correct CWD for Fly deploys)
- iKawn project rules in CLAUDE.md (monorepo, Postgres-only, no Redis, captureMessage for all writes)

### Related prior specs

- `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-03-17-ruhi-agent-platform-design.md`
- `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-04-17-lucy-react-frontend-design.md`

---

## Appendix A: What we are *not* changing in OpenBrain

- The provider layer (`providers/`) and its Claude / Gemini routing.
- `captureMessage()` and the existing event-sourced data model.
- Brand API, reports, scheduler, executor, mentions, Mission Control.
- Embeddings (`gemini-embedding-001`) and the chat-tier filtering rules.
- Telegram handler integration (it continues to call legacy HTTP `/v1/turns`, which is now served by the v2 engine via the legacy transport).
- Authentication (`ik_*` API keys).
- Fly deployment topology (`ikawn-openbrain` and `ruhi-os-brain` apps).

The brain refactor is upstream of every other system. Done well, nothing else needs to know.
