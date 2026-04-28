# @ikawn/agent-api

OpenBrain agent runtime primitives: TurnEngine (Plan 02), ToolRegistry, ContextAssembler, RunState, BrandContext, LearningSink. Built per `docs/superpowers/specs/2026-04-27-openbrain-agent-api-foundation-design-v2.1.md`.

## Status

- **Plan 01 (this commit):** foundational primitives, in-memory implementations only. No engine, no Postgres, no MCP.
- **Plan 02 (shipped):** TurnEngine class, real Claude provider, three pioneer tools (`vector_search`, `brand_context_read`, `web_search`), `legacyHttp.js` transport behind `OPENBRAIN_BRAIN=v2`, `PgSession` and `PgLearningSink`.
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

## Plan 02 surface — engine + first tools + Lucy cutover gate

This package now exports:

- `TurnEngine` — drives a turn through context assembly, provider invocation, tool dispatch, and persistence.
- `ClaudeProvider` — Anthropic SDK-backed provider with `cache_control: ephemeral` at the four cache breakpoints.
- `MemoryProvider` — scripted in-memory provider for tests.
- `PgSession` — Postgres-backed Session adapter. Uses `captureMessage` (the existing OpenBrain "only door") for `user_message` and `assistant_message` items; persists every other RunItem in `agent_run_states.state` JSONB.
- `PgLearningSink` — Postgres-backed LearningSink against `learning_signals` and `lessons` tables.
- `vectorSearch`, `brandContextRead`, `webSearch` — the three pioneer tools.
- `createLegacyHttpRouter(deps)` — Express router that mounts `POST /api/chat/send` and serves byte-compatible SSE.

### Activating v2 on a Fly app

Plan 02 is dormant by default. To activate the engine on a Fly app, deploy a fresh image (with `--no-cache` per the repo's Depot caching rule), then set the secret:

```bash
cd /Users/vineet/ikawn-openbrain
npm run pre-deploy                                                            # mandatory gate
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --no-cache       # fresh image
~/.fly/bin/flyctl secrets set OPENBRAIN_BRAIN=v2 --app ikawn-openbrain        # flip flag
```

Confirm activation in the deploy logs:

```
[index] OPENBRAIN_BRAIN=v2 — chat served by agent-api legacyHttp transport
```

To roll back instantly:

```bash
~/.fly/bin/flyctl secrets unset OPENBRAIN_BRAIN --app ikawn-openbrain
```

(Or set it to `v1`; only the literal string `v2` activates the engine.)

### Lucy soak window

Per spec v2 §9.1 step 13, soak Lucy for at least one week before V approves the Ruhi Brain cutover. Ruhi Brain (`ruhi-os-brain` Fly app) MUST NOT have `OPENBRAIN_BRAIN=v2` set without explicit V approval — see memory `feedback_lucy_first_ruhi_safe.md`.

### Plan 02 v2 cutover scope (minimum viable)

With `OPENBRAIN_BRAIN=v2` active, only **plain text turns + the 3 pioneer tools** work end-to-end. The following v1 features fall back to "feature unavailable" or are silently no-ops under v2 in Plan 02:

- Mentions (`@agent`)
- Skill shortcuts
- Tier switching beyond pro/expert
- Attachments (images, documents, links)
- Image / video / PPTX generation tools
- Draft handling
- Title generation
- Brand-knowledge markdown injection (`loadBrandKnowledge`)

These are restored in Plans 03-05.
