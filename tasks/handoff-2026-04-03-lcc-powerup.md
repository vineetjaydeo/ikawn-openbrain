# Session Handoff — 2026-04-03: LCC Power-Up

## What Was Done

### Source Material
- Cloned leaked Claude Code source (https://github.com/tanbiralam/claude-code.git) into `lcc/` directory
- Analyzed 512K lines of CC's TypeScript architecture to extract patterns for OpenBrain
- `lcc/` is gitignored — reference only, not committed

### Features Built (v2.7.0, commit 19320b7)

**1. Context Compression** (`src/utils/context-compressor.js`)
- Compresses older messages in long conversations using Haiku
- Integrated into `chat-api.js` — triggers when history exceeds ~40K tokens
- Stores compressed summary in `conversations.compressed_at` column (added via ALTER TABLE in `db.js`)
- Keeps last 8 messages verbatim, summarizes the rest
- 10 tests in `tests/unit/context-compressor.test.js`

**2. Parallel Tool Execution** (`src/agent/executor.js`)
- Replaced sequential `for` loop with `Promise.allSettled()` in batches of 5
- Exported: `executeSingleTool()`, `executeToolsParallel()`
- Single-tool optimization (skips parallel overhead for 1 tool)
- 5 tests in `tests/unit/parallel-executor.test.js`

**3. Real-Time Memory Extraction** (`src/utils/memory-extractor.js`)
- Extracts facts/decisions/commitments from each conversation turn using Haiku
- Fire-and-forget integration in `chat-api.js` (never blocks response)
- Filters by confidence > 0.7, truncates input to 2000 chars
- Updated `captureMessage()` in `src/utils/capture.js` to accept `memory_type` parameter
- 10 tests in `tests/unit/memory-extractor.test.js`

**4. Ruhi Coding Tools** (5 new files in `src/tools/`)
- `code-read.tool.js` — Read files with line numbers, offset/limit, allowlist/blocklist
- `code-write.tool.js` — Write/create files with auto-backup, max 50KB
- `code-edit.tool.js` — String replacement editing with ambiguity detection
- `bash.tool.js` — Allowlisted shell commands (63 validation tests)
- `deploy.tool.js` — Full deploy flow: pre-deploy gate → fly deploy → verify → notify
- Allowlist dirs: `src/tools/`, `src/utils/`, `src/skills/`, `src/workers/`, `src/connectors/`, `docs/`, `tests/`
- Protected files: `db.js`, `auth.js`, `index.js`, `package.json`, `.env`
- All tools are `tier: 'agent'` — only callable via executor, not direct chat
- Wired into `ruhi.seed.js` and `tech.seed.js` agent definitions
- 14 + 11 + 10 + 63 + 10 = 108 tests across 5 test files

**5. Feature Flags** (`src/utils/features.js`)
- 10 flags: CONTEXT_COMPRESSION, PARALLEL_TOOLS, MEMORY_EXTRACTION, CODE_TOOLS, DEPLOY_TOOLS, AGENT_PLATFORM, MISSION_CONTROL, BRAND_API, ACTIVEPIECES, COST_DASHBOARD
- Env var overrides, caching, `getAllFeatures()` for admin UI
- 9 tests in `tests/unit/features.test.js`

**6. Tool Permission Model** (`src/tools/registry.js`)
- Added `checkToolPermission(toolName, context)` and `getToolCostTier(toolName)`
- 4 tiers: low/medium/high/critical
- Internal (ikawn) gets full access, external brands blocked from high/critical
- Integrated into `executeSingleTool()` in executor — checks before execution
- 13 tests in `tests/unit/tool-permissions.test.js`

**7. OpenAI → Claude + Gemini Migration**
- `src/embeddings.js` — Google `text-embedding-004` (768-dim) replaces OpenAI `text-embedding-3-small` (1536-dim)
- `src/workers/embedding-worker.js` — Google batch/individual embedding calls
- `src/agent/llm-client.js` — `callGeminiFallback()` replaces `callOpenAIFallback()`, model override support via `params.model`
- `src/utils/llm.js` — All OpenAI chat calls replaced with Gemini
- `src/workers/moderation-worker.js` — Claude Haiku replaces OpenAI Moderation API
- `src/routes/chat-api.js`, `ruhi-chat.js` — Gemini fallback
- Added `@google/generative-ai` dependency
- Still uses OpenAI for: Whisper (telegram speech-to-text), admin costs dashboard

**8. Other Changes**
- `src/scheduler.js` — Added debug logging for task scheduler (found/executing/skipping)
- `src/tools/notify.tool.js` — Telegram message chunking (splits at 4000 chars)
- `src/agent/executor.js` — MAX_TOKENS reduced 200K→30K, MAX_TOOL_ROUNDS 10→5, task config model override
- `src/agents/ruhi.seed.js` — Added CODE TOOLS and TASK COMPLETION persona sections
- `src/agents/tech.seed.js` — Added CODE TOOLS persona section

### Deployed
- **Lucy** (ikawn-openbrain): v2.7.0 deployed, version 419+
- **Ruhi Brain** (ruhi-os-brain): NOT deployed — only secrets set. Needs `flyctl deploy --app ruhi-os-brain --remote-only`
- **GOOGLE_AI_API_KEY** set on both apps

### Scheduled Tasks
- **Daily Intelligence Briefing** (task id=5, uuid=787578a2): Cron `30 0 * * *` (6:00 AM IST daily)
  - Agent: ruhi, model: claude-haiku-4-5-20251001
  - Content: US/Iran + India impact + eCommerce AI + action items
  - Sends Telegram, active_window cleared (runs anytime)
  - Has run successfully at $0.047/run

---

## Known Issues / Incomplete

### Embedding Dimension Mismatch
- Old memories: 1536-dim (OpenAI), new memories: 768-dim (Google)
- Cosine similarity between mixed dimensions returns garbage → old memories effectively invisible
- **Fix**: Run `UPDATE memories SET embedding_status = 'pending' WHERE embedding IS NOT NULL;` to re-embed everything
- Do this AFTER confirming Google embeddings work (check logs for successful embedding)

### Lucy Chat UX — "Stuck" Behavior
- User reported Lucy says "let me pull from our full memory" but never does
- Root cause: OpenAI 429 was killing RAG. Now migrated to Google embeddings — should fix itself
- If still happens after re-embedding, investigate `chat-api.js` tool_use loop for the `system_status` and memory tools

### Ruhi Brain Not Deployed
- Code changes NOT deployed to `ruhi-os-brain` yet
- Run: `~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only`
- This will affect os.ikawn.com/ruhi — test on Lucy first

### Feature Flags Not Wired
- `features.js` exists but nothing reads it yet
- The context compressor, memory extractor, and code tools don't check `feature('CODE_TOOLS')` before executing
- Low priority — everything is enabled by default

### Tests
- **198 tests, 20 files, all passing**
- Some test files created by parallel agents may have slightly different mock patterns

---

## Next Session Priorities

1. **Re-embed old memories** — flip embedding_status to pending, verify Google embeddings work
2. **Deploy to Ruhi Brain** — after Lucy is confirmed stable
3. **Lucy chat UX** — investigate the "stuck" behavior if it persists after embedding fix
4. **Self-improvement loop test** — Create a Mission Control task for Tech agent: "Read src/routes/chat-api.js, find the greeting pattern, add 'namaste', run tests, deploy"
5. **Wire feature flags** — gate code tools behind `feature('CODE_TOOLS')` for production safety

---

## File Inventory (New Files)

```
src/tools/bash.tool.js           — Allowlisted shell execution
src/tools/code-edit.tool.js      — String replacement editing
src/tools/code-read.tool.js      — File reading with line numbers
src/tools/code-write.tool.js     — File creation/overwrite with backup
src/tools/deploy.tool.js         — Fly deploy with pre-deploy gate
src/utils/context-compressor.js  — Conversation history compression
src/utils/features.js            — Feature flag utility
src/utils/memory-extractor.js    — Real-time fact extraction
tasks/lcc-powerup-plan.md        — Full plan document
tests/unit/bash-tool.test.js
tests/unit/code-edit-tool.test.js
tests/unit/code-read-tool.test.js
tests/unit/code-write-tool.test.js
tests/unit/context-compressor.test.js
tests/unit/deploy-tool.test.js
tests/unit/features.test.js
tests/unit/memory-extractor.test.js
tests/unit/parallel-executor.test.js
tests/unit/tool-permissions.test.js
```
