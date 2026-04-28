# Plan 02 — agent-api engine + Lucy cutover gate (HANDOFF)

**Date:** 2026-04-28
**Repo:** /Users/vineet/ikawn-openbrain (main)
**Status:** 24/24 tasks shipped, code-review approved, NOT deployed
**Last commit before fix:** 62de9879 (T24)
**Plan 01 ended at:** 2c348f92

---

## What shipped
Plan 02 of 5 — agent-api engine + first 3 tools (vector_search, brand_context_read, web_search) + Lucy cutover gate.
24 atomic commits c1869661 → 62de9879.
Cutover gated behind `OPENBRAIN_BRAIN=v2` env var. Unset = byte-identical chat-api. Only literal `v2` activates.
Test count: 849 → 911 (+62 agent-api tests). Pre-deploy gate passed at T23.

## Hard rules (V's CLAUDE.md, non-negotiable)
- Lucy first, Ruhi safe. NEVER set `OPENBRAIN_BRAIN=v2` on `ruhi-os-brain` without V's explicit approval.
- `captureMessage()` is the only door for memories — Plan 02 honors this via PgSession.
- No Redis. No pgvector for new tables — `lessons.embedding` is JSONB (BLOCKER patched in T16).
- Deploy CWD must match repo — `cd /Users/vineet/ikawn-openbrain` BEFORE any flyctl call.
- No `--no-verify`, no skipping pre-deploy gate.

## Pre-flight before deploy
- Confirm `ANTHROPIC_API_KEY` is set on Fly app:
  ```
  ~/.fly/bin/flyctl secrets list --app ikawn-openbrain | grep ANTHROPIC
  ```
- DB schema auto-applies on boot via `initSchema()` in `src/db.js` (4 new tables: `agent_run_states`, `agent_configs`, `learning_signals`, `lessons`).
- Soak window: minimum 1 week on Lucy before any Ruhi consideration.

## Deploy commands (V to run)

```bash
cd /Users/vineet/ikawn-openbrain
npm run pre-deploy
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --no-cache
~/.fly/bin/flyctl secrets set OPENBRAIN_BRAIN=v2 --app ikawn-openbrain
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | grep OPENBRAIN_BRAIN
# expect: [index] OPENBRAIN_BRAIN=v2 — chat served by agent-api legacyHttp transport
```

**Rollback (instant):**
```bash
~/.fly/bin/flyctl secrets unset OPENBRAIN_BRAIN --app ikawn-openbrain
```

## Findings to address before/during deploy

### Pre-deploy housekeeping (NOT a blocker)
**T11 `vector_search.limit` defensive guard — added for parity with T13.** Original handoff framed this as a runtime-default bug. Audit on 2026-04-28 disproved that premise: `StreamingToolExecutor.dispatchToolUse` calls `tool.validateInput()` which runs `safeParse` and passes `validated.data` into `execute()`. Zod defaults materialize on the agent-api code path. Both T13 (`web_search.count`) and T11 (`vector_search.limit`) guards are belt-and-suspenders, not bug fixes.

The T11 guard was kept anyway for codebase consistency with T13. Committed as `chore(agent-api): match T13 defensive-guard pattern in vector_search` (NOT `fix:`). The deploy was never gated on this change.

**Caveat for future hunters:** if any caller *outside* `packages/agent-api/src/` invokes `tool.execute(...)` directly (e.g. legacy chat-api wiring or non-agent-api tests), the missing-default issue could resurface there. Within agent-api, grep confirms exactly one `execute()` call site and it goes through validateInput.

### Known at-deploy regressions (planned, document in deploy notes)
1. **Streaming UX regression.** Plan 02 buffers all `text_delta` into ONE chunk per turn instead of token-by-token. Lucy chat will feel less snappy. Plan 03 fixes with per-delta yields.
2. **v1-only events stop firing under v2:** `agent_identity`, `tier_switch`, `task_started`, `artifact_ready`, `generation_started`, `title`. Plan claims frontend tolerates absence — verify in DevTools network tab on first Lucy soak. JS errors → defensive guards needed before wider rollout.
3. **Out of scope under v2 (silently no-op):** mentions, skills, attachments, image/video/PPTX gen, drafts, titles, brand-knowledge markdown injection. Plans 03–05 close gaps.

### Non-blocking notes
- 5 ContextAssembler fixture patches in T7/T8/T9/T10/T19/T22 — Plan 01 constructor signature drifted. Implementers added `agentConfig`/`estimateTokens`/`learningSink` stubs. No test assertions weakened.
- `errors.js` extension in T9 — `BudgetExceededError` constructor accepts both `(message, opts)` and `(opts)` forms. Purely additive.
- T20 `mock_behavior.test.js` — implementer added 8-line placeholder file and overclaimed in commit message ("fixed pre-existing broken stub" — actually CREATED it). Harmless, no revert needed.

## Where to look

| Question | File |
|---|---|
| Plan source | `docs/superpowers/plans/2026-04-28-openbrain-agent-api-plan-02-engine-and-cutover.md` |
| New engine code | `packages/agent-api/src/engine/` |
| New tools | `packages/agent-api/src/tools/{vectorSearch,brandContextRead,webSearch}.js` |
| Transport | `packages/agent-api/src/transports/legacyHttp.js` |
| Env-flag fork | `src/index.js` (search `OPENBRAIN_BRAIN`) |
| New DDL | `src/db.js` (search `agent_run_states`) |
| Activation docs | `packages/agent-api/README.md` (Plan 02 surface section) |
| Flag docs | `CLAUDE.md` (line 228, "OpenBrain — OPENBRAIN_BRAIN flag") |

## Resume prompt for next session

> Resume Plan 02 deploy. CWD `/Users/vineet/ikawn-openbrain` on `main`.
> The T11 defensive guard (NOT a bug fix) is already committed as `chore(agent-api): match T13 defensive-guard pattern in vector_search`. No further action needed there.
> Then: confirm `ANTHROPIC_API_KEY` on Fly, deploy, set `OPENBRAIN_BRAIN=v2`, tail logs for activation line, send test message via ruhi.ikawn.in, watch SSE in DevTools, verify no JS errors from missing v1 events.
> Hard rules: Lucy first, Ruhi safe. CWD must match repo. No `--no-verify`. Rollback = unset the secret.
