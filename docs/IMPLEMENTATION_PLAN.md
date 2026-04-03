# Lucy v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Transform OpenBrain into Lucy v3 — an autonomous intelligence engine that runs iKawn with HOTL gates, then becomes Ruhi SaaS.

**Architecture:** See docs/ARCHITECTURE.md for full blueprint. Five pillars: Reasoning Loop, Memory System, Tool Framework, Agent Orchestration, HOTL Engine.

**Tech Stack:** Node.js/Express, Supabase (PostgreSQL + pgvector), Claude API (Anthropic SDK), Google text-embedding-004, Fly.io, Telegram Bot API

**Architecture Learning Directive:** All code is original. Never copy from external codebases. Study patterns, understand principles, write from scratch using iKawn naming conventions. See ARCHITECTURE.md Section 5 for full rules.

**Existing Codebase Reference:**
```
src/index.js              — Express app entry, middleware, route mounting
src/db.js                 — Postgres pool, schema init, table creation
src/auth.js               — requireAuth, requireAdmin, requireBrand, requireAuthOrApiKey
src/embeddings.js         — getEmbedding() for search queries
src/scheduler.js          — Cron: GitHub (30min), Calendar (2hr), retention (nightly)
src/agent/executor.js     — Basic agent execution (scheduled tasks)
src/agent/llm-client.js   — LLM API wrapper
src/agents/*.seed.js      — 10 agent definitions + seed-all.js
src/tools/registry.js     — Tool registry (19 tools)
src/tools/*.tool.js       — Individual tool implementations (19 files)
src/routes/*.js           — 32 route files
src/workers/*.js          — 9 background workers
src/utils/*.js            — 21 utility modules (capture.js, recall.js, llm.js, telegram.js, etc.)
src/ruhi/persona.js       — Ruhi system prompt builder
src/connectors/           — github.js, gcal.js, telegram.js
tests/                    — 41 existing tests
```

---

## Timeline Overview

| Week | Phase | Goal |
|------|-------|------|
| 1 | 0A — Supabase Setup & Write Path Audit | Supabase provisioned, full schema, all write paths cataloged |
| 2 | 0B — Dual-Write & Migration | OpenBrain runs on Supabase with zero data loss |
| 3 | 1A — Reasoning Loop Core | Working multi-turn reasoning loop with tool calls and cost tracking |
| 4 | 1B — Reasoning Loop Integration | Loop powers web chat with SSE streaming and context compression |
| 5 | 2 — Tool Framework v2 | Standardized envelopes, retries, permission enforcement on all tools |
| 6 | 3A — Agent Orchestration Core | Sub-agents spawn as background tasks with isolated tool scopes |
| 7 | 3B + 4A — Orchestration Wiring + HOTL Core | Scheduler wired, HOTL suspend/resume via Telegram |
| 8 | 4B + 5 — Trust System + Memory v2 | Trust auto-promotion, episodic/semantic memory, pgvector search |
| 9-10 | 6 — Lucy Operator + Burn-in | Lucy operates iKawn autonomously, 14-day burn-in |

---

## Week 1: Phase 0A — Supabase Setup & Write Path Audit

**Goal: By end of this week, Supabase is provisioned with full schema and we have a complete map of every write path in OpenBrain.**

---

### Task 0.1: Audit all write paths in OpenBrain (3h)

- [ ] Grep every INSERT, UPDATE, DELETE, and upsert across all `src/` files
- [ ] For each write path, document: file path, line number, table affected, trigger (HTTP route / worker / scheduler / internal call)
- [ ] Group by table — this becomes the dual-write checklist
- [ ] Flag any write paths that use raw SQL strings vs parameterized queries
- [ ] Count total unique write paths and confirm grep count matches documented entries

**Files:** Create `docs/WRITE_PATH_AUDIT.md`
**Behavior:** A comprehensive catalog of every database mutation in the codebase. Each entry contains the source file, approximate line, the SQL operation type, the target table, and what triggers the write (e.g., "POST /capture route", "embedding-worker batch update", "scheduler retention cleanup"). Entries grouped by table with a count summary at the end.
**Dependencies:** None
**Verification:**
```bash
grep -rn "INSERT\|UPDATE\|DELETE\|upsert" src/ --include="*.js" | wc -l
# Compare this count against the audit document entry count — they must match
```
**Hours:** 3

---

### Task 0.2: Provision Supabase project (1h)

- [ ] Create Supabase project in Singapore region (ap-southeast-1) on Pro plan
- [ ] Enable the `vector` extension via SQL editor: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] Note down the following connection strings and store securely:
  - Direct connection string (for migrations)
  - Pooled connection string (for application use via Supavisor)
  - Service role key (for admin operations)
  - Anon key (for RLS-gated access, future use)
- [ ] Verify dashboard is accessible and vector extension is active
- [ ] Test connection from local machine using `psql`

**Files:** Update `docs/ARCHITECTURE.md` appendix with connection details (redacted in repo — actual values as Fly secrets only)
**Behavior:** A live Supabase project in Singapore with pgvector enabled, ready to receive schema. No application code changes yet.
**Dependencies:** None
**Verification:**
```bash
# Connect to Supabase and verify pgvector
psql "$SUPABASE_DIRECT_URL" -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
# Should return: vector
```
**Hours:** 1

---

### Task 0.3: Create migration script for existing tables (3h)

- [ ] Write a migration SQL file that creates all existing OpenBrain tables on Supabase with their current schema
- [ ] Tables to migrate: `users`, `brands`, `brand_users`, `api_keys`, `api_key_usage`, `conversations`, `messages`, `memories`, `distilled_memory`, `scheduled_tasks`, `task_runs`, `domain_agents`, `flow_versions`
- [ ] Add new columns to existing tables as specified in ARCHITECTURE.md Section 3A:
  - `users`: add `trust_config JSONB DEFAULT '{}'`
  - `brands`: add `autonomy_budget JSONB DEFAULT '{}'`, `supabase_project_id TEXT`
  - `conversations`: add `session_id UUID`, `working_memory JSONB DEFAULT '{}'`
  - `messages`: add `compressed BOOLEAN DEFAULT false`, `token_count INTEGER`
- [ ] Preserve all existing indexes and constraints
- [ ] Add IF NOT EXISTS guards on all CREATE TABLE and ALTER TABLE statements
- [ ] Test migration script runs cleanly on empty Supabase project

**Files:** Create `src/db/migrations/001_existing_tables.sql`
**Behavior:** A standalone SQL file that, when run against the empty Supabase database, creates every table that currently exists in Fly Postgres — with the additional columns needed for Lucy v3. Does not create the new Lucy v3 tables (that is Task 0.4). Idempotent — safe to run multiple times.
**Dependencies:** Task 0.2 (Supabase project exists)
**Verification:**
```bash
# Run migration
psql "$SUPABASE_DIRECT_URL" -f src/db/migrations/001_existing_tables.sql

# Verify all tables exist
psql "$SUPABASE_DIRECT_URL" -c "\dt"
# Should list all 14 tables

# Verify new columns
psql "$SUPABASE_DIRECT_URL" -c "\d users" | grep trust_config
psql "$SUPABASE_DIRECT_URL" -c "\d conversations" | grep session_id
```
**Hours:** 3

---

### Task 0.4: Create new Lucy v3 tables on Supabase (4h)

- [ ] Create all new tables from ARCHITECTURE.md Section 3A:
  - `sessions` — with all columns, CHECK constraints, and 3 indexes (brand_status, parent, resume)
  - `episodic_memories` — with vector(768) column, 4 indexes including ivfflat on embedding
  - `semantic_knowledge` — with vector(768), superseded_by self-reference, 3 indexes
  - `task_queue` — with CHECK constraints on task_type/priority/status, 2 indexes
  - `task_executions` — with parent_execution self-reference, 3 indexes
  - `approval_requests` — with permission_tier/status CHECKs, 2 indexes
  - `trust_ledger` — with outcome CHECK, 1 compound index
  - `trust_scores` — composite primary key (brand_id, domain), tier CHECK
  - `tool_results` — with status CHECK, 1 index
  - `cost_events` — with event_type CHECK, 3 indexes
- [ ] All foreign key references must match actual referenced tables
- [ ] All indexes must be created with exact specifications from ARCHITECTURE.md
- [ ] ivfflat indexes require `WITH (lists = 100)` as specified
- [ ] Test all CHECK constraints reject invalid values

**Files:** Create `src/db/migrations/002_lucy_v3_tables.sql`
**Behavior:** A SQL migration file that creates all 10 new Lucy v3 tables with every column, constraint, index, and default value exactly as specified in the ARCHITECTURE.md data model. Idempotent with IF NOT EXISTS guards. The ivfflat indexes for vector columns are created with 100 lists. All self-referencing foreign keys (semantic_knowledge.superseded_by, task_executions.parent_execution, sessions.parent_session) use proper syntax.
**Dependencies:** Task 0.2 (Supabase with pgvector enabled)
**Verification:**
```bash
# Run migration
psql "$SUPABASE_DIRECT_URL" -f src/db/migrations/002_lucy_v3_tables.sql

# Verify all 10 new tables exist
psql "$SUPABASE_DIRECT_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('sessions','episodic_memories','semantic_knowledge','task_queue','task_executions','approval_requests','trust_ledger','trust_scores','tool_results','cost_events');"
# Should return 10 rows

# Verify vector columns
psql "$SUPABASE_DIRECT_URL" -c "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'episodic_memories' AND column_name = 'embedding';"

# Verify CHECK constraints reject bad data
psql "$SUPABASE_DIRECT_URL" -c "INSERT INTO sessions (brand_id, channel, status, model_tier, dollar_cap) VALUES ('test', 'invalid_channel', 'active', 'fast', 1.0);"
# Should fail with CHECK violation
```
**Hours:** 4

---

### Task 0.5: Rename domain_agents to agent_definitions (2h)

- [ ] Create migration that renames `domain_agents` table to `agent_definitions`
- [ ] Add new columns: `tool_scope TEXT[]`, `token_budget INTEGER`, `dollar_cap NUMERIC(10,4)`
- [ ] Grep entire codebase for `domain_agents` references
- [ ] Update every reference in application code to use `agent_definitions`
- [ ] Update agent seed files (`src/agents/*.seed.js`, `src/agents/seed-all.js`) to use new table name
- [ ] Update any route files that query `domain_agents` (likely `mission-control.js`, `intelligence.js`)
- [ ] Update any utility files that reference the old table name
- [ ] Ensure the rename works on both Fly PG (current) and Supabase (new)

**Files:** Create `src/db/migrations/003_rename_domain_agents.sql`. Modify: `src/agents/seed-all.js`, `src/agents/*.seed.js` (all 10), `src/routes/mission-control.js`, `src/routes/intelligence.js`, `src/agent/executor.js`, and any other files found by grep.
**Behavior:** The `domain_agents` table is renamed to `agent_definitions` everywhere — in the database schema and in all application code that references it. The three new columns are added with sensible defaults (tool_scope defaults to empty array, token_budget defaults to 200000, dollar_cap defaults to 2.0000). All existing agent seeds continue to work with the new table name.
**Dependencies:** None (can run on current Fly PG too)
**Verification:**
```bash
# Check no remaining references to old table name in code
grep -rn "domain_agents" src/ --include="*.js" | wc -l
# Should return 0

# Run existing tests
npm test
# All 41 tests should pass

# Verify table exists with new name (on whichever DB is active)
# psql -c "\d agent_definitions"
# Should show all columns including new ones
```
**Hours:** 2

---

## Week 2: Phase 0B — Dual-Write & Migration

**Goal: By end of this week, OpenBrain runs on Supabase with zero data loss. Fly PG is read-only backup.**

---

### Task 0.6: Implement dual-write layer (4h)

- [ ] Create a new database abstraction module that wraps all write operations
- [ ] The module maintains two connection pools: Supabase (primary) and Fly PG (secondary)
- [ ] On every write: execute on Supabase first. If Supabase fails, reject the write entirely (do NOT fall back to Fly PG alone)
- [ ] If Supabase succeeds, execute on Fly PG as best-effort (log failure but don't reject)
- [ ] Read operations go to Supabase only (single source of truth)
- [ ] Provide a `query()` function matching the existing `db.query()` interface so callers don't change
- [ ] Add a feature flag `DUAL_WRITE_ENABLED` — when false, writes go only to the primary DB (set by DATABASE_URL)
- [ ] Log every dual-write failure to console with table name and operation type
- [ ] Connection pools use the pooled Supabase URL (via Supavisor) for application queries

**Files:** Create `src/db/dual-write.js`. Modify `src/db.js` to import and delegate to dual-write when flag is set.
**Behavior:** A transparent write-amplification layer. From the perspective of every route, worker, and utility, they still call `db.query()`. Internally, writes are sent to Supabase first, then mirrored to Fly PG. Reads go to Supabase only. The module detects write operations by checking if the SQL starts with INSERT, UPDATE, DELETE, or contains RETURNING (for upserts). Everything else is treated as a read. Feature-flagged so it can be turned on/off via environment variable.
**Dependencies:** Task 0.2 (Supabase provisioned), Task 0.3 + 0.4 (schema exists on Supabase)
**Verification:**
```bash
# Set DUAL_WRITE_ENABLED=true and SUPABASE_URL in .env
# Start the app locally
npm run dev

# Create a test memory via API
curl -X POST http://localhost:3000/capture -H "X-Api-Key: $API_KEY" -d '{"content":"dual write test","source":"test"}'

# Verify data exists in both databases
psql "$SUPABASE_DIRECT_URL" -c "SELECT content FROM memories WHERE content = 'dual write test';"
psql "$FLY_DATABASE_URL" -c "SELECT content FROM memories WHERE content = 'dual write test';"
# Both should return the row
```
**Hours:** 4

---

### Task 0.7: Wire dual-write into all write paths from audit (4h)

- [ ] Open `docs/WRITE_PATH_AUDIT.md` from Task 0.1
- [ ] Go through every cataloged write path
- [ ] Verify each write path flows through `db.query()` (and therefore through dual-write)
- [ ] Identify any write paths that bypass `db.query()` (e.g., direct pool access, raw client calls)
- [ ] Fix any bypasses to route through `db.query()`
- [ ] For each critical write path, add a brief integration test or manual test confirming dual-write works
- [ ] Critical paths that MUST be tested:
  - `captureMessage()` in `src/utils/capture.js` — the single door for memories
  - Chat message creation in `src/routes/chat-api.js`
  - Conversation CRUD in `src/routes/chat-api.js`
  - User creation/update in `src/routes/admin-api.js` and `src/routes/auth-routes.js`
  - Embedding updates in `src/workers/embedding-worker.js`
  - Scheduled task updates in `src/scheduler.js`
  - Agent seed operations in `src/agents/seed-all.js`
- [ ] Mark each audit entry as "verified" in the audit document

**Files:** Modify any files where writes bypass `db.query()`. Update `docs/WRITE_PATH_AUDIT.md` with verification status.
**Behavior:** After this task, every database mutation in the entire codebase flows through the dual-write layer. No write path is missed. The audit document serves as the verification checklist, with each entry marked as confirmed.
**Dependencies:** Task 0.1 (audit complete), Task 0.6 (dual-write layer exists)
**Verification:**
```bash
# Search for any remaining direct pool usage that bypasses db.query
grep -rn "pool\.\(query\|connect\)" src/ --include="*.js" | grep -v "db.js" | grep -v "dual-write.js" | grep -v "node_modules"
# Should return 0 results (all pool access consolidated in db.js)

# Run full test suite
npm test
# All tests pass
```
**Hours:** 4

---

### Task 0.8: Backfill existing data to Supabase (3h)

- [ ] Write a migration script that exports data from Fly PG and imports to Supabase
- [ ] Use `pg_dump` with `--data-only --format=plain` for each table
- [ ] Transform any incompatible data formats (e.g., float8[] embeddings need to become vector(768) — these will be re-embedded separately in Task 0.9, so skip embedding columns)
- [ ] Handle foreign key ordering: users first, then brands, then brand_users, then conversations, then messages, etc.
- [ ] Disable foreign key checks during import, re-enable after
- [ ] Write a reconciliation script that compares row counts per table between both databases
- [ ] Run reconciliation and fix any discrepancies
- [ ] Handle the `memories` table specially — data goes into both `memories` (for backward compat during dual-write) and will be migrated to `episodic_memories` later (Phase 5)

**Files:** Create `scripts/backfill-supabase.sh` (orchestration), create `scripts/reconcile-counts.sh` (verification)
**Behavior:** A repeatable migration pipeline. The orchestration script connects to Fly PG, exports each table's data in dependency order, transforms where needed, and imports into Supabase. The reconciliation script connects to both databases and compares row counts for every table, outputting a pass/fail report. Can be run multiple times safely (uses UPSERT or DELETE+INSERT pattern).
**Dependencies:** Task 0.3 + 0.4 (Supabase schema exists), Task 0.6 (dual-write ready to enable after backfill)
**Verification:**
```bash
# Run backfill
bash scripts/backfill-supabase.sh

# Run reconciliation
bash scripts/reconcile-counts.sh
# Should output: "All tables match. 0 discrepancies."

# Spot-check a specific record
psql "$SUPABASE_DIRECT_URL" -c "SELECT COUNT(*) FROM conversations;"
psql "$FLY_DATABASE_URL" -c "SELECT COUNT(*) FROM conversations;"
# Counts must match
```
**Hours:** 3

---

### Task 0.9: Re-embed all memories to 768-dim (3h)

- [ ] In Supabase, mark all existing memory rows as needing re-embedding (set embedding column to NULL or add a `needs_reembedding BOOLEAN DEFAULT true` flag)
- [ ] Modify `src/workers/embedding-worker.js` to detect when running against Supabase:
  - Use Google `text-embedding-004` (768-dim) instead of OpenAI `text-embedding-3-small`
  - Write embeddings as `vector(768)` type using pgvector INSERT syntax
  - Batch size: 100 texts per API call (Google's limit)
  - Rate limit: 1500 RPM (stay under Google's free tier ceiling)
- [ ] The worker processes pending embeddings in batches, updating the vector column
- [ ] Monitor progress: log count of remaining un-embedded rows every 50 batches
- [ ] Handle Google API errors gracefully — retry with exponential backoff, skip permanently failing rows after 3 attempts
- [ ] Once all rows are embedded, remove the re-embedding flag

**Files:** Modify `src/workers/embedding-worker.js`, modify `src/embeddings.js` (if it hardcodes OpenAI embedding model)
**Behavior:** The embedding worker detects the database type and uses the appropriate embedding model and format. For Supabase/pgvector, it uses Google text-embedding-004 producing 768-dimensional vectors stored as the native `vector(768)` type. The worker processes all existing memories that lack embeddings, working through them in batches with rate limiting. Progress is logged. No existing embeddings in Fly PG are modified.
**Dependencies:** Task 0.8 (data exists in Supabase)
**Verification:**
```bash
# Check embedding progress on Supabase
psql "$SUPABASE_DIRECT_URL" -c "SELECT COUNT(*) as total, COUNT(embedding) as embedded FROM memories;"
# total and embedded should match when complete

# Verify embedding dimension
psql "$SUPABASE_DIRECT_URL" -c "SELECT vector_dims(embedding) FROM memories WHERE embedding IS NOT NULL LIMIT 1;"
# Should return: 768

# Test vector search works
psql "$SUPABASE_DIRECT_URL" -c "SELECT id, content FROM memories WHERE embedding IS NOT NULL ORDER BY embedding <=> (SELECT embedding FROM memories WHERE embedding IS NOT NULL LIMIT 1) LIMIT 5;"
# Should return 5 similar memories
```
**Hours:** 3

---

### Task 0.10: Switchover to Supabase (2h)

- [ ] Disable dual-write (set `DUAL_WRITE_ENABLED=false`)
- [ ] Update `DATABASE_URL` on Fly to point to Supabase pooled connection string
- [ ] Update `DATABASE_DIRECT_URL` on Fly to point to Supabase direct connection string (for migrations)
- [ ] Deploy to Fly
- [ ] Test all critical features:
  - Web chat: create conversation, send message, receive streaming response
  - Telegram: send message, receive reply
  - Search: vector search returns results
  - Brain Health dashboard loads
  - Mission Control loads
  - Workers: embedding worker processes new memories
- [ ] Set Fly PG to read-only (revoke write permissions for the application user)
- [ ] Document rollback procedure: how to revert DATABASE_URL to Fly PG in under 5 minutes
- [ ] Schedule Fly PG decommission for 7 days from switchover

**Files:** Modify Fly secrets (via `flyctl secrets set`). Create `docs/ROLLBACK_PROCEDURE.md`.
**Behavior:** The application now reads and writes exclusively to Supabase. Fly PG is kept alive but read-only as a safety net. If any issues are detected within 7 days, the rollback procedure reverses the change. The rollback document specifies exact commands to run, expected time to execute, and verification steps post-rollback.
**Dependencies:** Task 0.7 (all write paths verified), Task 0.8 (data backfilled), Task 0.9 (embeddings complete)
**Verification:**
```bash
# Deploy
cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only

# Check logs for any DB errors
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | head -50

# Test web chat
curl https://ruhi.ikawn.in/api/health
# Should return 200

# Test search
curl "https://ruhi.ikawn.in/search?q=test" -H "X-Api-Key: $API_KEY"
# Should return results from Supabase

# Verify Fly PG is read-only
psql "$FLY_DATABASE_URL" -c "INSERT INTO memories (content, source) VALUES ('should fail', 'test');"
# Should fail with permission denied
```
**Hours:** 2

---

### Task 0.11: Create RLS design doc placeholder (1h)

- [ ] Create a structured document outlining the RLS strategy for when multi-tenant Ruhi SaaS ships
- [ ] Document which tables need RLS policies
- [ ] For each table, describe the isolation rule (e.g., "users can only see rows where brand_id matches their JWT claim")
- [ ] Note that RLS is NOT implemented yet — this is a design document for a future phase
- [ ] Flag the service role bypass pattern: backend uses service role key to skip RLS for admin operations
- [ ] Describe the testing strategy: how to verify RLS policies work correctly

**Files:** Create `docs/RLS_DESIGN.md`
**Behavior:** A design document (not implementation) that maps out Row Level Security policies for every table. Each entry specifies: table name, the SELECT/INSERT/UPDATE/DELETE policies, the JWT claim used for filtering, and edge cases. Clearly marked as "DESIGN ONLY — not yet implemented" at the top.
**Dependencies:** Task 0.4 (tables exist to reference)
**Verification:**
```bash
# Document exists and has content
wc -l docs/RLS_DESIGN.md
# Should be 50+ lines with substantive content for each table
```
**Hours:** 1

---

## Week 3: Phase 1A — Reasoning Loop Core

**Goal: By end of this week, Lucy has a working multi-turn reasoning loop that can call tools and track costs.**

---

### Task 1.1: Create reasoning loop core (4h)

- [ ] Build the central multi-turn LLM conversation engine
- [ ] The loop takes a session configuration object containing: model_tier, available tools (as Claude tool definitions), system_prompt, dollar_cap, and existing message history
- [ ] Loop cycle: send messages to Claude API → check response for tool_use content blocks → if tool_use found, execute each tool → append tool results as tool_result messages → send back to Claude → repeat
- [ ] Loop terminates when: Claude responds with only text (no tool_use), OR dollar cap is hit, OR max iterations reached (configurable, default 25 turns)
- [ ] On dollar cap hit: throw a `BudgetExceededError` with cost breakdown
- [ ] On max iterations: return last response with metadata indicating truncation
- [ ] The loop does NOT handle streaming yet (Task 1.5 adds that)
- [ ] The loop does NOT handle session persistence yet — it operates on in-memory message arrays
- [ ] Returns a result object: `{ response, messages, totalTokensIn, totalTokensOut, totalCostUsd, turnCount, toolCallCount }`

**Files:** Create `src/engine/reasoning-loop.js`
**Behavior:** A function that orchestrates multi-turn Claude API conversations with tool use. Given a system prompt, message history, tool definitions, and budget constraints, it runs the LLM in a loop — calling tools when the model requests them, feeding results back, and continuing until the model produces a final text response or a budget/iteration limit is hit. It is stateless between invocations — all state is in the message array passed in and returned out. Tool execution is delegated to a callback function passed in (not hardcoded to any specific tool system — this allows the existing tool registry in Phase 1 and the v2 registry in Phase 2 to both work).
**Dependencies:** Phase 0 complete (Supabase with cost_events table available)
**Verification:**
```bash
# Unit test: reasoning loop with a mock LLM that returns tool_use then text
npm test -- --grep "reasoning-loop"
# Should pass: loop calls tool, feeds result, gets final text, returns cost summary

# Unit test: loop respects dollar cap
npm test -- --grep "dollar-cap"
# Should pass: loop stops when accumulated cost exceeds cap
```
**Hours:** 4

---

### Task 1.2: Create session manager (3h)

- [ ] Build session lifecycle management for the `sessions` table
- [ ] `create(config)` — inserts a new session row with status='active', returns session object with UUID
  - Config includes: brand_id, user_id, agent_slug, channel, model_tier, dollar_cap
  - Generates a UUID for the session
- [ ] `get(sessionId)` — loads session by UUID, returns null if not found
- [ ] `suspend(sessionId, workingMemory, checkpoint)` — sets status='suspended', saves working_memory JSONB, sets suspended_at, generates resume_token UUID
- [ ] `resume(resumeToken)` — finds session by resume_token, sets status='active', clears suspended_at, returns session with working_memory
- [ ] `complete(sessionId, summary)` — sets status='completed', updates total_tokens and total_cost_usd
- [ ] `fail(sessionId, error)` — sets status='failed', stores error info
- [ ] `updateCost(sessionId, tokensIn, tokensOut, costUsd)` — increments running totals atomically using SQL `SET total_tokens = total_tokens + $1`
- [ ] `listActive(brandId)` — returns all active/suspended sessions for a brand

**Files:** Create `src/engine/session-manager.js`
**Behavior:** CRUD + lifecycle management for the sessions table. Every session has a clear state machine: active → suspended → active (resumed) → completed/failed. The suspend operation serializes all runtime state to Postgres so no memory is held in the Node.js process. The resume operation restores state from Postgres. Cost tracking is incremental — each LLM call adds to the running total. The resume_token is a one-time-use UUID that allows the HOTL engine (Phase 4) to resume a session after approval.
**Dependencies:** Task 0.4 (sessions table exists on Supabase)
**Verification:**
```bash
# Unit test: full session lifecycle
npm test -- --grep "session-manager"
# Should pass: create → active, suspend → suspended with resume_token, resume → active, complete → completed

# Verify DB writes
npm test -- --grep "session-cost"
# Should pass: updateCost increments atomically
```
**Hours:** 3

---

### Task 1.3: Create model router (2h)

- [ ] Build deterministic model selection — no LLM self-selection
- [ ] Maps task tier to specific Claude model ID:
  - `fast` → Claude Haiku (cheapest, for background tasks and sub-agents)
  - `balanced` → Claude Sonnet (default for chat and most tasks)
  - `deep` → Claude Opus (expensive, for complex reasoning)
- [ ] Model IDs stored as constants, easily updatable when new versions release
- [ ] Input: model_tier string (from agent_definitions or task config)
- [ ] Output: `{ modelId, inputPricePerMToken, outputPricePerMToken }` — model ID plus pricing for cost calculation
- [ ] All models use the same `ANTHROPIC_API_KEY` environment variable
- [ ] Pricing constants maintained in the same file for easy updates
- [ ] Validates tier input — throws on unknown tier

**Files:** Create `src/engine/model-router.js`
**Behavior:** A pure function that maps a tier string to a model configuration. No network calls. No LLM involvement. The tier is set at task spawn time and never auto-escalated. Pricing data is used by the cost tracker (Task 1.4) to calculate per-call costs from token counts. The pricing should reflect current Claude API pricing at time of implementation.
**Dependencies:** None
**Verification:**
```bash
# Unit test: each tier returns correct model
npm test -- --grep "model-router"
# Should pass: fast→haiku, balanced→sonnet, deep→opus, unknown→throws
```
**Hours:** 2

---

### Task 1.4: Create cost tracker (2h)

- [ ] Build per-session cost tracking that logs every LLM call to the `cost_events` table
- [ ] `logLLMCall(sessionId, executionId, brandId, model, tokensIn, tokensOut)` — calculates cost using model-router pricing, inserts into cost_events with event_type='llm_call'
- [ ] `logToolCall(sessionId, executionId, brandId, toolName, costUsd)` — inserts with event_type='tool_call' and tool name in metadata
- [ ] `logEmbedding(sessionId, brandId, tokenCount)` — inserts with event_type='embedding'
- [ ] `getSessionTotal(sessionId)` — returns `SUM(cost_usd)` for the session from cost_events
- [ ] `getBrandDaily(brandId, date)` — returns total spend for a brand on a given date
- [ ] `checkBudget(sessionId, dollarCap)` — returns `{ withinBudget, spent, remaining }`. Does NOT enforce — caller decides what to do
- [ ] Wire into reasoning loop: after every Claude API call, log the cost event before processing the response
- [ ] Cost calculation: `(tokensIn * inputPricePerMToken / 1_000_000) + (tokensOut * outputPricePerMToken / 1_000_000)`

**Files:** Create `src/engine/cost-tracker.js`
**Behavior:** A cost accounting module that records every billable event (LLM calls, tool invocations, embeddings) into the cost_events table. Provides query functions for session-level and brand-level cost aggregation. Does NOT enforce budgets itself — it provides data that the reasoning loop uses to decide whether to continue. The cost_events table is the single source of truth for all spending — Brain Health dashboard, budget enforcement, and future billing all read from here.
**Dependencies:** Task 0.4 (cost_events table exists), Task 1.3 (model-router provides pricing)
**Verification:**
```bash
# Unit test: cost calculation accuracy
npm test -- --grep "cost-tracker"
# Should pass: correct cost for known token counts + model pricing

# Integration test: log call + query total
npm test -- --grep "cost-session-total"
# Should pass: log 3 calls, getSessionTotal returns sum
```
**Hours:** 2

---

## Week 4: Phase 1B — Reasoning Loop Integration

**Goal: By end of this week, Lucy's reasoning loop powers the web chat with SSE streaming and context compression.**

---

### Task 1.5: Add SSE streaming to reasoning loop (3h)

- [ ] Modify the reasoning loop to accept an optional event callback/emitter
- [ ] When a callback is provided, emit events during the loop:
  - `thinking` — emitted when Claude API call starts (for UI "thinking" indicator)
  - `text_delta` — emitted for each text chunk during streaming (Claude API streaming mode)
  - `tool_start` — emitted when a tool execution begins, includes tool name and input summary
  - `tool_result` — emitted when a tool execution completes, includes tool name and ok/error status
  - `done` — emitted when the loop completes, includes final cost summary
  - `error` — emitted on unrecoverable error
- [ ] Switch Claude API calls from non-streaming to streaming mode when callback is present
- [ ] Accumulate streamed text chunks into the message history for the next turn
- [ ] When no callback is provided, behavior is unchanged (non-streaming, returns full result)
- [ ] Handle backpressure: if SSE connection is slow, buffer events (bounded queue, drop oldest if full)

**Files:** Modify `src/engine/reasoning-loop.js`
**Behavior:** The reasoning loop gains real-time event emission. In streaming mode, each Claude API response is consumed as a stream — text chunks are emitted as `text_delta` events in real-time while simultaneously being accumulated for the message history. Tool executions emit start/result events. The loop still returns the same final result object, but callers can also observe the process in real-time via events. This is what powers the SSE response in the chat route.
**Dependencies:** Task 1.1 (reasoning loop exists)
**Verification:**
```bash
# Unit test: streaming events emitted in correct order
npm test -- --grep "reasoning-loop-streaming"
# Should pass: events emitted in order: thinking → text_delta(s) → done
# With tool use: thinking → tool_start → tool_result → thinking → text_delta(s) → done
```
**Hours:** 3

---

### Task 1.6: Create context compressor (4h)

- [ ] Build a module that strategically summarizes old messages when approaching token limits
- [ ] Takes a message array and a token limit (configurable, default 150,000 tokens)
- [ ] Token counting: use a fast approximation (4 chars = 1 token) for checking threshold. Exact counts from Claude API response metadata for cost tracking
- [ ] When message count * average tokens exceeds 70% of limit, trigger compression:
  - Keep: system prompt (always), last 5 tool results, last 10 user/assistant messages, working memory
  - Compress: everything else into a summary
- [ ] Summarization uses Haiku (cheapest model) via a separate Claude API call
- [ ] Summary prompt: "Summarize the following conversation history, preserving: key decisions, action items, important facts, user preferences. Be concise."
- [ ] Replace compressed messages with a single assistant message containing the summary
- [ ] Mark original messages as `compressed=true` in the database (so they're not loaded again)
- [ ] Track compression events in cost_events (the Haiku summarization call has a cost)

**Files:** Create `src/engine/context-compressor.js`
**Behavior:** A module that prevents context window overflow by compressing old conversation history into summaries. It preserves recent interactions and critical information (system prompt, recent tool results, working memory) while condensing older messages. Uses the cheapest model available for summarization to minimize cost. The compression is transparent to the reasoning loop — it receives a shorter message array that still contains all essential context. Compressed messages are flagged in the database so they're never re-loaded.
**Dependencies:** Task 1.1 (reasoning loop provides message arrays), Task 1.3 (model-router for Haiku), Task 1.4 (cost tracking for compression calls)
**Verification:**
```bash
# Unit test: compression triggers at threshold
npm test -- --grep "context-compressor"
# Should pass: 100-message array compressed to ~15 messages + summary

# Unit test: critical messages preserved
npm test -- --grep "compressor-preserves"
# Should pass: system prompt, last 5 tool results, last 10 messages all present after compression
```
**Hours:** 4

---

### Task 1.7: Implement basic working memory (2h)

- [ ] Add per-session JSONB scratchpad functionality
- [ ] The reasoning loop can read and write key-value pairs to working memory during execution
- [ ] In-memory cache: active sessions' working memory held in a `Map<sessionId, object>` for fast access
- [ ] Postgres as source of truth: on session create, load from DB. On session suspend/complete, flush to DB.
- [ ] Periodic flush: every 5 minutes for long-running sessions (in case of crash)
- [ ] Provide helper functions for the reasoning loop:
  - `getMemory(sessionId, key)` — read from in-memory cache
  - `setMemory(sessionId, key, value)` — write to in-memory cache (lazy flush)
  - `getAllMemory(sessionId)` — return full scratchpad object
  - `flushMemory(sessionId)` — persist to DB immediately
- [ ] Memory size limit: 100KB per session (reject writes that would exceed)
- [ ] Working memory is accessible to tools via execution context (they can read/write too)

**Files:** Create `src/engine/working-memory.js`
**Behavior:** A fast, in-memory scratchpad for active reasoning sessions with Postgres persistence. Agents can store notes, intermediate results, plans, and tracked state in working memory. The data lives in a Node.js Map for speed during active reasoning, but is always backed by the sessions table's working_memory JSONB column. On suspend or complete, the in-memory version is flushed to Postgres. On resume, it's loaded back. This is the Phase 1 foundation — Phase 5 (Task 5.7) will add structured fields and cross-session loading.
**Dependencies:** Task 1.2 (session manager manages sessions table)
**Verification:**
```bash
# Unit test: read/write working memory
npm test -- --grep "working-memory"
# Should pass: set key→value, get returns value, flush persists to DB, load restores from DB

# Unit test: size limit enforced
npm test -- --grep "memory-size-limit"
# Should pass: write exceeding 100KB rejected
```
**Hours:** 2

---

### Task 1.8: Wire reasoning loop to /api/chat route (4h)

- [ ] Replace the current single-shot LLM call in `src/routes/chat-api.js` with the reasoning loop
- [ ] On first message in a conversation: create a new session (via session-manager) linked to the conversation
- [ ] On subsequent messages: load existing session, append user message, run reasoning loop
- [ ] Map existing SSE infrastructure to reasoning loop events:
  - `text_delta` → SSE text events (same format as current chat)
  - `tool_start` → SSE tool_start event (new — UI can show "Using tool: X")
  - `tool_result` → SSE tool_result event (new — UI can show tool outcome)
  - `done` → SSE done event with cost info
- [ ] Preserve backward compatibility:
  - Existing chat UI must work without changes (text streaming still works)
  - New events (tool_start, tool_result) are additive — old UI ignores unknown events
- [ ] Load appropriate tools based on conversation context:
  - Regular chat: all auto-tier tools
  - Agent chat (via @mention): agent's scoped tools from agent_definitions
- [ ] Save assistant response to messages table as before
- [ ] Track cost via cost_tracker on every LLM call
- [ ] Apply context compression when conversation gets long

**Files:** Modify `src/routes/chat-api.js` (the SSE chat endpoint), modify `src/routes/ruhi-chat.js` if it has a separate path
**Behavior:** The web chat route now uses the multi-turn reasoning loop instead of a single LLM call. From the user's perspective, the chat still works the same way — they type, they see streaming text. But behind the scenes, the loop can make multiple LLM calls with tool use in a single chat turn. The session is created on first message and reused for the conversation's lifetime. Cost is tracked per-turn. Context compression kicks in for long conversations. The existing SSE event format is preserved for text streaming, with new event types added for tool use visibility.
**Dependencies:** Task 1.1 (reasoning loop), Task 1.2 (session manager), Task 1.4 (cost tracker), Task 1.5 (SSE streaming), Task 1.6 (context compressor), Task 1.7 (working memory)
**Verification:**
```bash
# Run all existing tests first — nothing should break
npm test

# Manual test: open ruhi.ikawn.in, start a chat, send a message
# Verify: streaming text appears as before
# Verify: no errors in Fly logs

# Manual test: ask Lucy to use a tool (e.g., "search my memories for X")
# Verify: tool_start and tool_result events in SSE stream (check browser DevTools Network tab)

# Check cost_events table has entries for the conversation
psql "$SUPABASE_DIRECT_URL" -c "SELECT * FROM cost_events ORDER BY created_at DESC LIMIT 5;"
```
**Hours:** 4

---

### Task 1.9: Wire reasoning loop to Telegram handler (3h)

- [ ] Update the Telegram intelligence handler in `src/routes/webhooks.js` to use the reasoning loop
- [ ] Create/continue a session per Telegram chat (daily session, matching current behavior)
- [ ] Channel = 'telegram' on the session
- [ ] Run the reasoning loop without SSE (no streaming needed — Telegram gets final response)
- [ ] Send the final text response back via Telegram Bot API (existing `sendTelegramMessage` utility)
- [ ] If reasoning loop uses tools mid-conversation, send intermediate "typing" indicators
- [ ] Apply dollar cap for Telegram sessions (configurable, default $0.50 per session)
- [ ] Handle timeout: if reasoning takes >60 seconds, send partial response with "I'm still working on this..." and continue in background
- [ ] Save all messages to conversations/messages tables as before

**Files:** Modify `src/routes/webhooks.js` (the intelligence-telegram handler)
**Behavior:** Telegram messages now go through the same reasoning loop as web chat. The Telegram handler creates or resumes a daily session for each chat, runs the loop with the user's message, and sends the final response back. Tools are available during the loop. The key difference from web chat is no SSE streaming — Telegram gets the complete response after the loop finishes. A typing indicator is sent while the loop runs. Budget is enforced per-session.
**Dependencies:** Task 1.8 (chat route wired — validates the loop works end-to-end), Task 1.2 (session manager)
**Verification:**
```bash
# Manual test: send a Telegram message to Lucy
# Verify: response comes back (may take a few seconds)
# Verify: session created in sessions table with channel='telegram'
# Verify: cost_events logged

# Check no errors in logs
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | grep -i error | head -10
```
**Hours:** 3

---

### Task 1.10: Implement 5-minute chat timeout (2h)

- [ ] Add a timeout mechanism to the reasoning loop when running in chat context
- [ ] If the loop hasn't completed a turn within 5 minutes (configurable via `CHAT_TURN_TIMEOUT_MS`):
  - Emit a `timeout` SSE event with the partial results gathered so far
  - Return whatever response text has been generated
  - Create a `task_queue` entry with type='on_demand' containing the remaining work context
  - Send a follow-up message: "I'm continuing to work on this in the background. I'll notify you when done."
- [ ] The background task picks up where the chat left off (same session, same working memory)
- [ ] When the background task completes, notify the user:
  - Web: update the conversation with the completion message (user sees it next time they load chat)
  - Telegram: send a follow-up message
- [ ] The timeout is per-turn, not per-session — each user message gets a fresh 5-minute window

**Files:** Modify `src/engine/reasoning-loop.js` (add timeout parameter), modify `src/routes/chat-api.js` (handle timeout event)
**Behavior:** Prevents hung SSE connections by capping individual reasoning turns at 5 minutes. When a turn times out, the user gets whatever partial results exist, and the remaining work continues asynchronously as a background task. This ensures the chat UI never hangs, while complex tasks still complete. The background task shares the same session and working memory, so continuity is preserved.
**Dependencies:** Task 1.8 (chat route wired), Task 1.2 (session suspend for background work)
**Verification:**
```bash
# Unit test: timeout triggers at configured interval
npm test -- --grep "chat-timeout"
# Should pass: mock slow tool, verify timeout event emitted at 5 min, background task created

# Integration test: verify background task created
npm test -- --grep "timeout-background-task"
# Should pass: task_queue entry exists with correct session reference
```
**Hours:** 2

---

## Week 5: Phase 2 — Tool Framework v2

**Goal: By end of this week, all tools use standardized envelopes with retry policies and permission enforcement.**

---

### Task 2.1: Create tool v2 interface definition (2h)

- [ ] Define the contract that every v2 tool must implement:
  - `name` — unique string identifier
  - `description` — human-readable description (also used in Claude tool definitions)
  - `inputSchema` — JSON Schema object describing the tool's parameters
  - `permissionTier` — one of: 'auto', 'confirm', 'review'
  - `category` — one of: 'observe', 'analyze', 'create', 'execute', 'ship', 'communicate'
  - `timeout` — maximum execution time in milliseconds
  - `retryPolicy` — `{ maxRetries, backoff: [ms, ms, ...], timeoutMs }`
  - `execute(input, context)` — async function that performs the tool's action
- [ ] Context object passed to execute contains: sessionId, brandId, userId, workingMemory (read-only), costTracker
- [ ] Return value must be a standardized envelope: `{ ok, data, error, metadata }`
  - `metadata` always includes: tool name, duration_ms, attempt number, truncated flag, cost_usd
- [ ] Create a validation function that checks a tool object conforms to the interface
- [ ] Define `PROTECTED_TABLES` constant: list of tables that no tool may write to — `trust_ledger`, `trust_scores`, `agent_definitions` (persona column), `approval_requests` (timeout columns)

**Files:** Create `src/engine/tool-interface.js`
**Behavior:** A module that defines the shape of a v2 tool and provides a validation function. It is not a base class — tools are plain objects that conform to the interface. The validation function checks all required fields, validates the JSON Schema structure, ensures permissionTier is valid, and confirms execute is an async function. The PROTECTED_TABLES list is exported as a frozen array for use by the tool executor.
**Dependencies:** None
**Verification:**
```bash
# Unit test: valid tool passes validation
npm test -- --grep "tool-interface-valid"
# Should pass: well-formed tool object passes validation

# Unit test: invalid tool fails validation
npm test -- --grep "tool-interface-invalid"
# Should pass: missing fields, bad tier, non-async execute all rejected with clear error messages
```
**Hours:** 2

---

### Task 2.2: Create tool executor with retry engine (4h)

- [ ] Build the dispatch + retry engine for tool execution
- [ ] `executeTool(toolName, input, context)` — the main entry point:
  - Looks up tool in registry
  - Checks permission tier against session's trust level (from trust_scores table or default)
  - If permission requires HOTL gate: returns a `{ gated: true, approvalRequired: tier }` response (caller handles suspension)
  - Executes tool with timeout enforcement (Promise.race with timer)
  - On failure: check retry policy. If retries remaining, wait backoff[attempt], retry. If no retries, handle per category:
    - Observe/Analyze tools: return error envelope, reasoning loop continues
    - Create/Execute tools: return error with `suspend: true` flag — caller should suspend session
    - Ship tools: return error with `hotl: true` flag — caller must get HOTL approval to retry
  - Log every attempt to `tool_results` table (success and failure)
- [ ] PROTECTED_TABLES enforcement: before executing any tool, inspect the tool's input for SQL or table references. If the input targets a protected table (string matching on table names), reject before execution with a clear error message
- [ ] Cost tracking: after successful tool execution, log to cost_events if the tool reports a cost in its metadata

**Files:** Create `src/engine/tool-executor.js`
**Behavior:** The central tool dispatch system. Every tool invocation in Lucy v3 goes through this module. It handles permission checking, timeout enforcement, retry with backoff, failure escalation, result logging, and protected table enforcement. It does NOT handle HOTL approval flow directly — it signals to the caller (reasoning loop or task processor) that approval is needed, and the caller coordinates with the HOTL engine. Each tool attempt is logged to the tool_results table for audit purposes.
**Dependencies:** Task 2.1 (tool interface defines the contract), Task 1.4 (cost tracker for logging)
**Verification:**
```bash
# Unit test: successful tool execution
npm test -- --grep "tool-executor-success"
# Should pass: tool executed, result logged, envelope returned

# Unit test: retry with backoff
npm test -- --grep "tool-executor-retry"
# Should pass: tool fails twice, succeeds on third attempt, backoff delays respected

# Unit test: protected table rejection
npm test -- --grep "tool-executor-protected"
# Should pass: tool input referencing trust_ledger rejected before execution

# Unit test: timeout enforcement
npm test -- --grep "tool-executor-timeout"
# Should pass: slow tool killed at timeout, error envelope returned
```
**Hours:** 4

---

### Task 2.3: Create tool registry v2 (3h)

- [ ] Build a new registry that discovers and validates tools from a `src/tools/v2/` directory
- [ ] On startup: scan directory, require each `.tool.js` file, validate against tool interface
- [ ] Reject tools that don't pass validation (log error, skip tool — don't crash)
- [ ] Provide lookup functions:
  - `lookupTool(name)` — returns tool object by name, null if not found
  - `listTools(scope)` — returns tools filtered by scope (a list of category names). E.g., scope=['observe','analyze'] returns all tools in those categories
  - `listAllTools()` — returns all registered tools
  - `getToolDefinitions(scope)` — returns tools formatted as Claude API tool definitions (for passing to the LLM). Filters by scope if provided
- [ ] Tool definitions for Claude: transform each tool's inputSchema into Claude's `{ name, description, input_schema }` format
- [ ] Support hot-reload during development (not production): re-scan directory on SIGHUP
- [ ] Maintain backward compatibility: keep `src/tools/registry.js` working for any code that hasn't migrated yet

**Files:** Create `src/engine/tool-registry-v2.js`, create directory `src/tools/v2/`
**Behavior:** The new tool registry auto-discovers tool files from a directory, validates them, and provides fast lookup. It replaces the manual registration in the existing `src/tools/registry.js` with convention-based discovery. Tools are plain objects exported from `.tool.js` files in `src/tools/v2/`. The registry generates Claude API-compatible tool definitions for passing to the reasoning loop. The existing registry continues to work during the migration period.
**Dependencies:** Task 2.1 (tool interface for validation)
**Verification:**
```bash
# Unit test: registry discovers tools from directory
npm test -- --grep "tool-registry-v2"
# Should pass: tools discovered, validated, queryable by name and scope

# Unit test: invalid tool file skipped gracefully
npm test -- --grep "registry-skip-invalid"
# Should pass: invalid tool logged and skipped, registry still works
```
**Hours:** 3

---

### Task 2.4: Migrate existing tools to v2 interface (4h)

- [ ] For each of the 19 existing tools in `src/tools/`, create a v2 wrapper in `src/tools/v2/`
- [ ] Each wrapper:
  - Exports a tool object conforming to the v2 interface
  - Adds `inputSchema` (JSON Schema) based on the tool's current parameter handling
  - Sets `permissionTier` based on the category mapping from ARCHITECTURE.md
  - Sets `retryPolicy` based on the category defaults from ARCHITECTURE.md
  - Wraps the existing `execute()` function to return the standardized `{ok, data, error, metadata}` envelope
  - Catches any thrown errors and converts to error envelopes
  - Times the execution and includes `duration_ms` in metadata
- [ ] Tools to migrate (19 total):
  - Observe: `fly.tool.js`, `system.tool.js` (partial)
  - Analyze: `code-read.tool.js`, `recall.tool.js`, `brand-analysis.tool.js`, `ga.tool.js`
  - Create: `code-write.tool.js`, `code-edit.tool.js`, `content.tool.js`, `create-user-task.tool.js`
  - Execute: `bash.tool.js`, `deploy.tool.js`, `manage-task.tool.js`
  - Ship: (deploy.tool.js for production — split into two v2 tools)
  - Communicate: `notify.tool.js`, `gmail.tool.js`, `gmail-draft.tool.js`, `calendar.tool.js`, `ikawn-os.tool.js`, `automation.tool.js`
- [ ] Keep original files untouched — v2 wrappers import from them
- [ ] Verify each migrated tool passes v2 interface validation

**Files:** Create 19+ files in `src/tools/v2/` (one per tool, some tools may split into multiple v2 tools)
**Behavior:** Every existing tool gets a v2-compatible wrapper without changing the original tool code. The wrappers add the missing contract pieces (schema, permissions, retry policy, envelope formatting) while delegating actual execution to the proven original code. This is an adapter pattern — the original tools are the implementation, the v2 wrappers are the interface. After this task, all tools are accessible through both the old registry (for backward compat) and the new v2 registry.
**Dependencies:** Task 2.1 (interface to validate against), Task 2.3 (registry to register with)
**Verification:**
```bash
# Unit test: all 19 tools pass v2 validation
npm test -- --grep "tool-migration-validation"
# Should pass: every tool in src/tools/v2/ validated successfully

# Integration test: each tool returns proper envelope
npm test -- --grep "tool-envelope"
# Should pass: successful tool returns {ok:true, data, error:null, metadata}
# Failed tool returns {ok:false, data:null, error, metadata}
```
**Hours:** 4

---

### Task 2.5: Add new tool — db_query_readonly (2h)

- [ ] Create a new v2 tool that executes read-only SQL queries
- [ ] Input schema: `{ query: string, database?: string }` — database defaults to 'openbrain'
- [ ] Permission tier: Auto (read-only is safe)
- [ ] Category: Analyze
- [ ] Validation: parse the SQL query and reject if it contains any write operations:
  - Reject: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE
  - Reject: any query containing semicolons after the first statement (no multi-statement injection)
  - Allow: SELECT, WITH (CTE), EXPLAIN
- [ ] Timeout: 30 seconds (prevent runaway queries)
- [ ] Add `STATEMENT_TIMEOUT` to the query connection: `SET statement_timeout = '30s'`
- [ ] Return: `{ rows, rowCount, fields }` in the data envelope
- [ ] Truncate results if >100 rows (return first 100 with `truncated: true` in metadata)
- [ ] Log the query text in tool_results for audit trail

**Files:** Create `src/tools/v2/db-query-readonly.tool.js`
**Behavior:** Gives Lucy the ability to inspect any iKawn database with read-only SQL. Useful for debugging, analytics, and understanding system state. The tool aggressively validates input to prevent any data modification — it parses the query text and rejects anything that isn't a pure read operation. Results are truncated at 100 rows to prevent context overflow. The database parameter allows querying different databases in the future (e.g., ikawn-v3's DB for cross-system analysis).
**Dependencies:** Task 2.1 (v2 interface), Task 2.3 (v2 registry)
**Verification:**
```bash
# Unit test: SELECT query succeeds
npm test -- --grep "db-query-readonly-select"
# Should pass: returns rows in envelope

# Unit test: INSERT/UPDATE/DELETE rejected
npm test -- --grep "db-query-readonly-reject"
# Should pass: write operations rejected before execution

# Unit test: multi-statement injection rejected
npm test -- --grep "db-query-readonly-injection"
# Should pass: "SELECT 1; DROP TABLE users" rejected
```
**Hours:** 2

---

### Task 2.6: Add new tools — plan_creator, test_runner (3h)

- [ ] **plan_creator** tool:
  - Creates markdown implementation plans from a brief
  - Input schema: `{ title: string, description: string, constraints?: string }`
  - Permission tier: Confirm (creates artifacts)
  - Category: Create
  - Behavior: writes a markdown file to a specified path (or returns the content for in-chat use)
  - Output: the plan content in the data envelope
  - Timeout: 60 seconds

- [ ] **test_runner** tool:
  - Runs `npm test` or specific test files in a target project directory
  - Input schema: `{ projectDir: string, testPattern?: string }` — projectDir is the absolute path to the project, testPattern is an optional grep pattern
  - Permission tier: Confirm (executes code)
  - Category: Execute
  - Behavior: spawns `npm test` as a child process in the specified directory, captures stdout/stderr
  - Output: `{ passed, failed, total, output }` in the data envelope
  - Timeout: 120 seconds
  - Parses test output to extract pass/fail counts (handles common test runner formats: jest, vitest, mocha)
  - Truncates output if >5000 chars (include first 2500 and last 2500 with truncation notice)

**Files:** Create `src/tools/v2/plan-creator.tool.js`, create `src/tools/v2/test-runner.tool.js`
**Behavior:** Two new tools that expand Lucy's capabilities. plan_creator lets Lucy author structured plans — useful for the Operator role (Phase 6) where Lucy plans work before implementing. test_runner lets Lucy validate changes by running the project's test suite — essential for the Builder and Reviewer agent types. Both follow the v2 interface and return standardized envelopes.
**Dependencies:** Task 2.1 (v2 interface), Task 2.3 (v2 registry)
**Verification:**
```bash
# Unit test: plan_creator produces markdown
npm test -- --grep "plan-creator"
# Should pass: returns markdown content in envelope

# Integration test: test_runner runs tests in this project
npm test -- --grep "test-runner-integration"
# Should pass: runs npm test in /Users/vineet/ikawn-openbrain, reports pass/fail counts
```
**Hours:** 3

---

### Task 2.7: Add new tools — deploy_staging, deploy_production (3h)

- [ ] **deploy_staging** tool:
  - Deploys an application to staging environment
  - Input schema: `{ app: string, projectDir: string }` — app is the Fly app name, projectDir is the local path
  - Permission tier: Confirm (executes deployment but to staging only)
  - Category: Execute
  - Behavior: runs `flyctl deploy --app {app} --remote-only` in the project directory as a child process. Captures stdout/stderr. Waits for completion.
  - Timeout: 300 seconds (5 minutes — deploys can be slow)
  - Output: `{ success, appUrl, deployDuration, output }` in envelope
  - Validates: projectDir contains a `fly.toml` or `Dockerfile` before attempting deploy

- [ ] **deploy_production** tool:
  - Deploys an application to production
  - Input schema: `{ app: string, projectDir: string, reason: string }` — reason is mandatory (for audit trail)
  - Permission tier: Review (highest gate — requires explicit human approval)
  - Category: Ship
  - Retry policy: 0 retries (no auto-retry on production deploys)
  - Behavior: same as staging but with Review-tier permission and mandatory reason field
  - Timeout: 300 seconds
  - Output: same as staging plus the reason field in metadata

- [ ] Both tools must run `npm run pre-deploy` before the actual deploy and abort if it fails

**Files:** Create `src/tools/v2/deploy-staging.tool.js`, create `src/tools/v2/deploy-production.tool.js`
**Behavior:** Deployment tools that let Lucy deploy to Fly.io environments. deploy_staging is gated at Confirm tier (quick tap approval). deploy_production is gated at Review tier (you need to review the diff/changes). Both run pre-deploy checks first. The production tool requires a reason field to document why the deploy is happening — this is logged in tool_results for the audit trail. Neither tool can bypass the HOTL gate — even if trust promotes staging deploys to auto, production deploys stay at Review or Confirm (never auto — per ARCHITECTURE.md trust table: "Client-Facing Changes: Never auto. Always full review.").
**Dependencies:** Task 2.1 (v2 interface), Task 2.3 (v2 registry)
**Verification:**
```bash
# Unit test: deploy_staging validates fly.toml exists
npm test -- --grep "deploy-staging-validation"
# Should pass: missing fly.toml → error envelope

# Unit test: deploy_production requires reason
npm test -- --grep "deploy-production-reason"
# Should pass: missing reason → validation error

# Unit test: deploy_production has Review tier
npm test -- --grep "deploy-production-tier"
# Should pass: permissionTier === 'review'
```
**Hours:** 3

---

### Task 2.8: Wire tool executor into reasoning loop (2h)

- [ ] Modify the reasoning loop to dispatch tool calls through the tool executor (Task 2.2) instead of direct invocation
- [ ] When Claude returns tool_use content blocks:
  - For each tool_use block: call `toolExecutor.executeTool(name, input, context)`
  - If executor returns `{ gated: true }`: pause the loop, return a `gated` result with the approval requirement (HOTL engine handles this in Phase 4 — for now, just stop and return)
  - If executor returns success envelope: format as tool_result message for Claude
  - If executor returns error envelope with `suspend: true`: suspend session, return partial results
  - If executor returns error envelope without suspend: include error as tool_result, let Claude adapt
- [ ] Populate execution context for tools: sessionId, brandId, userId, workingMemory, costTracker
- [ ] All tool results now go through the retry + envelope + logging pipeline automatically
- [ ] Remove any direct tool invocation code from the reasoning loop

**Files:** Modify `src/engine/reasoning-loop.js`
**Behavior:** The reasoning loop is now tool-executor-aware. Instead of calling tools directly, it delegates to the tool executor which handles retries, permissions, timeouts, and logging. The loop handles three possible outcomes from the executor: success (continue reasoning), gated (pause for approval), or error (either continue or suspend depending on severity). This ensures all tool invocations are audited, retried appropriately, and permission-checked.
**Dependencies:** Task 2.2 (tool executor), Task 2.3 (tool registry v2), Task 2.4 (tools migrated), Task 1.1 (reasoning loop)
**Verification:**
```bash
# Integration test: reasoning loop uses tool executor
npm test -- --grep "loop-tool-executor"
# Should pass: tool call goes through executor, result logged in tool_results table, retry works

# Integration test: gated tool pauses loop
npm test -- --grep "loop-gated-tool"
# Should pass: Review-tier tool returns gated result, loop stops cleanly
```
**Hours:** 2

---

## Week 6: Phase 3A — Agent Orchestration Core

**Goal: By end of this week, Lucy can spawn sub-agents that run as background tasks with isolated tool scopes.**

---

### Task 3.1: Create task processor (4h)

- [ ] Build the queue poller that picks up and executes tasks from `task_queue`
- [ ] Poll every 5 seconds: `SELECT * FROM task_queue WHERE status IN ('pending','queued') AND enabled = true AND next_run_at <= NOW() ORDER BY priority ASC, next_run_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
- [ ] The `FOR UPDATE SKIP LOCKED` pattern prevents multiple processors from claiming the same task (advisory lock pattern)
- [ ] On claiming a task:
  - Set status='running'
  - Create a `task_executions` record with status='running'
  - Create a session via session-manager (channel='scheduled' or 'sub_agent')
  - Start a reasoning loop with the task's prompt, agent's tool scope, and budget
  - On completion: update task_executions with result, status='completed', cost data
  - On failure: update with error, status='failed'
- [ ] Concurrency limit: max 3 concurrent reasoning loops per process
  - Use a semaphore counter — if 3 loops running, skip poll cycle
- [ ] For cron tasks: after execution, calculate next_run_at from cron_expression (using a cron parser library with timezone support)
- [ ] Handle server restart recovery: on startup, scan `task_executions WHERE status = 'running'`. Mark each as 'failed' with error='server_restart'. The cron scheduler will re-queue them.
- [ ] Start polling on application boot (in `src/index.js`)

**Files:** Create `src/engine/task-processor.js`, modify `src/index.js` (start processor on boot)
**Behavior:** The task processor is the background execution engine for Lucy v3. It polls the task_queue table for pending work, claims tasks atomically, and executes them via the reasoning loop. It handles three types of tasks: scheduled (cron-driven), on_demand (triggered by chat timeout or API), and sub_agent (spawned by coordinators). Concurrency is capped at 3 to stay within memory limits. Cron tasks auto-reschedule after completion. Crash recovery marks interrupted tasks as failed so they can be retried.
**Dependencies:** Task 1.1 (reasoning loop), Task 1.2 (session manager), Task 1.4 (cost tracker), Task 0.4 (task_queue + task_executions tables)
**Verification:**
```bash
# Unit test: task processor claims and executes task
npm test -- --grep "task-processor"
# Should pass: pending task → running → completed, execution record created

# Unit test: concurrency limit respected
npm test -- --grep "processor-concurrency"
# Should pass: 4th task waits until one of first 3 completes

# Unit test: cron rescheduling
npm test -- --grep "processor-cron"
# Should pass: completed cron task gets new next_run_at based on expression

# Unit test: crash recovery
npm test -- --grep "processor-recovery"
# Should pass: running tasks on startup marked as failed with server_restart error
```
**Hours:** 4

---

### Task 3.2: Create agent spawner (3h)

- [ ] Build the sub-agent creation system that coordinators use to delegate work
- [ ] `spawnAgent(config)` — creates a child task and session:
  - Config: `{ type, prompt, parentSession, brandId, tools?, budget?, dollarCap? }`
  - Type must be one of the defined agent presets (Task 3.3)
  - Creates a `task_queue` entry with task_type='sub_agent', status='pending'
  - Sets the task's config JSONB with parent_session reference
  - Returns the task_id for tracking
- [ ] Agent type determines defaults (from presets):
  - Tool scope (which categories the sub-agent can access)
  - Token budget
  - Dollar cap
  - Model tier
  - System prompt additions
- [ ] Custom overrides: caller can override budget and dollarCap (but NOT tool scope — that's locked to the preset)
- [ ] Parent tracking: the sub-agent's session gets `parent_session` set to the coordinator's session_id
- [ ] Max 3 sub-agents per coordinator (checked on spawn — returns error if limit reached)
- [ ] `getChildStatus(parentSessionId)` — returns status of all child tasks for a coordinator

**Files:** Create `src/engine/agent-spawner.js`
**Behavior:** The spawner is how Lucy delegates work. A coordinator agent decides it needs research done, calls spawnAgent with type='researcher' and a prompt, and gets back a task_id. The task enters the queue and is picked up by the task processor (Task 3.1). The spawner enforces preset constraints — a Researcher cannot access Create or Ship tools regardless of what the coordinator requests. Budget overrides are allowed to let coordinators allocate their own budget across children, but tool scope is immutable per preset.
**Dependencies:** Task 3.1 (task processor to execute spawned agents), Task 0.4 (task_queue table)
**Verification:**
```bash
# Unit test: spawn researcher agent
npm test -- --grep "agent-spawner-researcher"
# Should pass: task created with type='sub_agent', tools limited to observe+analyze

# Unit test: tool scope override rejected
npm test -- --grep "spawner-scope-locked"
# Should pass: attempting to give researcher 'ship' tools fails

# Unit test: max 3 sub-agents enforced
npm test -- --grep "spawner-max-children"
# Should pass: 4th spawn returns error
```
**Hours:** 3

---

### Task 3.3: Create agent presets (2h)

- [ ] Define the 6 agent type presets from ARCHITECTURE.md Section 2 Pillar 4
- [ ] Each preset specifies:
  - `type` — string identifier
  - `role` — human-readable description
  - `toolScope` — array of allowed tool categories
  - `tokenBudget` — max tokens for the session
  - `dollarCap` — max USD spend
  - `modelTier` — 'fast', 'balanced', or 'deep'
  - `systemPromptAddition` — text appended to the base system prompt

- [ ] Preset definitions:

  | Type | Tool Scope | Token Budget | Dollar Cap | Model Tier |
  |------|-----------|-------------|-----------|-----------|
  | coordinator | All categories | Session-level | Configurable (default $2) | balanced |
  | researcher | observe, analyze | 60K | $0.50 | fast |
  | builder | analyze, create | 200K | $1.00 | balanced |
  | reviewer | analyze, execute | 60K | $0.50 | balanced |
  | deployer | execute, ship | 30K | $0.25 | fast |
  | analyst | observe, analyze, communicate | 60K | $0.50 | fast |

- [ ] System prompt additions per type:
  - Researcher: "You are a researcher. Investigate thoroughly. Use observe and analyze tools. Return structured findings."
  - Builder: "You are a builder. Write clean, tested code. Follow project conventions. Return file paths modified."
  - Reviewer: "You are a reviewer. Check code quality, run tests, verify correctness. Return pass/fail with details."
  - Deployer: "You are a deployer. Deploy safely. Run pre-deploy checks. Verify after deploy. Return deploy status."
  - Analyst: "You are an analyst. Analyze data, find insights. Be precise with numbers. Return structured analysis."
  - Coordinator: (no addition — uses full Lucy persona)

**Files:** Create `src/engine/agent-presets.js`
**Behavior:** A configuration module that defines the agent archetypes. Each preset is a frozen object — no runtime modification. The presets are used by the agent spawner to set up sub-agent sessions with the correct constraints. The system prompt additions are concise and directive — they tell the sub-agent what role it plays without exposing internal architecture.
**Dependencies:** None (pure configuration)
**Verification:**
```bash
# Unit test: all 6 presets defined and frozen
npm test -- --grep "agent-presets"
# Should pass: each preset has all required fields, objects are frozen

# Unit test: coordinator has all tool categories
npm test -- --grep "preset-coordinator-scope"
# Should pass: coordinator toolScope includes all 6 categories
```
**Hours:** 2

---

### Task 3.4: Implement structured result return (3h)

- [ ] When a sub-agent's reasoning loop completes, serialize the result into a structured format
- [ ] The result format: `{ ok, data, error, metadata }` — same envelope pattern as tools
  - `data` contains: the agent's final text response, any files created/modified, key findings
  - `metadata` contains: agent type, total tokens used, total cost, tool calls made, duration
  - `error` (if failed): error message, last checkpoint state, tools that failed
- [ ] Write the result to `task_executions.result` as JSONB
- [ ] The coordinator receives this structured result — NOT the sub-agent's full message history
  - This is critical: message history can be 50+ messages. The coordinator gets a concise summary.
- [ ] If the sub-agent hit its token budget: set `truncated: true` in metadata, include partial results
- [ ] If the sub-agent hit its dollar cap: set `budget_exceeded: true`, include cost report
- [ ] If the sub-agent's reasoning loop errored: capture the error and last working state

**Files:** Create `src/engine/result-serializer.js`, modify `src/engine/task-processor.js` (use serializer on completion)
**Behavior:** A standardization layer between sub-agent execution and coordinator consumption. The sub-agent runs its full reasoning loop and produces a potentially long conversation. The result serializer distills this into a concise, structured envelope that tells the coordinator exactly what happened: what was found/built/verified, whether it succeeded, how much it cost, and whether there were any issues. The coordinator can then make decisions based on structured data rather than parsing raw conversation.
**Dependencies:** Task 3.1 (task processor runs agents), Task 3.2 (agent spawner creates agents)
**Verification:**
```bash
# Unit test: successful agent produces structured result
npm test -- --grep "result-serializer-success"
# Should pass: result has ok=true, data with response, metadata with costs

# Unit test: truncated agent includes partial results
npm test -- --grep "result-serializer-truncated"
# Should pass: truncated=true in metadata, partial data present
```
**Hours:** 3

---

### Task 3.5: Implement LISTEN/NOTIFY for sub-agent results (3h)

- [ ] Set up Postgres LISTEN/NOTIFY for real-time sub-agent completion notification
- [ ] When a sub-agent completes (in task-processor.js): `NOTIFY task_complete, '{execution_id}'`
- [ ] Coordinator session listens: `LISTEN task_complete`
- [ ] On notification: check if the completed execution_id belongs to one of the coordinator's children
  - If yes: load the structured result from task_executions, feed back into coordinator's reasoning loop
  - If no: ignore (notification was for a different coordinator)
- [ ] Fallback for connection pooler environments (Supabase Supavisor doesn't support LISTEN/NOTIFY on pooled connections):
  - Detect if LISTEN fails (connection pool returns error)
  - Fall back to polling: check task_executions for children with status IN ('completed','failed') every 2 seconds
  - Exponential backoff on polling: 2s → 5s → 15s → 15s (cap)
- [ ] Use a dedicated (non-pooled) Postgres connection for LISTEN/NOTIFY
  - This is the direct connection string, not the pooled one
  - Reconnect on disconnect with exponential backoff

**Files:** Create `src/engine/result-notifier.js`, modify `src/engine/task-processor.js` (trigger NOTIFY on completion)
**Behavior:** Near-instant notification when sub-agents complete their work. The coordinator doesn't need to poll — Postgres pushes a notification when the child task finishes. If the database setup doesn't support LISTEN/NOTIFY (common with connection poolers), the module silently falls back to polling with exponential backoff. The fallback is transparent to the coordinator — it just receives results, regardless of how the notification was delivered.
**Dependencies:** Task 3.1 (task processor completes tasks), Task 3.4 (results are serialized)
**Verification:**
```bash
# Integration test: NOTIFY received within 1 second of completion
npm test -- --grep "result-notifier-listen"
# Should pass: child completes, coordinator notified within 1s

# Unit test: fallback polling works when LISTEN unavailable
npm test -- --grep "result-notifier-fallback"
# Should pass: LISTEN fails, polling kicks in, result delivered within 5s
```
**Hours:** 3

---

### Task 3.6: Implement failure cascade (4h)

- [ ] Implement all 6 failure scenarios from ARCHITECTURE.md Section 2 Pillar 4:

  **Scenario 1: Sub-agent hits token budget**
  - [ ] Reasoning loop detects token count exceeding session's token_budget
  - [ ] Loop returns partial results with `truncated: true`
  - [ ] Result serializer includes what was completed so far
  - [ ] Coordinator receives partial result, decides: accept partial, spawn new agent to continue, or escalate

  **Scenario 2: Sub-agent hits dollar cap**
  - [ ] Cost tracker reports session total exceeding dollar_cap
  - [ ] Reasoning loop immediately stops (current LLM call may complete, but no new ones)
  - [ ] Result includes cost report: total spent, breakdown by model and tool calls
  - [ ] Coordinator receives cost report, cannot spawn replacement without its own budget

  **Scenario 3: Sub-agent tool fails after retries**
  - [ ] Tool executor exhausts retry policy
  - [ ] For Observe/Analyze tools: error envelope returned to reasoning loop, loop continues with error context
  - [ ] For Create/Execute tools: session suspended, error returned to coordinator
  - [ ] For Ship tools: HOTL approval required to retry
  - [ ] Coordinator receives structured error, decides: retry with different approach, spawn new agent, or escalate to HOTL

  **Scenario 4: Sub-agent times out (no progress 10 min)**
  - [ ] Task processor monitors each running task: if no new tool_results or cost_events in 10 minutes, consider stuck
  - [ ] Kill the session (status='killed'), capture last checkpoint from working memory
  - [ ] Return last checkpoint to coordinator
  - [ ] Log timeout event in cost_events for monitoring

  **Scenario 5: Coordinator hits dollar cap**
  - [ ] Same as Scenario 2, but for the coordinator session
  - [ ] All running children are also killed (cascade kill)
  - [ ] Entire session suspended
  - [ ] Telegram alert sent with full cost breakdown: coordinator cost + all children costs
  - [ ] Human must increase cap or close the session

  **Scenario 6: Multiple sub-agents fail (>50%)**
  - [ ] Coordinator tracks child completion: if more than half of spawned children fail (any failure type)
  - [ ] Auto-escalate to HOTL: suspend session, create approval request
  - [ ] Context includes: which agents failed, why, what succeeded, suggested next steps
  - [ ] Human decides: continue with reduced scope, retry, or abort

**Files:** Modify `src/engine/reasoning-loop.js` (budget checks), modify `src/engine/task-processor.js` (timeout detection, cascade kill), modify `src/engine/agent-spawner.js` (child failure tracking), create `src/engine/failure-handler.js` (centralized failure logic)
**Behavior:** A comprehensive failure handling system that ensures Lucy never runs away, never gets stuck silently, and always escalates appropriately. Each failure type has a defined response — from graceful degradation (partial results) to hard stops (dollar cap) to human escalation (>50% failure). The failure handler is the central module that determines the appropriate response for each failure type, while the actual enforcement happens in the reasoning loop, task processor, and agent spawner.
**Dependencies:** Task 3.1-3.5 (full orchestration chain), Task 1.4 (cost tracker), Task 1.2 (session manager for suspend)
**Verification:**
```bash
# Unit test: each failure scenario
npm test -- --grep "failure-cascade"
# Should pass 6 tests, one for each scenario

# Integration test: coordinator cap triggers cascade kill
npm test -- --grep "cascade-kill"
# Should pass: coordinator cap hit → all children killed → session suspended → alert sent

# Integration test: >50% child failure triggers HOTL
npm test -- --grep "majority-failure-escalation"
# Should pass: 3 of 4 children fail → HOTL escalation triggered
```
**Hours:** 4

---

## Week 7: Phase 3B + Phase 4A — Orchestration Wiring + HOTL Core

**Goal (3B): Scheduled tasks run through the new orchestration system with timezone-aware cron. Agent seeds migrated.**
**Goal (4A): Lucy can suspend a session, send a Telegram approval request, and resume on response.**

---

### Task 3.7: Implement cost rollup (2h)

- [ ] Parent session's `total_cost_usd` must include all children's costs
- [ ] When a child session completes: add its `total_cost_usd` to the parent's total via `session-manager.updateCost()`
- [ ] `cost_events` for children reference both the child's `session_id` and the parent's `execution_id`
- [ ] Brain Health dashboard aggregates correctly:
  - Per-session view: shows coordinator cost + children costs separately
  - Total view: sums everything without double-counting
- [ ] `getSessionTotalWithChildren(sessionId)` — returns total cost including all descendant sessions (recursive)

**Files:** Modify `src/engine/task-processor.js` (rollup on child completion), modify `src/engine/cost-tracker.js` (add recursive total function), modify `src/routes/brain-health.js` (update dashboard queries)
**Behavior:** Cost visibility flows upward. A coordinator session's total cost reflects everything it caused — its own LLM calls, its tools, and all sub-agent work. The cost_events table is the source of truth, and the sessions table's total_cost_usd is a denormalized running total for quick access. The Brain Health dashboard can show a hierarchical cost breakdown: coordinator → children.
**Dependencies:** Task 3.1 (task processor), Task 3.4 (results include cost data), Task 1.4 (cost tracker)
**Verification:**
```bash
# Integration test: child cost rolls up to parent
npm test -- --grep "cost-rollup"
# Should pass: parent total = own cost + child1 cost + child2 cost
```
**Hours:** 2

---

### Task 3.8: Wire scheduler to new task system (3h)

- [ ] Replace the current `src/scheduler.js` cron-based execution with `task_queue` entries
- [ ] Convert existing scheduled operations to task_queue rows:
  - GitHub sync (every 30 min) → task_queue with cron_expression='*/30 * * * *', agent_slug='tech'
  - Calendar sync (every 2 hr) → task_queue with cron_expression='0 */2 * * *', agent_slug='ops'
  - Retention cleanup (nightly) → task_queue with cron_expression='0 2 * * *', agent_slug='ops'
- [ ] Use `cron-parser` library with timezone option (default 'Asia/Kolkata') for next_run_at calculation
- [ ] Remove the direct cron execution from scheduler.js — it becomes a thin wrapper that:
  - On startup: ensures task_queue has entries for all standing tasks (create if missing)
  - Periodically recalculates next_run_at for completed tasks
- [ ] The task_processor (Task 3.1) handles actual execution
- [ ] Preserve backward compatibility: if a task fails in the new system, it still logs the same way

**Files:** Modify `src/scheduler.js` (convert to task_queue seeder), modify `src/index.js` (scheduler init)
**Behavior:** The scheduler transitions from being an executor to being a queue seeder. Instead of running cron jobs directly, it ensures task_queue has the right entries with correct cron expressions and timezones. The task processor picks these up and executes them through the reasoning loop. This unifies scheduled and on-demand execution into one path, making monitoring and debugging simpler.
**Dependencies:** Task 3.1 (task processor executes tasks from queue), Task 0.4 (task_queue table)
**Verification:**
```bash
# Verify task_queue has standing tasks after startup
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, cron_expression, timezone, status FROM task_queue WHERE task_type = 'scheduled';"
# Should show GitHub sync, calendar sync, retention cleanup

# Verify next_run_at is calculated correctly in IST
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, next_run_at FROM task_queue WHERE task_type = 'scheduled';"
# next_run_at should be in the future, respecting timezone

# Run all tests
npm test
```
**Hours:** 3

---

### Task 3.9: Update agent seed files (2h)

- [ ] Migrate all 10 agent seeds from `domain_agents` format to `agent_definitions` with new fields
- [ ] For each seed file (`src/agents/*.seed.js`), add:
  - `tool_scope` — array of tool categories this agent can use (based on role mapping)
  - `token_budget` — default token limit (from agent presets or custom)
  - `dollar_cap` — default dollar limit
- [ ] Agent-to-preset mapping:
  - `ruhi.seed.js` → coordinator preset (all tools, $2 cap)
  - `tech.seed.js` → builder preset + observe (analyze + create + observe, $1 cap)
  - `ops.seed.js` → analyst preset (observe + analyze + communicate, $0.50 cap)
  - `marketing.seed.js` → analyst preset ($0.50 cap)
  - `sales.seed.js` → analyst preset ($0.50 cap)
  - `finance.seed.js` → analyst preset ($0.50 cap)
  - `hr.seed.js` → analyst preset ($0.50 cap)
  - `growth.seed.js` → analyst preset ($0.50 cap)
  - `customer-success.seed.js` → analyst preset ($0.50 cap)
  - `r-and-d.seed.js` → researcher preset (observe + analyze, $0.50 cap)
- [ ] Update `seed-all.js` to use `agent_definitions` table name and include new columns in INSERT
- [ ] Run seed to update existing rows (use UPSERT pattern)

**Files:** Modify all files in `src/agents/`: `ruhi.seed.js`, `tech.seed.js`, `ops.seed.js`, `marketing.seed.js`, `sales.seed.js`, `finance.seed.js`, `hr.seed.js`, `growth.seed.js`, `customer-success.seed.js`, `r-and-d.seed.js`, `seed-all.js`
**Behavior:** All agent definitions now include the v3 fields (tool_scope, token_budget, dollar_cap) so they can be used with the new orchestration system. The seed files are the source of truth for agent configuration — running seed-all.js populates agent_definitions with all 10 agents and their constraints.
**Dependencies:** Task 0.5 (table renamed to agent_definitions with new columns)
**Verification:**
```bash
# Run seed
node src/agents/seed-all.js

# Verify all agents have new fields
psql "$SUPABASE_DIRECT_URL" -c "SELECT slug, tool_scope, token_budget, dollar_cap FROM agent_definitions;"
# Should show all 10 agents with populated fields

# Run tests
npm test
```
**Hours:** 2

---

### Task 3.10: Integration test — coordinator + sub-agent flow (3h)

- [ ] Write a comprehensive integration test that validates the full orchestration chain
- [ ] Test scenario: "Research what version of Node.js OpenBrain uses"
  - Create a coordinator task with this prompt
  - Coordinator should spawn a Researcher sub-agent
  - Researcher should use code_reader tool to check package.json or Dockerfile
  - Researcher returns structured finding
  - Coordinator synthesizes a response
- [ ] Verify the following at each step:
  - [ ] task_queue has 2 entries (coordinator + researcher)
  - [ ] task_executions has 2 entries with correct parent-child linkage
  - [ ] sessions has 2 entries with parent_session set correctly
  - [ ] cost_events tracks both sessions' costs
  - [ ] Researcher's tool_scope is limited to observe + analyze
  - [ ] Cost rollup: coordinator total includes researcher cost
  - [ ] Structured result: coordinator received envelope, not raw message history
- [ ] Test with mock LLM to keep costs zero and execution predictable

**Files:** Create `tests/integration/orchestration-flow.test.js`
**Behavior:** An end-to-end integration test that exercises the complete orchestration pipeline: task creation → processing → sub-agent spawning → tool execution → result serialization → parent notification → cost rollup. Uses mock LLM responses to make the test deterministic and free. This test is the confidence gate for the orchestration system — if it passes, the core pipeline works.
**Dependencies:** Tasks 3.1-3.9 (full orchestration system)
**Verification:**
```bash
# Run the integration test
npm test -- --grep "orchestration-flow"
# Should pass with all assertions verified

# Check test covers all assertions listed above
grep -c "assert\|expect" tests/integration/orchestration-flow.test.js
# Should be 10+ assertions
```
**Hours:** 3

---

### Task 4.1: Create HOTL approval engine (4h)

- [ ] Build the Human On The Loop approval system core
- [ ] `requestApproval(session, execution, actionType, context)`:
  - Creates an `approval_requests` record with status='pending'
  - Sets `permission_tier` based on the tool's tier
  - Sets `timeout_hours` based on tier defaults (confirm=2h, review=8h) — overridable per brand via trust_config
  - Serializes session state: calls `sessionManager.suspend()` to save working_memory and checkpoint
  - Returns the approval_request ID and resume_token
- [ ] `processApproval(approvalId, approved, userId, note)`:
  - Updates approval_requests: status='approved'/'rejected', responded_at, responded_by, approved_by_user_id, response_note
  - If approved: creates a `task_queue` entry with type='hotl_resume', config includes resume_token and approved action
  - If rejected: creates a task_queue entry with type='hotl_resume', config includes rejection reason
  - Returns the resume task_id
- [ ] `getApprovalContext(approvalId)` — returns the full context for display (what action, why, risk, relevant data)
- [ ] Context builder: extracts from session's working_memory and recent messages to create a human-readable summary of what Lucy wants to do and why

**Files:** Create `src/engine/hotl.js`
**Behavior:** The HOTL engine is the gateway between Lucy's autonomous execution and human oversight. When Lucy encounters an action that requires approval, the HOTL engine suspends her session (freeing memory), creates a trackable approval request, and waits. When a human responds (via Telegram in Phase 4.2), the engine processes the response and queues the session for resumption. The engine doesn't block or hold memory during the wait — everything is persisted to Postgres.
**Dependencies:** Task 1.2 (session manager for suspend/resume), Task 0.4 (approval_requests table), Task 3.1 (task processor for resume tasks)
**Verification:**
```bash
# Unit test: request creates approval and suspends session
npm test -- --grep "hotl-request"
# Should pass: approval_request created, session status='suspended', working_memory persisted

# Unit test: approve creates resume task
npm test -- --grep "hotl-approve"
# Should pass: approval status='approved', task_queue entry created with type='hotl_resume'

# Unit test: reject creates resume task with reason
npm test -- --grep "hotl-reject"
# Should pass: rejection reason in task config, session receives it on resume
```
**Hours:** 4

---

### Task 4.2: Create Telegram approval delivery (3h)

- [ ] Build the Telegram message formatter for approval requests
- [ ] Format approval as a rich Telegram message:
  - Header: "Lucy needs your approval" + permission tier badge
  - Action: what Lucy wants to do (e.g., "Deploy ikawn-openbrain to production")
  - Reason: why she wants to do it (extracted from reasoning context)
  - Risk assessment: high/medium/low based on tool category (Ship=high, Execute=medium, Create=low)
  - Relevant data: for deploys — changed files or commit summary. For code changes — file paths. For data operations — affected tables/rows.
  - Timeout: "Expires in 2 hours" / "Expires in 8 hours"
- [ ] Add inline keyboard with two buttons:
  - "Approve" → callback_data = `hotl_approve:{approval_id}`
  - "Reject" → callback_data = `hotl_reject:{approval_id}`
- [ ] Send via Telegram Bot API to the configured admin user (V's Telegram chat ID)
- [ ] Store the Telegram message_id in the approval_request record (for potential message updates)
- [ ] Handle Telegram API failures gracefully: retry 3 times, then log error and continue (approval still exists in DB — human can check via web)

**Files:** Create `src/engine/approval-telegram.js`
**Behavior:** Transforms an approval request into a well-formatted Telegram message with action buttons. The message provides enough context for V to make an informed decision without opening a laptop — what Lucy wants to do, why, and what the risk is. The inline keyboard makes approving/rejecting a single tap. The Telegram message is the primary approval channel for burn-in; web UI is deferred to later.
**Dependencies:** Task 4.1 (HOTL engine creates approvals), existing `src/utils/telegram.js` (Telegram Bot API utilities)
**Verification:**
```bash
# Unit test: message formatting
npm test -- --grep "approval-telegram-format"
# Should pass: message contains action, reason, risk, timeout, two buttons

# Unit test: callback data format
npm test -- --grep "approval-telegram-buttons"
# Should pass: approve button has "hotl_approve:{id}", reject has "hotl_reject:{id}"
```
**Hours:** 3

---

### Task 4.3: Implement Telegram callback handler (3h)

- [ ] Add a callback_query handler to the existing Telegram webhook in `src/routes/webhooks.js`
- [ ] Parse callback data: extract `hotl_approve:{approval_id}` or `hotl_reject:{approval_id}`
- [ ] On approve:
  - Call `hotl.processApproval(approvalId, true, userId, null)`
  - Answer callback query with "Approved. Lucy is resuming."
  - Edit the original Telegram message to show "APPROVED" badge and disable buttons
- [ ] On reject:
  - Prompt for rejection reason via a follow-up message (optional — if no reason within 30 seconds, proceed without)
  - Call `hotl.processApproval(approvalId, false, userId, reason)`
  - Answer callback query with "Rejected. Lucy will adjust."
  - Edit original message to show "REJECTED" badge with reason
- [ ] Validate: approval_id exists and status is 'pending' (prevent double-tap)
- [ ] Map Telegram user_id to internal user_id for audit trail
- [ ] Handle edge cases: approval already processed (double-tap), approval expired, unknown approval_id

**Files:** Modify `src/routes/webhooks.js` (add callback_query handler)
**Behavior:** Completes the Telegram approval loop. When V taps Approve or Reject on the inline keyboard, this handler processes the response, updates the approval record, and queues the session for resumption. The original message is edited to show the outcome (prevents confusion from stale buttons). Double-taps are handled gracefully — the second tap gets "Already processed" response.
**Dependencies:** Task 4.1 (HOTL engine processApproval), Task 4.2 (Telegram messages with buttons)
**Verification:**
```bash
# Integration test: approve flow
npm test -- --grep "telegram-approve-callback"
# Should pass: callback received → approval processed → session queued for resume → message updated

# Integration test: reject flow
npm test -- --grep "telegram-reject-callback"
# Should pass: callback received → rejection processed → session queued with reason

# Unit test: double-tap handling
npm test -- --grep "telegram-double-tap"
# Should pass: second tap returns "Already processed", no state change
```
**Hours:** 3

---

### Task 4.4: Implement session resume from HOTL (3h)

- [ ] Modify task-processor to handle `hotl_resume` task type
- [ ] When a `hotl_resume` task is picked up:
  - Load the approval_request to get the session's resume_token
  - Call `sessionManager.resume(resumeToken)` to restore the session
  - Load the checkpoint from task_executions
  - Restore the reasoning loop state: message history, working_memory, tool execution context
- [ ] If approved:
  - Continue the reasoning loop from where it left off
  - The gated tool call that triggered HOTL now proceeds (tool executor skips permission check for approved actions)
  - Loop continues normally after the tool returns
- [ ] If rejected:
  - Inject the rejection reason as a user message: "The human reviewer rejected this action. Reason: {reason}. Adjust your approach."
  - Resume the reasoning loop — Lucy sees the rejection and adapts
  - The rejected tool is NOT re-attempted unless Lucy explicitly decides to after adjustment
- [ ] Update the original task_execution status to 'completed' or 'failed' based on the resumed outcome
- [ ] Clear the resume_token after use (one-time-use)

**Files:** Modify `src/engine/task-processor.js` (handle hotl_resume type), modify `src/engine/reasoning-loop.js` (support resume from checkpoint)
**Behavior:** The final piece of the HOTL cycle. A suspended session is restored from Postgres with full context: what it was doing, what tool it wanted to use, and what the human decided. On approval, the session continues seamlessly — the tool executes and the loop proceeds. On rejection, Lucy receives the feedback as a message and gets a chance to try a different approach. The resume is transparent — from Lucy's perspective, she asked for permission, waited, and got an answer.
**Dependencies:** Task 4.1 (HOTL engine), Task 4.3 (callback handler creates resume tasks), Task 1.2 (session resume)
**Verification:**
```bash
# Integration test: approve → resume → tool executes → loop completes
npm test -- --grep "hotl-resume-approve"
# Should pass: session restored, tool executed, final response produced

# Integration test: reject → resume → Lucy adapts
npm test -- --grep "hotl-resume-reject"
# Should pass: rejection message injected, Lucy produces alternative response

# Integration test: resume token one-time use
npm test -- --grep "hotl-resume-token-single-use"
# Should pass: second resume attempt with same token fails
```
**Hours:** 3

---

### Task 4.5: Implement timeout handler (2h)

- [ ] Create a background check that runs every 5 minutes (or as part of the task processor poll cycle)
- [ ] Scan `approval_requests WHERE status = 'pending' AND requested_at + (timeout_hours * INTERVAL '1 hour') < NOW()`
- [ ] For each expired approval:
  - Set status='timeout'
  - Log to trust_ledger with outcome='neutral' (timeouts are not failures — they're just unanswered)
  - Send Telegram notification: "Approval request expired: {action description}. Session remains suspended."
  - Do NOT auto-reject — the session stays suspended. V can manually resume via Mission Control or a future web UI.
- [ ] Optionally: send a reminder 30 minutes before expiry (configurable, default off for burn-in)

**Files:** Modify `src/engine/task-processor.js` (add timeout scan to poll cycle) or create `src/engine/approval-timeout.js` (standalone checker called periodically)
**Behavior:** Prevents approval requests from hanging indefinitely. After the configured timeout (2h for confirm, 8h for review), the request is marked as expired. The session is NOT auto-rejected — it stays suspended, preserving Lucy's work. V gets a notification and can handle it when available. Timeouts are logged as neutral in the trust ledger — they don't count against Lucy's trust score.
**Dependencies:** Task 4.1 (approval_requests table), Task 4.2 (Telegram for notifications)
**Verification:**
```bash
# Unit test: expired approval detected and marked
npm test -- --grep "approval-timeout"
# Should pass: approval older than timeout_hours → status='timeout', trust_ledger entry created

# Unit test: trust_ledger logs neutral outcome
npm test -- --grep "timeout-neutral-trust"
# Should pass: outcome='neutral', not 'failure'
```
**Hours:** 2

---

## Week 8: Phase 4B + Phase 5 — Trust System + Memory v2

**Goal (4B): Trust scores auto-promote/demote based on Lucy's track record.**
**Goal (5): Episodic and semantic memory with pgvector search. Memory-augmented reasoning.**

---

### Task 4.6: Implement trust ledger logging (2h)

- [ ] After every HOTL-gated action completes (whether the original gate was bypassed by trust or not), log to trust_ledger
- [ ] Log entry fields:
  - `brand_id` — which brand context the action was in
  - `domain` — categorized area (monitoring, bug_fixes, staging_deploys, production_deploys, code_changes, cost_decisions, client_facing)
  - `action_type` — specific action (e.g., 'deploy_staging', 'code_edit', 'cost_alert')
  - `outcome` — 'success', 'failure', 'regression', or 'false_positive'
  - `session_id` — which session performed the action
  - `detail` — human-readable description of what happened
- [ ] Determine outcome automatically where possible:
  - Deploy tools: success if no errors in output, failure if deploy command failed
  - Test tools: success if all tests pass, failure if any fail
  - Code changes: success initially (regression detected later if tests fail after deploy)
  - Monitoring alerts: success if alert was actionable, false_positive if no real issue found
- [ ] For outcomes that can't be auto-determined: default to 'success', allow manual override via Mission Control

**Files:** Modify `src/engine/tool-executor.js` (log after gated tool completion), modify `src/engine/hotl.js` (log after HOTL-approved action completion)
**Behavior:** Every action that goes through (or could go through) a HOTL gate gets logged in the trust ledger. This is Lucy's track record — it drives trust score computation. The ledger is append-only and protected (Lucy cannot modify it). Outcomes are determined automatically where the tool's result provides clear signal, and default to success otherwise. Manual regression marking is available via Mission Control for cases where a deploy passes but causes issues later.
**Dependencies:** Task 4.1 (HOTL engine for gated actions), Task 2.2 (tool executor for tool outcomes), Task 0.4 (trust_ledger table)
**Verification:**
```bash
# Integration test: successful tool creates trust entry
npm test -- --grep "trust-ledger-success"
# Should pass: deploy succeeds → trust_ledger entry with outcome='success'

# Integration test: failed tool creates trust entry
npm test -- --grep "trust-ledger-failure"
# Should pass: deploy fails → trust_ledger entry with outcome='failure'
```
**Hours:** 2

---

### Task 4.7: Implement trust score computation (3h)

- [ ] Create a weekly job (runs Sunday midnight IST, cron: `0 18 * * 0` UTC = midnight IST)
- [ ] For each unique `(brand_id, domain)` pair in trust_ledger:
  - Count consecutive successes (from most recent backward until first non-success)
  - Compare against promotion thresholds from ARCHITECTURE.md:
    - Monitoring/Alerts: 20 consecutive → auto
    - Bug Fixes: 10 consecutive → auto
    - Staging Deploys: 15 consecutive → auto
    - Production Deploys: 25 consecutive → auto (but never above confirm for client_facing — permanent gate)
    - Code Changes: 30 consecutive → auto
    - Cost Decisions: 30 days within budget → auto
  - If threshold met and current_tier isn't already 'auto': promote, log promotion
  - If threshold not met but was previously 'auto': check demotion triggers:
    - Any failure in the domain since last evaluation → demote to 'confirm'
    - Send Telegram alert: "Lucy's trust demoted in {domain}: {reason}"
  - Update `trust_scores` table with new tier, consecutive_successes count, last_evaluated
- [ ] On demotion: take effect immediately (don't wait for weekly job — check on each failure event)
- [ ] Promotion only happens weekly (to prevent gaming via rapid cheap actions)
- [ ] Client-facing domain: NEVER promote to auto. Always 'review'. Hard-coded constraint.

**Files:** Create `src/engine/trust-scorer.js`, add cron entry to scheduler for weekly run
**Behavior:** An automated trust management system that promotes Lucy when she proves reliability and demotes her when she fails. Promotions are weekly and conservative — they require sustained track records. Demotions are immediate — a single regression in a promoted domain triggers instant downgrade. This ensures Lucy earns autonomy slowly but loses it quickly, matching the asymmetric risk profile of autonomous operations. The client_facing domain is permanently gated regardless of track record.
**Dependencies:** Task 4.6 (trust ledger has entries to analyze), Task 0.4 (trust_scores table)
**Verification:**
```bash
# Unit test: promotion after threshold
npm test -- --grep "trust-promotion"
# Should pass: 20 consecutive monitoring successes → tier promoted to 'auto'

# Unit test: demotion on failure
npm test -- --grep "trust-demotion"
# Should pass: 1 failure after promotion → tier demoted to 'confirm', Telegram alert sent

# Unit test: client_facing never auto
npm test -- --grep "trust-client-facing-locked"
# Should pass: 100 successes → still 'review', never 'auto'
```
**Hours:** 3

---

### Task 4.8: Wire trust scores to tool permissions (2h)

- [ ] Modify tool-executor to check trust_scores before applying permission tier
- [ ] Flow:
  1. Tool has a base permission tier (from tool interface, e.g., 'confirm')
  2. Look up trust_scores for (brand_id, tool's domain)
  3. If trust score tier is 'auto' and tool's base tier is 'confirm': skip HOTL gate, execute directly
  4. If trust score tier is 'review' and tool's base tier is 'confirm': upgrade to 'review' (stricter gate)
  5. If no trust_scores entry exists: use tool's base tier (default behavior)
- [ ] Domain mapping: each tool maps to a trust domain:
  - deploy_staging → staging_deploys
  - deploy_production → production_deploys
  - code_write, code_edit → code_changes
  - bash_runner → code_changes
  - cost_monitor → cost_decisions
  - notify, gmail → client_facing (permanent review)
- [ ] Trust scores are read-only for Lucy — enforced by PROTECTED_TABLES
- [ ] Log the effective permission tier in tool_results metadata (so audit trail shows whether trust was applied)

**Files:** Modify `src/engine/tool-executor.js` (add trust score lookup before permission check)
**Behavior:** Trust scores dynamically adjust tool permission gates. When Lucy has earned trust in a domain, tools in that domain require less human oversight. When trust is lost, gates tighten. The tool executor becomes trust-aware — it consults the trust_scores table and adjusts the effective permission tier accordingly. This is the mechanism that makes Lucy progressively more autonomous as she proves reliability.
**Dependencies:** Task 4.7 (trust scores exist and are maintained), Task 2.2 (tool executor)
**Verification:**
```bash
# Integration test: promoted domain skips gate
npm test -- --grep "trust-skip-gate"
# Should pass: staging_deploys promoted to 'auto' → deploy_staging executes without HOTL

# Integration test: demoted domain enforces stricter gate
npm test -- --grep "trust-enforce-gate"
# Should pass: domain at 'review' → confirm-tier tool upgraded to review
```
**Hours:** 2

---

### Task 4.9: Integration test — full HOTL cycle (3h)

- [ ] Write a comprehensive integration test for the complete HOTL flow
- [ ] Test scenario: Lucy wants to deploy to production
  - Reasoning loop encounters deploy_production tool call
  - Tool executor checks permission: tier='review'
  - HOTL engine creates approval_request, suspends session
  - Telegram message sent (mock — verify format and buttons)
  - Simulate approve callback
  - Session resumes, deploy executes (mock)
  - Trust ledger entry created
  - Original Telegram message updated with "APPROVED" badge
- [ ] Test timeout scenario separately:
  - Create approval, wait past timeout (use short timeout for test)
  - Verify: status='timeout', trust_ledger logs neutral, notification sent
- [ ] Test rejection scenario:
  - Create approval, simulate reject callback with reason
  - Verify: session resumes, Lucy receives rejection message, adapts approach
- [ ] All tests use mocked LLM and Telegram API

**Files:** Create `tests/integration/hotl-cycle.test.js`
**Behavior:** End-to-end validation of the HOTL pipeline: tool gate → approval creation → session suspension → Telegram delivery → human response → session resume → trust logging. This test is the confidence gate for the HOTL system. It tests the happy path (approve), the rejection path, and the timeout path. All external APIs are mocked.
**Dependencies:** Tasks 4.1-4.8 (complete HOTL system)
**Verification:**
```bash
# Run HOTL integration tests
npm test -- --grep "hotl-cycle"
# Should pass all 3 scenarios: approve, reject, timeout
```
**Hours:** 3

---

### Task 5.1: Implement episodic memory capture (3h)

- [ ] Modify the reasoning loop to auto-capture episodic memories after each turn
- [ ] After each LLM response (and after each tool result), create an episodic_memories entry:
  - `content` — the message content or tool result summary
  - `content_type` — based on what it is:
    - User messages → 'message'
    - Tool results → 'tool_result'
    - Agent decisions (when Lucy explicitly states a decision) → 'decision'
    - Observations (monitoring results, error scans) → 'observation'
    - Errors → 'error'
  - `author_type` — 'user', 'agent', 'system', or 'tool'
  - `author_ref` — user's email, agent slug, tool name
  - `source` — channel from session (chat, telegram, scheduled, sub_agent, webhook)
  - `session_id` — linked to current session
  - `brand_id`, `user_id` — from session context
- [ ] Embedding is NOT computed inline — the episodic_memories row is created with `embedding = NULL`
- [ ] The embedding worker (Task 5.2) picks up rows with null embeddings asynchronously
- [ ] Content_type classification: use simple heuristics (tool results are obvious, decisions contain "I'll", "Let's", "I decided")
- [ ] Do NOT capture every single text_delta — only capture complete messages

**Files:** Modify `src/engine/reasoning-loop.js` (add capture after each turn)
**Behavior:** Every meaningful interaction in Lucy's reasoning process is automatically captured as an episodic memory. This creates a searchable, queryable history of everything Lucy has done, seen, and decided. The capture is non-blocking — it fires-and-forgets the INSERT, and the embedding is computed asynchronously by the embedding worker. This replaces the current `captureMessage()` approach for reasoning loop messages while preserving backward compatibility for other capture sources.
**Dependencies:** Task 0.4 (episodic_memories table), Task 1.1 (reasoning loop)
**Verification:**
```bash
# Integration test: chat produces episodic memories
npm test -- --grep "episodic-capture"
# Should pass: after a 3-turn chat, episodic_memories has entries for user messages, agent responses, and any tool results

# Verify content_type classification
npm test -- --grep "episodic-content-type"
# Should pass: tool results classified as 'tool_result', decisions as 'decision'
```
**Hours:** 3

---

### Task 5.2: Update embedding worker for pgvector (2h)

- [ ] Modify `src/workers/embedding-worker.js` to write embeddings as `vector(768)` type
- [ ] The worker now processes TWO tables:
  - `memories` (legacy, if still in use during transition)
  - `episodic_memories` (new)
- [ ] Use Google `text-embedding-004` (768-dim) for all embeddings
- [ ] Write embeddings using pgvector INSERT syntax: `$1::vector` parameter binding
- [ ] Remove the old float8[] array format code (or keep behind a feature flag for rollback)
- [ ] Remove the application-level cosine similarity math in `src/utils/similarity.js` — pgvector does this in SQL with the `<=>` operator
- [ ] Batch processing: 100 texts per API call, 1500 RPM rate limit
- [ ] Error handling: skip rows that fail after 3 attempts, log the failure, continue with next batch

**Files:** Modify `src/workers/embedding-worker.js`, modify `src/embeddings.js` (if needed), optionally deprecate `src/utils/similarity.js`
**Behavior:** The embedding worker transitions from writing float8 arrays (application-level math) to writing native pgvector vectors (database-level math). This enables the `<=>` cosine distance operator in SQL, eliminating the need for application-code similarity calculations. The worker processes both legacy memories and new episodic_memories tables, using the same Google embedding model for consistent 768-dimensional vectors.
**Dependencies:** Task 0.9 (initial re-embedding validates the approach), Task 5.1 (episodic_memories rows to embed)
**Verification:**
```bash
# Verify embedding worker processes new episodic memories
# Create a test episodic_memories row, wait for worker cycle, check embedding populated
npm test -- --grep "embedding-worker-pgvector"
# Should pass: embedding column populated with vector(768), <=> operator works

# Verify old similarity.js not used by new code paths
grep -rn "similarity" src/ --include="*.js" | grep -v "node_modules" | grep -v "similarity.js"
# New code should use SQL <=> operator, not similarity.js functions
```
**Hours:** 2

---

### Task 5.3: Implement pgvector hybrid search (3h)

- [ ] Create a new search module that replaces `src/utils/recall.js` for the reasoning loop
- [ ] Hybrid search combining:
  - **Vector similarity** (weight 0.7): `1 - (embedding <=> query_embedding)` using pgvector cosine distance
  - **Recency score** (weight 0.3): `1 / (1 + EXTRACT(EPOCH FROM NOW() - created_at) / 86400)` — recent memories score higher
- [ ] Combined score: `0.7 * similarity + 0.3 * recency`
- [ ] Scoped by: `brand_id` (required), `user_id` (optional), `session_id` (optional)
- [ ] Parameters:
  - `query` — text to search for (embedded on-the-fly using text-embedding-004)
  - `topK` — number of results (default 10)
  - `minSimilarity` — minimum vector similarity threshold (default 0.5)
  - `tables` — which tables to search: 'episodic', 'semantic', or 'both' (default 'both')
  - `contentTypes` — optional filter on content_type
- [ ] Search both `episodic_memories` and `semantic_knowledge` tables
- [ ] For semantic_knowledge: only return active facts (WHERE superseded_by IS NULL)
- [ ] Increment `times_referenced` on semantic_knowledge entries that are returned
- [ ] Return results sorted by combined score, each with: id, content, score, source table, metadata
- [ ] Keep `src/utils/recall.js` working for existing code — this is a new module, not a replacement (yet)

**Files:** Create `src/engine/memory-search.js`
**Behavior:** A vector-powered memory retrieval system that finds relevant past experiences and knowledge. Uses pgvector for fast cosine similarity search directly in SQL (no application-level math), combined with a recency bias that prioritizes recent memories. Searches across both episodic (what happened) and semantic (what was learned) memories. This replaces the existing recall.js for the reasoning loop while maintaining backward compatibility for other callers.
**Dependencies:** Task 5.2 (embeddings stored as pgvector), Task 0.4 (episodic_memories + semantic_knowledge tables)
**Verification:**
```bash
# Integration test: hybrid search returns ranked results
npm test -- --grep "memory-search-hybrid"
# Should pass: results ordered by combined score, recent similar memories rank highest

# Integration test: scope filtering works
npm test -- --grep "memory-search-scope"
# Should pass: search for brand_id='ikawn' only returns ikawn memories

# Performance test: search completes under 200ms
npm test -- --grep "memory-search-performance"
# Should pass: search on 1000+ memories completes within 200ms
```
**Hours:** 3

---

### Task 5.4: Implement semantic knowledge extraction (4h)

- [ ] Refactor `src/workers/distillation-worker.js` into a new semantic extractor
- [ ] The extractor processes recent episodic_memories to extract durable facts:
  - Runs periodically (every 30 minutes) or on-demand after significant sessions
  - Selects episodic memories not yet processed (use a `processed_for_extraction BOOLEAN DEFAULT false` flag)
  - Groups by session_id for context
- [ ] For each batch of session memories, call Haiku with a prompt:
  - "Extract factual knowledge from these interactions. For each fact: state the fact, explain the reasoning, and rate confidence 0-1."
  - Input: the session's episodic memories as context
  - Output: structured JSON array of facts
- [ ] For each extracted fact:
  - Check if a similar fact already exists in semantic_knowledge (vector similarity > 0.9)
  - If exists and new fact contradicts: create new entry, set old entry's `superseded_by` to new entry's id
  - If exists and consistent: skip (don't duplicate)
  - If new: create entry with `source_episodes` linking to the episodic memories that produced it
- [ ] Confidence scoring:
  - Single mention in one session → 0.3
  - Mentioned across 2+ sessions → 0.6
  - Explicitly confirmed by user → 0.9
  - Contradicted → 0.1 (and superseded)
- [ ] Use Haiku for extraction (cheapest model — this runs frequently)
- [ ] Track extraction cost in cost_events

**Files:** Create `src/workers/semantic-extractor.js` (new name, new logic), keep `src/workers/distillation-worker.js` as deprecated reference
**Behavior:** An autonomous knowledge builder. The semantic extractor reads through Lucy's experiences (episodic memories) and distills them into durable facts (semantic knowledge). It handles contradictions through supersession chains — when a new fact contradicts an old one, the old fact is linked to the new one, creating a version history. Confidence scores reflect how well-established a fact is. This is how Lucy learns from experience without being explicitly taught.
**Dependencies:** Task 5.1 (episodic memories exist to extract from), Task 5.3 (memory search for deduplication), Task 1.3 (model router for Haiku)
**Verification:**
```bash
# Integration test: facts extracted from episodic memories
npm test -- --grep "semantic-extraction"
# Should pass: session memories → semantic_knowledge entries with confidence scores

# Unit test: contradiction handling
npm test -- --grep "semantic-supersession"
# Should pass: contradicting fact creates new entry, old entry's superseded_by set

# Unit test: deduplication
npm test -- --grep "semantic-dedup"
# Should pass: same fact not duplicated across runs
```
**Hours:** 4

---

### Task 5.5: Implement memory-augmented reasoning (3h)

- [ ] Before each reasoning turn, auto-search memories for relevant context
- [ ] Query construction: use the user's last message (or task prompt) as the search query
- [ ] Search both episodic and semantic memories via memory-search.js (Task 5.3)
- [ ] Filter: only include results with similarity > 0.7 (configurable)
- [ ] Limit: max 5 memories, max 2000 tokens total (prevent context bloat)
- [ ] Inject as a system message before the latest user message:
  ```
  Relevant context from your memory:
  - [episodic] 2026-03-15: "User discussed deploy strategy for MaxFashion..."
  - [semantic] "MaxFashion uses Shopify Plus, integrated since Feb 2026" (confidence: 0.8)
  ```
- [ ] The reasoning loop includes this context in its message array but does NOT expose the raw memory system to the LLM — Lucy sees memories as context, not as something to directly query (she has the recall tool for explicit searches)
- [ ] If no relevant memories found (all below threshold): skip injection (don't add empty context)
- [ ] Track memory retrieval in cost_events (the embedding call for the search query)

**Files:** Modify `src/engine/reasoning-loop.js` (add memory retrieval before each turn)
**Behavior:** Lucy automatically remembers relevant context from past interactions before responding. The memory retrieval is transparent — Lucy doesn't need to explicitly search; the system proactively provides relevant context. This makes Lucy feel like she has continuous memory across sessions. The 5-memory, 2000-token limit prevents old context from overwhelming the current conversation.
**Dependencies:** Task 5.3 (memory search), Task 5.1 (episodic memories to search), Task 5.4 (semantic knowledge to search)
**Verification:**
```bash
# Integration test: relevant memories injected
npm test -- --grep "memory-augmented-reasoning"
# Should pass: ask about "MaxFashion" → memory context includes past MaxFashion discussions

# Unit test: threshold filtering
npm test -- --grep "memory-threshold"
# Should pass: only memories with similarity > 0.7 injected, irrelevant memories excluded

# Unit test: token limit respected
npm test -- --grep "memory-token-limit"
# Should pass: even with many relevant memories, total injected content < 2000 tokens
```
**Hours:** 3

---

### Task 5.6: Implement cross-session continuity (3h)

- [ ] When creating a new session, search for recent sessions by the same user/brand
- [ ] Load the working_memory summary from the last 3 completed sessions (ordered by created_at DESC)
- [ ] Construct an initial context message:
  ```
  Previous session context:
  - Session [date]: Discussed [working_memory.current_plan]. Decided [working_memory.decisions_made]. Next steps: [working_memory.pending_actions].
  - Session [date]: ...
  ```
- [ ] Inject this as the first system message after the base system prompt
- [ ] Only load sessions from the same channel (web sessions don't need Telegram context and vice versa)
- [ ] Only load sessions that completed normally (not failed or killed)
- [ ] If no previous sessions exist: skip (new user/brand)
- [ ] Limit cross-session context to 1000 tokens (summarize if needed)

**Files:** Modify `src/engine/session-manager.js` (add cross-session loading to create), modify `src/engine/reasoning-loop.js` (include cross-session context)
**Behavior:** Lucy has continuity across sessions. When a new chat session starts, she automatically loads context from recent previous sessions — what was discussed, what was decided, what needs follow-up. This creates the experience of a persistent assistant who remembers the ongoing work. The context is lightweight (1000 tokens max) and channel-scoped to keep it relevant.
**Dependencies:** Task 1.7 (working memory stores structured data), Task 1.2 (session manager)
**Verification:**
```bash
# Integration test: new session loads previous context
npm test -- --grep "cross-session-context"
# Should pass: Session 2 starts with context from Session 1's working_memory

# Unit test: channel scoping
npm test -- --grep "cross-session-channel"
# Should pass: web session only loads previous web sessions, not telegram sessions
```
**Hours:** 3

---

### Task 5.7: Implement persistent working memory (3h)

- [ ] Extend Task 1.7's basic scratchpad with structured fields
- [ ] Working memory now includes predefined keys with specific semantics:
  - `current_plan` — what Lucy is currently working on (text/markdown)
  - `decisions_made` — list of decisions made this session
  - `files_modified` — list of file paths touched
  - `pending_actions` — what still needs to be done
  - `key_findings` — important things discovered
  - `custom` — freeform key-value store for agent-specific data
- [ ] On session suspend: all structured fields serialized to Postgres (already done in Task 1.7)
- [ ] On session resume: all structured fields loaded back (already done in Task 1.7)
- [ ] NEW behavior: the reasoning loop is aware of structured fields
  - Before each turn, current_plan and pending_actions are included in the system message
  - After the loop makes a decision, it's auto-appended to decisions_made
  - After a code tool modifies a file, the path is auto-appended to files_modified
- [ ] Auto-detection: parse the LLM's responses for decision indicators ("I'll", "Let's", "I decided", "We should") and auto-append to decisions_made
- [ ] Size management: if any field exceeds 5000 chars, summarize using Haiku (cheap)

**Files:** Modify `src/engine/working-memory.js` (add structured fields), modify `src/engine/reasoning-loop.js` (auto-populate structured fields)
**Behavior:** Working memory evolves from a simple key-value scratchpad into a structured knowledge store. The predefined fields capture the essential state of what Lucy is doing, what she's decided, and what's left to do. This state survives suspend/resume cycles and powers cross-session continuity (Task 5.6). The auto-population of fields (decisions, files modified) reduces the need for Lucy to explicitly manage her own memory — the system tracks it automatically.
**Dependencies:** Task 1.7 (basic working memory), Task 5.6 (cross-session uses structured fields)
**Verification:**
```bash
# Integration test: structured fields populated during session
npm test -- --grep "persistent-working-memory"
# Should pass: after a session with code changes, files_modified contains paths, decisions_made has entries

# Unit test: suspend preserves structured fields
npm test -- --grep "working-memory-persist"
# Should pass: suspend → resume → all structured fields intact

# Unit test: size management
npm test -- --grep "working-memory-size"
# Should pass: field exceeding 5000 chars triggers summarization
```
**Hours:** 3

---

### Task 5.8: Implement memory lifecycle (2h)

- [ ] Create a scheduled job that handles memory expiration
- [ ] Runs nightly (cron: `0 3 * * *` UTC = 8:30am IST)
- [ ] Delete from `episodic_memories WHERE expires_at IS NOT NULL AND expires_at < NOW()`
- [ ] Set `expires_at` based on brand's data retention policy:
  - Default: 90 days
  - Configurable per brand via `brands.autonomy_budget.data_retention_days`
  - On insert to episodic_memories: `expires_at = created_at + INTERVAL '{retention_days} days'`
- [ ] Semantic knowledge NEVER auto-expires (permanent facts)
- [ ] Add an index on `expires_at` for efficient cleanup: `CREATE INDEX idx_episodic_expires ON episodic_memories(expires_at) WHERE expires_at IS NOT NULL`
- [ ] Log cleanup stats: how many memories expired, total storage freed
- [ ] Handle orphaned embeddings: if a memory is deleted, its embedding is automatically gone (same row)

**Files:** Create `src/workers/memory-lifecycle.js` (or add to existing worker), modify `src/engine/reasoning-loop.js` (set expires_at on episodic capture)
**Behavior:** Automatic memory cleanup that respects data retention policies. Episodic memories have a finite lifespan — old experiences are forgotten after the configured retention period. Semantic knowledge (distilled facts) is permanent — Lucy's learned knowledge persists indefinitely. This balances storage costs with memory value: recent experiences are detailed, old experiences fade, but the lessons learned from them remain as semantic facts.
**Dependencies:** Task 5.1 (episodic memories with expires_at), Task 0.4 (table schema)
**Verification:**
```bash
# Unit test: expired memories cleaned up
npm test -- --grep "memory-lifecycle"
# Should pass: memories older than retention_days deleted, semantic knowledge untouched

# Unit test: brand-specific retention
npm test -- --grep "memory-retention-brand"
# Should pass: brand with 30-day retention has memories expire sooner than default 90-day
```
**Hours:** 2

---

### Task 5.9: Integration test — memory across sessions (3h)

- [ ] Write a comprehensive integration test for the full memory pipeline
- [ ] Test scenario:
  - **Session 1:** Discuss "deploy strategy for MaxFashion — we'll use blue-green deploys on Shopify"
    - Episodic memories captured for each message
    - Working memory stores: decisions_made includes "blue-green deploy strategy"
    - Semantic extractor runs: extracts fact "MaxFashion uses blue-green deploy strategy" with confidence 0.6
  - **Session 2 (new session, same user):** Ask "what did we discuss about MaxFashion?"
    - Cross-session context loaded from Session 1's working_memory
    - Memory-augmented reasoning retrieves relevant episodic memories via pgvector
    - Semantic fact about MaxFashion deploy strategy found
    - Lucy references past conversation accurately
  - **Session 3:** Say "Actually, we're switching MaxFashion to canary deploys"
    - Semantic extractor runs: creates new fact about canary deploys
    - Old fact (blue-green) superseded by new fact (canary)
    - Supersession chain intact
- [ ] Verify at each step:
  - [ ] Episodic memories exist with correct content_type and author_type
  - [ ] Embeddings computed (not null) after worker runs
  - [ ] Semantic knowledge extracted with source_episodes linked
  - [ ] pgvector search returns relevant results ranked by combined score
  - [ ] Cross-session context appears in Session 2
  - [ ] Supersession chain: old fact's superseded_by points to new fact

**Files:** Create `tests/integration/memory-pipeline.test.js`
**Behavior:** End-to-end validation of the complete memory system: capture → embed → search → extract → supersede → cross-session recall. This test exercises all three memory layers (working, episodic, semantic) across multiple sessions to verify that Lucy truly remembers and learns. Uses mock LLM for determinism.
**Dependencies:** Tasks 5.1-5.8 (complete memory system)
**Verification:**
```bash
# Run memory pipeline integration tests
npm test -- --grep "memory-pipeline"
# Should pass all assertions across 3 simulated sessions
```
**Hours:** 3

---

## Week 9-10: Phase 6 — Lucy as iKawn Operator

**Goal (Week 9): Lucy has her operator persona and standing scheduled tasks.**
**Goal (Week 10): Lucy can handle an end-to-end feature build. Begin burn-in.**

---

### Task 6.1: Create Lucy's operator persona (3h)

- [ ] Build the operator system prompt that defines Lucy's role as iKawn's autonomous operator
- [ ] The persona includes:
  - **Identity:** "You are Lucy, iKawn's autonomous intelligence engine. You monitor, build, deploy, and analyze."
  - **Standing instructions:**
    - Monitor costs and flag anomalies (>$1/hour or >$5/day)
    - Check error logs every 15 minutes for patterns
    - Prepare daily briefing at 6am IST
    - Flag issues proactively — don't wait to be asked
    - When fixing bugs: diagnose root cause, implement fix, test, deploy to staging, request review for production
  - **System knowledge:** all iKawn systems (ikawn-v3 paths, OpenBrain internals, Fly app names, VPS details)
  - **Communication style:** concise, technical, Telegram-friendly (no markdown headers — use bold and lists)
  - **Decision framework:** always prefer the cheapest correct approach. Use Haiku for background tasks. Never use Opus unless explicitly instructed.
- [ ] Build on existing `src/ruhi/persona.js` patterns but extend for operator mode
- [ ] The operator persona is used when agent_slug='ruhi' and channel='scheduled' or when Lucy is running standing tasks
- [ ] Regular chat persona (existing persona.js) continues for web chat and Telegram conversations

**Files:** Create `src/ruhi/lucy-operator.js`
**Behavior:** Defines Lucy's personality and instructions when she's operating autonomously (not in a conversation with a human). This is the system prompt for scheduled tasks, background monitoring, and proactive operations. It's more directive than the chat persona — it tells Lucy exactly what to monitor, what thresholds to use, and how to communicate findings. The operator persona is activated by channel context, not by explicit selection.
**Dependencies:** Phase 5 complete (Lucy has memory to reference), existing `src/ruhi/persona.js` (patterns to follow)
**Verification:**
```bash
# Unit test: operator persona generates valid system prompt
npm test -- --grep "lucy-operator-persona"
# Should pass: prompt includes identity, standing instructions, system knowledge, decision framework

# Unit test: operator persona differs from chat persona
npm test -- --grep "operator-vs-chat-persona"
# Should pass: operator persona has monitoring instructions, chat persona does not
```
**Hours:** 3

---

### Task 6.2: Configure morning briefing task (2h)

- [ ] Create a standing scheduled task in task_queue:
  - `cron_expression`: `'30 0 * * *'` (6:00 AM IST = 00:30 UTC)
  - `timezone`: `'Asia/Kolkata'`
  - `agent_slug`: `'ruhi'` (coordinator)
  - `task_type`: `'scheduled'`
  - `model_tier`: `'fast'` (Haiku — daily briefing is routine)
  - `dollar_cap`: `0.10`
  - `prompt`: Detailed briefing prompt covering:
    - OpenBrain health: check /api/health endpoint, recent errors in logs
    - ikawn-v3 status: check Fly app status
    - Cost summary: last 24 hours from cost_events, compare to 7-day average
    - Error spikes: any unusual patterns in the last 24 hours
    - Pending approval requests: any unanswered HOTL gates
    - Active sessions: any suspended or running sessions
    - Schedule: what tasks are coming up today
- [ ] The briefing result is sent via Telegram to V
- [ ] Add the seed to `src/agents/seed-all.js` or create a separate standing tasks seed file
- [ ] If briefing fails (tool error, budget hit): send a simplified "Briefing failed: {reason}" Telegram message

**Files:** Create `src/tasks/standing-tasks.seed.js` (or add to existing seed), ensure task_queue has the entry
**Behavior:** Every morning at 6am IST, Lucy automatically prepares and sends a briefing via Telegram. The briefing covers system health, costs, errors, and pending items — everything V needs to know before starting the day. The briefing uses the cheapest model (Haiku) since it's routine aggregation, not complex reasoning. If anything looks abnormal, Lucy highlights it prominently.
**Dependencies:** Task 3.1 (task processor runs scheduled tasks), Task 3.8 (scheduler seeds tasks), Task 6.1 (operator persona)
**Verification:**
```bash
# Verify task seeded
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, cron_expression, timezone, dollar_cap FROM task_queue WHERE prompt ILIKE '%briefing%';"
# Should return: ruhi, '30 0 * * *', Asia/Kolkata, 0.10

# Manual test: trigger the briefing task immediately
# (Insert a task_queue entry with next_run_at = NOW())
# Verify Telegram message received with briefing content
```
**Hours:** 2

---

### Task 6.3: Configure hourly cost monitor (2h)

- [ ] Create a standing scheduled task:
  - `cron_expression`: `'0 * * * *'` (every hour on the hour)
  - `agent_slug`: `'finance'` (analyst)
  - `model_tier`: `'fast'`
  - `dollar_cap`: `0.05`
  - `prompt`: "Check cost_events for the last hour. Calculate total spend. If hourly spend exceeds $1, send an alert via Telegram with breakdown by model and session. If spend is normal, do nothing (no notification needed)."
- [ ] The task uses the `cost_monitor` tool (existing) or `db_query_readonly` tool to check costs
- [ ] Alert format: "COST ALERT: $X.XX spent in the last hour. Top sessions: [session_id: $amount, ...]"
- [ ] Normal operation: task completes silently (no Telegram on normal spend)
- [ ] Threshold is configurable via task config JSONB

**Files:** Add to `src/tasks/standing-tasks.seed.js`
**Behavior:** An hourly cost watchdog. Lucy checks the cost_events table, calculates the hourly spend, and alerts only if it's abnormal. Most hours, this task runs silently and costs <$0.01 (a single Haiku call to analyze costs). When there's a spending anomaly, V gets an immediate Telegram alert with details. This prevents runaway spend situations like the $4+ burn that motivated this entire project.
**Dependencies:** Task 3.1 (task processor), Task 1.4 (cost_events data), Task 6.1 (operator persona)
**Verification:**
```bash
# Verify task seeded
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, cron_expression, dollar_cap FROM task_queue WHERE prompt ILIKE '%cost%' AND prompt ILIKE '%hour%';"
# Should return: finance, '0 * * * *', 0.05
```
**Hours:** 2

---

### Task 6.4: Configure error log scanner (2h)

- [ ] Create a standing scheduled task:
  - `cron_expression`: `'*/15 * * * *'` (every 15 minutes)
  - `agent_slug`: `'tech'` (researcher — observe + analyze)
  - `model_tier`: `'fast'`
  - `dollar_cap`: `0.05`
  - `prompt`: "Check recent Fly logs for ikawn-openbrain. Look for: uncaught exceptions, crash loops (same error repeating), connection failures, timeout spikes, memory warnings. If patterns found, alert via Telegram with the error message and frequency. If logs are clean, do nothing."
- [ ] Uses the `fly_status` tool to read logs (existing tool)
- [ ] Pattern detection: the LLM analyzes raw log output for concerning patterns
- [ ] Deduplication: check working_memory for previously alerted errors — don't re-alert on the same error within 1 hour
- [ ] Alert format: "ERROR PATTERN: '{error_message}' seen {count} times in last 15 minutes. First occurrence: {timestamp}."

**Files:** Add to `src/tasks/standing-tasks.seed.js`
**Behavior:** Continuous error monitoring. Every 15 minutes, Lucy scans the application logs for problems. She uses Haiku to analyze the logs (pattern recognition, not just string matching) and only alerts on real issues. Working memory prevents alert fatigue from repeated notifications about the same error. Most scans complete silently at minimal cost.
**Dependencies:** Task 3.1 (task processor), Task 1.7 (working memory for dedup), existing fly.tool.js
**Verification:**
```bash
# Verify task seeded
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, cron_expression, dollar_cap FROM task_queue WHERE prompt ILIKE '%error%' AND prompt ILIKE '%log%';"
# Should return: tech, '*/15 * * * *', 0.05
```
**Hours:** 2

---

### Task 6.5: Configure weekly health report (2h)

- [ ] Create a standing scheduled task:
  - `cron_expression`: `'0 18 * * 0'` (Sunday midnight IST = 18:00 UTC Saturday)
  - `timezone`: `'Asia/Kolkata'`
  - `agent_slug`: `'ruhi'` (coordinator — may spawn sub-agents)
  - `model_tier`: `'balanced'` (Sonnet — this is a comprehensive analysis)
  - `dollar_cap`: `0.50`
  - `prompt`: Comprehensive weekly report covering:
    - Cost trends: this week vs last week, by model, by session type
    - Error trends: unique errors this week, resolution status
    - Performance insights: average response time, number of sessions, tool usage stats
    - Trust ledger summary: actions taken, successes, failures, current trust levels
    - HOTL stats: approval requests, response times, approval rate
    - Optimization suggestions: opportunities to reduce cost or improve reliability
    - Upcoming work: any pending tasks or scheduled items for next week
- [ ] The coordinator may spawn analyst sub-agents for specific investigations
- [ ] Report sent via Telegram (may be long — split into multiple messages if >4000 chars)
- [ ] Also saved to semantic_knowledge as a weekly snapshot (for future trend analysis)

**Files:** Add to `src/tasks/standing-tasks.seed.js`
**Behavior:** A weekly executive summary of Lucy's operations. Unlike the daily briefing (which is routine), the weekly report uses Sonnet for deeper analysis and may spawn sub-agents for specific investigations. The report covers trends, not just snapshots — comparing this week to last week to spot improvements or regressions. It's saved to semantic memory so Lucy can reference past reports in future analyses.
**Dependencies:** Task 3.1 (task processor), Task 3.2 (agent spawner for sub-agents), Task 1.4 (cost data), Task 4.6 (trust ledger data)
**Verification:**
```bash
# Verify task seeded
psql "$SUPABASE_DIRECT_URL" -c "SELECT agent_slug, cron_expression, model_tier, dollar_cap FROM task_queue WHERE prompt ILIKE '%weekly%';"
# Should return: ruhi, '0 18 * * 0', balanced, 0.50
```
**Hours:** 2

---

### Task 6.6: Test end-to-end feature flow (4h)

- [ ] Give Lucy a real, controlled brief and verify she can handle the full cycle:
  - **Brief:** "Add a /ping endpoint to OpenBrain that returns {status: 'ok', version: process.env.npm_package_version, timestamp: new Date().toISOString()}"
  - This is intentionally simple — a 5-line feature to validate the flow, not the capability
- [ ] Expected flow:
  1. Coordinator receives the brief
  2. Coordinator spawns Researcher to understand the codebase (reads src/index.js, src/routes/)
  3. Researcher returns: "Routes are Express, mounted in index.js, follow pattern in existing route files"
  4. Coordinator spawns Builder to implement: create src/routes/ping.js, modify src/index.js to mount it
  5. Builder returns: "Created ping.js, added route to index.js"
  6. Coordinator spawns Reviewer to test: run npm test, verify no regressions
  7. Reviewer returns: "All 41+ tests pass, new endpoint responds correctly"
  8. Coordinator requests HOTL approval for staging deploy
  9. V approves via Telegram
  10. Coordinator spawns Deployer to deploy to staging (or coordinator uses deploy_staging tool directly)
  11. Coordinator verifies deploy: curl staging endpoint, confirm /ping works
  12. Coordinator reports completion via Telegram
- [ ] Verify at each step:
  - [ ] Correct agent types spawned with correct tool scopes
  - [ ] Structured results returned (not raw message history)
  - [ ] HOTL gate triggered for deploy
  - [ ] All costs tracked and rolled up to coordinator
  - [ ] Trust ledger entries created for the deploy
  - [ ] Total cost for this end-to-end flow is <$2.00

**Files:** This is a manual test procedure — document in `docs/E2E_TEST_PROCEDURE.md`
**Behavior:** The definitive validation of Lucy as an operator. If she can take a feature brief and produce a deployed, working feature with appropriate human checkpoints, the system works. This test exercises every pillar: reasoning loop (multi-turn), tools (code read/write/deploy), orchestration (sub-agents), HOTL (deploy approval), and memory (context across the flow). Document the actual results — what worked, what needed intervention, what cost.
**Dependencies:** All previous phases complete
**Verification:**
```bash
# After the flow completes:
# 1. Verify /ping endpoint works on staging
curl https://ikawn-openbrain.fly.dev/ping
# Should return: {"status":"ok","version":"X.X.X","timestamp":"..."}

# 2. Verify cost
psql "$SUPABASE_DIRECT_URL" -c "SELECT SUM(cost_usd) FROM cost_events WHERE session_id IN (SELECT id FROM sessions WHERE created_at > NOW() - INTERVAL '4 hours');"
# Should be < $2.00

# 3. Verify trust ledger
psql "$SUPABASE_DIRECT_URL" -c "SELECT domain, action_type, outcome FROM trust_ledger ORDER BY recorded_at DESC LIMIT 5;"
# Should show staging_deploy with outcome='success'
```
**Hours:** 4

---

### Task 6.7: Begin burn-in period (ongoing, 14 days)

- [ ] Set all trust gates to 'confirm' (nothing runs on auto yet)
- [ ] Verify all standing tasks are seeded and running:
  - Morning briefing at 6am IST
  - Hourly cost monitor
  - Error log scanner every 15 min
  - Weekly health report on Sundays
- [ ] Create `docs/BURN_IN_LOG.md` for daily observations
- [ ] Daily monitoring checklist (for 14 days):
  - [ ] Check trust_ledger for any failures: `SELECT * FROM trust_ledger WHERE outcome != 'success' AND recorded_at > NOW() - INTERVAL '24 hours';`
  - [ ] Review all Telegram approval requests: were they reasonable? Any false alarms?
  - [ ] Verify cost_events total for the day: `SELECT SUM(cost_usd) FROM cost_events WHERE created_at > NOW() - INTERVAL '24 hours';`
  - [ ] Check for any stuck sessions: `SELECT * FROM sessions WHERE status = 'active' AND updated_at < NOW() - INTERVAL '30 minutes';`
  - [ ] Check for any failed tasks: `SELECT * FROM task_executions WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours';`
  - [ ] Verify no unexpected tool calls: `SELECT tool_name, COUNT(*) FROM tool_results WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY tool_name ORDER BY count DESC;`
- [ ] Log any issues, interventions, or surprises in BURN_IN_LOG.md
- [ ] Criteria for ending burn-in:
  - 14 consecutive days with 0 production incidents caused by Lucy
  - All standing tasks run successfully for 14 days
  - Daily cost is within expected range (< $3/day for operations)
  - No unexpected tool invocations
  - HOTL approval rate > 90% (most requests are reasonable)

**Files:** Create `docs/BURN_IN_LOG.md` (daily entries)
**Behavior:** A 14-day observation period where Lucy runs with maximum human oversight. Every action requires confirmation. The purpose is to build confidence that the system works correctly before relaxing trust gates. Daily monitoring catches issues early. The burn-in log creates a paper trail of Lucy's operational history.
**Dependencies:** Tasks 6.1-6.6 (Lucy operational with all standing tasks)
**Verification:**
```bash
# Daily check (run each day during burn-in):
psql "$SUPABASE_DIRECT_URL" -c "
  SELECT 
    (SELECT COUNT(*) FROM trust_ledger WHERE outcome != 'success' AND recorded_at > NOW() - INTERVAL '24 hours') as failures,
    (SELECT SUM(cost_usd)::numeric(10,2) FROM cost_events WHERE created_at > NOW() - INTERVAL '24 hours') as daily_cost,
    (SELECT COUNT(*) FROM sessions WHERE status = 'active' AND updated_at < NOW() - INTERVAL '30 minutes') as stuck_sessions,
    (SELECT COUNT(*) FROM task_executions WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours') as failed_tasks;
"
# failures=0, daily_cost<$3, stuck_sessions=0, failed_tasks=0
```
**Hours:** Ongoing (14 days, ~30 min/day monitoring = ~7 hours total)

---

### Task 6.8: First trust promotions (1h, after burn-in)

- [ ] After 14 days of clean burn-in, review trust scores
- [ ] Run trust score computation manually (or wait for Sunday job)
- [ ] Expected promotions (if criteria met):
  - **Monitoring/Alerts**: 20+ consecutive accurate alerts → promote to auto
    - Verify: `SELECT consecutive_successes FROM trust_scores WHERE domain = 'monitoring';`
  - **Staging deploys**: 15+ clean staging deploys → promote to auto
    - Verify: `SELECT consecutive_successes FROM trust_scores WHERE domain = 'staging_deploys';`
- [ ] Do NOT promote:
  - Production deploys (never auto — always confirm minimum)
  - Code changes (need more data — 30 consecutive required)
  - Client-facing (permanent review gate)
- [ ] Document each promotion decision with reasoning in BURN_IN_LOG.md
- [ ] After promoting, monitor for 48 hours: auto-approved actions should not cause issues

**Files:** Update `docs/BURN_IN_LOG.md` with promotion decisions
**Behavior:** The first trust graduation. After proving herself for 14 days, Lucy earns autonomy in low-risk domains. Monitoring becomes automatic — Lucy no longer needs to ask before sending alerts. Staging deploys become one-tap confirms instead of detailed reviews. Higher-risk domains remain gated until their thresholds are met. This is the moment Lucy transitions from "assistant that asks for everything" to "operator that handles routine work independently."
**Dependencies:** Task 6.7 (burn-in complete), Task 4.7 (trust score computation)
**Verification:**
```bash
# Verify trust scores after promotion
psql "$SUPABASE_DIRECT_URL" -c "SELECT domain, current_tier, consecutive_successes, promotion_threshold FROM trust_scores ORDER BY domain;"
# monitoring → auto, staging_deploys → auto (if threshold met)
# production_deploys → confirm, code_changes → confirm, client_facing → review

# Verify next monitoring alert runs without HOTL gate
# Check task_executions for next error scan — should complete without approval_request
```
**Hours:** 1

---

## Summary — Complete Task List

| Task | Description | Hours | Week |
|------|-------------|-------|------|
| 0.1 | Audit all write paths | 3 | 1 |
| 0.2 | Provision Supabase project | 1 | 1 |
| 0.3 | Migration script for existing tables | 3 | 1 |
| 0.4 | Create new Lucy v3 tables | 4 | 1 |
| 0.5 | Rename domain_agents to agent_definitions | 2 | 1 |
| 0.6 | Implement dual-write layer | 4 | 2 |
| 0.7 | Wire dual-write into all write paths | 4 | 2 |
| 0.8 | Backfill existing data to Supabase | 3 | 2 |
| 0.9 | Re-embed all memories to 768-dim | 3 | 2 |
| 0.10 | Switchover to Supabase | 2 | 2 |
| 0.11 | Create RLS design doc | 1 | 2 |
| 1.1 | Create reasoning loop core | 4 | 3 |
| 1.2 | Create session manager | 3 | 3 |
| 1.3 | Create model router | 2 | 3 |
| 1.4 | Create cost tracker | 2 | 3 |
| 1.5 | Add SSE streaming to reasoning loop | 3 | 4 |
| 1.6 | Create context compressor | 4 | 4 |
| 1.7 | Implement basic working memory | 2 | 4 |
| 1.8 | Wire reasoning loop to /api/chat | 4 | 4 |
| 1.9 | Wire reasoning loop to Telegram | 3 | 4 |
| 1.10 | Implement 5-minute chat timeout | 2 | 4 |
| 2.1 | Create tool v2 interface | 2 | 5 |
| 2.2 | Create tool executor with retry engine | 4 | 5 |
| 2.3 | Create tool registry v2 | 3 | 5 |
| 2.4 | Migrate existing tools to v2 interface | 4 | 5 |
| 2.5 | Add db_query_readonly tool | 2 | 5 |
| 2.6 | Add plan_creator and test_runner tools | 3 | 5 |
| 2.7 | Add deploy_staging and deploy_production tools | 3 | 5 |
| 2.8 | Wire tool executor into reasoning loop | 2 | 5 |
| 3.1 | Create task processor | 4 | 6 |
| 3.2 | Create agent spawner | 3 | 6 |
| 3.3 | Create agent presets | 2 | 6 |
| 3.4 | Implement structured result return | 3 | 6 |
| 3.5 | Implement LISTEN/NOTIFY for results | 3 | 6 |
| 3.6 | Implement failure cascade | 4 | 6 |
| 3.7 | Implement cost rollup | 2 | 7 |
| 3.8 | Wire scheduler to new task system | 3 | 7 |
| 3.9 | Update agent seed files | 2 | 7 |
| 3.10 | Integration test: orchestration flow | 3 | 7 |
| 4.1 | Create HOTL approval engine | 4 | 7 |
| 4.2 | Create Telegram approval delivery | 3 | 7 |
| 4.3 | Implement Telegram callback handler | 3 | 7 |
| 4.4 | Implement session resume from HOTL | 3 | 7 |
| 4.5 | Implement timeout handler | 2 | 7 |
| 4.6 | Implement trust ledger logging | 2 | 8 |
| 4.7 | Implement trust score computation | 3 | 8 |
| 4.8 | Wire trust scores to tool permissions | 2 | 8 |
| 4.9 | Integration test: full HOTL cycle | 3 | 8 |
| 5.1 | Implement episodic memory capture | 3 | 8 |
| 5.2 | Update embedding worker for pgvector | 2 | 8 |
| 5.3 | Implement pgvector hybrid search | 3 | 8 |
| 5.4 | Implement semantic knowledge extraction | 4 | 8 |
| 5.5 | Implement memory-augmented reasoning | 3 | 8 |
| 5.6 | Implement cross-session continuity | 3 | 8 |
| 5.7 | Implement persistent working memory | 3 | 8 |
| 5.8 | Implement memory lifecycle | 2 | 8 |
| 5.9 | Integration test: memory pipeline | 3 | 8 |
| 6.1 | Create Lucy's operator persona | 3 | 9 |
| 6.2 | Configure morning briefing task | 2 | 9 |
| 6.3 | Configure hourly cost monitor | 2 | 9 |
| 6.4 | Configure error log scanner | 2 | 9 |
| 6.5 | Configure weekly health report | 2 | 9 |
| 6.6 | Test end-to-end feature flow | 4 | 10 |
| 6.7 | Begin burn-in period (14 days) | 7 | 10+ |
| 6.8 | First trust promotions | 1 | 12 |
| **TOTAL** | | **~168h** | **~10 weeks** |

---

## New Files Created (Summary)

```
docs/WRITE_PATH_AUDIT.md              — Catalog of every database write in the codebase
docs/RLS_DESIGN.md                    — Row Level Security design document (future)
docs/ROLLBACK_PROCEDURE.md            — Supabase rollback steps
docs/E2E_TEST_PROCEDURE.md            — End-to-end feature flow test script
docs/BURN_IN_LOG.md                   — Daily burn-in observations

src/db/migrations/001_existing_tables.sql    — Existing tables for Supabase
src/db/migrations/002_lucy_v3_tables.sql     — New Lucy v3 tables
src/db/migrations/003_rename_domain_agents.sql — Rename to agent_definitions
src/db/dual-write.js                         — Dual-write layer

src/engine/reasoning-loop.js          — Multi-turn LLM conversation engine
src/engine/session-manager.js         — Session lifecycle CRUD
src/engine/model-router.js            — Deterministic model selection
src/engine/cost-tracker.js            — Per-session cost tracking
src/engine/context-compressor.js      — Strategic message summarization
src/engine/working-memory.js          — Per-session JSONB scratchpad
src/engine/tool-interface.js          — Tool v2 contract definition
src/engine/tool-executor.js           — Tool dispatch + retry engine
src/engine/tool-registry-v2.js        — Auto-discovery tool registry
src/engine/task-processor.js          — Queue poller + execution engine
src/engine/agent-spawner.js           — Sub-agent creation
src/engine/agent-presets.js           — Agent type definitions
src/engine/result-serializer.js       — Structured result formatting
src/engine/result-notifier.js         — LISTEN/NOTIFY for sub-agent results
src/engine/failure-handler.js         — Centralized failure logic
src/engine/hotl.js                    — HOTL approval engine
src/engine/approval-telegram.js       — Telegram approval formatting
src/engine/approval-timeout.js        — Approval expiry handler
src/engine/trust-scorer.js            — Trust score computation
src/engine/memory-search.js           — pgvector hybrid search

src/tools/v2/                         — All v2 tool wrappers (19+ files)
src/tools/v2/db-query-readonly.tool.js
src/tools/v2/plan-creator.tool.js
src/tools/v2/test-runner.tool.js
src/tools/v2/deploy-staging.tool.js
src/tools/v2/deploy-production.tool.js

src/workers/semantic-extractor.js     — Episodic → semantic knowledge extraction
src/workers/memory-lifecycle.js       — Memory expiration cleanup

src/ruhi/lucy-operator.js             — Operator persona
src/tasks/standing-tasks.seed.js      — Standing scheduled tasks

scripts/backfill-supabase.sh          — Data migration script
scripts/reconcile-counts.sh           — Row count verification

tests/integration/orchestration-flow.test.js  — Coordinator + sub-agent test
tests/integration/hotl-cycle.test.js           — Full HOTL approval test
tests/integration/memory-pipeline.test.js      — Cross-session memory test
```

---

## Existing Files Modified (Summary)

```
src/index.js                  — Start task processor, mount new routes
src/db.js                     — Delegate to dual-write, new table init
src/scheduler.js              — Convert to task_queue seeder
src/workers/embedding-worker.js — pgvector format, dual-table support
src/embeddings.js             — Google text-embedding-004 support
src/routes/chat-api.js        — Reasoning loop integration
src/routes/webhooks.js        — Telegram callback handler, reasoning loop
src/routes/brain-health.js    — Cost rollup queries
src/routes/mission-control.js — agent_definitions references
src/agents/*.seed.js          — New columns (tool_scope, budget, cap)
src/agents/seed-all.js        — agent_definitions table, new columns
src/ruhi/persona.js           — Operator mode branching
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Supabase migration causes data loss | Dual-write period, row-count reconciliation, 7-day Fly PG backup |
| Reasoning loop runs away (cost) | Dollar caps at session and task level, 5-minute chat timeout, hourly cost monitor |
| HOTL Telegram fails | Approval exists in DB regardless — web check possible. 3-retry on Telegram API. |
| Sub-agents spawn infinitely | Max 3 per coordinator (hard limit), total dollar cap on coordinator |
| Trust auto-promotion causes incident | Immediate demotion on any failure, 14-day burn-in before any promotion |
| Memory search too slow | pgvector ivfflat index, 768-dim (not 1536), similarity threshold filtering |
| Standing tasks cost too much | $0.05-$0.10 caps per task, Haiku for all monitoring, cost tracked in cost_events |
| Server restart loses work | All state in Postgres, crash recovery marks running tasks as failed, cron auto-retries |
