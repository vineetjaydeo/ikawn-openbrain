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
