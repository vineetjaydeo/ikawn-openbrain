# OpenBrain LCC Power-Up Plan

**Date**: 2026-04-03
**Source**: Leaked Claude Code (LCC) source at `lcc/` — extracted architectural patterns
**Goal**: Make Ruhi smarter, cheaper, and capable of writing + deploying her own code

---

## Why We're Doing This

Claude Code (CC) is a 512K-line production CLI that solves the same core problems OpenBrain
faces: tool orchestration, context management, cost control, and agentic execution. Rather
than reinventing these patterns, we're extracting the battle-tested architecture from CC and
adapting it to OpenBrain's Express/Postgres stack.

**Three outcomes we want:**
1. **Cost savings** — context compression alone could cut 30-50% of token spend on long Ruhi conversations
2. **Speed** — parallel tool execution makes agent tasks 40-60% faster
3. **Self-coding Ruhi** — the big unlock: Ruhi can write code, test it, commit it, and deploy it herself

---

## Task Breakdown

### Phase 1: Immediate Wins (Items 1-3, parallel)

#### 1. Context Compression (`src/services/context-compressor.js`)

**What**: When a Ruhi conversation exceeds a token threshold (~60K), automatically summarize
older messages into a compact context block. Keep recent messages verbatim.

**Why**: Long Ruhi chats send the full history on every message. A 50-message conversation
can burn 100K+ tokens per reply. Compression keeps semantics, drops verbosity.

**LCC reference**: `lcc/src/services/compact/` — uses Claude to summarize prior turns into
a condensed block, preserving key facts and decisions.

**OpenBrain implementation**:
- New utility: `src/utils/context-compressor.js`
- Triggers in `chat-api.js` and `ruhi-chat.js` when message history exceeds threshold
- Uses Haiku (cheapest) to summarize older messages into a `[Context Summary]` block
- Stores compressed summary in `ob_conversations.context_summary` (new column)
- On next message, loads: `[compressed context] + last N raw messages` instead of full history
- Configurable threshold via env: `CONTEXT_COMPRESS_THRESHOLD` (default: 40000 tokens)

**Estimated token savings**: 30-50% on conversations with 20+ messages

---

#### 2. Parallel Tool Execution in Agent Executor

**What**: When Claude returns multiple `tool_use` blocks that are independent, execute them
concurrently with `Promise.all()` instead of the current sequential `for...of` loop.

**Why**: Current executor runs tools one-by-one. If Claude asks to search web + check calendar
+ read email simultaneously, that's 3x the wall-clock time for no reason.

**LCC reference**: `lcc/src/tools/AgentTool/` — sub-agents run in parallel, results collected
and fed back together.

**OpenBrain implementation**:
- Modify `src/agent/executor.js` lines 134-149
- Replace sequential `for (const toolBlock of toolUseBlocks)` with `Promise.allSettled()`
- Each tool still gets its own `withTimeout()` wrapper
- Failed tools don't block successful ones
- Add a concurrency cap (max 5 parallel) to prevent API rate limits
- Log parallel vs sequential execution time for observability

**Estimated speedup**: 40-60% on multi-tool agent tasks

---

#### 3. Real-Time Memory Extraction from Conversations

**What**: After each Ruhi conversation turn, run a lightweight extraction pass to identify
key facts, decisions, and commitments — then auto-capture them as typed memories.

**Why**: Currently `captureMessage()` stores the raw message. The distillation worker
summarizes later, but it's slow and lossy. Real-time extraction catches structured facts
(decisions, commitments, preferences) that RAG can retrieve precisely.

**LCC reference**: `lcc/src/services/extractMemories/` — post-conversation extraction of
important facts into persistent memory.

**OpenBrain implementation**:
- New utility: `src/utils/memory-extractor.js`
- Called async (non-blocking) after every assistant response in `chat-api.js`
- Uses Haiku with a focused prompt: "Extract facts, decisions, commitments from this exchange"
- Returns structured objects: `{ type: 'fact'|'decision'|'commitment', content, confidence }`
- Only captures items with confidence > 0.7
- Routes through `captureMessage()` (the only door) with `memory_type` set correctly
- Skips extraction on trivial messages (greetings, acknowledgments)
- Cost guard: max 500 input tokens for the extraction call (truncate if needed)

---

### Phase 2: Ruhi Coding Abilities (Item 4 — the big one)

#### 4. Code Tools for Ruhi (`code.tool.js` + `bash.tool.js`)

**What**: Give Ruhi the ability to read, write, and edit code files, run shell commands in a
sandboxed environment, and deploy changes — making her a self-improving system.

**Why**: This is the north star. Ruhi should be able to:
- Fix her own bugs when users report them
- Write new tools for herself
- Deploy hotfixes without waiting for V
- Iterate on her own prompts and knowledge base

**LCC reference**: The entire tool system — `BashTool` (with 2,600 lines of validation),
`FileReadTool`, `FileEditTool`, `FileWriteTool`, `GlobTool`, `GrepTool`.

**OpenBrain implementation** (4 new tools):

##### 4a. `code-read.tool.js`
- Read files from the OpenBrain repo (or ikawn-v3 via SSH/API)
- Allowlist of readable directories: `src/`, `docs/`, `tests/`, `package.json`
- Blocklist: `.env`, `node_modules/`, `.git/`, any file with "secret"/"key"/"password"
- Returns file content with line numbers (like CC's FileReadTool)
- Supports partial reads (offset + limit) for large files

##### 4b. `code-write.tool.js`
- Write or overwrite files within allowed directories
- Creates backup before overwrite (`.bak` suffix)
- Validates: no writes to `.env`, `db.js`, `auth.js`, `index.js` (protected files)
- Max file size: 50KB (prevents accidental large writes)
- Returns diff summary after write

##### 4c. `code-edit.tool.js`
- String-replacement editing (like CC's FileEditTool)
- `old_string` → `new_string` replacement
- Must be unique match (fails if ambiguous)
- Same allowlist/blocklist as code-write
- Creates backup before edit
- Returns: lines changed, before/after snippet

##### 4d. `bash.tool.js` (sandboxed)
- Execute shell commands in a restricted environment
- **Allowlist approach** (NOT blocklist — safer):
  - `npm test`, `npm run lint`, `npm run pre-deploy`
  - `git status`, `git diff`, `git log`, `git add`, `git commit`
  - `ls`, `cat`, `head`, `grep`, `wc` (read-only commands)
  - `flyctl deploy`, `flyctl logs`, `flyctl status` (deploy commands)
- **Blocked**: `rm -rf`, `DROP`, `DELETE FROM`, `curl` to external, `ssh`, `eval`, `exec`
- Timeout: 30 seconds per command
- Working directory locked to repo root
- All commands logged to `task_runs` for audit trail

##### 4e. `deploy.tool.js`
- Wraps the full deploy flow: `npm run pre-deploy` → `flyctl deploy`
- Requires all tests to pass before deploy proceeds
- Captures deploy output to memory
- Sends Telegram notification on success/failure
- Only deploys to `ikawn-openbrain` (Lucy) — Ruhi Brain deploy requires V's approval
- Includes version bump logic

**Safety model** (borrowed from LCC's permission system):
- All code tools require `agent.tools` array to include the tool name explicitly
- Protected file list prevents touching critical infrastructure
- Every file change creates a backup
- Every bash command is logged
- Deploy requires pre-deploy gate (tests must pass)
- Cost cap per coding session: $2 max

---

### Phase 3: Supporting Infrastructure (Items 5-6)

#### 5. Feature Flag Utility

- `src/utils/features.js` — centralized `feature(name)` function
- Reads from env vars, defaults in code
- Flags: `CONTEXT_COMPRESSION`, `PARALLEL_TOOLS`, `MEMORY_EXTRACTION`, `CODE_TOOLS`, `BRAND_API`
- Clean gating for Lucy-only vs Ruhi-only features

#### 6. Tool Permission Model

- Extend tool definitions with `permissions`, `costTier`, `requiresApproval` fields
- Permission check in executor before tool execution
- Important for multi-tenant: Brand X's agent can't use deploy tools
- Audit log for all tool executions with cost tracking

---

## Done When

- [ ] Context compression live, cutting 30%+ tokens on long conversations
- [ ] Agent executor runs independent tools in parallel
- [ ] Memory extraction capturing facts/decisions from conversations
- [ ] Ruhi can read, write, edit code files within safety boundaries
- [ ] Ruhi can run tests and deploy (with pre-deploy gate)
- [ ] All changes tested, no regressions
