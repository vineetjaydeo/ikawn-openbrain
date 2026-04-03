# Session Handoff — 2026-04-03: Embedding Fix & Chat Safety

## What Was Done (commit 5948d0a, pushed to main)

### 1. Google AI Embedding Fix
- **Problem**: `GOOGLE_AI_API_KEY` on Lucy was wrong format (OAuth token, not AI Studio key). All embeddings failing with 401 for ~24hrs.
- **Then**: Model `text-embedding-004` deprecated/removed from Google API. Switched to `gemini-embedding-001` (3072-dim).
- **Result**: 6,526/6,900 memories re-embedded. RAG operational again.
- **Key**: `AIzaSyDrVKaK3oDOjQdFcx5bS8jM2RPKPcwv4ZE` set on Lucy. Ruhi Brain (`ruhi-os-brain`) still needs this key + deploy.

**Files changed:**
- `/Users/vineet/ikawn-openbrain/src/embeddings.js` — model `text-embedding-004` → `gemini-embedding-001`
- `/Users/vineet/ikawn-openbrain/src/workers/embedding-worker.js` — same model name fix (line 17)

### 2. Chat Tool Tier Filtering (Security Fix)
- **Problem**: All 18 tools (including `bash_exec`, `deploy_openbrain`, `code_write`) were exposed to user chat. Any user could potentially trick Claude into running shell commands.
- **Fix**: Chat path now filters to `tier: 'direct'` tools only. Agent-tier tools restricted to executor.
- **Direct tools** (safe for chat): `system_status`, `fly_status`, `ga_report`, `brand_analysis`, `calendar_read`, `gmail_read`, `create_user_task`, `manage_task`, `notify`, `search_memory`
- **Agent tools** (executor only): `code_read`, `code_write`, `code_edit`, `bash_exec`, `deploy_openbrain`, `content_draft`, `ikawn_generate`, `automation`, `gmail_draft`

**File changed:**
- `/Users/vineet/ikawn-openbrain/src/routes/chat-api.js` — lines 593-598: `getTools()` filtered by `tool.tier !== 'agent'`

### 3. New `search_memory` Tool
- **Problem**: Lucy had passive RAG injection (system prompt) but no active memory search tool. When RAG was empty, Claude said "let me search memory" but had no tool to do it.
- **Fix**: New tool `search_memory` (tier: `direct`) wraps `recall()`. Available in both chat and executor paths.

**File created:**
- `/Users/vineet/ikawn-openbrain/src/tools/recall.tool.js` — 40 lines, parameters: `query` (required), `limit` (optional)

### 4. Title Generation Model Fix
- **Problem**: Auto-title for first message called `chatCompletion` with `gpt-4o-mini` — but `chatCompletion` now routes to Gemini, which doesn't understand that model name.
- **Fix**: Changed to `gemini-2.5-flash`.

**File changed:**
- `/Users/vineet/ikawn-openbrain/src/routes/chat-api.js` — line 910: `'gpt-4o-mini'` → `'gemini-2.5-flash'`

### 5. Feature Flag Gating for Code Tools
- **Problem**: Code tools had no feature flag check — always enabled.
- **Fix**: `executeSingleTool()` now checks `feature('CODE_TOOLS')` for code tools and `feature('DEPLOY_TOOLS')` for deploy tool before permission check.
- `CODE_TOOLS` default: `true` (enabled). `DEPLOY_TOOLS` default: `false` (disabled).
- Override via env: `ENABLE_CODE_TOOLS=false` or `ENABLE_DEPLOY_TOOLS=true`

**File changed:**
- `/Users/vineet/ikawn-openbrain/src/agent/executor.js` — lines 7 (import features), 39-47 (feature flag checks)

### 6. Executor Config Overrides
- **Problem**: `MAX_TOKENS=30K` and `MAX_TOOL_ROUNDS=5` too tight for coding tasks. Haiku used all 5 rounds without completing.
- **Fix**: Defaults bumped to 50K tokens, 10 rounds. Tasks can override via config JSON: `config.max_tokens`, `config.max_tool_rounds`.

**File changed:**
- `/Users/vineet/ikawn-openbrain/src/agent/executor.js`:
  - Line 12: `MAX_TOOL_ROUNDS = 10` (was 5)
  - Line 13: `MAX_TOKENS = 50_000` (was 30,000)
  - Line 185: reads `task.config.max_tool_rounds`
  - Line 205: reads `task.config.max_tokens`

---

## Deployed To

- **Lucy** (`ikawn-openbrain`): v2.7.1, commit 5948d0a, 3 deploys during session
- **Ruhi Brain** (`ruhi-os-brain`): **NOT deployed** — per V's instruction. Needs deploy + GOOGLE_AI_API_KEY secret set.

---

## Known Issues / Incomplete

### Empty Content Embeddings
- Some memories have empty `content` → Google API returns 400 "empty Part"
- ~5 memories permanently failed. Need to add content check in embedding worker before calling API.
- Fix: in `embedding-worker.js`, skip rows where `content` is null/empty/whitespace-only

### Active Window DB Defaults
- `scheduled_tasks` table has DEFAULT values: `active_window_start = '07:00'`, `active_window_end = '19:00'`
- Every new task silently gets IST business hours restriction
- One-time tasks created at night get blocked
- Fix options: (a) skip `isInActiveWindow()` for `schedule_type = 'once'`, or (b) remove column defaults in `db.js`

### Self-Coding Loop
- Works mechanically: scheduler → executor → tools → result
- Haiku too round-hungry for multi-step coding (used 10 rounds, $0.08, 90K tokens, didn't finish)
- Sonnet recommended for coding tasks (smarter tool usage, fewer rounds)
- Test task still in DB: uuid `8ecb1c32` (disabled after run)

### DB Machine Health
- `ikawn-openbrain-db` machine went into `error` state during session (3 critical checks)
- Fixed with `flyctl machine restart`. Monitor.

### Stale OpenAI References (Low Priority)
- `src/db.js:212-213` — default model config still says `gpt-4o-mini` / `gpt-4o`
- `src/mcp/server.js:230` — uses `gpt-4o` model string
- `src/agents/tech.seed.js:47`, `src/agents/ruhi.seed.js:47` — persona text references `gpt-5-mini`
- Variable names like `openaiMessages` in chat-api.js — cosmetic, no functional impact

---

## Next Session Priorities

1. **Deploy to Ruhi Brain**:
   ```bash
   ~/.fly/bin/flyctl secrets set "GOOGLE_AI_API_KEY=AIzaSyDrVKaK3oDOjQdFcx5bS8jM2RPKPcwv4ZE" --app ruhi-os-brain
   ~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only
   ```
   Then reset embeddings on `ruhi-os-brain-db` too.

2. **Fix empty content embeddings**: Add guard in `embedding-worker.js`

3. **Fix active_window defaults**: Skip for `once` tasks

4. **Re-test self-coding with Sonnet**: Recreate the namaste task with `config.model = 'claude-sonnet-4-6'`

5. **Verify Lucy chat UX**: Go to ruhi.ikawn.in, start a conversation, confirm RAG returns results and `search_memory` tool works

---

## File Inventory (All Changed Files)

```
Modified:
  src/agent/executor.js              — Feature flags, config overrides, bumped limits
  src/embeddings.js                  — gemini-embedding-001 model name
  src/routes/chat-api.js             — Tier filtering, title model, tool safety
  src/workers/embedding-worker.js    — gemini-embedding-001 model name

Created:
  src/tools/recall.tool.js           — search_memory tool for active recall
  tasks/handoff-2026-04-03-embedding-fix.md — This file

Unchanged but relevant:
  src/utils/features.js              — Feature flag definitions (CODE_TOOLS, DEPLOY_TOOLS)
  src/utils/similarity.js            — CHAT_CONTEXT_THRESHOLD = 0.2
  src/utils/schedule.js              — isInActiveWindow() logic
  src/tools/registry.js              — Tool loading, tier checks, getToolSchemas()
  src/utils/recall.js                — recall() function used by search_memory tool
  src/db.js                          — active_window column defaults (needs fix)
```

## Secrets Status

| Secret | Lucy (ikawn-openbrain) | Ruhi Brain (ruhi-os-brain) |
|--------|----------------------|--------------------------|
| GOOGLE_AI_API_KEY | ✅ Set (AIzaSy...) | ❌ Needs setting |
| ANTHROPIC_API_KEY | ✅ | ✅ |
| Code deployed | ✅ v2.7.1 (5948d0a) | ❌ Still on v2.7.0 |
