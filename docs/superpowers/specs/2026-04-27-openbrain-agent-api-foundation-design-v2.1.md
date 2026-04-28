# OpenBrain Agent-API Foundation (v2.1)

**Date:** 2026-04-27
**Status:** Approved (architecture). Implementation plan to follow.
**Owner:** V
**Scope:** OpenBrain (Lucy + Ruhi Brain). iKawn-v3 integration explicitly later.
**Supersedes:** `2026-04-27-openbrain-agent-api-foundation-design-v2.md` (delta only; all unchanged sections inherit from v2).

---

## Changes from v2

This revision closes four gaps surfaced against `/Users/vineet/ikawn-openbrain/CLAUDE.md` and locks six of the eight open questions.

### Gaps addressed

1. **Existing MCP server migration.** `src/mcp/server.js` (8 tools, exposed to Claude Desktop) is not parallel infrastructure. Its tools migrate through the new registry first; the existing server becomes a thin shim over the new registry, then is deleted. (New Section 6.6.)
2. **`manage_automation` tool (ActivePieces) added** to the reliability profile. Mode `async`, circuit-broken. (Section 4.7.5 updated.)
3. **`brand_id = 'ikawn'` transition mode** acknowledged. `BrandContext` permits a default-brand fallback during the multi-tenant rollout window; the fallback is observable on every span and is removed once multi-tenant is fully live, per CLAUDE.md OpenBrain rule 6. (Section 3.4.2 updated.)
4. **Fly hard rules** propagated through the design:
   - `--no-cache` is mandatory on every Depot deploy. (Section 9 updated.)
   - Fly kills async work after `res.json()`. Async-tool implementations MUST enqueue the Fly machine task *before* responding to the caller. (Section 4.7.2 updated + Appendix B note.)

### Open questions locked

| # | Question | Resolution |
|---|----------|------------|
| 1 | `agent_run_states` table shape | JSONB blob + indexed columns (`current_step`, `pending_approval_count`, `pending_job_count`, `brand`, `updated_at`). See Section 5.2. |
| 2 | `send_turn` over MCP stdio: streaming or collect-and-return | Collect-and-return on stdio; streaming on HTTP+SSE. See Section 6.2. |
| 3 | Per-agent config location | Postgres `agent_configs(agent_id, brand_id, input_token_budget, tool_allowlist JSONB, lesson_injection_weights JSONB)`. Loaded by `ctx.agent` at engine construction. See Section 3.5.3. |
| 5 | Auth scope for MCP HTTP `send_turn` | Agent-scoped `ik_*` key carrying claims `(user_id, brand_allowlist, agent_allowlist)`. Legacy single-brand keys fall back to `brand = 'ikawn'` during transition. See Section 6.3. |
| 6 | Edit delta capture surfaces for v2 cutover | Lucy and Ruhi web only. Mobile and Telegram deferred to a follow-up phase. The `LearningSink.recordEditDelta` interface is fully built; deferred surfaces just don't call it yet. See Section 3.6.1. |
| 8 | Lesson injection ranking | Weighted: `0.5 * similarity + 0.3 * recency + 0.2 * quality_score`. Per-agent overrides live in `agent_configs.lesson_injection_weights`. See Section 3.6.5. |

Questions 4 (Lucy approval UI) and 7 (cross-brand threshold) remain advisory, not blocking.

---

## Replaced and amended sections

Each section below either *REPLACES* or *APPENDS TO* the corresponding section in v2. All other sections of v2 stand unchanged.

### Section 3.4.2 — REPLACES v2

`buildBrandContext(authPrincipal, requestedBrand, agent)` is the single constructor. It runs four checks in order:

1. The auth principal (from `ik_*` key or session) is verified against the user table.
2. The requested brand is verified to belong to the user (membership check, no exceptions).
   - **Transition mode:** if the auth principal carries the legacy single-brand claim (no `brand_allowlist`) OR the user has not yet been migrated to multi-tenant, the constructor falls back to brand `'ikawn'` and sets `brandContext.transitionDefault = true`. This flag is logged on every span and emitted as a `brand_context.transition_default` counter. The transition mode is removed once multi-tenant routing is live for all users (CLAUDE.md OpenBrain rule 6). The fallback is time-bounded; the v2.1 implementation plan tracks the deletion task explicitly.
3. The agent is verified to be allowed for the user/brand pair.
4. The resolved permissions are intersected with the agent's allowlist.

If any check fails, the constructor throws `BrandIsolationError`, which is caught at the transport layer and returns a 403 (HTTP) or MCP error. The `TurnEngine` never sees an unbuilt `BrandContext`.

### Section 3.5.3 — APPENDS TO v2

Per-agent `inputTokenBudget`, `tool_allowlist`, and `lesson_injection_weights` are stored in a new Postgres table:

```sql
CREATE TABLE agent_configs (
  agent_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  input_token_budget INT NOT NULL,
  tool_allowlist JSONB NOT NULL,                  -- array of tool names
  lesson_injection_weights JSONB NOT NULL,        -- { similarity, recency, quality_score }
  max_retrieval INT NOT NULL DEFAULT 8,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, brand_id)
);
```

The assembler reads this row once per turn via the engine's `(ctx.agent, ctx.brand)` lookup; rows are cached in process for the life of a turn. A missing row falls back to a code-defined default profile (logged) so a misconfigured agent does not break the engine.

### Section 3.6.1 — APPENDS TO v2 (capture surface scope)

For v2 cutover, edit delta capture is wired in **Lucy** and **Ruhi web** only. Telegram and mobile surfaces are deferred to a follow-up phase.

The `LearningSink.recordEditDelta` interface is fully built; deferred surfaces simply do not call it yet. When mobile and Telegram capture is added later, no engine or sink changes are required, only client-side wiring. This is intentionally narrow scope for the cutover so the learning loop can be validated end-to-end on two surfaces before fanning out.

### Section 3.6.5 — REPLACES v2

`ContextAssembler.compose` step 3 calls `LearningSink.readLessons({ brand: ctx.brand, agent: ctx.agent })` and ranks the returned candidates by:

```
score = (w_sim * cosine_similarity)
      + (w_recency * recency_decay)
      + (w_quality * quality_score)
```

Default weights: `w_sim = 0.5`, `w_recency = 0.3`, `w_quality = 0.2`. Per-agent overrides live in `agent_configs.lesson_injection_weights` (Section 3.5.3). The top N lessons by score are injected (default `N = 5`), capped at the agent's configured per-turn lesson token budget.

This closes the loop: a human correction at turn T is captured as a signal, distilled by the next reflection cycle, and read back into context at turn T+k. The lag is intentional; raw deltas are not fed back at turn T+1 because that would amount to in-context fine-tuning without distillation.

### Section 4.7.2 — APPENDS TO v2

**Critical Fly constraint:** Fly.io terminates async work after `res.json()` returns to the caller (CLAUDE.md OpenBrain rule 5). The tool implementation that enqueues a Fly machine task MUST enqueue *before* the synchronous response is returned to the executor.

Required ordering inside an async tool's `execute()`:

1. Build job record in the job store with status `pending`.
2. Enqueue the Fly machine task carrying the `idempotencyKey`. Wait for the enqueue ack.
3. Only then return `{ jobId, estimatedMs }` to the executor.

Any work attempted after step 3 (background timers, post-response logging, deferred enqueue) is silently dropped on Fly. The pattern is locked at the executor layer: `asyncJobExecutor` requires the tool's return value to include a confirmed-enqueued `jobId`, never a "will enqueue shortly" promise.

### Section 4.7.5 — REPLACES v2

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
| `manage_automation` | async | 60s | 1 attempt | turn+toolUseId | ActivePieces flow ops; circuit broken |

Twelve tools total in v2.1 cutover.

### Section 5.2 — APPENDS TO v2 (agent_run_states schema)

```sql
CREATE TABLE agent_run_states (
  conversation_id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  current_step TEXT NOT NULL,           -- 'idle' | 'in_turn' | 'awaiting_approval' | 'awaiting_job' | 'awaiting_resume'
  pending_approval_count INT NOT NULL DEFAULT 0,
  pending_job_count INT NOT NULL DEFAULT 0,
  state JSONB NOT NULL,                 -- full RunState blob
  schema_version TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_run_states_brand_step_idx
  ON agent_run_states (brand, current_step) WHERE current_step != 'idle';

CREATE INDEX agent_run_states_pending_jobs_idx
  ON agent_run_states (updated_at) WHERE pending_job_count > 0;

CREATE INDEX agent_run_states_pending_approvals_idx
  ON agent_run_states (updated_at) WHERE pending_approval_count > 0;
```

JSONB for the full state; indexed columns for the hot-path queries (resumable conversations per brand, stuck jobs, pending approvals).

### Section 6.2 — APPENDS TO v2 (streaming behavior)

`send_turn` streaming semantics by transport:

- **HTTP+SSE:** streams tokens and items as they are produced. SSE event types: `item.append` (one per `RunItem` produced), `turn.suspended` (on approval or async-job suspension, with status payload), `turn.complete` (final assistant message + new `session_id`). Clients that ignore SSE and just read the final response get the equivalent of the collect-and-return mode.
- **stdio:** collect-and-return. All items accumulate in process; the MCP response contains the final assistant message + new `session_id`. Intermediate items are surfaced via stderr structured logs only. Stdio consumers needing progress poll `RunState` separately via a future `get_run_state` tool (out of scope for v2.1; deferred).

This split reflects the transport reality: stdio MCP has no streaming primitive in the spec today; HTTP+SSE has SSE natively.

### Section 6.3 — REPLACES v2

- **HTTP transport.** Requires `Authorization: Bearer ik_*` header. The key carries claims `(user_id, brand_allowlist, agent_allowlist)`. `BrandContext` construction validates the requested `(brand, agent)` is in the allowlist. Keys without the new claims (legacy keys issued before this rollout) fall back to single-brand mode (`brand = 'ikawn'`, `transitionDefault = true`) until rotated. A rotation deadline is published to consumers.
- **stdio transport.** No transport-level auth; relies on process boundary. The MCP client process is trusted. The spawning context still passes a synthetic auth principal so `BrandContext` can be built normally.

Key claim format (compact JWT-ish payload, signed with existing OpenBrain secret):

```json
{
  "user_id": "u_...",
  "brand_allowlist": ["ikawn", "maxfashion", "shubhkart"],
  "agent_allowlist": ["ruhi", "lucy", "leadspark"],
  "iat": 1714123200,
  "kid": "ik-2026-04"
}
```

A migration utility (one-shot script) re-issues legacy keys with the new claim shape; legacy unsigned keys continue to work for the transition window.

### Section 6.6 — NEW

OpenBrain currently runs an MCP stdio server at `/Users/vineet/ikawn-openbrain/src/mcp/server.js` exposing 8 tools to Claude Desktop. v2.1 absorbs this server rather than running parallel infrastructure.

**Migration steps:**

1. Each of the 8 existing tools is rewritten as a `defineTool` declaration in `packages/agent-api/src/tools/legacy/`. Same names, same semantics; gain Zod input/output schemas, brand isolation assertion (with `transitionDefault` allowed since Claude Desktop is single-tenant), and output validation. PR-per-tool.
2. Once all 8 are in the new registry, `src/mcp/server.js` is rewritten as a thin shim that constructs an `mcpStdio` server pointed at the new registry, exposes only the same 8 tools (allowlist-restricted to preserve Claude Desktop's surface), and preserves the existing stdio command consumers use.
3. After Lucy cutover validates the shim against existing Claude Desktop configurations, the shim is deleted. Consumers point directly at the canonical `transports/mcpStdio.js`.

**Inventory of the 8 existing tools** (to be confirmed against `src/mcp/server.js` during step 1):

The implementation plan begins with a read pass on `src/mcp/server.js` to enumerate the 8 tools, capture their current input shapes, and produce parity tests *before* any rewrite. No tool is migrated until its parity test exists.

This avoids two MCP servers in one process, two tool registries, and two ways for Claude Desktop to call OpenBrain.

### Section 9 (Migration & Cutover) — APPENDS TO v2 (deploy commands)

Deploy commands for OpenBrain MUST use `--no-cache`. CLAUDE.md OpenBrain rule 2 is non-negotiable.

```bash
# Lucy
cd /Users/vineet/ikawn-openbrain
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --no-cache

# Ruhi Brain (only after V approval per Lucy-first-Ruhi-safe directive)
cd /Users/vineet/ikawn-openbrain
~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only --no-cache
```

`npm run pre-deploy` MUST pass before either deploy (CLAUDE.md Testing rule).

### Section 9.1 — APPENDS TO v2 (additional build-order step)

Insert a new step between v2 step 8 (MCP transports) and step 9 (Slack bridge cutover):

**Step 8.5: Existing MCP server absorption.** Migrate the 8 tools from `src/mcp/server.js` through the new registry per Section 6.6. Replace the existing server with a thin shim. Validate against current Claude Desktop configurations. Delete the shim after Lucy cutover.

The full v2.1 build order is therefore 15 steps. The numbering in v2.1's implementation plan reflects this.

### Section 12 (Open Questions) — REPLACES v2

The following remain open (advisory, not blocking):

4. **Approval UI on Lucy and Ruhi web.** Lucy currently has none. Recommendation: add a minimal approval surface to Lucy as part of step 11 of the migration. Ruhi web likely needs a new component as well; surface design follows the Lucy pattern once that ships.
7. **Cross-brand promotion threshold.** Set conservatively at 5 brands initially; revisit after first month of production data. Adjustable via `reflectionWorker` config without redeploy.

Questions 1, 2, 3, 5, 6, and 8 from v2 are now locked in their respective sections of v2.1.

### Appendix B — APPENDS TO v2 (Fly async-after-response note at step 3)

**Implementation note for step 3:** per Fly's `kill async work after res.json()` constraint (CLAUDE.md OpenBrain rule 5), the tool implementation MUST enqueue the Fly machine task *before* returning `{ jobId, estimatedMs }` to the executor. Required ordering:

1. Write the job record to the job store with status `pending`.
2. Enqueue the Fly machine task carrying the `idempotencyKey`. Await the enqueue ack.
3. Return `{ jobId, estimatedMs }` to the executor.

Reversing steps 2 and 3 silently drops the work on Fly. The executor refuses any return value that does not represent a confirmed-enqueued job; "will enqueue after response" is rejected at the type level.

---

## Implementation plan trigger

This v2.1 spec is the source of truth for the implementation plan that follows. The plan is generated against this document via the `superpowers:writing-plans` skill, with v2's unchanged sections inherited by reference.
