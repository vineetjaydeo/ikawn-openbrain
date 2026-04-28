# OpenBrain Agent-API Foundation (v2)

**Date:** 2026-04-27
**Status:** Approved (architecture). Implementation plan to follow.
**Owner:** V
**Scope:** OpenBrain (Lucy + Ruhi Brain). iKawn-v3 integration explicitly later.
**Supersedes:** `2026-04-26-openbrain-agent-api-foundation-design.md`

---

## Changes from v1

This revision lands six foundational changes:

1. **Learning loop is first-class.** Edit deltas, tool outcomes, approval signals, and per-brand lessons are typed `RunItem` variants persisted via a new `LearningSink` primitive. Lessons are read back into future turns by the `ContextAssembler`. Without this, the architecture would be a vanilla agent platform with learning bolted on later.
2. **`ContextAssembler` is a named primitive** alongside `TurnEngine` and `ToolRegistry`. v1 hand-waved context assembly as one bullet in step 2.b. That is the path the most recent API cost audit identified as the primary burn driver, so it gets its own contract: budgeting, cache markers, retrieval quotas, lesson injection, brand scoping.
3. **`BrandContext` is threaded through every `ctx`** via a single context constructor that proves brand scope before any tool runs (Section 3.4). Cross-tenant isolation moves from "reuse existing scoping" to a load-bearing architectural component.
4. **MCP exposure inverts.** `send_turn` is the default surface for both stdio and HTTP+SSE. Tool-level access is opt-in per consumer via allowlist. Smaller attack surface, simpler auth, fewer ways to leak tenant data across the MCP boundary.
5. **MCP is ready day one.** Both transports ship in v2 with at least one production consumer (Slack bridge) migrated during the cutover window so the surface gets soaked, not stockpiled.
6. **Tool reliability contract** (Section 4.7). Every tool declares timeout, retry policy, output schema, and execution mode (sync vs async). Long-running tools (PPT generation, video render, third-party connector calls) run as async jobs the engine resumes against. Output validation, idempotency, and circuit breakers around external connectors are part of the registration contract, not best-effort code. Appendix B walks PPT generation end to end as the canonical async tool.

---

## 1. Context & Motivation

OpenBrain today is the brain behind Lucy (`ikawn-openbrain` on Fly, ruhi.ikawn.in) and Ruhi Brain (`ruhi-os-brain` on Fly, powering os.ikawn.com/ruhi). One codebase, two deploys, two databases. The runtime is centered on `chat-api.js` with eleven tools, native tool_use, agent platform, mentions, scheduler, executor.

The orchestration layer is functional but not robust. Four pains drive this rewrite:

1. **Tool coupling.** Adding or swapping a tool means editing `chat-api.js`. No clean interface, hard to test in isolation, no concurrency model.
2. **State and session chaos.** Context handoff between turns, agents, and tools is held together with hope. There is no single answer to "what does the model know right now?"
3. **Context burn.** The most recent API cost audit pinned the primary burn on bloated context payloads, no prompt caching, ungated retrieval. Without an explicit context assembly primitive with a budget, the rewrite ships the same problem in cleaner clothing.
4. **Tool fragility.** PPT generation, video render, and third-party connector calls fail in long, partially-observed ways. The current path has no idempotency, no async-job model, no output validation, no circuit breakers. A clean tool contract has to fix this from the registration interface up.

iKawn OS is positioned as an *agentic orchestration platform for enterprises*, and OpenBrain is its brain. That positioning forces three things into the foundation:

- **MCP, both inbound and outbound**, with the loop ownership decided per consumer rather than baked in.
- **Cross-tenant isolation as architecture**, not as a TODO. Six critical data leakage risks are open and blocking.
- **A learning loop as a first-class concept**, because the moat against well-funded agent platforms is operational data captured per-brand and patterns distilled cross-brand. If learning is bolted on later, the foundation absorbs the patches and gets harder to reason about.

The design draws from two real systems read end to end during research:

- **LCC** (Claude Code internals at `/Users/vineet/ikawn-openbrain/lcc/`): class-based `QueryEngine`, `StreamingToolExecutor` with concurrency tags, pluggable permission model, compression as a forked agent, hard blocking limits before the API call, non-fatal permission denial.
- **OpenAI Agents JS** (at `/Users/vineet/ikawn-openbrain/references/openai-agents-js/`): Zod parameters auto-generating JSON schemas, turn-granular typed item stream, agents-as-tools (handoffs as sugar), per-layer tracing spans, server-managed conversation as an explicit option, approval gates as turn suspension, serializable `RunState` with schema versioning, the explicit contract that turns are model-call boundaries (not message boundaries).

We learn the patterns and re-implement; we do not copy code (per directive at `~/.claude/projects/-Users-vineet/memory/directive_architecture_learning.md`).

---

## 2. Goals & Non-Goals

### Goals

- A single, testable `TurnEngine` that is the *only* place a model is called.
- A `ContextAssembler` primitive that owns context budgeting, prompt caching markers, retrieval quotas, lesson injection, and brand scoping (Section 3.5).
- A `BrandContext` threaded through every `ctx`, with brand scope proven before any tool runs (Section 3.4).
- A `LearningSink` primitive that captures edit deltas, tool outcomes, approvals, and per-brand lessons, and feeds them back through the `ContextAssembler` (Section 3.6).
- A clean `ToolRegistry` with Zod-defined input *and* output schemas, concurrency tags, optional approval gates, declared timeouts and retry policies, sync and async execution modes (Section 4).
- A `RunState` snapshot that is serializable, version-pinned, and resumable mid-turn (across approval gates *and* async jobs).
- A `Session` interface that wraps existing `captureMessage()` so the "all data through captureMessage" rule is preserved.
- Three external surfaces from day one: MCP stdio, MCP HTTP+SSE, legacy HTTP `/v1/turns`. `send_turn` is the default exposure on both MCP transports; tool-level access is opt-in per consumer via allowlist.
- At least one production consumer migrated to MCP HTTP within this phase (Slack bridge) so the surface is soaked, not stockpiled.
- Per-environment, per-app cutover via `OPENBRAIN_BRAIN=v2` env flag. Lucy first, Ruhi Brain after validation.
- Drift control: explicit policy that no new feature lands in `chat-api.js v1` once v2 ships in any environment.

### Non-Goals

- Metadata service layer (data-about-data registry). Worth doing later, especially for Leadspark; not foundational.
- iKawn-v3 fully consuming the new MCP surface as its primary path. Brain becomes ready and one consumer (Slack bridge) validates the surface; broader iKawn-v3 integration is a separate effort.
- Replacing `captureMessage()`. The new `Session` adapter wraps it.
- Migrating to a different LLM provider abstraction layer than what already exists in OpenBrain.
- Replacing the existing scheduler / executor / agent platform. The brain refactor is upstream of these; they continue to work. The `reflectionWorker` (Section 3.6) runs *on* the existing scheduler.
- Streaming UX changes for end users. Wire format stays compatible.

---

## 3. Architecture

### 3.1 Module layout

```
/Users/vineet/ikawn-openbrain/packages/agent-api/
  src/
    engine/
      TurnEngine.js              # class, async-generator entry
      ContextAssembler.js        # budgeting, caching, retrieval, lesson injection
      runState.js                # RunState shape, version constant, (de)serialize
      session.js                 # Session interface + PgSession + MemorySession
      learningSink.js            # LearningSink + PgLearningSink + MemoryLearningSink
      brandContext.js            # BrandContext type + ctx constructor + isolation guard
      compressor.js              # forked-agent compression
    tools/
      ToolRegistry.js
      defineTool.js              # Zod input + output schemas, mode, retry, timeout
      StreamingToolExecutor.js
      asyncJobExecutor.js        # long-running tool support
      circuitBreaker.js          # for connector tools
      errors.js
    transports/
      mcpAdapter.js              # registry-to-MCP mapping, allowlist enforcement
      mcpStdio.js
      mcpHttp.js
      legacyHttp.js
    tracing/
      spans.js
      exporter.js
    providers/
      claude.js
      gemini.js
      provider.js
    learning/
      reflectionWorker.js        # scheduled lesson distillation
    index.js
  test/
    engine/
    tools/
    transports/
    learning/
  package.json
  README.md
```

OpenBrain's existing `chat-api.js` stays untouched in v1. The `legacyHttp.js` transport, when v2 is enabled, takes over the `POST /v1/turns` route.

### 3.2 The internal primitives

Five primitives. Every other module is a transport, exporter, or provider that wraps one of these.

**`TurnEngine` (class).** Adapted from LCC's `QueryEngine`. Stateful, one instance per conversation. Single entry: `async *submitMessage(input, ctx)` returns an async iterable of `RunItem` objects. The engine is the *only* thing that calls a model. Per-turn ephemeral state (scratchpad, tool result cache, file cache) is owned here; cross-turn state lives in the `Session`.

**`ContextAssembler`.** Owns everything that goes into the model. The engine never assembles context inline. The assembler is invoked once per model call (Section 7 step 2.c) and produces a deterministic, observable, budgeted context package. It is the single place prompt caching markers, retrieval quotas, brand context, and lessons from the `LearningSink` get composed. Detail in Section 3.5.

**`ToolRegistry` and `StreamingToolExecutor`.** Adapted from LCC's executor and the Agents SDK's tool definition. Tools are registered via `defineTool` (Section 4.1) with input schema, output schema, timeout, retry policy, and execution mode (sync or async). The executor dispatches sync tools as they arrive in the model stream; async tools are dispatched to `asyncJobExecutor`, which suspends the turn and resumes when the job completes. All tools speak this interface even when in-process; that uniformity is what makes "remote MCP tool" later a config swap, not a rewrite.

**`RunState` and `Session`.** Adapted from Agents SDK. `RunState` is the serializable, version-pinned snapshot of a turn. `Session` is the persistence hook. `PgSession` (default) wraps `captureMessage()`. `MemorySession` is for tests.

**`LearningSink`.** New primitive. Captures the four signal types the system learns from (edit deltas, tool outcomes, approvals, distilled lessons), exposes a typed read interface for the `ContextAssembler`, and provides a write interface for `TurnEngine`, the approval flow, and the scheduled `reflectionWorker`. Detail in Section 3.6.

### 3.3 External surfaces

Three surfaces. Each is a thin transport adapter; none own logic.

1. **MCP server, stdio transport** (`transports/mcpStdio.js`). For Claude Code, in-process agents, dev tooling, anything spawning OpenBrain as a subprocess.
2. **MCP server, HTTP+SSE transport** (`transports/mcpHttp.js`). For Slack bridge (day one), Ruhi web, Lucy UI, mobile app, iKawn-v3 agents (later). Auth via existing `ik_*` API key pattern, extended to carry agent scope as a claim. SSE for streaming turn output.
3. **Legacy HTTP `POST /v1/turns`** (`transports/legacyHttp.js`). Same wire format as today's `chat-api.js`. Existing Telegram handler and any unmigrated client keep working unchanged.

Both MCP servers expose the same default surface:

- `send_turn(input, session_id?, agent?, brand?)` as the high-level tool. Default exposure for every authenticated consumer.
- Individual tools from the `ToolRegistry` are exposed *only* when the consumer's API key is on the per-tool allowlist for that tool. By default, an `ik_*` key gets `send_turn` and nothing else.

This is a deliberate tightening from v1's "everything individually exposed by default." Per-tool access is for composing clients (specific iKawn-v3 agents, internal dev tools, Cursor) that have a registered need; thin clients get exactly one tool to call. Smaller surface, simpler auth, fewer paths to a tenant data leak.

### 3.4 BrandContext and tenant isolation

`BrandContext` is the load-bearing object that proves brand scope on every operation. Constructed once per inbound request, threaded through every `ctx`, validated at three checkpoints.

#### 3.4.1 Shape

```ts
interface BrandContext {
  brand: string;             // canonical brand id, never user-supplied raw
  brandRevision: number;     // monotonic, bumped when brand scope changes
  userId: string;            // owner of the request
  agent: string;             // active agent
  authScope: 'user' | 'agent' | 'system';
  permissions: ReadonlySet<string>;   // resolved from agent config + user role
  isolationToken: string;    // opaque, derived from brand + revision; used by storage layer
}
```

#### 3.4.2 Construction

`buildBrandContext(authPrincipal, requestedBrand, agent)` is the single constructor. It runs four checks in order:

1. The auth principal (from `ik_*` key or session) is verified against the user table.
2. The requested brand is verified to belong to the user (membership check, no exceptions).
3. The agent is verified to be allowed for the user/brand pair.
4. The resolved permissions are intersected with the agent's allowlist.

If any check fails, the constructor throws `BrandIsolationError`, which is caught at the transport layer and returns a 403 (HTTP) or MCP error. The `TurnEngine` never sees an unbuilt `BrandContext`.

#### 3.4.3 Threading

Every `ctx` object passed to a tool, the `ContextAssembler`, the `Session`, the `LearningSink`, the compressor, and the provider includes the `BrandContext`. The three checkpoints:

- **Tool execution.** Before `execute(input, ctx)` runs, `StreamingToolExecutor` asserts `ctx.brandContext.brand === state.brand`. Mismatch returns `ToolError(kind: 'isolation_violation')` and aborts the turn.
- **Storage operations.** `PgSession.appendItem` and `PgLearningSink.write` both require the `isolationToken` and use it as a row-level filter. A write that does not carry a matching token is rejected at the adapter, not at the database. (Database constraints are a backstop, not the primary guard.)
- **Retrieval.** The `ContextAssembler`'s vector search and lesson lookup pass the `isolationToken` as a non-optional filter argument. Cross-brand retrieval is impossible by construction; there is no path that constructs a vector query without it.

#### 3.4.4 Cross-brand patterns

Cross-brand intelligence (lessons distilled across the platform) is the *only* place data leaves a brand boundary. The `reflectionWorker` (Section 3.6) reads brand-scoped raw signals, distills them through Haiku into pattern descriptions stripped of brand-identifying detail, and writes patterns to a separate `cross_brand_patterns` table that has no brand scoping. The boundary is one-way: raw data never crosses, distilled patterns do, and the distillation step is the audit point.

### 3.5 ContextAssembler

The single place context is composed for a model call. The engine calls it once per turn iteration (Section 7).

#### 3.5.1 Contract

```ts
interface ContextAssemblerInput {
  ctx: TurnContext;          // includes BrandContext
  state: RunState;           // current conversation state
  turnInput: ContentBlock[]; // the new user input for this turn
}

interface AssembledContext {
  systemPrompt: string;
  messages: ProviderMessage[];
  tools: ProviderToolDef[];
  cacheBreakpoints: CacheBreakpoint[];
  budget: { inputTokenBudget: number; estimatedInputTokens: number; cacheableTokens: number };
  lessonsApplied: LessonRef[];
}
```

#### 3.5.2 Composition order

The assembler runs five stages, each with a defined token budget contribution:

1. **System prompt** (fixed). Agent system prompt + iKawn standing rules. Cached as a single block.
2. **Brand context** (cached, brand-scoped). Brand voice, guidelines, recent decisions. Cached at the `brandRevision` boundary; invalidates on brand update. Pulled from `BrandContext.brand` via a brand-scoped read.
3. **Lessons** (cached per `brandRevision`). Top N relevant lessons from `LearningSink` for this `(brand, agent)` pair. Selected by a small embedding query against the turn input; ranked by relevance and recency. Capped at a configured per-turn token budget.
4. **Conversation history** (partial cache). All `RunState.items` since the last `compaction_boundary`, projected to provider message format. Cache breakpoint at the most recent `compaction_boundary` so prefix is reused across turns.
5. **Turn input** (uncached). The new user message. Always at the tail.

#### 3.5.3 Budgeting and gating

Each agent declares an `inputTokenBudget` in its config. The assembler estimates input tokens after composition; if the estimate exceeds the budget, the assembler:

1. Drops lowest-relevance lessons until under budget, or
2. Triggers compression (Section 5.4) if history is the dominant cost, or
3. Returns a `BudgetExceededError` if neither is sufficient.

The error surfaces to the engine, which surfaces it as a controlled assistant message ("the context for this turn is too large to send safely; some background was dropped") rather than failing silently or hitting the provider's hard limit.

Retrieval quotas: vector search is capped at `maxRetrieval` items per turn (default 8). Web search is gated by an intent classifier on the turn input (existing OpenBrain heuristic); if the turn does not need search, no search call is made. Both gates were identified in the previous API cost audit and are enforced here at the assembler, not inside individual tools.

#### 3.5.4 Observability

Every `AssembledContext` emits a `context.assembled` span with: stage-level token counts, cache breakpoint positions, lessons applied (by id), retrieval call count, brand revision used. This is the primary signal for catching context drift and cost regressions.

### 3.6 Learning loop

Four signal types, one sink, one feedback path through the assembler.

#### 3.6.1 Signal types

1. **Edit delta.** When a human edits an assistant-generated message before it is sent or published, the system records `(original, edited, dimensions)`. Dimensions are tagged: `tone`, `factual`, `brand_voice`, `format`, `other`. Captured at the surface where the edit happens (Lucy UI, Ruhi UI, mobile app); written to `LearningSink` via the `Session` boundary.
2. **Tool outcome.** Implicit signal from whether the conversation continued productively after a tool result. Captured by the engine: a tool result followed by an assistant message that does not invoke a corrective tool (or by an end_turn) is a positive signal; a tool result followed by an immediate retry or a corrective tool call is negative.
3. **Approval / denial.** The approval flow (Section 4.4) records explicit human decisions on tool invocations. `approve` and `reject` are both signals.
4. **Distilled lesson.** Output of the `reflectionWorker`. Pattern-level, brand-scoped (or cross-brand stripped), produced by Haiku reading recent raw signals.

#### 3.6.2 New RunItem types

Two new variants are added to `RunItem` for in-turn capture:

```ts
| { type: 'edit_delta'; original: ContentBlock[]; edited: ContentBlock[]; dimensions: string[]; lateSignal?: boolean; ts: number }
| { type: 'learn_signal'; kind: 'tool_outcome' | 'approval' | 'denial'; toolUseId?: string; detail: unknown; ts: number }
```

Edit deltas are typically appended *after* the turn completes, when the human edits the published output; the `Session` allows out-of-band item append against a closed turn for this case (the `lateSignal: true` flag).

#### 3.6.3 LearningSink interface

```ts
interface LearningSink {
  recordEditDelta(brand: string, turnId: string, delta: EditDelta): Promise<void>;
  recordToolOutcome(brand: string, turnId: string, signal: ToolOutcomeSignal): Promise<void>;
  recordApproval(brand: string, turnId: string, decision: ApprovalDecision): Promise<void>;
  writeLesson(scope: { brand?: string; crossBrand?: boolean }, lesson: Lesson): Promise<void>;
  readLessons(scope: { brand: string; agent: string; topic?: string }, limit: number): Promise<Lesson[]>;
}
```

`PgLearningSink` writes to two tables: `learning_signals` (raw, brand-scoped, append-only) and `lessons` (distilled, with optional cross-brand row). `MemoryLearningSink` is for tests.

`recordEditDelta` is the most important capture point; it is what turns Ruhi from a generation tool into a learning system. Every iKawn UI surface that allows editing AI-generated content must call into this hook (Section 12 question 6 enumerates the v2 cutover scope).

#### 3.6.4 Reflection worker

Scheduled job (every 6 hours per brand by default, configurable). For each brand:

1. Reads `learning_signals` since the last reflection cursor.
2. Buckets signals by dimension and tool.
3. For each bucket with enough signal, calls Haiku with a "what pattern do you see?" prompt and a strict output schema.
4. Writes resulting `Lesson` rows via `LearningSink.writeLesson`.
5. For patterns that meet a cross-brand promotion threshold (configurable, default: occurs in 5+ brands, no brand-identifying tokens after a Haiku-side stripping pass), writes a cross-brand row.

Runs on the existing OpenBrain scheduler. Uses Haiku exclusively (per directive `feedback_use_haiku_for_tasks.md`).

#### 3.6.5 Feedback path

`ContextAssembler.compose` step 3 calls `LearningSink.readLessons({ brand: ctx.brand, agent: ctx.agent })` and includes the top N lessons in the prompt. This closes the loop: a human correction at turn T is captured as a signal, distilled by the next reflection cycle, and read back into context at turn T+k. The lag is intentional; raw deltas are not fed back at turn T+1 because that would amount to in-context fine-tuning without distillation.

---

## 4. Tool Interface

### 4.1 Authoring

Tools are declared with a single factory call. Zod schemas on input *and* output are the source of truth; JSON schemas are derived automatically.

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
  output: z.object({
    items: z.array(z.object({ id: z.string(), score: z.number(), text: z.string() })),
    truncated: z.boolean(),
  }),
  mode: 'sync',                  // 'sync' | 'async'
  concurrency: 'safe',           // 'safe' | 'exclusive'
  needsApproval: false,
  timeoutMs: 5000,
  retry: { maxAttempts: 0 },
  async execute(input, ctx) {
    return await ctx.deps.embeddings.search(
      input.query, input.limit, ctx.brandContext.isolationToken
    );
  },
});
```

`defineTool` handles JSON-schema generation (via `zod-to-json-schema`), name validation, output validation wrapping, timeout enforcement, retry handling, and registration of the tool's reliability profile. Tools never know about MCP, transports, or the engine; they take parsed input and a context object.

### 4.2 Registration

```js
import { ToolRegistry } from '@ikawn/agent-api/tools';
import { vectorSearch, brandContextRead, webSearch /* ... */ } from './tools';

const registry = new ToolRegistry();
registry.register(vectorSearch, brandContextRead, webSearch /* ... */);
```

There is one production registry. Per-agent tool subsets are expressed by passing an allowlist into `submitMessage`. Per-MCP-consumer tool subsets are enforced separately (Section 4.6).

### 4.3 Dispatch and concurrency

`StreamingToolExecutor` reads tool_use blocks as they stream in from the model. For each block:

1. Look up the tool by name. Missing tool returns a `ToolError` envelope (does not throw).
2. Validate input against the input Zod schema. Validation failure returns a `ToolError` envelope with the parsed Zod issue list.
3. Run the permission check (`canUseTool(tool, input, ctx)`, a dependency-injected function). Denial records a `denial` `RunItem` and continues without invoking.
4. **Assert brand isolation.** `ctx.brandContext.brand === state.brand`. Mismatch returns `ToolError(kind: 'isolation_violation')` and aborts the turn.
5. Dispatch by mode:
   - `mode: 'sync'` and `concurrency: 'safe'`: run in parallel via `Promise.all` against the safe queue.
   - `mode: 'sync'` and `concurrency: 'exclusive'`: drain the safe queue first, then run alone.
   - `mode: 'async'`: enqueue to `asyncJobExecutor` (Section 4.7), suspend the turn, return `{ status: 'awaiting_job' }`. The engine resumes when the job completes.
6. On completion, validate the result against the output schema. Validation failure returns `ToolError(kind: 'output_invalid')`. Otherwise the result becomes a `tool_result` `RunItem` appended to `RunState.items` and yielded to the caller.

Permission denial is non-fatal. The model sees the next turn without the result, learns the tool was unavailable, and adapts (LCC pattern).

### 4.4 Approvals

Tools with `needsApproval: true` (or a function that decides per-input) suspend the turn. The executor:

1. Emits an `approval_pending` `RunItem`.
2. Persists the partial `RunState`.
3. Returns control to the caller with `status: 'awaiting_approval'`.

The caller's UI surfaces the approval. On accept, `engine.resume(state, decision)` continues. On reject, the same denial path runs. **Turn counter does not increment on resume.** Turns are model-call boundaries, not approval-decision boundaries (Agents SDK contract).

Both approve and reject decisions are recorded as `learn_signal` items via the `LearningSink` so the model and the reflection worker both see them.

### 4.5 Error envelope

Tools never throw. Failures are returned as a typed envelope:

```js
{
  ok: false,
  kind: 'validation' | 'output_invalid' | 'timeout' | 'runtime' | 'denied'
      | 'not_found' | 'isolation_violation' | 'connector_unavailable' | 'async_timeout',
  message: string,
  detail?: unknown
}
```

The envelope is fed back to the model as the tool result so the model can recover. Errors are also recorded in the tool span for observability.

### 4.6 MCP exposure

`send_turn` is the default MCP tool exposed by both stdio and HTTP transports. Every authenticated MCP consumer can call it; this is the standard "talk to the brain" entry point.

Tool-level exposure is opt-in. An admin-only configuration (`agent_mcp_allowlists` table) maps `(api_key_id, tool_name)` pairs. A consumer's MCP `list_tools` response includes `send_turn` plus only the tools their key is allowlisted for. Same for `call_tool`: invoking a non-allowlisted tool returns an MCP error before the registry is touched.

Default consumer profile: `send_turn` only. Composing consumers (specific iKawn-v3 agents, dev tools) are explicitly granted per-tool access via the allowlist.

The mapping for any exposed tool is mechanical:

- `name` to MCP tool name
- `description` to MCP description
- JSON schema (input) to MCP input schema
- `execute(input, ctx)` to a wrapped MCP handler that constructs a synthetic `ctx` from the MCP session, builds a `BrandContext`, and runs through the same dispatch path as the engine.

### 4.7 Reliability contract

PPT generation, video render, third-party connector calls, and similar long-running operations are first-class concerns, not best-effort code. Every tool registration declares its reliability profile, and the executor enforces it.

#### 4.7.1 Declared properties

Every `defineTool` call requires:

- `mode: 'sync' | 'async'`. Sync tools resolve within `timeoutMs`. Async tools return immediately with a job reference and resolve via the resume path.
- `timeoutMs: number`. Hard kill for sync tools; soft progress check interval for async tools.
- `retry: { maxAttempts, retryOn?, backoff? }`. Default: no retry. `retryOn` accepts a predicate over `ToolError`; only transient errors should retry. Side-effect tools (publish, charge, send) are not allowed `maxAttempts > 0` unless they also declare `idempotencyKey`.
- `idempotencyKey?: (input, ctx) => string`. Required for any tool with `maxAttempts > 0` that has external side effects. The runner passes this key to the tool implementation; the tool is responsible for using it (e.g., as a header to a connector API).
- `output: ZodSchema`. Validated on every result. Output validation failure is a `ToolError`, never silent corruption.

#### 4.7.2 Async execution

`asyncJobExecutor` manages long-running tools. Lifecycle:

1. Tool is invoked. Implementation returns `{ jobId, estimatedMs }` instead of a result.
2. Executor records a `tool_async_pending` `RunItem` with `jobId`. The turn is suspended (similar to approval flow), `RunState` is persisted, and the transport returns `{ status: 'awaiting_job' }`.
3. Tool implementation runs the actual work (PPT generation, video render, connector call) on the existing executor or as a Fly machine task. On completion or failure, it writes the result to the job store keyed by `jobId`.
4. A poller (or webhook for connectors that support it) calls `engine.resumeJob(state, jobId)`. The executor reads the result, validates against the output schema, and resumes the turn at the equivalent of step 4.a in Section 7.

PPT generation is the canonical example: scene-bible to PPT can take 60 to 90 seconds, well beyond a sync timeout, and the user expects a progress signal. With async mode, the turn yields a `tool_async_pending` item the UI can render as a spinner with the `estimatedMs`, and resumes when the file is ready. Full walkthrough in Appendix B.

#### 4.7.3 Connector tools and circuit breaking

Tools that call external services (third-party MCP servers, REST APIs, web search) wrap their network call in a circuit breaker (`tools/circuitBreaker.js`). Defaults:

- Failure threshold: 5 failures in 60 seconds opens the circuit.
- Open duration: 30 seconds before half-open probe.
- Half-open: one probe call; success closes, failure reopens.

When a tool's circuit is open, invocation returns `ToolError(kind: 'connector_unavailable')` immediately. The model sees the error and adapts (the entire point of the non-fatal envelope pattern). Circuit state per tool is exported as a span field for observability.

#### 4.7.4 Output validation as a first-class concern

Every tool's output goes through Zod validation before reaching the model. This catches:

- Connector responses with unexpected shapes (third-party API change).
- Tool implementation bugs returning partial data.
- Async job results that completed but produced invalid output.

Validation failure returns `ToolError(kind: 'output_invalid')` with the Zod issue list. The model gets a structured error, not corrupted data. This is the difference between PPT generation "silently fails" and PPT generation returning a structured error the model can reason about ("the file builder returned an empty page count, retrying with a simpler scene").

#### 4.7.5 Reliability profile per tool (initial)

| Tool | Mode | Timeout | Retry | Idempotency | Notes |
|------|------|---------|-------|-------------|-------|
| `vector_search` | sync | 5s | none | n/a | Pure read |
| `brand_context_read` | sync | 3s | none | n/a | Cached read |
| `web_search` | sync | 15s | 1 attempt on network | n/a | Circuit broken |
| `generate_pptx` | async | 120s | 1 attempt | turn+toolUseId | Fly machine task |
| `generate_video` | async | 600s | 1 attempt | turn+toolUseId | Calls Muse pipeline |
| `publish_post` | sync | 20s | 1 attempt | turn+toolUseId | Late connector, side effect |
| `update_shopify_product` | sync | 30s | 1 attempt | turn+toolUseId | Side effect |
| `summarize` (compaction) | sync | 30s | none | n/a | Internal only |
| `vector_upsert` | sync | 10s | 2 attempts | content hash | Idempotent by hash |
| `audit_listing` | sync | 30s | none | n/a | Pure read |
| `get_lesson` | sync | 3s | none | n/a | Cached read |

This table is the authoritative reliability profile for the eleven tools migrated in v2.

---

## 5. State Model

### 5.1 RunState shape

```ts
interface RunState {
  schemaVersion: '1.0';
  conversationId: string;
  userId: string;
  brand: string;             // required, must match BrandContext.brand
  brandRevision: number;
  agent: string;
  items: RunItem[];          // append-only typed log
  currentStep: 'idle' | 'in_turn' | 'awaiting_approval' | 'awaiting_job' | 'awaiting_resume';
  pendingApprovals: ApprovalRef[];
  pendingJobs: JobRef[];     // async tool jobs in flight
  usage: { inputTokens: number; outputTokens: number; cacheReads: number; cacheWrites: number };
  spanContext: SpanContext;
  metadata: Record<string, unknown>;
}

type RunItem =
  | { type: 'user_message'; content: ContentBlock[]; ts: number }
  | { type: 'assistant_message'; content: ContentBlock[]; ts: number }
  | { type: 'tool_call'; toolName: string; toolUseId: string; input: unknown; ts: number }
  | { type: 'tool_result'; toolUseId: string; output: unknown | ToolError; ts: number }
  | { type: 'tool_async_pending'; toolUseId: string; jobId: string; estimatedMs: number; ts: number }
  | { type: 'denial'; toolName: string; reason: string; ts: number }
  | { type: 'approval_pending'; toolName: string; toolUseId: string; ts: number }
  | { type: 'compaction_boundary'; summary: string; ts: number }
  | { type: 'reasoning'; content: string; ts: number }
  | { type: 'edit_delta'; original: ContentBlock[]; edited: ContentBlock[]; dimensions: string[]; lateSignal?: boolean; ts: number }
  | { type: 'learn_signal'; kind: 'tool_outcome' | 'approval' | 'denial'; toolUseId?: string; detail: unknown; ts: number };
```

`brand` is required (was optional in v1). All operations are brand-scoped.

`schemaVersion` starts at `'1.0'`. Bump on any change to `RunItem` shape. Forward-compat reader rejects unknown versions explicitly.

### 5.2 Session interface

```ts
interface Session {
  load(conversationId: string): Promise<RunState | null>;
  save(state: RunState): Promise<void>;
  appendItem(conversationId: string, item: RunItem, opts?: { lateSignal?: boolean }): Promise<void>;
}
```

Two implementations:

- `PgSession`: reads existing `captureMessage()` data and projects it into `RunState.items` on `load`. Writes go through `captureMessage()` on `appendItem` so the existing rule (`ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL`) holds, with a new `RunState` snapshot row stored in an `agent_run_states` table for resumption (turn-in-progress, pending approvals, pending jobs).
- `MemorySession`: in-memory map, for tests.

### 5.3 LearningSink

Detail in Section 3.6.3. Two implementations: `PgLearningSink` (writes to `learning_signals` and `lessons` tables) and `MemoryLearningSink` (tests).

### 5.4 Compression

When the assembled context approaches the model's blocking limit, `TurnEngine` invokes `compressor.compress(state)` *before* the model call (LCC pattern: hard blocking limit, not soft). Compression runs as a *forked* `TurnEngine` instance against a stripped-down tool subset (only `summarize`), produces a summary, replaces the compressed range in `items` with a `compaction_boundary` item, and returns the trimmed state.

The fork uses **Haiku** (per memory: `feedback_use_haiku_for_tasks.md`). Compression never uses the conversation's primary model.

Compression strategy is *oldest-first within the recent-conversation window*. The compressor operates only on `RunState.items`; brand context and lessons are reconstructed each turn by the `ContextAssembler` and are never compressed. `edit_delta` and `learn_signal` items are also exempt: they are persistent learning signals, not conversation flow.

---

## 6. MCP Surfaces (detail)

### 6.1 Tool exposure

Both `mcpStdio.js` and `mcpHttp.js` use a shared `mcpAdapter.js` that:

1. Always exposes `send_turn` to every authenticated consumer.
2. For each tool in `ToolRegistry`, checks `agent_mcp_allowlists` for the calling consumer's API key id. Exposes the tool only if the row exists.
3. Implements the MCP `call_tool` handler by validating with the original Zod schema, building a synthetic engine context (including `BrandContext`), asserting brand isolation, invoking the tool, validating output, returning the result.

### 6.2 `send_turn` high-level tool

```
name: send_turn
description: Send a message to the iKawn brain and receive a full turn response.
parameters:
  input: string | ContentBlock[]
  session_id: string?
  agent: string?         # default 'ruhi'
  brand: string?         # default user's primary brand
```

Implementation: builds `BrandContext` from the consumer's auth principal plus requested brand and agent, looks up or creates `RunState` via `Session`, instantiates `TurnEngine`, runs `submitMessage`, collects the item stream, returns the final assistant message plus the new `session_id`. Streaming variant available over SSE on the HTTP transport; collect-and-return on stdio.

### 6.3 Auth

- HTTP transport: requires `Authorization: Bearer ik_*` header. The key carries `(user, brand_allowlist, agent_allowlist)` claims; `BrandContext` construction validates the requested `(brand, agent)` is in the allowlist.
- stdio transport: no transport-level auth; relies on process boundary. The MCP client process is trusted. The spawning context still passes a synthetic auth principal so `BrandContext` can be built normally.

### 6.4 Discovery

The brain registers itself in a known location (env var `MCP_DISCOVERY_URL` if set, else logs the local stdio command on startup) so iKawn-v3 and other consumers can configure connection without hard-coding paths.

### 6.5 Day-one consumer

To prevent MCP HTTP from being dead code that ships and waits, one consumer is migrated within this phase:

**Slack bridge.** The Slack handler currently posts to `chat-api.js` directly. As part of step 9 of the migration (Section 9.1), it switches to MCP HTTP `send_turn` with `ik_*` auth. This is the smallest viable consumer and has no UX dependencies, so cutover risk is low.

This means MCP HTTP carries production traffic before iKawn-v3 is ever pointed at it, which is the entire point.

---

## 7. Turn Lifecycle

A single turn flows as follows.

```
1. caller -> TurnEngine.submitMessage(input, ctx)
2. TurnEngine:
     a. brandContextGuard(ctx)              # re-asserts BrandContext is built
     b. session.load(conversationId) -> state
     c. assembled = contextAssembler.compose({ ctx, state, turnInput: input })
        - reads BrandContext for brand-scoped data
        - reads LearningSink.readLessons for relevant lessons
        - applies budget; may trigger compressor or return BudgetExceededError
     d. provider.invoke(assembled.messages, assembled.tools) -> stream
3. for each chunk in stream:
     a. if text: yield assistant_message item
     b. if tool_use: enqueue to StreamingToolExecutor (asserts brand isolation per 4.3 step 4)
4. as tools complete:
     a. yield tool_result item (or denial / approval_pending / tool_async_pending)
     b. if approval_pending: persist state, return { status: 'awaiting_approval' }
     c. if tool_async_pending: persist state, return { status: 'awaiting_job' }
5. if any sync tool ran: loop to step 2.c with new tool_result items
6. when stop_reason != 'tool_use':
     a. capture in-turn learning signals (tool_outcome) via LearningSink
     b. session.save(final state)
     c. yield { status: 'end_turn' }
```

Key invariants:

- Step 2.d is the *only* model call in the system.
- Step 2.c is the *only* place context is composed.
- Step 4.b suspension is reversible via `engine.resume(state, decision)`. Resume re-enters at step 4.a with the approval applied.
- Step 4.c suspension is reversible via `engine.resumeJob(state, jobId)`. Resume re-enters at step 4.a with the job result applied.
- Step 5 loop count is the *internal* turn count for the engine; the *user-facing* turn counter increments only at step 1, not on resumes.
- Edit deltas (Section 3.6.1) are captured *out of band* by the UI surface, not in this lifecycle. The lifecycle only captures in-turn signals.

---

## 8. Tracing & Observability

Per-layer typed spans, exported via a hook so we don't pin to anyone's backend.

Span types:

- `agent` — agent boundary (name, brand, user)
- `context.assembled` — context composition (stage token counts, lessons applied, retrieval count, brand revision)
- `generation` — model call (provider, model, inputTokens, outputTokens, cache stats)
- `tool` — single tool invocation (name, input hash, output kind, duration, circuit state)
- `tool.async` — async job lifecycle (jobId, dispatched, completed, durationMs)
- `compaction` — forked compression run
- `approval` — approval gate event
- `learning.signal` — signal recorded to LearningSink (kind, brand, dimensions)
- `learning.reflection` — reflection worker run (signals processed, lessons produced)
- `isolation.check` — brand isolation guard event (pass or violation, pre-tool)

Default exporter writes to a new `agent_spans` Postgres table and to `captureMessage()` for the high-level events (so admin observability per the IKAWN rule "per-user per-agent improvement logs" is preserved). Hook is pluggable; later we can add OTel without touching the engine.

---

## 9. Migration & Cutover

### 9.1 Build order

Each step has a defined demoable outcome so progress is visible week over week, not buried until the final cutover.

1. Module skeleton + `RunState` + `Session` + `MemorySession` + `BrandContext` + tests. **Demoable: in-memory turn loop with brand isolation tests passing.**
2. `defineTool` + `ToolRegistry` + `StreamingToolExecutor` + output validation + tests with fake provider. **Demoable: tool dispatch, concurrency, output validation against fakes.**
3. `ContextAssembler` with budget gating + `LearningSink` (memory impl) + tests. **Demoable: assembler produces deterministic context with budget enforcement.**
4. `TurnEngine` with one provider (Claude) and three migrated tools (`vector_search`, `brand_context_read`, `web_search`). **Demoable: end-to-end turn against real Claude, three tools, one brand.**
5. `legacyHttp.js` transport. Behind `OPENBRAIN_BRAIN=v2` env flag. Wire-format-identical responses verified against v1.
6. `PgSession` + `PgLearningSink` adapters wrapping `captureMessage()`. Tests against staging DB. **Demoable: turn round-trips through Postgres, learning signals captured.**
7. Migrate remaining tools, one PR per tool, each with parity test against v1. PPT (`generate_pptx`) and video (`generate_video`) get extra attention as the first async-mode tools. **Demoable per tool: parity passes, async tools run end-to-end.**
8. `mcpStdio.js` + `mcpHttp.js` transports. `send_turn` plus per-tool allowlist. End-to-end test from a synthetic MCP client. **Demoable: Claude Code talks to OpenBrain over stdio MCP.**
9. Slack bridge cutover from legacy HTTP to MCP HTTP `send_turn`. Soak in staging, then production. **Demoable: Slack bot is a real MCP consumer carrying production traffic.**
10. `compressor.js` (forked Haiku). Tests against synthetic long conversations.
11. Approval flow + async job resume end-to-end. Tests for suspend, persist, resume.
12. `reflectionWorker` deployed as a scheduled job on the existing scheduler. **Demoable: lessons are produced from real signals after one cycle.**
13. Lucy cutover: set `OPENBRAIN_BRAIN=v2` on Fly app `ikawn-openbrain`. Soak for one week.
14. Ruhi Brain cutover: set `OPENBRAIN_BRAIN=v2` on Fly app `ruhi-os-brain`. Requires V approval per directive at `~/.claude/projects/-Users-vineet/memory/feedback_lucy_first_ruhi_safe.md`.

### 9.2 Drift control

Mandatory rules during the migration window:

- **No new feature lands in `chat-api.js v1`** once v2 is enabled in any environment. Bug fixes only, and each must also land in v2.
- **Every tool migration is a single PR** that includes: defineTool conversion, parity test, removal of the v1 implementation only after v2 is enabled in Lucy.
- **The legacy wire format is locked.** New `RunItem` types (`edit_delta`, `learn_signal`, `tool_async_pending`) are *engine-internal* on the legacy transport and are stripped from the v1-shape response. They are visible on MCP transports.
- **Weekly diff audit** comparing v1 and v2 directories until v1 is removed.

### 9.3 Rollback

One env var per app: `OPENBRAIN_BRAIN=v1`. Roll back instantly. State written by v2 (the new `agent_run_states`, `learning_signals`, `lessons` tables) is additive; v1 ignores it. Conversations started under v2 continue under v1 with degraded resumption (no in-flight approval recovery, no async job resume), but functional.

### 9.4 Deletion

Once Ruhi Brain has run on v2 for two weeks without regression, `chat-api.js`, the v1 tool handlers, and the legacy data path are deleted in one PR. No backwards-compat shims left behind (per directive).

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wire-format drift between v1 and v2 breaks a client | Medium | High | Parity test per tool; locked response shape; new `RunItem` types are engine-internal on the legacy transport |
| Streaming-vs-batch behavior differs subtly | Medium | Medium | Property-based test that the same input produces equivalent item streams under both v1 and v2 |
| `PgSession` performance regresses | Low | Medium | Bench against current `captureMessage` path before Lucy cutover; cache `RunState` reads in process for active conversations |
| Compression eats tokens on long conversations | Medium | Low | Haiku-only enforcement; budget cap per conversation per day; observability span on every compaction |
| MCP HTTP transport leaks per-tenant data | Low | Critical | `BrandContext` threading + isolation token + per-tool allowlist (Section 3.4 + 4.6); integration test asserting cross-tenant isolation across all surfaces |
| Drift between v1 and v2 because both stay alive | High | Medium | Hard rule (Section 9.2). Weekly audit. Delete v1 within 4 weeks of Ruhi cutover |
| Approval flow corruption on resume | Low | High | `RunState.schemaVersion` strict validation; reject resume if state is from a different schema version |
| Async job resume fails silently (PPT, video) | Medium | High | Job store has TTL; jobs not resumed within TTL emit `tool_async_pending` timeout span and surface as `ToolError(kind: 'async_timeout')`; turn becomes resumable by user retry |
| Output schema validation rejects valid model adaptations | Low | Medium | Output schemas reviewed per tool; failures logged with full payload for schema tightening |
| Connector outage cascades through tool calls | Medium | High | Circuit breaker per connector tool (4.7.3); model receives `ToolError(kind: 'connector_unavailable')` and adapts |
| Learning loop produces low-quality lessons | Medium | Medium | Reflection worker output is reviewable; lessons carry a `quality_score` (set by next-cycle outcomes); low-score lessons are not injected by `ContextAssembler` |
| Cross-brand pattern leaks brand-identifying detail | Low | Critical | Distillation prompt explicitly strips identifying tokens; second-pass review by Haiku before write to cross-brand table; sample audit weekly until trust is established |
| MCP HTTP ships with no real consumer (dead code) | Low | Medium | Slack bridge cutover (step 9) is the day-one consumer; iKawn-v3 follows in a later phase |

---

## 11. Out of Scope

- **Metadata service layer.** Worth doing; not foundational. Defer.
- **iKawn-v3 fully consuming the MCP surface as its primary path.** The brain becomes ready and Slack bridge validates the surface; broader iKawn-v3 integration is a separate phase planned over the same MCP that this design exposes.
- **Mobile app cutover from any direct-to-chat-api path.** Mobile app continues using HTTP `/v1/turns` until a separate effort migrates it to MCP HTTP.
- **Replacing the model provider abstraction.** Existing OpenBrain provider layer is reused.
- **New scheduler / executor work.** They sit upstream of the brain and continue to function. The `reflectionWorker` runs *on* the existing scheduler.
- **Cross-brand pattern-driven prompt tuning at scale.** Foundational write path is in place; the cross-brand promotion threshold is conservative initially. Tuning is a follow-up after sufficient data accumulates.

---

## 12. Open Questions

These need an answer before the implementation plan is final:

1. **`agent_run_states` table shape.** JSONB blob plus indexed columns for `current_step`, `pending_approval_count`, `pending_job_count`, `brand`. Confirm.
2. **`send_turn` over MCP stdio: streaming or collect-and-return?** Recommendation: collect-and-return on stdio (no SSE on subprocess), streaming on HTTP+SSE. Confirm.
3. **Per-agent context budgets and tool allowlists: encoded where?** Recommendation: in agent config rows in Postgres, loaded by `ctx.agent` lookup at engine construction. Confirm.
4. **Approval UI on Lucy and Ruhi web: existing or new?** Lucy currently has none. Recommendation: add a minimal approval surface to Lucy as part of step 11 of the migration.
5. **Auth scope for MCP HTTP `send_turn`: user-scoped or agent-scoped token?** Recommendation: agent-scoped (carries `(user, brand_allowlist, agent_allowlist)`), since `BrandContext` requires all three. Existing `ik_*` key format extends to carry these as claims.
6. **Edit delta capture surfaces for v2 cutover.** Minimum: Lucy (existing edit affordance), Ruhi web (where users approve before publish). Mobile and Telegram deferred. Confirm scope.
7. **Cross-brand promotion threshold: 5 brands enough?** Set conservatively initially; revisit after first month of data.
8. **Lesson injection ranking.** Pure embedding similarity, or weighted combination of similarity + recency + quality_score? Recommendation: weighted, with weights tunable per agent. Confirm.

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

- `~/.claude/projects/-Users-vineet/memory/feedback_lucy_first_ruhi_safe.md`
- `~/.claude/projects/-Users-vineet/memory/directive_architecture_learning.md`
- `~/.claude/projects/-Users-vineet/memory/feedback_use_haiku_for_tasks.md`
- `~/.claude/projects/-Users-vineet/memory/feedback_claude_primary.md`
- `~/.claude/projects/-Users-vineet/memory/feedback_no_openai.md`
- `~/.claude/projects/-Users-vineet/memory/feedback_predeploy_checklist.md`
- `~/.claude/projects/-Users-vineet/memory/feedback_deploy_cwd.md`
- iKawn project rules in CLAUDE.md (monorepo, Postgres-only, no Redis, captureMessage for all writes)

### Related prior specs

- `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-03-17-ruhi-agent-platform-design.md`
- `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-04-17-lucy-react-frontend-design.md`
- `/Users/vineet/ikawn-openbrain/docs/superpowers/specs/2026-04-26-openbrain-agent-api-foundation-design.md` (v1, superseded)

---

## Appendix A: What we are *not* changing in OpenBrain

- The provider layer (`providers/`) and its Claude / Gemini routing.
- `captureMessage()` and the existing event-sourced data model.
- Brand API, reports, scheduler, executor, mentions, Mission Control.
- Embeddings (`gemini-embedding-001`) and the chat-tier filtering rules.
- Telegram handler integration (it continues to call legacy HTTP `/v1/turns`, which is now served by the v2 engine via the legacy transport).
- Authentication (`ik_*` API keys), with non-breaking extension to carry agent and brand allowlist claims.
- Fly deployment topology (`ikawn-openbrain` and `ruhi-os-brain` apps).

The brain refactor is upstream of every other system. Done well, nothing else needs to know.

---

## Appendix B: PPT generation as the canonical async tool

PPT generation is the first non-trivial async tool. Its end-to-end path through this architecture is the reference for every other long-running tool (video, large connector calls, multi-step audits).

**Path:**

1. Model invokes `generate_pptx` with input (scene bible, brand id, deck spec).
2. `StreamingToolExecutor` runs the standard pipeline: input Zod validation, permission check, brand isolation assertion, tool lookup. Sees `mode: 'async'`.
3. Tool implementation enqueues a Fly machine task with the input plus `idempotencyKey = turnId+toolUseId`. Returns `{ jobId, estimatedMs: 75000 }`.
4. Executor records `tool_async_pending` `RunItem`. Engine suspends the turn, persists `RunState` (with `pendingJobs` entry), and the transport returns `{ status: 'awaiting_job' }`.
5. UI renders progress (`estimatedMs`, optional periodic poll for live status). On stdio MCP, the consumer polls; on HTTP+SSE, the server pushes a status event.
6. Fly machine runs the actual PPT build (existing pipeline). On completion, writes the result to the job store keyed by `jobId`. On failure, writes a `ToolError(kind: 'runtime')` envelope. Idempotency key is honored by the build pipeline so a repeat dispatch with the same key returns the same artifact.
7. Poller (or webhook) calls `engine.resumeJob(state, jobId)`. Engine reads result, validates against output schema (`{ url: string, pageCount: number > 0, sizeBytes: number }`).
   - Validation pass: result is appended as a `tool_result` item; turn resumes at the next loop iteration.
   - Validation fail: `ToolError(kind: 'output_invalid')` is appended; model sees the structured error and can recover.
8. Model sees the result (or the structured error) and either presents the deck or recovers by regenerating with simpler input.

**Failure modes covered:**

- Network glitch on enqueue: retry once with same `idempotencyKey`.
- Build pipeline crashes mid-run: TTL on job store fires, `ToolError(kind: 'async_timeout')` surfaces, model retries with the same key (same artifact returned if the pipeline recovered) or simpler input.
- Build pipeline returns malformed output: caught at output schema validation, surfaced as `output_invalid`, model adapts.
- User cancels the conversation mid-job: `RunState.pendingJobs` is consulted on resume; orphaned jobs are reaped by a sweeper.
- Same turn dispatches PPT twice (model decides to retry without waiting): `idempotencyKey` collides, second dispatch returns the in-flight `jobId` rather than starting a duplicate build.

This pattern is the answer to "how do tools that take 90 seconds work without breaking the streaming turn model?" It is also the answer to "how do connector calls to flaky third-party APIs not corrupt the conversation?": the same async lifecycle plus circuit breakers from Section 4.7.3.

Every other long-running or external tool inherits this contract by declaration, not by ad-hoc handling. That is the point.
