# Lucy v3 — Architecture Blueprint

| Field | Value |
|-------|-------|
| **Status** | APPROVED |
| **Author** | Vineet (CEO, iKawn) + Claude (Architecture) |
| **Date** | 2026-04-03 |
| **Governs** | OpenBrain codebase at `/Users/vineet/ikawn-openbrain/` |

---

## 1. Vision & Success Criteria

**Vision:** Lucy is iKawn's autonomous operator — a private, server-side intelligence engine that monitors, builds, deploys, analyzes, and learns. She runs iKawn with minimal human intervention, pausing only at defined trust gates. Once proven internally, she becomes Ruhi — a multi-tenant SaaS where every enterprise gets their own "Lucy."

### Three Sub-Projects

1. **Lucy v3 Engine** — Core agent loop with memory, tools, sub-agents, context management (the "private Claude Code")
2. **Lucy v3 Operator** — Lucy running iKawn on auto-mode (the "first demanding customer")
3. **Ruhi SaaS** — Multi-tenant packaging with budget-based autonomy (the "start selling" part)

### Success Milestones

| Milestone | What it means | You know it's working when... |
|---|---|---|
| Lucy v3 Engine | Core agent loop with memory, tools, sub-agents, context management | Lucy can hold a multi-hour coding session, remember context across days, and use 20+ tools reliably |
| Lucy v3 Operator | Lucy runs iKawn autonomously with HOTL gates | You wake up to a Telegram summary of what Lucy did overnight — deploys, fixes, insights — and nothing broke |
| Trust Earned | Lucy has proven reliability across domains | You've promoted her from "confirm everything" to "auto on ops, confirm on deploys" based on track record |
| Ruhi SaaS | Multi-tenant packaging with budget-based autonomy | MaxFashion's Lucy monitors their store, generates content, flags issues — all within their credit budget |

### Non-Goals for v1

- Voice input/output
- IDE integration (Lucy is server-side, not CLI)
- Real-time collaboration (multi-user same session)
- Custom model training/fine-tuning
- Lucy cannot modify her own system prompt, trust scores, or memory extraction rules without Vineet's explicit approval (self-modification lockout)

### Trust Promotion Criteria (Measurable)

| Domain | Promote to Auto when... | Demote back to Confirm if... |
|---|---|---|
| Monitoring/Alerts | 20 consecutive accurate alerts, 0 false positives | 1 missed critical alert OR 3 false positives in a week |
| Bug Fixes | 10 successful fixes with 0 regressions introduced | 1 regression that reaches production |
| Staging Deploys | 15 clean staging deploys, all tests passing | 1 deploy that breaks staging |
| Production Deploys | 25 clean production deploys via staging-first flow | Any production incident caused by Lucy |
| Code Changes (non-critical) | 30 approved PRs with <10% revision rate | Revision rate exceeds 25% over a week |
| Cost Decisions | 30 days within budget, 0 runaway spend events | Any single action costing >$5 unexpectedly |
| Client-Facing Changes | Never auto. Always full review. | N/A — permanent gate |

Tracked in a `trust_ledger` table. Lucy can see her own trust scores but cannot modify them.

### HOTL Model

Risk-tier gates (auto/confirm/review) with trust escalation over time for Lucy. Budget-based autonomy added later for Ruhi SaaS clients.

---

## 2. Core Architecture — The Five Pillars

### Pillar 1: The Reasoning Loop

The heart of Lucy. A stateful, multi-turn LLM conversation engine that:

- Maintains message history per session
- Calls tools when needed, handles results, continues reasoning
- Streams responses via SSE to the web UI and Telegram
- Compresses context strategically when approaching token limits
- Tracks cost per turn, enforces budgets
- Supports deterministic model routing: Haiku for fast tasks, Sonnet for balanced, Opus for deep reasoning

**How it differs from current OpenBrain:**

- **Current:** Single LLM call per chat message, no multi-turn tool loops
- **Lucy v3:** Multi-turn loop — LLM reasons → calls tools → processes results → reasons again → repeats until task complete or budget hit
- Current `executor.js` has a basic version for scheduled tasks. Lucy v3 unifies chat and scheduled tasks into one loop.

**Model routing is rule-based by task tier, NOT LLM self-selection:**

| Task Tier | Model | When |
|---|---|---|
| fast | Claude Haiku | Scheduled background tasks, monitoring, simple queries, sub-agent researchers |
| balanced | Claude Sonnet | Chat conversations, code generation, most sub-agents, default |
| deep | Claude Opus | Schema migrations, security analysis, multi-file refactors, coordinator planning complex tasks |

Rule: Task tier is set at spawn time based on `agent_definitions.model_tier` or `task_queue.config.model_tier`. Never auto-escalated by the LLM.

### Pillar 2: Memory System (Three Layers)

| Layer | Purpose | Storage | Retention |
|---|---|---|---|
| Working Memory | Current session state, scratchpad, active plans | Postgres-first (JSONB on sessions table), in-memory cache for active sessions only | Session lifetime (hours) |
| Episodic Memory | Conversation history, what happened when, decisions made | Postgres + pgvector (Supabase) | Configurable per brand (30-365 days) |
| Semantic Memory | Distilled facts, learned patterns, domain knowledge | Postgres + pgvector (Supabase) | Permanent (versioned, supersession chain) |

**Key changes from current architecture:**

- **Working memory is new** — agents currently lose all context between runs. Phase 1 gets basic working memory (per-session JSONB scratchpad). Phase 5 gets persistent working memory (survives suspend/resume, cross-session context loading). No rework — Phase 1 builds the foundation, Phase 5 extends it.
- **Episodic** replaces raw `memories` table — structured by session, proper pgvector, unified 768-dim
- **Semantic** replaces `distilled_memory` — same concept but with proper vector search via pgvector
- **Unified embedding dimension** — everything 768-dim (Google text-embedding-004), no mixed dimensions

### Pillar 3: Tool Framework

A registry of capabilities Lucy can invoke. Each tool has:

- A schema (what inputs it takes, what it returns)
- A permission tier (auto / confirm / review)
- A timeout and cost estimate
- A retry policy (max retries, backoff schedule, timeout per attempt)
- Standardized result envelope: `{ok, data, error, metadata}`

**Tool categories for v1:**

| Category | Tools | Permission Tier |
|---|---|---|
| Observe | log_reader, cost_monitor, health_check, analytics_query | Auto |
| Analyze | code_reader, search_memory, web_search, db_query_readonly | Auto |
| Create | code_writer, code_editor, content_draft, plan_creator | Confirm |
| Execute | bash_runner, deploy_staging, test_runner | Confirm |
| Ship | deploy_production, db_migrate, secret_manager | Review |
| Communicate | telegram_notify, email_draft, slack_post | Confirm |

**Standardized Result Envelope (all tools return this):**

```json
{
  "ok": true,
  "data": { },
  "error": null,
  "metadata": {
    "tool": "code_reader",
    "duration_ms": 142,
    "attempt": 1,
    "truncated": false,
    "cost_usd": 0.0
  }
}
```

**Tool Retry Policy (per-tool configurable):**

| Tool Category | Max Retries | Backoff | Timeout | On Final Failure |
|---|---|---|---|---|
| Observe | 3 | 2s, 5s, 15s | 20s | Return error envelope, continue reasoning |
| Analyze | 2 | 3s, 10s | 30s | Return error envelope, continue reasoning |
| Create | 1 | 5s | 60s | Suspend session, alert coordinator |
| Execute | 1 | 10s | 120s | Suspend session, alert coordinator |
| Ship | 0 | N/A | 300s | Suspend session, require HOTL approval to retry |

### Pillar 4: Agent Orchestration

Lucy can spawn sub-agents for parallel work. Each sub-agent:

- Gets its own reasoning loop instance with isolated context
- Has a scoped tool set (researcher agent can't deploy, deployer can't code)
- Reports structured results back to the parent (not message history)
- Runs with its own token budget and hard dollar cap
- Max 3 concurrent sub-agents per coordinator

**Agent types for v1:**

| Agent | Role | Tools Available | Budget | Dollar Cap |
|---|---|---|---|---|
| Coordinator | Lucy herself — delegates, synthesizes, decides | All tools | Session-level | Configurable (default $2) |
| Researcher | Investigates codebases, logs, docs | Observe + Analyze only | 60K tokens | $0.50 |
| Builder | Implements code changes | Analyze + Create | 200K tokens | $1.00 |
| Reviewer | Reviews code, runs tests, validates | Analyze + Execute | 60K tokens | $0.50 |
| Deployer | Handles staging/production deploys | Execute + Ship | 30K tokens | $0.25 |
| Analyst | Business intelligence, analytics | Observe + Analyze + Communicate | 60K tokens | $0.50 |

**Failure Cascade:**

| Scenario | Response |
|---|---|
| Sub-agent hits token budget | Return partial results to coordinator with `truncated: true` |
| Sub-agent hits dollar cap | Kill immediately, return cost report to coordinator |
| Sub-agent tool fails after retries | Sub-agent returns structured error, coordinator decides: retry with different approach, spawn new agent, or escalate to HOTL |
| Sub-agent times out (no progress 10 min) | Kill, return last checkpoint to coordinator |
| Coordinator hits dollar cap | Suspend entire session, Telegram alert with cost breakdown |
| Multiple sub-agents fail (>50%) | Coordinator auto-escalates to HOTL before continuing |

### Pillar 5: HOTL (Human On The Loop) Engine

The approval system. Every action above "Auto" tier pauses and waits.

**Flow:**

1. Agent reaches a gated action (e.g., production deploy)
2. HOTL engine creates an `approval_request` record
3. Sends Telegram message with context + approve/reject buttons
4. Agent session is suspended (serialized to DB, not holding memory)
5. You tap approve → agent resumes from checkpoint
6. You tap reject → agent receives rejection reason, adjusts approach
7. Timeout (configurable per tier) → auto-reject with notification

**HOTL Timeout Configuration:**

| Permission Tier | Default Timeout | Configurable Range |
|---|---|---|
| Confirm (Telegram tap) | 2 hours | 30min — 12 hours |
| Review (read the diff) | 8 hours | 2 hours — 48 hours |
| Expired action | Auto-reject, notify, log to trust_ledger as neutral (not failure) | — |

**Key design choices:**

- Async, not blocking — session state serialized to Postgres, resumed on approval
- Rich context in Telegram — what changed, why, test results, risk assessment
- Audit trail — every approval/rejection logged with timestamp, response time, outcome, and `approved_by_user_id`

**Self-Modification Lockout:**

Lucy cannot modify via any tool:

- Her own system prompts (`agent_definitions.persona`)
- Trust scores/ledger (`trust_ledger`, `trust_scores`)
- Memory extraction rules (distillation worker config)
- HOTL timeout configuration
- Tool permission tier assignments
- Her own dollar caps

Protected by a `PROTECTED_TABLES` constant in the tool framework. Any tool invocation that would write to these tables is rejected at the framework level, not the tool level.

---

## 3. Data Model

### 3A: Database — Supabase (PostgreSQL + pgvector)

**Why Supabase:**

- Native pgvector — real vector similarity search in SQL
- Row Level Security (RLS) — multi-tenant isolation at database level (critical for Ruhi SaaS)
- Connection pooling (Supavisor) — built-in
- Dashboard — table browser, SQL editor, monitoring
- Singapore region — matches Fly deployment

**What stays the same:**

- Still Postgres — existing queries work
- Still accessed via `DATABASE_URL`
- OpenBrain on Fly connects to Supabase PG as external database
- Deploy topology unchanged

### Tables We Keep (Modified)

- **users** — add `trust_config JSONB`
- **brands** — add `autonomy_budget JSONB`, `supabase_project_id`
- **brand_users** — no changes
- **api_keys** — no changes
- **api_key_usage** — no changes
- **conversations** — add `session_id UUID`, `working_memory JSONB`
- **messages** — add `compressed BOOLEAN DEFAULT false`, `token_count INTEGER`
- **domain_agents** → renamed to **agent_definitions** — add `tool_scope TEXT[]`, `token_budget INTEGER`, `dollar_cap NUMERIC(10,4)`

### Tables We Replace

| Old | New | Why |
|---|---|---|
| memories | episodic_memories | Structured by session, pgvector, unified 768-dim |
| distilled_memory | semantic_knowledge | Versioned facts with provenance chain |
| scheduled_tasks | task_queue | Unified queue for scheduled + on-demand + sub-agent tasks |
| task_runs | task_executions | Richer state: checkpoint, cost tracking, parent linkage |

### New Tables

**sessions:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL REFERENCES brands
user_id         INTEGER REFERENCES users
agent_slug      TEXT REFERENCES agent_definitions(slug)
channel         TEXT CHECK (channel IN ('web','telegram','api','scheduled','sub_agent'))
status          TEXT CHECK (status IN ('active','suspended','completed','failed','expired'))
model_tier      TEXT CHECK (model_tier IN ('fast','balanced','deep'))
working_memory  JSONB DEFAULT '{}'
message_count   INTEGER DEFAULT 0
total_tokens    INTEGER DEFAULT 0
total_cost_usd  NUMERIC(10,6) DEFAULT 0
dollar_cap      NUMERIC(10,4) NOT NULL
suspended_at    TIMESTAMPTZ
resume_token    UUID
parent_session  UUID REFERENCES sessions(id)
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()

INDEX idx_sessions_brand_status ON sessions(brand_id, status)
INDEX idx_sessions_parent ON sessions(parent_session) WHERE parent_session IS NOT NULL
INDEX idx_sessions_resume ON sessions(resume_token) WHERE resume_token IS NOT NULL
```

**episodic_memories:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL
user_id         INTEGER
session_id      UUID REFERENCES sessions
content         TEXT NOT NULL
content_type    TEXT CHECK (content_type IN ('message','tool_result','decision','observation','error'))
author_type     TEXT CHECK (author_type IN ('user','agent','system','tool'))
author_ref      TEXT
source          TEXT NOT NULL CHECK (source IN ('chat','telegram','scheduled','sub_agent','webhook'))
tags            TEXT[]
embedding       vector(768)
created_at      TIMESTAMPTZ DEFAULT NOW()
expires_at      TIMESTAMPTZ

INDEX idx_episodic_brand_created ON episodic_memories(brand_id, created_at DESC)
INDEX idx_episodic_session ON episodic_memories(session_id)
INDEX idx_episodic_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
INDEX idx_episodic_tags ON episodic_memories USING gin(tags)
```

**semantic_knowledge:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL
fact            TEXT NOT NULL
reasoning       TEXT
confidence      NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1)
source_episodes UUID[]
embedding       vector(768)
superseded_by   UUID REFERENCES semantic_knowledge(id)
times_referenced INTEGER DEFAULT 0
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()

INDEX idx_semantic_brand ON semantic_knowledge(brand_id)
INDEX idx_semantic_embedding ON semantic_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
INDEX idx_semantic_active ON semantic_knowledge(brand_id) WHERE superseded_by IS NULL
```

**task_queue:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL
agent_slug      TEXT NOT NULL
task_type       TEXT CHECK (task_type IN ('scheduled','on_demand','sub_agent','hotl_resume'))
priority        INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10)
cron_expression TEXT
timezone        TEXT DEFAULT 'Asia/Kolkata'
prompt          TEXT NOT NULL
config          JSONB DEFAULT '{}'
status          TEXT CHECK (status IN ('pending','queued','running','suspended','completed','failed','cancelled'))
next_run_at     TIMESTAMPTZ
enabled         BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT NOW()

INDEX idx_taskq_pending ON task_queue(next_run_at) WHERE status IN ('pending','queued') AND enabled = true
INDEX idx_taskq_brand ON task_queue(brand_id, status)
```

**task_executions:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
task_id         UUID NOT NULL REFERENCES task_queue
session_id      UUID REFERENCES sessions
parent_execution UUID REFERENCES task_executions(id)
status          TEXT CHECK (status IN ('running','suspended','completed','failed','killed','timeout'))
result          JSONB
checkpoint      JSONB
tokens_in       INTEGER DEFAULT 0
tokens_out      INTEGER DEFAULT 0
cost_usd        NUMERIC(10,6) DEFAULT 0
tool_calls      INTEGER DEFAULT 0
error_message   TEXT
started_at      TIMESTAMPTZ DEFAULT NOW()
completed_at    TIMESTAMPTZ

INDEX idx_executions_task ON task_executions(task_id)
INDEX idx_executions_parent ON task_executions(parent_execution) WHERE parent_execution IS NOT NULL
INDEX idx_executions_running ON task_executions(status) WHERE status = 'running'
```

**approval_requests:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL
session_id      UUID NOT NULL REFERENCES sessions
execution_id    UUID NOT NULL REFERENCES task_executions
action_type     TEXT NOT NULL
permission_tier TEXT CHECK (permission_tier IN ('confirm','review'))
context         JSONB NOT NULL
status          TEXT CHECK (status IN ('pending','approved','rejected','timeout','expired'))
timeout_hours   NUMERIC(4,1) NOT NULL
approved_by_user_id INTEGER REFERENCES users
requested_at    TIMESTAMPTZ DEFAULT NOW()
responded_at    TIMESTAMPTZ
responded_by    TEXT
response_note   TEXT

INDEX idx_approvals_pending ON approval_requests(brand_id, status) WHERE status = 'pending'
INDEX idx_approvals_session ON approval_requests(session_id)
```

**trust_ledger:**

```
id              SERIAL PRIMARY KEY
brand_id        TEXT NOT NULL
domain          TEXT NOT NULL
action_type     TEXT NOT NULL
outcome         TEXT CHECK (outcome IN ('success','failure','regression','false_positive'))
session_id      UUID REFERENCES sessions
detail          TEXT
recorded_at     TIMESTAMPTZ DEFAULT NOW()

INDEX idx_trust_brand_domain ON trust_ledger(brand_id, domain, recorded_at DESC)
```

**trust_scores:**

```
brand_id                TEXT NOT NULL
domain                  TEXT NOT NULL
current_tier            TEXT CHECK (current_tier IN ('auto','confirm','review'))
consecutive_successes   INTEGER DEFAULT 0
promotion_threshold     INTEGER NOT NULL
demotion_triggers       INTEGER DEFAULT 0
last_evaluated          TIMESTAMPTZ DEFAULT NOW()
PRIMARY KEY (brand_id, domain)
```

**tool_results:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
execution_id    UUID NOT NULL REFERENCES task_executions
tool_name       TEXT NOT NULL
status          TEXT CHECK (status IN ('success','error','timeout','retrying'))
result          JSONB NOT NULL
attempt         INTEGER DEFAULT 1
duration_ms     INTEGER
created_at      TIMESTAMPTZ DEFAULT NOW()

INDEX idx_toolresults_execution ON tool_results(execution_id)
```

Note: Tool results are for logging/audit only in v1. Caching/deduplication deferred to later optimization phase.

**cost_events:**

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
brand_id        TEXT NOT NULL
session_id      UUID REFERENCES sessions
execution_id    UUID REFERENCES task_executions
event_type      TEXT CHECK (event_type IN ('llm_call','tool_call','embedding','external_api'))
model           TEXT
tokens_in       INTEGER DEFAULT 0
tokens_out      INTEGER DEFAULT 0
cost_usd        NUMERIC(10,6) NOT NULL
metadata        JSONB DEFAULT '{}'
created_at      TIMESTAMPTZ DEFAULT NOW()

INDEX idx_cost_brand_date ON cost_events(brand_id, created_at DESC)
INDEX idx_cost_session ON cost_events(session_id) WHERE session_id IS NOT NULL
INDEX idx_cost_daily ON cost_events(brand_id, DATE(created_at))
```

This is the single source of truth for all costs. Brain Health dashboard, budget enforcement, and billing all read from here.

### 3B: Migration Plan — Fly Postgres to Supabase

#### Phase 1: Provision & Dual-Write (Zero Downtime)

**Step 0.0:** Audit ALL write paths in OpenBrain before implementing dual-write. Every INSERT, UPDATE, DELETE across all routes, workers, and utilities must be cataloged.

1. Provision Supabase project (Singapore region, Pro plan, enable pgvector extension)
2. Create full schema (all tables above) on Supabase
3. Write migration script: Fly PG → Supabase backfill
4. Add dual-write layer — Supabase-first, Fly PG second. Supabase failure = reject write entirely.
5. Re-embed all memories to 768-dim in Supabase (Google text-embedding-004, ~1500 RPM, 100 texts/batch, free tier)
6. Row-count reconciliation: automated script comparing every table between both DBs

#### Phase 2: Validate & Switchover

7. Run read queries against both DBs, compare results for 48 hours
8. Switch `DATABASE_URL` to Supabase
9. Keep Fly PG as read-only backup for 7 days
10. Decommission Fly PG after validation

**Rollback plan:** If post-switchover issues arise within 7-day window:

- Reverse `DATABASE_URL` to Fly PG
- Re-enable dual-write in reverse direction (Fly-first)
- Investigate and fix Supabase issue
- Re-attempt switchover

#### Phase 3: Schema Evolution

11. Drop old tables (memories, distilled_memory, scheduled_tasks, task_runs)
12. RLS design doc created as separate document — covers policy per table, brand isolation rules, service role bypass, testing strategy. NOT hand-waved.

---

## 4. Implementation Phases & Timeline

### Time Estimates (Solo Engineer, Realistic)

| Phase | Estimated Duration | Parallelizable With |
|---|---|---|
| Phase 0: Foundation (DB Migration) | 5-7 days | Nothing (blocking) |
| Phase 1: Reasoning Loop | 7-10 days | Nothing (depends on Phase 0) |
| Phase 2: Tool Framework v2 | 5-7 days | Phase 5.1-5.3 can start |
| Phase 3: Agent Orchestration | 7-10 days | Phase 5.1-5.3 can continue |
| Phase 4: HOTL Engine | 5-7 days | Phase 5.4-5.7 |
| Phase 5: Memory System v2 | 7-10 days (spans Phases 2-4) | Partially parallel |
| Phase 6: Lucy Operator | 5-7 days + 14 days burn-in | Nothing (needs all previous) |
| **Total** | **~8-10 weeks** (including burn-in) | |

### Phase 0: Foundation — Database Migration

**Goal:** Move to Supabase, new schema live, existing features unbroken

| Step | What | Depends On | Verification |
|---|---|---|---|
| 0.0 | Audit ALL write paths in OpenBrain — catalog every INSERT, UPDATE, DELETE | — | Written audit document listing every write path by file |
| 0.1 | Provision Supabase project (Singapore, Pro plan, enable pgvector) | — | Dashboard accessible, vector extension enabled |
| 0.2 | Create full schema with all tables, indexes, constraints, cost_events | 0.1 | All tables exist, constraints enforced, indexes created |
| 0.3 | Write migration script: Fly PG → Supabase backfill | 0.2 | Row counts match across all tables |
| 0.4 | Add dual-write layer (Supabase-first, Fly PG second, Supabase failure = reject) | 0.0, 0.2 | New data appears in both DBs |
| 0.5 | Re-embed all memories to 768-dim in Supabase | 0.3 | All embeddings populated, unified dimension |
| 0.6 | Row-count reconciliation: automated comparison | 0.5 | Zero discrepancy |
| 0.7 | Switch DATABASE_URL to Supabase, Fly PG read-only backup | 0.6 | All features work: chat, Telegram, search, workers |
| 0.8 | Rollback plan documented and tested (can revert in <5 min) | 0.7 | Tested revert procedure |
| 0.9 | RLS design doc created (separate document) | 0.7 | Doc covers: policy per table, brand isolation, service role bypass, testing |

**Exit criteria:** ruhi.ikawn.in fully operational on Supabase. Vector search uses pgvector `<=>` operator. All existing tests pass. Rollback tested.

### Phase 1: The Reasoning Loop

**Goal:** Lucy can hold multi-turn conversations with tool use

| Step | What | Depends On | Verification |
|---|---|---|---|
| 1.1 | Design `src/engine/reasoning-loop.js` — core multi-turn LLM loop | Phase 0 | Code review, unit tests |
| 1.2 | Implement session lifecycle: create → active → suspended → resumed → completed | 1.1 | Sessions table populated correctly |
| 1.3 | Implement model routing: fast/balanced/deep, rule-based at spawn time | 1.1 | Correct model used per tier, verified in cost_events |
| 1.4 | Implement context compression: strategic summarization near token limit | 1.2 | 50+ turn conversation completes, compressed messages marked |
| 1.5 | Implement basic working memory: per-session JSONB scratchpad, Postgres-first with in-memory cache | 1.2 | Agent stores/retrieves notes within session |
| 1.6 | Wire to chat route (`/api/chat`) — replaces single-shot | 1.4, 1.5 | Web chat uses new loop, SSE works |
| 1.7 | Wire to Telegram handler | 1.6 | Telegram uses multi-turn loop |
| 1.8 | Cost tracking: every LLM call → cost_events | 1.3 | Brain Health shows per-session costs |
| 1.9 | Dollar cap enforcement: session killed when cap hit | 1.8 | $0.01 cap test → session stops, returns cost report |
| 1.10 | Chat session timeout: 5-minute max per reasoning turn. Exceed → partial results + convert to background task + notify user | 1.6 | Test: long-running chat turn times out, remaining work queued |

**Exit criteria:** Lucy holds 20+ turn conversation, uses tools mid-conversation, compresses context, tracks costs, respects caps and timeouts.

### Phase 2: Tool Framework v2

**Goal:** Standardized tools with envelopes, retries, permissions

| Step | What | Depends On | Verification |
|---|---|---|---|
| 2.1 | Design tool interface: schema, tier, timeout, retry, envelope | Phase 1 | Interface doc reviewed |
| 2.2 | Implement tool registry v2: discovery, validation, permission checking | 2.1 | All tools loadable |
| 2.3 | Implement standardized result envelope across all tools | 2.2 | Every tool returns `{ok, data, error, metadata}` |
| 2.4 | Implement retry policy engine: per-tool retries, backoff, timeout, failure cascade | 2.2 | Tool fails 2x, succeeds 3rd attempt |
| 2.5 | Implement PROTECTED_TABLES enforcement at framework level | 2.2 | Write to protected table → rejected before execution |
| 2.6 | Migrate existing tools to v2 interface | 2.3 | All 19 tools work with new framework |
| 2.7 | Add new tools: db_query_readonly, plan_creator, test_runner, deploy_staging, deploy_production | 2.6 | Each tested independently |
| 2.8 | Tool result storage: tool_results table populated for logging/audit only | 2.3 | Results logged, no caching/dedup (deferred) |

**Exit criteria:** 25+ tools, standardized envelopes, retries working, permissions enforced, protected tables locked.

### Phase 3: Agent Orchestration

**Goal:** Lucy spawns sub-agents, delegates, collects results, handles failures

| Step | What | Depends On | Verification |
|---|---|---|---|
| 3.1 | Design sub-agent spawning: coordinator → child sessions with scoped tools and budgets | Phase 2 | Design doc reviewed |
| 3.2 | Implement task_queue processor: poll pending, spawn sessions, manage lifecycle. Max 3 concurrent reasoning loops. | 3.1 | Tasks move through statuses correctly |
| 3.3 | Implement sub-agent isolation: own session, scoped tools, own dollar cap. Max 3 concurrent sub-agents per coordinator. | 3.2 | Sub-agent limited to its tool_scope, dies at cap |
| 3.4 | Implement structured result return: sub-agents return `{ok, data, error, metadata}` | 3.3 | Coordinator gets structured result |
| 3.5 | Implement failure cascade: all scenarios from Section 2 Pillar 4 table | 3.3 | Each failure scenario tested |
| 3.6 | Implement agent type presets: Researcher, Builder, Reviewer, Deployer, Analyst | 3.4 | Each spawnable with correct defaults |
| 3.7 | Implement parent-child linkage: cost rollup to coordinator | 3.4 | Total cost visible at coordinator level |
| 3.8 | Wire to scheduler: cron tasks spawn via orchestration. Timezone-aware (IST for briefings). | 3.2 | Daily briefing at 6am IST works correctly |
| 3.9 | Sub-agent result notification: use Postgres LISTEN/NOTIFY for coordinator-to-sub-agent result delivery. Fallback to exponential backoff polling (2s → 5s → 15s) if LISTEN/NOTIFY unavailable (e.g., connection pooler limitations). | 3.4 | Coordinator notified of sub-agent completion within 1 second |

**Exit criteria:** Lucy receives task, spawns Researcher sub-agent, gets structured results, synthesizes response. Failures handled. Costs rolled up.

### Phase 4: HOTL Engine

**Goal:** Lucy pauses at trust gates, asks Telegram, resumes on response

| Step | What | Depends On | Verification |
|---|---|---|---|
| 4.1 | Design HOTL flow: suspension, approval creation, Telegram delivery, resume | Phase 3 | Design doc reviewed |
| 4.2 | Implement session suspend/resume: serialize to `sessions.working_memory` + `task_executions.checkpoint` | 4.1 | Suspend → server restart → resume from exact state |
| 4.3 | Implement approval_requests lifecycle: create → pending → approved/rejected/timeout | 4.2 | Records created with tier-based timeouts |
| 4.4 | Implement Telegram approval UI: rich message, inline approve/reject buttons | 4.3 | Message shows action, why, risk, diff, two buttons |
| 4.5 | Implement approval callback: Telegram tap → update → resume session | 4.4 | Approve → session resumes within 5 seconds |
| 4.6 | Implement rejection handling: session gets reason, adjusts approach | 4.4 | Reject with note → session adapts |
| 4.7 | Implement configurable timeouts per tier per brand | 4.3 | Confirm=2hr, Review=8hr defaults, brand-overridable |
| 4.8 | Implement trust ledger logging | 4.5 | All interactions logged |
| 4.9 | Implement trust score computation: weekly aggregation, auto-promotion/demotion | 4.8 | 20 monitoring successes → auto promotion |

**Exit criteria:** Lucy attempts production deploy, pauses, Telegram sent, you approve, deploy completes. Trust scores visible. Timeouts work per tier.

Note: Web approval UI deferred to Phase 6 or later. Telegram is sufficient for burn-in.

### Phase 5: Memory System v2 (Partially Parallel)

**Goal:** Lucy remembers across sessions, learns, searches intelligently

Steps 5.1-5.3 can begin after Phase 1 completes (parallel with Phases 2-3).
Steps 5.4-5.7 need the reasoning loop to be mature (parallel with Phase 4).

| Step | What | Depends On | Verification |
|---|---|---|---|
| 5.1 | Implement episodic memory capture: sessions auto-create episodic records with author_type, author_ref, content_type | Phase 1 | Chat sessions produce episodic_memories rows |
| 5.2 | Implement semantic extraction: distillation worker → semantic_knowledge with confidence | 5.1 | Facts extracted with reasoning, sources linked |
| 5.3 | Implement hybrid search: pgvector similarity + recency + relevance scoring | 5.1 | Ranked results using `<=>` operator |
| 5.4 | Implement memory-augmented reasoning: loop auto-retrieves relevant memories | 5.3 | Lucy references past conversations accurately |
| 5.5 | Implement cross-session continuity: new session loads relevant context | 5.4 | "Continue where we left off" → Lucy has context |
| 5.6 | Implement memory lifecycle: expiration, supersession chain | 5.2 | Old memories expire, facts version-tracked |
| 5.7 | Implement persistent working memory: survives suspend/resume, extends Phase 1.5 foundation | 5.4 | Suspended session resumes with full scratchpad |

**Exit criteria:** Lucy recalls past decisions. Semantic knowledge grows. Search <200ms via pgvector. Retention policies work.

### Phase 6: Lucy as iKawn Operator

**Goal:** Lucy actively monitors and operates iKawn infrastructure

| Step | What | Depends On | Verification |
|---|---|---|---|
| 6.1 | Create Lucy's operator persona: system prompt, standing instructions, daily routines | Phases 1-5 | Persona reviewed by Vineet |
| 6.2 | Configure standing scheduled tasks: morning briefing, cost monitoring (hourly), error scan (15 min), analytics daily | 6.1 | Tasks running on schedule |
| 6.3 | Implement reactive monitoring: log watcher triggering alerts on error patterns | 6.2 | Error spike → Telegram alert within 2 minutes |
| 6.4 | Implement proactive analysis: weekly health report, cost optimization, performance insights | 6.2 | Weekly digest with actionable insights |
| 6.5 | Test end-to-end feature flow: brief → research → plan → implement → test → staging → review | 6.1 | Complete feature to staging with <3 HOTL interruptions |
| 6.6 | Burn-in period: 2 weeks, all gates at "confirm" | 6.5 | Zero production incidents |
| 6.7 | First trust promotions based on ledger data | 6.6 | Monitoring + staging deploys promoted to auto |

**Exit criteria:** Lucy runs iKawn daily. Morning briefing by 6am IST. Errors caught. Features built from briefs. Trust earned.

### Dependency Graph

```
Phase 0 (DB Migration)
    |
    v
Phase 1 (Reasoning Loop)
    |               \
    v                v
Phase 2 (Tools)    Phase 5.1-5.3 (Memory capture + search)
    |               |
    v               v
Phase 3 (Agents)   Phase 5.4-5.7 (Memory-augmented reasoning)
    |              /
    v             v
Phase 4 (HOTL)
    |
    v
Phase 6 (Operator) <-- requires ALL previous
```

---

## 4.5. Execution Model

Core question: Where does the reasoning loop run, and what happens when things crash?

**Decision: Queue-driven with in-process execution.**

### How It Works

| Concern | Decision | Why |
|---|---|---|
| Where loops run | In-process on same Fly machine as Express | Simplicity. No Redis, no Bull, no separate worker. Postgres task_queue is the queue. |
| Concurrency | Max 3 concurrent reasoning loops per machine. Max 3 sub-agents per coordinator. | 1GB RAM. Each loop ~50MB. 3 loops = 150MB safe headroom. |
| Chat sessions | Synchronous — reasoning loop runs inline with SSE response. No queue. | Chat needs immediate response. |
| Chat timeout | 5-minute max per reasoning turn. Exceed → return partial results, convert to background task, notify user. | Prevents hung connections. |
| Scheduled tasks | Queue-driven — task_queue poller picks them up every 5s. | Async, decoupled from requests. |
| Sub-agents | Spawned as child tasks in task_queue, executed by same poller. | Same execution path as scheduled tasks. |
| Sub-agent notification | Postgres LISTEN/NOTIFY for result delivery. Fallback: exponential backoff polling (2s → 5s → 15s). | Near-instant notification without polling overhead. |
| HOTL suspension | Session serialized to Postgres. Loop exits. Poller picks up resumed sessions. | No memory held during human think time. |
| Server restart | Scan task_executions for status = 'running'. Mark as failed with error = 'server_restart'. Coordinator sees child failure, handles via cascade. Cron tasks auto-retry on next schedule. | Clean recovery. No zombies. |
| Crash mid-tool | Tool results written to tool_results before return to loop. Failed execution's checkpoint shows completed tools. Coordinator retries. | Idempotent recovery. |

### What We Explicitly Avoid

- **No Redis** — Postgres polling sufficient at <100 tasks/day
- **No separate worker process** — one Node.js process runs Express + poller + loops
- **No in-memory queues** — everything in Postgres for crash recovery
- **No WebSocket for sub-agent communication** — LISTEN/NOTIFY or polling

### Scale Ceiling

This works for ~100 concurrent sessions. Ruhi SaaS may need dedicated worker process + Bull/Redis queue — that's Phase 7+.

---

## 5. Architecture Learning Directive

This architecture was designed by studying patterns from external codebases — NOT by copying code.

**Rules governing all implementation:**

- NEVER copy any function, class, or module verbatim from any external codebase
- NEVER paste code and rename identifiers
- NEVER use exact prompt strings from external sources
- NEVER replicate external file/folder structures
- ALWAYS write original implementations that solve the same problems iKawn's way
- ALWAYS use iKawn naming conventions (Lucy, Ruhi, OpenBrain)
- ALWAYS document WHY decisions were made (paper trail of original thought)
- ALWAYS flag in commit messages: "Architecture inspired by [source] — original implementation"

The test: "If Anthropic's lawyers read this function — could they point to their codebase and say 'that's ours'?" If yes → rewrite from scratch.

---

## 6. What Comes After (Not In This Plan)

These are Phase 7+ and get their own design cycle:

- **Ruhi SaaS packaging** — multi-tenant onboarding, budget-based autonomy (model 3), credit billing
- **RLS implementation** — per Phase 0.9 design doc
- **MCP client** — connecting Lucy to external tool servers
- **Skill system** — user-created reusable workflows
- **Web UI redesign** — Lucy's autonomous operator interface
- **Web approval UI** — fallback for Telegram
