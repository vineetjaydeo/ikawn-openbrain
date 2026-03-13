# Execution Handoff: Intelligence Layer (Phases 1-4)

## What to build

Add the Memory Intelligence & Self-Learning layer to OpenBrain. Events flow in via `captureEditDelta()` dual-write, get distilled into knowledge by a daily Anthropic Claude worker, and are recalled during generation via unified `recall()` that queries both `memories` + `distilled_memory`.

## Plan location

`/Users/vineet/ikawn-openbrain/docs/superpowers/plans/2026-03-13-intelligence-layer-phases-1-4.md`

## Key decisions already made

- **JSDoc + @ts-check** — no TypeScript build pipeline changes
- **float8[]** — no pgvector, use existing `cosine_similarity()` PL/pgSQL function
- **Anthropic Claude** for intelligence workers (Haiku for distillation, Sonnet for strategy)
- **OpenAI** stays for embeddings only (`text-embedding-3-small`)
- **Dual-write** `captureEditDelta` — `edit_deltas` (mothership) + `memory_events` (distillation), independent
- **In-memory worker flags** — no `worker_locks` table (single Fly machine)
- **recall()** queries both `memories` + `distilled_memory`, configurable via `source` param
- **Supersession** uses cheap Haiku call to detect agree vs contradict (not just similarity)
- **$5/day** cost ceiling, 20 LLM calls per worker run, circuit breaker at 3 failures

## Execution order (12 tasks)

| # | Task | Type | Dependencies |
|---|------|------|-------------|
| 1 | Schema (4 new tables in db.js) | Modify | None |
| 2 | Anthropic client + model routing in llm.js | Modify | None |
| 3 | Worker guards (worker-guards.js) | Create | None |
| 4 | Dual-write captureEditDelta + captureEvent | Modify | Task 1 |
| 5 | Extend embedding worker for distilled_memory | Modify | Task 1 |
| 6 | Distillation worker | Create + wire in index.js | Tasks 1-3 |
| 7 | recall() utility | Create | Task 1 |
| 8 | generateWithMemory wrapper | Create | Tasks 2, 7 |
| 9 | Recall API route + mount in index.js | Create | Task 7 |
| 10 | Admin endpoints (worker status, trigger, inspect) | Modify | Tasks 3, 6 |
| 11 | E2E smoke test | Verify | All above |
| 12 | Deploy to Fly.io | Deploy | Task 11 |

Tasks 1-3 are independent — can run in parallel.
Tasks 4-5 depend on Task 1 only.
Task 6 depends on Tasks 1-3.
Tasks 7-9 are independent of each other but depend on Task 1.

## Files touched

**New (5):** `src/utils/worker-guards.js`, `src/workers/distillation-worker.js`, `src/utils/recall.js`, `src/utils/generate-with-memory.js`, `src/routes/recall.js`

**Modified (6):** `src/db.js`, `src/utils/llm.js`, `src/utils/capture.js`, `src/workers/embedding-worker.js`, `src/index.js`, `src/routes/admin-api.js`

## Pre-execution checklist

- [ ] `ANTHROPIC_API_KEY` available (needed for Task 6 testing). If not, worker starts disabled with clear warning.
- [ ] `DATABASE_URL` available for local schema test (Task 1 step 6). If not, verify SQL by reading.
- [ ] Read `src/db.js`, `src/utils/llm.js`, `src/utils/capture.js`, `src/workers/embedding-worker.js` before modifying.

## Spec documents (read if you need deeper context)

1. `docs/plans/ruhi-memory-intelligence-prompt-v1.md` — original spec (Phases 1-4)
2. `docs/plans/cc-response-ruhi-intelligence.md` — V's architecture decisions
3. `docs/plans/cc-addendum-scale-optimization.md` — scale + token optimization rules

## Post-execution

- Set `ANTHROPIC_API_KEY` Fly secret before deploy
- Deploy with `~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false`
- Verify new tables exist via `flyctl postgres connect`
- Test recall API: `curl https://ikawn-openbrain.fly.dev/api/memory/recall?q=test -H "x-api-key: $KEY"`
