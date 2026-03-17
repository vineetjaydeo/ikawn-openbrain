# Ruhi Agent Platform — Design Spec

**Date:** 2026-03-17
**Status:** Draft
**Author:** V + Claude
**Repo:** ikawn-openbrain (ruhi.ikawn.in)

---

## 1. Vision

Ruhi is an autonomous Co-CEO — an agentic C-suite that replaces $50k+/month in executive overhead for SMBs and mid-market eCommerce businesses. Each business function (Marketing, Tech, Sales, R&D, Growth, Customer Success, Finance, HR, Ops) is a specialized domain agent. Ruhi orchestrates them all, makes cross-functional decisions, and only escalates to the human CEO when governance requires it.

**North star:** A business owner connects their tools, and Ruhi starts running the business — researching, creating content, monitoring metrics, qualifying leads, retaining customers, and reporting results. The owner approves and course-corrects. Over time, Ruhi earns more autonomy.

---

## 2. Architecture: Hybrid Scheduler + Agent Executor

### 2.1 Two-Tier Execution

**Tier 1 (Direct):** Simple tasks that don't need reasoning. "Fetch calendar every 2h", "Check GA daily", "Send cost report". Just call the tool function directly. Zero LLM cost.

**Tier 2 (Agent):** Complex tasks that need thinking. "Research competitors", "Draft social content", "Analyze GA anomaly and recommend action". Claude Sonnet 4.6 with tool_use, approval gates, and memory context.

### 2.2 Why Hybrid

- The $4 burn incident proved that simple tasks should never touch an LLM.
- "Check calendar every 2h" doesn't need Claude. But "analyze this calendar conflict and reschedule my day" does.
- Same tool registry for both tiers — the difference is whether Claude picks the tools or the scheduler calls them directly.

---

## 3. Data Model

### 3.1 `scheduled_tasks` — The Task Queue

```sql
CREATE TABLE scheduled_tasks (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  user_id INTEGER REFERENCES users(id),
  agent_slug TEXT NOT NULL DEFAULT 'ruhi',  -- Which domain agent handles this

  -- What
  name TEXT NOT NULL,
  description TEXT,
  tier TEXT NOT NULL DEFAULT 'direct',  -- 'direct' or 'agent'
  tool TEXT NOT NULL,
  config JSONB DEFAULT '{}',

  -- When
  schedule_type TEXT NOT NULL,          -- 'cron', 'interval', 'once', 'trigger'
  cron_expression TEXT,
  interval_minutes INTEGER,
  run_after TIMESTAMPTZ,
  trigger_event TEXT,
  active_window_start TIME,
  active_window_end TIME,
  timezone TEXT DEFAULT 'Asia/Calcutta',

  -- State
  enabled BOOLEAN DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  run_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,

  -- Governance
  requires_approval BOOLEAN DEFAULT false,
  max_cost_per_run NUMERIC(8,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks (next_run_at)
  WHERE enabled = true;
CREATE INDEX idx_scheduled_tasks_brand ON scheduled_tasks (brand_id);
```

### 3.2 `task_runs` — Execution Log

```sql
CREATE TABLE task_runs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES scheduled_tasks(id),
  agent_slug TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  tier TEXT NOT NULL,

  -- What happened
  result JSONB,
  error TEXT,
  cost_usd NUMERIC(8,4) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,

  -- Tier 2: agent plan and approval
  plan JSONB,
  approval_message TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE INDEX idx_task_runs_task ON task_runs (task_id, started_at DESC);
```

### 3.3 `domain_agents` — C-Suite Definitions

```sql
CREATE TABLE domain_agents (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  name TEXT NOT NULL,
  role TEXT NOT NULL,            -- 'Co-CEO', 'CMO', 'CTO', etc.
  persona TEXT NOT NULL,         -- Full system prompt
  tools TEXT[] NOT NULL,         -- Allowed tool names
  memory_tags TEXT[],            -- Filter RAG to these hashtags
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 `growth_experiments` — Hormozi's Rule of 100

```sql
CREATE TABLE growth_experiments (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  agent_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  channel TEXT NOT NULL,          -- 'email', 'social', 'ads', 'partnerships'
  target_reps INTEGER DEFAULT 100,
  completed_reps INTEGER DEFAULT 0,
  results JSONB DEFAULT '{}',
  status TEXT DEFAULT 'running',  -- 'running', 'evaluating', 'winner', 'failed'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);
```

### 3.5 `weekly_scorecards` — Accountability

```sql
CREATE TABLE weekly_scorecards (
  id SERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  week_start DATE NOT NULL,
  scorecard JSONB NOT NULL,       -- Per-agent metrics, wins, risks
  sent_at TIMESTAMPTZ,
  sent_via TEXT,                   -- 'telegram', 'email'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Tool Registry

### 4.1 Standard Interface

Every tool is a file in `src/tools/*.tool.js` with this interface:

```javascript
module.exports = {
  name: 'tool_name',
  description: 'What this tool does (used by Claude for tool selection)',
  tier: 'direct',  // default tier
  parameters: {
    param_name: { type: 'string', required: true, description: '...' }
  },
  async execute(config, context) {
    // context = { brandId, userId, pool, notify, memories }
    return {
      success: true,
      data: { /* structured output */ },
      summary: 'Human-readable result summary'
    };
  }
};
```

### 4.2 Tool Loading

`src/tools/registry.js` scans `src/tools/*.tool.js` on startup, builds a Map. Exposes:

- `getTools()` — all tools
- `getTool(name)` — single tool
- `getToolsForAgent(slug)` — filtered by domain_agents.tools[]
- `getToolSchemas(slugs)` — Anthropic tool_use format for Claude

### 4.3 Phase 1 Tools

| Tool | Tier | Description |
|------|------|-------------|
| `calendar_read` | direct | Fetch Google Calendar events (next N hours) |
| `calendar_create` | agent | Create/modify calendar events |
| `gmail_read` | direct | Fetch inbox/threads matching query |
| `gmail_draft` | agent | Draft email (LLM writes, requires approval) |
| `gmail_send` | agent | Send email (always requires approval) |
| `ga_report` | direct | Fetch GA4 summary (sessions, top pages, anomalies) |
| `ga_analyze` | agent | Deep GA analysis with recommendations |
| `ikawn_generate` | agent | Trigger Genie/Remix/Prism/Lazarus on ikawn OS |
| `web_search` | agent | Claude's built-in server-side tool (not a tool file — see note) |
| `content_draft` | agent | Draft social media posts/captions |
| `notify` | direct | Send message via Telegram or web chat |
| `system_status` | direct | OpenBrain health, worker status, costs |
| `fly_status` | direct | Fly.io app status, recent deploys |
| `manage_task` | direct | Create/modify/list/enable/disable scheduled tasks |

### 4.4 Phase 2+ Tools (later)

| Tool | Description |
|------|-------------|
| `browser_action` | Playwright/extension-based web control |
| `shopify_read` | Order/inventory monitoring |
| `social_publish` | Post to connected social accounts |
| `docs_write` | Create help docs / release notes |
| `crm_update` | Update CRM records |
| `expense_track` | Log/categorize expenses |
| `invoice_scan` | OCR + categorize invoices |

---

## 5. Domain Agents (C-Suite)

### 5.1 Agent Model

A domain agent is NOT a separate process. It's a system prompt + tool subset + memory scope that runs within the same Tier 2 executor. The `domain_agents` table is the **single source of truth** for agent definitions. Claude receives the agent's persona as system prompt when executing a Tier 2 task for that agent.

**Persona management:** `src/agents/*.seed.js` files are seed scripts only — they run once during initial setup to INSERT into `domain_agents`. After that, persona edits happen via DB (admin endpoint or direct SQL). The executor always reads from the `domain_agents` table, never from filesystem. This allows per-brand persona customization without code changes.

### 5.2 Ruhi (Co-CEO) — Orchestrator

**Role:** Routes tasks to domain agents. Makes cross-functional decisions. Resolves conflicts (Marketing wants budget, Finance says no). Human interface for commands and approvals.

**Tools:** All tools + `manage_task`

**Unique behaviors:**
- Default agent for all direct commands
- Routes ambiguous requests to the right domain agent
- Compiles weekly scorecards across all agents
- Maintains the decision journal

### 5.3 Marketing Agent (CMO) — Phase 1

**Role:** Content strategy, social media, GA analysis, brand voice, campaigns, SEO.

**Tools:** `ga_report`, `ga_analyze`, `content_draft`, `ikawn_generate`, `web_search`, `notify`

**Scheduled tasks (default):**
- Daily: GA morning report (Tier 1 → ga_report)
- Daily: Draft social media posts for next day (Tier 2 → content_draft + ikawn_generate)
- Weekly: Competitive content audit (Tier 2 → web_search + content_draft)
- Weekly: Content performance analysis (Tier 2 → ga_analyze)

**Flywheel integration:** Every insight from any agent → Marketing gets a content brief automatically.

### 5.4 Tech Agent (CTO) — Phase 1

**Role:** System health, deployment monitoring, error tracking, release notes, help docs, infra costs.

**Tools:** `system_status`, `fly_status`, `ga_report`, `web_search`, `content_draft`, `notify`

**Scheduled tasks (default):**
- Every 2h: System health check (Tier 1 → system_status)
- Daily: Cost report — OpenAI + Anthropic + Fly.io (Tier 1 → system_status)
- On trigger (deployment): Write release notes + help docs (Tier 2)
- On trigger (error spike): Investigate and alert (Tier 2)

### 5.5 Growth Agent (CGO) — Phase 1

**Role:** Experiment design and execution, channel discovery, lead magnets, viral loops, referral programs.

**Tools:** `web_search`, `content_draft`, `gmail_draft`, `ga_analyze`, `notify`

**Unique behaviors:**
- Manages `growth_experiments` table
- Never evaluates an experiment before target_reps (Rule of 100)
- Proposes new experiments based on what's working
- Cross-pollinates winning patterns across channels

**Scheduled tasks (default):**
- Daily: Check experiment progress, update reps (Tier 1)
- Weekly: Evaluate completed experiments, propose next batch (Tier 2)

### 5.6 Customer Success Agent (CCO) — Phase 1

**Role:** Churn detection, retention interventions, testimonial collection, NPS, customer health scores.

**Tools:** `gmail_read`, `gmail_draft`, `web_search`, `ga_analyze`, `notify`

**Unique behaviors:**
- Monitors user engagement patterns (from intelligence worker's cohort data)
- Detects churn risk signals: declining usage, support complaints, billing issues
- Proactively drafts retention emails or offers
- Collects testimonials from happy customers (auto-detected from engagement)

**Scheduled tasks (default):**
- Daily: Scan cohort data for churn signals (Tier 1 → query intelligence_snapshots)
- Weekly: Customer health report (Tier 2 → analyze patterns + recommend actions)
- On trigger (churn risk): Draft retention intervention (Tier 2 → requires approval)

### 5.7 Phase 2 Agents

**Sales (CRO):** Lead qualification, outreach, pipeline, follow-ups.
**R&D (CPO):** Competitor research, market trends, product gaps, feature ideation.

### 5.8 Phase 3 Agents

**Finance (CFO):** Cost monitoring, budget tracking, forecasting, P&L, ROI attribution.
**HR (CHRO):** Hiring pipeline, onboarding, performance.
**Ops (COO):** Inventory, fulfillment, supplier management, reorders.

---

## 6. Task Scheduler

### 6.1 Polling Loop

Added to existing `src/scheduler.js` alongside GitHub/Calendar crons:

```javascript
setInterval(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Advisory lock prevents overlap if scheduler tick is slow or Fly restarts mid-tick
    const lockResult = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('task_scheduler'))");
    if (!lockResult.rows[0].pg_try_advisory_xact_lock) return; // another tick is running

    // FOR UPDATE SKIP LOCKED prevents double-execution per task row
    const { rows: dueTasks } = await client.query(`
      SELECT * FROM scheduled_tasks
      WHERE enabled AND next_run_at <= NOW()
      ORDER BY next_run_at ASC LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);

    for (const task of dueTasks) {
      // Check active window: (NOW() AT TIME ZONE timezone)::TIME BETWEEN start AND end
      if (!isInActiveWindow(task)) continue;

      if (task.tier === 'direct') {
        await toolRegistry.get(task.tool).execute(task.config, context);
      } else {
        await agentExecutor.run(task, agentDef);
      }
      // Log to task_runs, update next_run_at, handle failures
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}, 30_000);  // every 30s
```

**Lock strategy:** Single Fly machine today, but `pg_try_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED` is required for crash-restart overlap safety. The advisory lock is transaction-scoped — automatically released on commit/rollback, no manual cleanup needed.

### 6.2 Schedule Calculation

- `cron`: Use `croner` npm package to parse cron expressions and calculate next occurrence respecting timezone
- `interval`: last_run_at + interval_minutes
- `once`: run_after (then disable after execution)
- `trigger`: No next_run_at — fired by event dispatcher (see 6.4)

### 6.3 Active Window

Tasks only run between `active_window_start` and `active_window_end` in the configured timezone. Default: 07:00 - 19:00 IST. If a task is due outside the window, it waits until window opens.

Check: `(NOW() AT TIME ZONE task.timezone)::TIME BETWEEN active_window_start AND active_window_end`

### 6.4 Trigger Events

An in-process `EventEmitter` handles trigger-based tasks (no Redis, no external pub/sub):

```javascript
// src/utils/event-bus.js
const EventEmitter = require('events');
const eventBus = new EventEmitter();
module.exports = eventBus;
```

**Event names and emitters:**

| Event | Emitted by | Triggers |
|-------|-----------|----------|
| `deployment.completed` | Fly.io deploy webhook (new route) or fly_status tool detecting version change | Tech Agent: write release notes |
| `error.spike` | Error logging middleware (when error count > threshold in 5min window) | Tech Agent: investigate and alert |
| `churn.risk` | Intelligence worker (when cohort analysis detects declining engagement) | Customer Success: draft retention |
| `experiment.completed` | Growth Agent (when completed_reps >= target_reps) | Growth Agent: evaluate results |
| `ga.anomaly` | ga_report tool (when metric deviates > 2 std dev from 7-day mean) | Marketing Agent: analyze |

**Listener (in scheduler.js):**
```javascript
eventBus.on('*', async (eventName, payload) => {
  const triggers = await pool.query(
    'SELECT * FROM scheduled_tasks WHERE trigger_event = $1 AND enabled',
    [eventName]
  );
  for (const task of triggers.rows) {
    await pool.query(
      'UPDATE scheduled_tasks SET next_run_at = NOW() WHERE id = $1',
      [task.id]
    );
    // Scheduler picks it up on next 30s tick
  }
});
```

Note: Node's EventEmitter doesn't support wildcard `'*'`. Use `eventemitter2` package for wildcard support, or register individual listeners per known event name.

---

## 7. Agent Executor (Tier 2)

### 7.1 Execution Flow

```
1. Load domain agent definition (persona, tools, memory_tags)
2. Build context:
   - Task description + config
   - RAG search (filtered by agent's memory_tags)
   - Last 3 task_runs for this task (learn from past)
   - Any pending corrections for this agent (CORRECTION memories)
3. Call Claude Sonnet 4.6 with:
   - System prompt: agent persona + task context
   - tool_use definitions from agent's tool subset
   - Max 10 tool call rounds
4. Multi-turn loop:
   - Claude returns tool_use → execute tool → feed result back
   - Continue until Claude produces final text response
5. Parse final output:
   { summary, artifacts, notification, requires_approval, approval_message }
6. If requires_approval:
   - Save to task_runs with status 'awaiting_approval'
   - Send approval_message via Telegram (inline buttons)
   - Return (don't block scheduler)
7. On approval callback → execute pending actions
8. On rejection → capture reason as CORRECTION memory
9. Log everything to task_runs + capture summary to memories
```

### 7.2 LLM Fallback

```
Claude Sonnet 4.6 (Anthropic) — primary
  → timeout 60s or API error
  → retry once with 5s backoff
  → OpenAI GPT-5.2 — fallback
  → if both fail: log error, notify via Telegram, increment failure count
```

### 7.3 Cost Tracking

Every LLM call during execution logs:
- `input_tokens`, `output_tokens` from API response
- Estimated `cost_usd` from a configurable rate table in `src/agent/llm-client.js` (updated when pricing changes — check Anthropic/OpenAI pricing pages)
- Accumulated to `task_runs.cost_usd` and `task_runs.tokens_used`
- If single run exceeds `max_cost_per_run` → stop execution, alert

---

## 8. Conversational Control

### 8.1 Task Management via Chat

Both Telegram and web chat handlers add `manage_task` as a Claude tool_use definition. When a user says "check my calendar every 2 hours", Claude calls `manage_task` with the appropriate parameters.

```javascript
// Added to Claude's tool definitions in chat handlers
{
  name: 'manage_task',
  description: 'Create, modify, list, enable, disable, or immediately run scheduled tasks',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'disable', 'enable', 'delete', 'list', 'run_now', 'update'] },
      task_uuid: { type: 'string' },
      name: { type: 'string' },
      tool: { type: 'string' },
      agent_slug: { type: 'string' },
      schedule_type: { type: 'string', enum: ['cron', 'interval', 'once', 'trigger'] },
      interval_minutes: { type: 'number' },
      cron_expression: { type: 'string' },
      config: { type: 'object' },
      requires_approval: { type: 'boolean' }
    },
    required: ['action']
  }
}
```

### 8.2 Telegram Approval Buttons

Tier 2 tasks that need approval send Telegram messages with inline keyboards:

```
[Approve] [Reject] [Edit]
```

Approval callbacks hit a new webhook endpoint on OpenBrain that:
1. Updates `task_runs.status` to 'approved' or 'rejected'
2. If approved: executes pending actions
3. If rejected: captures reason, asks for feedback via follow-up message

### 8.3 Proactive Reporting

Agents send results via the `notify` tool. Notifications include contextual inline buttons for follow-up actions:

```
Marketing Agent: "Morning GA Report for March 17:
  - Sessions: 1,240 (+8% WoW)
  - Organic: 890 (+15%)
  - Top page: /products/summer — 340 views
  - Anomaly: /checkout bounce rate up 12%

  [Analyze bounce spike] [Draft social about summer collection] [Full report]"
```

---

## 9. Flywheel Mechanics

### 9.1 Cross-Agent Content Pipeline

Every agent's insights feed Marketing's content queue:
- R&D finds trend → content brief
- Customer Success resolves issue → "how we fixed it" story
- Finance hits milestone → social proof post
- Tech ships release → changelog + help doc
- Growth experiment wins → case study brief

Implementation: Each agent, when producing an insight, also captures a memory tagged `content_brief`. Marketing Agent's scheduled content planning task queries these briefs.

### 9.2 Weekly Scorecard

Every Sunday 8pm IST, Ruhi (Co-CEO) compiles a scorecard:

```
Per agent:
- Tasks run / succeeded / failed
- Key metric moved (agent-specific)
- Top win this week
- Top risk this week
- Experiments status (Growth)
- Cost spent on LLM

Cross-functional:
- Total actions taken
- Total human approvals (ratio of approve vs reject)
- Revenue attributed (when measurable)
- Biggest decision made
- Recommendation for next week's priority
```

Stored in `weekly_scorecards`, sent via Telegram.

### 9.3 Decision Journal

Already exists (`log_decision` in MCP + `decisions` in memory). Enhanced with:
- Monthly review: Ruhi analyzes past decisions vs outcomes
- Pattern extraction: "We tend to overinvest in X and underinvest in Y"
- Captured as `BUSINESS_INSIGHT` memories for future reasoning

### 9.4 Learning Loop (Bones for A-Mode)

```
Rejection → CORRECTION memory → future RAG context → better outputs → higher approval rate
                                                                            │
                                                                            ▼
                                                          Confidence threshold rises
                                                                            │
                                                                            ▼
                                                          Auto-approve above threshold
                                                                            │
                                                                            ▼
                                                               Full autonomy (A-mode)
```

Per-agent tracking:
- `approval_rate` = approved / (approved + rejected) over rolling 30 days
- When approval_rate > 0.9 for 30 days → suggest raising autonomy
- Human can toggle `requires_approval = false` per task or per agent

---

## 10. Integration Points

### 10.1 Google APIs (OAuth2)

- **Calendar:** Read events, create events, modify events
- **Gmail:** Read inbox, draft, send (with approval)
- **Analytics (GA4):** Reporting API for sessions, pages, events, conversions

OAuth2 tokens stored in DB per brand_id. Refresh token flow handled by `src/utils/google-auth.js`.

```sql
CREATE TABLE brand_oauth_tokens (
  id SERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  provider TEXT NOT NULL,            -- 'google'
  scopes TEXT[] NOT NULL,            -- ['calendar.readonly', 'gmail.modify', 'analytics.readonly']
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, provider)
);
```

Token refresh: `google-auth.js` checks `expires_at` before every API call. If expired, refreshes using `refresh_token`, updates the row. If refresh fails, disables dependent tasks and alerts via Telegram.

### 10.2 ikawn OS (os.ikawn.com)

Existing integration via `POST /api/external/generate` + `GET /api/external/generations/:id`. Marketing and Growth agents use this for image/video creation.

### 10.3 Telegram Bot

Existing `@OpenBrain_Ruhi_bot`. Enhanced with:
- Inline keyboard buttons for approvals
- Callback query handler for button responses
- File/image sending for generated content previews

### 10.4 Web Chat (ruhi.ikawn.in)

Existing web chat. Enhanced with same tool_use definitions as Telegram. Task management visible in chat UI.

---

## 11. LLM Configuration

### 11.1 Model Selection

| Use Case | Model | Rationale |
|----------|-------|-----------|
| Chat (Telegram + web) | Claude Sonnet 4.6 | Persona consistency, web search built in |
| Tier 2 task execution | Claude Sonnet 4.6 | Full reasoning, never cheap out |
| Distillation worker | Claude Sonnet 4.6 | Quality extraction matters |
| Embeddings | OpenAI text-embedding-3-small | Cost-effective, already integrated |
| Moderation | OpenAI moderation API | Purpose-built, cheap |
| Fallback (all) | OpenAI GPT-5.2 | If Anthropic is down, Ruhi must keep running |

### 11.2 Cost Safety

- Per-task `max_cost_per_run` budget cap
- Global daily budget: `daily_budget_usd` column on `brand_budgets` table (Phase 2 — use a hardcoded $10/day default in Phase 1)
- 3 consecutive failures → auto-disable task + alert
- Cost tracked per run in `task_runs.cost_usd`
- Weekly cost summary in scorecard

---

## 12. Implementation Phases

### Phase 1 — Foundation + Core C-Suite (Build Now)

**Database:**
- Add to `initSchema()`: `scheduled_tasks`, `task_runs`, `domain_agents`, `brand_oauth_tokens`
- Seed: Ruhi + Marketing + Tech agent definitions (via `agents/seed-all.js`)

**Infrastructure:**
- `src/tools/registry.js` — auto-loader for *.tool.js
- `src/agent/executor.js` — Tier 2 agent loop
- `src/agent/llm-client.js` — Anthropic primary + OpenAI fallback
- Task scheduler polling loop in `src/scheduler.js`
- `src/utils/event-bus.js` — in-process event emitter for triggers
- `src/utils/google-auth.js` — OAuth2 token management
- Telegram inline keyboard + callback handler

**Tools:**
- `calendar_read`, `gmail_read`, `ga_report` (Tier 1)
- `calendar_create`, `gmail_draft`, `gmail_send`, `ga_analyze` (Tier 2)
- `ikawn_generate`, `content_draft` (Tier 2)
- `notify`, `system_status`, `fly_status`, `manage_task` (Tier 1)
- `web_search` via Claude server-side tool (not a tool file)

**Agents:**
- Ruhi (Co-CEO) — orchestration + direct commands
- Marketing (CMO) — GA + content + campaigns
- Tech (CTO) — health + costs + release docs

**Google OAuth:**
- Calendar API, Gmail API, GA4 Reporting API
- `brand_oauth_tokens` table for token storage + auto-refresh

**Chat integration:**
- `manage_task` tool_use added to BOTH Telegram handler (webhooks.js) AND web chat (ruhi-chat.js)
- Approval flow via Telegram inline buttons + callback query handler

### Phase 1.5 — Growth + Customer Success (After Phase 1 Proven)

- Growth Agent (CGO) — experiments, channel testing
- Customer Success Agent (CCO) — churn detection, retention
- `growth_experiments` table
- `weekly_scorecards` table + scorecard compilation
- Content flywheel: cross-agent content briefs

### Phase 2 — Sales + R&D + Dashboard

- Sales Agent (CRO) + R&D Agent (CPO)
- Tools: `crm_update`, `social_publish`, `docs_write`
- Cross-agent task delegation
- Web dashboard: task list, run history, agent activity, experiment tracker
- Learning loop: corrections → memory → improved approval rate
- `daily_budget_usd` column on `brand_budgets`

### Phase 3 — Finance + HR + Ops + Autonomy

- Finance (CFO), HR (CHRO), Ops (COO) agents
- Tools: `expense_track`, `invoice_scan`, `browser_action`
- A-mode toggle: per-agent confidence thresholds
- Multi-tenant onboarding: brand signup → agent suite provisioned
- ROI attribution engine

### Phase 4 — Enterprise Scale

- Per-brand agent customization
- Custom agent creation by brands
- Cross-brand anonymized learning (mothership)
- RuhiOS.com B2C split (if warranted)
- Mobile app as thin client
- Browser extension tool

---

## 13. File Structure (New + Modified)

### New Files
```
src/
  tools/
    registry.js              — Load *.tool.js, expose Map, generate Anthropic tool schemas
    calendar.tool.js         — Google Calendar read/create
    gmail.tool.js            — Gmail read/draft/send
    ga.tool.js               — Google Analytics report/analyze
    ikawn-os.tool.js         — Trigger generations on os.ikawn.com
    notify.tool.js           — Send Telegram/web notifications
    system.tool.js           — OpenBrain health, worker status, costs
    fly.tool.js              — Fly.io app status
    content.tool.js          — Draft social media content
    manage-task.tool.js      — CRUD for scheduled_tasks
  agent/
    executor.js              — Tier 2 agent loop (Claude + tools + approval)
    llm-client.js            — Anthropic primary + OpenAI fallback, configurable rate table
  agents/
    ruhi.seed.js             — Co-CEO persona (seed script → INSERT into domain_agents)
    marketing.seed.js        — CMO persona seed
    tech.seed.js             — CTO persona seed
    growth.seed.js           — CGO persona seed
    customer-success.seed.js — CCO persona seed
    seed-all.js              — Runs all seed scripts (idempotent, INSERT ON CONFLICT DO NOTHING)
  utils/
    google-auth.js           — OAuth2 token management, auto-refresh, failure alerting
    event-bus.js             — In-process EventEmitter for trigger-based tasks
    scorecard.js             — Weekly scorecard compilation
```

**Note:** `web_search` is NOT a tool file. It's Claude's server-side tool (`web_search_20250305`), automatically included in Tier 2 executor's tool definitions as `{ type: 'server_tool', name: 'web_search_20250305' }`.

**Note:** Cron parsing uses the `croner` npm package (not a custom parser). Thin wrapper in scheduler.js.

### Modified Files
```
src/scheduler.js           — Add task polling loop + event bus listeners
src/db.js                  — Add new tables via CREATE TABLE IF NOT EXISTS (follows existing pattern)
src/routes/webhooks.js     — Add manage_task tool_use to intelligence-telegram handler
                             + approval callback handler for inline buttons
src/routes/ruhi-chat.js    — Add manage_task tool_use to web chat handler
src/ruhi/persona.js        — Enhance existing system prompt with task management awareness
                             (this file stays as chat persona; Tier 2 uses domain_agents table)
```

**Schema pattern:** All new tables added to `initSchema()` in `src/db.js` using `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` — matching the existing migration pattern. No separate migration files.

---

## 14. Non-Negotiable Rules

1. **No Redis.** Postgres is the queue. Advisory locks prevent double-execution.
2. **No separate worker process.** Everything runs in the same Express process on Fly.io.
3. **captureMessage() is still the ONLY door** for memory writes.
4. **Anthropic primary, OpenAI fallback.** Never cheap out on reasoning or distillation.
5. **3-failure auto-disable.** No runaway loops. Ever.
6. **Active window enforcement.** No 3am API calls unless explicitly configured.
7. **brand_id scoping everywhere.** V is tenant zero, but the system is multi-tenant from day one.
8. **Approval before publish/send.** Medium autonomy now, bones for full autonomy.
9. **Never expose agent internals in user-facing UI.** Users see "Ruhi" — not "Marketing Agent executing task #47".
10. **Every agent action captured to memory.** The system learns from everything it does.
