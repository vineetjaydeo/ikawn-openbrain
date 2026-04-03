# Session Handoff — 2026-04-03: Full Context

## Repo & CWD
- **Repo**: `/Users/vineet/ikawn-openbrain/` (GitHub: vineonardo/ikawn-openbrain)
- **Branch**: `main`, commit `5948d0a`, pushed
- **Fly app**: `ikawn-openbrain` (Lucy), `ruhi-os-brain` (Ruhi Brain — NOT yet deployed)
- **DB**: `ikawn-openbrain-db` (Fly Postgres, had error state this session — restarted)

---

## What Was Done This Session

### Embedding Fix (deployed)
- Fixed `GOOGLE_AI_API_KEY` — was wrong format (OAuth token). Now `AIzaSyDrVKaK3oDOjQdFcx5bS8jM2RPKPcwv4ZE`
- Model `text-embedding-004` to `gemini-embedding-001` (3072-dim)
- 6,526/6,900 memories re-embedded. ~5 failing (empty content)
- **Files**: `src/embeddings.js`, `src/workers/embedding-worker.js`

### Chat Tool Safety (deployed)
- Chat path filters to `tier: 'direct'` only — coding tools hidden from chat (INTENTIONAL)
- New `search_memory` tool (tier: direct) for active memory recall in chat
- Title gen: `gpt-4o-mini` to `gemini-2.5-flash`
- **Files**: `src/routes/chat-api.js` (lines 593-598, 910), `src/tools/recall.tool.js` (NEW)

### Executor Improvements (deployed)
- Feature flags gate code tools: `feature('CODE_TOOLS')`, `feature('DEPLOY_TOOLS')`
- `max_tokens`, `max_tool_rounds` configurable per task via `config` JSON
- Defaults: 50K tokens, 10 rounds (was 30K/5)
- **File**: `src/agent/executor.js` (lines 7, 12-13, 39-47, 185, 205)

### Self-Coding Loop Test
- Tested via Mission Control scheduled task, Tech agent, tools, result
- **Works mechanically** but Haiku too round-hungry. Needs Sonnet for coding tasks.
- Cost: $0.078/run with Haiku (90K tokens, 10 rounds, didn't finish)

---

## BUGS FOUND (Not Yet Fixed)

### Bug 1: "Something went wrong" Telegram spam overnight
- **Root cause**: Generic catch-all in `/Users/vineet/ikawn-openbrain/src/routes/webhooks.js` line 474-478
- DB went into error state, every Telegram message hit failed query, generic error sent back
- **Fix**: Add `err.message` to the error Telegram message for debugging

### Bug 2: Git not available in Fly container
- **Root cause**: `/Users/vineet/ikawn-openbrain/Dockerfile` uses `node:20-alpine` — no git binary
- `/Users/vineet/ikawn-openbrain/src/tools/bash.tool.js` has `git` in allowlist (line 20) with subcommands (lines 25-27), but binary doesnt exist
- **Fix**: Add `RUN apk add --no-cache git` to Dockerfile after line 3

### Bug 3: Active window blocks one-time tasks at night
- DB has DEFAULT values `active_window_start='07:00'`, `active_window_end='19:00'` on `scheduled_tasks`
- Every task silently gets IST business hours restriction
- Water reminder (id=7) and self-coding tasks were blocked at night
- **Fix**: In `/Users/vineet/ikawn-openbrain/src/utils/schedule.js` `isInActiveWindow()` — skip check for `schedule_type = 'once'`. Or remove column defaults in `/Users/vineet/ikawn-openbrain/src/db.js`

### Bug 4: Empty content memories fail embedding
- Some memories have empty/null content, Google API returns 400 "empty Part"
- ~5 memories permanently failed
- **Fix**: In `/Users/vineet/ikawn-openbrain/src/workers/embedding-worker.js`, skip rows where content is null/empty/whitespace

---

## VISION: Lucy as Autonomous Coding Agent

**V's intent**: Lucy should NOT code in chat. She should perform coding tasks AUTONOMOUSLY via Mission Control — read code, edit, test, deploy safely, update git. The chat tier filtering is CORRECT.

### How it works today
```
User creates task in Mission Control UI (or scheduled_tasks DB)
  Scheduler picks it up (src/scheduler.js, 30s poll)
  Executor runs the agent (src/agent/executor.js)
  Agent has tools: code_read, code_write, code_edit, bash_exec, deploy_openbrain, notify
  Agent completes task, result saved to task_runs table
```

### What's missing for autonomous coding to work well

1. **Git in container** — Dockerfile needs git. Without it, agents cant commit/push.
   - File: `/Users/vineet/ikawn-openbrain/Dockerfile`

2. **Git auth in container** — Even with git binary, need credentials to push.
   - Options: (a) GitHub deploy key as Fly secret, (b) GitHub token in env, (c) gh CLI with token
   - Need to set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` env vars too

3. **Sonnet for coding** — Haiku burns rounds without finishing. Coding tasks need `config.model = 'claude-sonnet-4-6'`
   - File: `/Users/vineet/ikawn-openbrain/src/agent/executor.js` line 178 (modelOverride)

4. **Deploy tool safety** — `deploy_openbrain` tool exists at `/Users/vineet/ikawn-openbrain/src/tools/deploy.tool.js` but `DEPLOY_TOOLS` feature flag is OFF by default
   - To enable: `flyctl secrets set ENABLE_DEPLOY_TOOLS=true --app ikawn-openbrain`
   - Or set per-task via executor (currently feature flag is global)

5. **Pre-deploy gate** — Deploy tool should run `npm test` before deploying. Check if `/Users/vineet/ikawn-openbrain/src/tools/deploy.tool.js` already has this.

6. **Task to Telegram notification** — Notify tool exists (`/Users/vineet/ikawn-openbrain/src/tools/notify.tool.js`) but agents need to be told to use it in task description.

7. **Chat to Task creation** — Lucy in chat should be able to CREATE coding tasks (via `manage_task` tool, tier: direct) that run asynchronously. This already works — `manage_task` is direct tier.

### Ideal autonomous flow
```
V in chat: "Lucy, add namaste to the greeting patterns"
  Lucy creates a scheduled_task via manage_task tool (tier: direct, in chat)
  Task assigned to Tech agent with coding tools
  Tech agent: code_read, code_edit, bash_exec(npm test), bash_exec(git commit+push), deploy_openbrain, notify(Telegram)
  V gets Telegram: "Done. Added namaste to persona.js. Tests pass. Deployed v2.7.2."
```

---

## Next Session Priorities (in order)

1. **Fix Dockerfile** — add git + set git identity
   - `/Users/vineet/ikawn-openbrain/Dockerfile`

2. **Git auth in Fly** — set `GITHUB_TOKEN` secret, configure git in container startup
   - May need a startup script or env vars in fly.toml

3. **Fix Telegram error messages** — add detail to catch-all
   - `/Users/vineet/ikawn-openbrain/src/routes/webhooks.js` line 474-478

4. **Fix active_window defaults** — skip for once tasks
   - `/Users/vineet/ikawn-openbrain/src/utils/schedule.js` line 41-42

5. **Fix empty content embedding** — skip null/empty rows
   - `/Users/vineet/ikawn-openbrain/src/workers/embedding-worker.js`

6. **Re-test self-coding with Sonnet** — recreate namaste task with `claude-sonnet-4-6`

7. **Deploy to Ruhi Brain** — set GOOGLE_AI_API_KEY, deploy, reset embeddings

8. **Verify Lucy chat UX** — test on ruhi.ikawn.in that RAG works, search_memory tool works

---

## All Files Touched or Relevant

```
MODIFIED (committed, pushed):
  /Users/vineet/ikawn-openbrain/src/agent/executor.js          — Feature flags, config overrides, limits
  /Users/vineet/ikawn-openbrain/src/embeddings.js              — gemini-embedding-001 model
  /Users/vineet/ikawn-openbrain/src/routes/chat-api.js         — Tier filtering, title model
  /Users/vineet/ikawn-openbrain/src/workers/embedding-worker.js — gemini-embedding-001 model

CREATED (committed, pushed):
  /Users/vineet/ikawn-openbrain/src/tools/recall.tool.js       — search_memory tool

NEEDS FIXING (next session):
  /Users/vineet/ikawn-openbrain/Dockerfile                     — Add git, set identity
  /Users/vineet/ikawn-openbrain/src/routes/webhooks.js         — Line 474-478, error detail
  /Users/vineet/ikawn-openbrain/src/utils/schedule.js          — Line 41-42, skip window for once
  /Users/vineet/ikawn-openbrain/src/workers/embedding-worker.js — Skip empty content

RELEVANT (unchanged):
  /Users/vineet/ikawn-openbrain/src/tools/bash.tool.js         — Git in allowlist (line 20)
  /Users/vineet/ikawn-openbrain/src/tools/deploy.tool.js       — Deploy flow, pre-deploy gate
  /Users/vineet/ikawn-openbrain/src/tools/notify.tool.js       — Telegram notifications
  /Users/vineet/ikawn-openbrain/src/tools/manage-task.tool.js  — Task CRUD (tier: direct)
  /Users/vineet/ikawn-openbrain/src/tools/code-read.tool.js    — File reading (tier: agent)
  /Users/vineet/ikawn-openbrain/src/tools/code-write.tool.js   — File writing (tier: agent)
  /Users/vineet/ikawn-openbrain/src/tools/code-edit.tool.js    — String replace (tier: agent)
  /Users/vineet/ikawn-openbrain/src/utils/features.js          — Feature flag definitions
  /Users/vineet/ikawn-openbrain/src/utils/schedule.js          — isInActiveWindow()
  /Users/vineet/ikawn-openbrain/src/scheduler.js               — Task scheduler (30s poll)
  /Users/vineet/ikawn-openbrain/src/agents/tech.seed.js        — Tech agent definition
  /Users/vineet/ikawn-openbrain/src/agents/ruhi.seed.js        — Ruhi agent definition
  /Users/vineet/ikawn-openbrain/src/db.js                      — Schema, active_window defaults
  /Users/vineet/ikawn-openbrain/fly.toml                       — Fly config
```

## Secrets Status

| Secret | Lucy (ikawn-openbrain) | Ruhi Brain (ruhi-os-brain) |
|--------|----------------------|--------------------------|
| GOOGLE_AI_API_KEY | Set (AIzaSy...) | Needs setting |
| ANTHROPIC_API_KEY | Set | Set |
| GITHUB_TOKEN | Needs adding | N/A |
| ENABLE_DEPLOY_TOOLS | Not set (default: false) | N/A |
| Code version | v2.7.1 (5948d0a) | v2.7.0 (old) |
