# Ruhi: Memory, Intelligence & Self-Learning System — Claude Code Prompt

## READ THIS FIRST

Before writing ANY code, do the following:

1. **Discover the existing codebase.** Read the project structure, package.json, existing database schema, existing modules, and understand what already exists. DO NOT create files that duplicate existing functionality.
2. **Identify the tech stack.** Confirm: Node/TypeScript or Python? Express or Fastify? Drizzle or Prisma or raw SQL? What ORM/query patterns are already used? Match them exactly.
3. **Find existing patterns.** How are background jobs currently run? How are API endpoints structured? How is auth handled? How are env vars loaded? Replicate these patterns.
4. **Check for pgvector.** Is the extension already enabled? If not, add it in the migration.
5. **Check for existing tables.** Some tables referenced here (users, brands, conversations) may already exist. DO NOT recreate them. Reference them.

**If anything is ambiguous, follow what the existing codebase does. When in doubt, read more code before writing any.**

---

## ARCHITECTURE MAP (Re-read this before starting each phase)

This is the entire system in 30 lines. If you lose context, come back here.

```
THE LOOP: Sense → Decide → Govern → Orchestrate → Outcome → Sense again

TABLES (12):
  memory_events          -- raw event inbox (append-only)
  distilled_memory       -- learned knowledge (with reasoning, supersession, embeddings)
  session_summaries      -- compressed conversations
  research_topics        -- what Ruhi monitors
  research_raw           -- fetched articles (append-only, re-distillable)
  research_findings      -- distilled research insights
  learning_velocity      -- metrics tracking Ruhi's improvement over time
  worker_locks           -- idempotency for background jobs
  brand_budgets          -- per-brand spend limits (atomic enforcement)
  action_queue           -- approval state machine (pending → approved → executed)
  action_log             -- immutable audit trail with real costs
  cost_catalog           -- what things cost (versioned)

DATA FLOW:
  Events IN → memory_events → distiller → distilled_memory → recall() → generation prompt
  Caption edits → voice rules (with reasoning)
  Post metrics → outcome reflection → creative insights
  Brave Search → research_raw → research_findings → EXTERNAL_INSIGHT
  Generation: recall() → memories injected → content created → memoriesUsed[] tracked
  All autonomous actions → governAction() → budget check + confidence check + approval → executeAction() → action_log
  Post outcomes → memory feedback (confidence adjustment on memories_used)
  Human rejections → CORRECTION memories (Ruhi learns from "no")
  New brand → onboardBrand() → budget + industry tag + research topics + cross-brand pull

WORKERS (3 crons):
  1. Distillation (daily 2am): Pass 1 events + Pass 2 outcomes + weekly strategic rollup + weekly cross-brand + expire stale actions + monthly product reflection
  2. Research (daily 3am): Stage 1 fetch + Stage 2 distill
  3. Budget reset (daily midnight): reset monthly budgets on reset day

KEY PRINCIPLE: Every distilled_memory has a "reasoning" field. Every action in action_queue has a "reasoning" field.
Reasoning is NEVER optional. It's what makes autonomy trustable. If you can't explain why, don't do it.

UNIT SYSTEM: All costs are tracked in CREDITS (integer). 1 credit = smallest billable unit.
  See cost_catalog for credit values per action. brand_budgets uses credits (integer).
```

---

## What is Ruhi

Ruhi is iKawn's operating intelligence. Not a chatbot. Not an AI layer. The OS itself.

Ruhi operates on one loop:

**Sense → Decide → Govern → Orchestrate → Outcome → (measure) → Sense again**

Everything lives inside Ruhi. One codebase, one deployment, five capabilities as internal modules:

- **Sense**: Capture events, research trends, detect signals, monitor platforms
- **Decide**: Distill knowledge, reflect on outcomes, form strategy, learn
- **Govern**: Enforce budgets, gate approvals, audit every action, ensure trust
- **Orchestrate**: Generate content, post to platforms, manage workflows, talk to APIs
- **Outcome**: Measure results, capture performance data, feed back into Sense

os.ikawn.com/ruhi is a window into Ruhi -- a controlled, stripped-down conversational interface. Ruhi herself is the full loop underneath.

---

## System Boundaries (Non-Negotiable)

ONE codebase. ONE deployment. Internal module boundaries, NOT network boundaries.

All new modules use direct function imports. NO internal HTTP calls between Sense/Decide/Orchestrate/Outcome. HTTP endpoints are ONLY exposed for:
- External interfaces that need to call Ruhi (os.ikawn.com/ruhi frontend, Telegram webhooks)
- Future third-party integrations

Infrastructure: Fly.io (Postgres + pgvector). Brave Search API for web research. Fal.ai for generation. Meta Graph API for Instagram. Telegram for triggers. Shopify API for store management.

---

## What to Build Now

Add the Memory, Intelligence & Governance layer to Ruhi. This covers Sense + Decide + Govern and introduces the features that separate a tool from irreplaceable commerce infrastructure:

1. **Memory capture & distillation** -- raw events become structured knowledge
2. **Self-reflection** -- Ruhi reviews outcomes and learns what works
3. **External intelligence** -- Ruhi researches trends, platform changes, market shifts
4. **Cross-brand intelligence** -- learnings from one brand accelerate ALL brands (THE network effect)
5. **Governance** -- budgets, approvals, cost tracking, audit trail (the trust layer that makes autonomy possible at scale)
6. **Self-directed evolution** -- Ruhi suggests what iKawn should build next
7. **Progressive autonomy** -- confidence + budget + approval = governed autopilot

---

## Phase 1: Schema & Event Capture

Create these Postgres tables via migration. All tables live in the same database as existing tables.

**IMPORTANT: Follow the existing migration pattern in the codebase. If migrations are in `src/db/migrations/`, put them there. If they use Drizzle, use Drizzle. If raw SQL, use raw SQL. Match exactly.**

### Table 1: `memory_events`

The Sense layer's inbox. Every event in the system flows through here.

```sql
CREATE TABLE IF NOT EXISTS memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  brand_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_type_created
  ON memory_events (user_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_events_unprocessed
  ON memory_events (created_at) WHERE processed_at IS NULL;
```

Valid `event_type` values (enforce via CHECK constraint or application-level validation):
- `conversation` -- chat message or exchange
- `caption_edit` -- user edited Ruhi-generated content
- `campaign_result` -- post performance metrics
- `signal` -- external signal detected
- `shopify_event` -- store event
- `capability_gap` -- user asked for something Ruhi can't do
- `manual_override` -- user manually intervened in an automated workflow

Append-only. Never deleted. Never updated (except `processed_at`).

### Table 2: `distilled_memory`

The Decide layer's output. What Ruhi has LEARNED.

```sql
CREATE TABLE IF NOT EXISTS distilled_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  brand_id UUID,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1.0),
  source_event_ids UUID[] DEFAULT '{}',
  reasoning TEXT,
  superseded_by UUID REFERENCES distilled_memory(id),
  embedding_model TEXT,
  embedding VECTOR(1536),
  last_used TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distilled_user_brand_type
  ON distilled_memory (user_id, brand_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_distilled_active
  ON distilled_memory (user_id, brand_id) WHERE superseded_by IS NULL;
```

Valid `memory_type` values:
- `USER_PREFERENCE` -- how a user likes to work
- `BRAND_VOICE_RULE` -- how a brand communicates
- `BUSINESS_INSIGHT` -- performance or strategic learning
- `WORKFLOW_PATTERN` -- how tasks should be executed
- `CORRECTION` -- something Ruhi got wrong
- `CREATIVE_PATTERN` -- what visual/content style works
- `CONTENT_STRATEGY` -- what content approach works
- `AUDIENCE_INSIGHT` -- what the audience responds to
- `PERFORMANCE_INSIGHT` -- timing, format, tactical
- `STRATEGIC_RECOMMENDATION` -- weekly rollup recommendation
- `EXTERNAL_INSIGHT` -- from research/trends
- `PRODUCT_SUGGESTION` -- what to build next
- `CROSS_BRAND_INSIGHT` -- anonymized learning across brands (see Phase 8)
- `COST_EFFICIENCY` -- ROI and cost-per-outcome learnings (see Phase 9)

Key columns explained:
- `reasoning`: WHY Ruhi learned this. Human-readable evidence chain. Example: "Extracted from 7 caption edits where user consistently shortened sentences and removed exclamation marks." This is what gets shown in the UI when Ruhi cites her reasoning.
- `superseded_by`: When a newer insight contradicts an older one, the older one is NOT deleted. Its `superseded_by` points to the replacement. This preserves history and audit trail.
- `embedding_model`: Which model generated this embedding. If model changes, stale embeddings can be identified and regenerated.

**Supersession rule:** During upsert, if a new insight contradicts an existing one (cosine similarity > 0.85 but content is meaningfully different), set the old one's `superseded_by` to the new one's id. When querying, always filter `WHERE superseded_by IS NULL` to get active memories only.

### Table 3: `session_summaries`

```sql
CREATE TABLE IF NOT EXISTS session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  brand_id UUID,
  summary TEXT NOT NULL,
  key_decisions JSONB DEFAULT '[]',
  open_threads JSONB DEFAULT '[]',
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table 4: `research_topics`

```sql
CREATE TABLE IF NOT EXISTS research_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'global',
  search_queries TEXT[] NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'biweekly')),
  last_researched TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table 5: `research_raw`

```sql
CREATE TABLE IF NOT EXISTS research_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES research_topics(id),
  search_query TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT,
  raw_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  distilled_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_raw_hash ON research_raw (content_hash);
CREATE INDEX IF NOT EXISTS idx_research_raw_undistilled ON research_raw (fetched_at) WHERE distilled_at IS NULL;
```

### Table 6: `research_findings`

```sql
CREATE TABLE IF NOT EXISTS research_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES research_topics(id),
  source_raw_ids UUID[] DEFAULT '{}',
  distilled_insight TEXT NOT NULL,
  relevance_to_clients TEXT,
  memory_type TEXT DEFAULT 'EXTERNAL_INSIGHT',
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1.0),
  embedding_model TEXT,
  embedding VECTOR(1536),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_findings_topic ON research_findings (topic_id, created_at);
```

### Table 7: `learning_velocity`

**This is new. Critical for demonstrating Ruhi's value.**

```sql
CREATE TABLE IF NOT EXISTS learning_velocity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_brand ON learning_velocity (brand_id, metric_type, measured_at);
```

Valid `metric_type` values:
- `voice_accuracy` -- percentage of outputs the user DIDN'T edit (1 - edit_rate)
- `autonomy_level` -- average confidence score across active memories for this brand
- `edit_rate` -- percentage of outputs requiring user edits this period
- `suggestions_accepted` -- percentage of Ruhi suggestions accepted without changes
- `days_to_threshold` -- days from brand onboarding to reaching confidence > 0.6
- `onboarding_acceleration` -- how much faster new brands reach autonomy vs the first brand (network effect metric)
- `rejection_rate` -- percentage of proposed actions rejected by humans (should decrease over time)
- `cost_per_engagement` -- average cost in credits per engagement unit (like + save + comment) for this brand
- `budget_utilization` -- percentage of monthly budget used (efficiency metric)

This powers the **Learning Velocity Dashboard** -- the single most important visual for demos and pitches.

### Table 8: `worker_locks`

```sql
CREATE TABLE IF NOT EXISTS worker_locks (
  worker_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL,
  locked_by TEXT
);
```

### Table 9: `brand_budgets`

**Every brand gets a budget. Every action has a cost. No exceptions.**

```sql
CREATE TABLE IF NOT EXISTS brand_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL UNIQUE,
  budget_monthly_credits INTEGER NOT NULL DEFAULT 0,
  spent_monthly_credits INTEGER NOT NULL DEFAULT 0,
  budget_reset_day INTEGER NOT NULL DEFAULT 1,
  auto_pause_at_percent INTEGER NOT NULL DEFAULT 100,
  warn_at_percent INTEGER NOT NULL DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exhausted')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Key design:
- `spent_monthly_credits` is atomically incremented on every action. No eventual consistency. `UPDATE brand_budgets SET spent_monthly_credits = spent_monthly_credits + $cost WHERE brand_id = $id AND spent_monthly_credits + $cost <= budget_monthly_credits RETURNING *`. If the RETURNING is empty, budget exceeded -- reject the action.
- `auto_pause_at_percent`: default 100 (pause when fully spent). Enterprise clients may set 90% to leave buffer.
- `warn_at_percent`: fires a `signal` memory_event when crossed so Ruhi can notify the user.
- Monthly reset: a worker resets `spent_monthly_credits = 0` and advances `current_period_start` on the `budget_reset_day`.

### Table 10: `action_queue`

**Every autonomous action passes through this queue. The approval state machine.**

```sql
CREATE TABLE IF NOT EXISTS action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  estimated_cost_credits INTEGER NOT NULL DEFAULT 0,
  confidence FLOAT NOT NULL,
  reasoning TEXT NOT NULL,
  memories_used UUID[] DEFAULT '{}',
  governance_result TEXT NOT NULL DEFAULT 'pending'
    CHECK (governance_result IN ('pending', 'auto_approved', 'awaiting_human', 'approved', 'rejected', 'revision_requested', 'expired', 'budget_blocked', 'failed')),
  governance_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_queue_pending
  ON action_queue (brand_id, governance_result, created_at)
  WHERE governance_result IN ('pending', 'awaiting_human');
CREATE INDEX IF NOT EXISTS idx_action_queue_brand_time
  ON action_queue (brand_id, created_at);
```

Valid `action_type` values:
- `post_instagram` -- publish content to Instagram
- `generate_content` -- create images/video via agents (Genie, Prism, Lazarus, Muse)
- `schedule_post` -- schedule future post
- `update_shopify` -- modify Shopify store
- `send_message` -- outbound communication
- `run_campaign` -- multi-step campaign execution

Valid `governance_result` transitions:
```
pending → auto_approved (confidence > threshold AND budget available AND no human gate required)
pending → awaiting_human (confidence below threshold OR action type requires human approval)
pending → budget_blocked (insufficient budget)
awaiting_human → approved (human approves)
awaiting_human → rejected (human rejects → logged as CORRECTION memory)
awaiting_human → revision_requested (human wants changes → Ruhi revises and resubmits as new action)
approved → executed (Orchestrate runs it)
auto_approved → executed (Orchestrate runs it)
approved → failed (execution error → budget refunded → logged for learning)
auto_approved → failed (execution error → budget refunded → logged for learning)
pending → expired (not acted on within expires_at window)
```

Key design:
- `estimated_cost_credits`: Ruhi estimates cost BEFORE execution. Governance checks budget BEFORE approving.
- `memories_used`: links to distilled_memories that informed this action. Enables outcome → memory feedback loop.
- `reasoning`: human-readable explanation of why Ruhi wants to take this action. Shown in approval UI and notification.
- `expires_at`: actions don't live forever. Default 24 hours for posts, 1 hour for time-sensitive actions.

### Table 11: `action_log`

**Immutable audit trail. Every action that executes, with its real cost.**

```sql
CREATE TABLE IF NOT EXISTS action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_queue_id UUID NOT NULL REFERENCES action_queue(id),
  brand_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  actual_cost_credits INTEGER NOT NULL DEFAULT 0,
  cost_breakdown JSONB DEFAULT '{}',
  outcome_status TEXT NOT NULL CHECK (outcome_status IN ('success', 'partial', 'failed')),
  outcome_details JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_log_brand ON action_log (brand_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_action_log_type ON action_log (brand_id, action_type, executed_at);
```

`cost_breakdown` example:
```json
{
  "generation_credits": 10,
  "api_calls": { "fal_ai": 1, "meta_graph": 1 },
  "llm_tokens": { "input": 2400, "output": 800 },
  "total_credits": 15
}
```

This table becomes the basis for:
- Per-brand P&L reporting
- Cost-per-outcome intelligence (cost / engagement metrics from campaign_result events)
- ROI optimization: Ruhi learns which action types deliver best value per credit spent

### Table 12: `cost_catalog`

**What things cost. Updated as pricing changes.**

```sql
CREATE TABLE IF NOT EXISTS cost_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  sub_type TEXT,
  cost_credits INTEGER NOT NULL,
  description TEXT,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cost_catalog_lookup
  ON cost_catalog (action_type, sub_type)
  WHERE effective_until IS NULL;
```

Seed with current costs:
```json
[
  {"action_type": "generate_content", "sub_type": "genie", "cost_credits": 1, "description": "Text-to-image (1 credit)"},
  {"action_type": "generate_content", "sub_type": "remix_standard", "cost_credits": 2, "description": "Remix standard"},
  {"action_type": "generate_content", "sub_type": "remix_hd", "cost_credits": 6, "description": "HD Remix"},
  {"action_type": "generate_content", "sub_type": "prism", "cost_credits": 15, "description": "Prism creative shot (avg)"},
  {"action_type": "generate_content", "sub_type": "lazarus", "cost_credits": 20, "description": "Image-to-video"},
  {"action_type": "generate_content", "sub_type": "muse", "cost_credits": 40, "description": "Marketing video per second"},
  {"action_type": "post_instagram", "sub_type": null, "cost_credits": 0, "description": "Post to Instagram (API call only)"},
  {"action_type": "llm_reflection", "sub_type": null, "cost_credits": 1, "description": "Per reflection LLM call"},
  {"action_type": "brave_search", "sub_type": null, "cost_credits": 0, "description": "Search query (free tier)"}
]
```

Ruhi looks up estimated cost from this catalog when building an action. If pricing changes, update `effective_until` on old row and insert new row. Historical costs remain accurate.

---

## Phase 2: Edit Delta Capture & Voice Rule Extraction

Highest immediate client value. Build first after schema.

### A. `captureEditDelta(params)`

Direct function call (NOT HTTP). Called by any Ruhi interface when a user edits Ruhi-generated content.

```typescript
interface CaptureEditDeltaParams {
  userId: string;
  brandId: string;
  originalContent: string;
  editedContent: string;
  contentType: 'caption' | 'email' | 'ad_copy' | 'description';
  context?: Record<string, any>;
}
```

Logic:
1. Compute diff (use `diff` npm package or whatever diffing utility exists in codebase)
2. Store as `memory_event`: `event_type = 'caption_edit'`, payload = `{ original, edited, diff, contentType, context }`
3. Update `learning_velocity`: calculate current edit_rate for brand (edits / total outputs this week), insert `voice_accuracy` = `1 - edit_rate`

### B. `distillEditDeltas(userId, brandId)`

Called by daily worker. Also callable on-demand when 5+ unprocessed edits exist (faster initial learning).

1. Fetch unprocessed `caption_edit` events for user/brand
2. If fewer than 3, skip
3. **Token budget**: If batch exceeds 3000 tokens of edit data, split into chunks. Process sequentially. Merge results.
4. Send to LLM:

```
You are analyzing content edits for a brand. A user edited AI-generated content.

Here are the original and edited versions:
{edits_as_json}

Extract DURABLE voice and style rules from the editing patterns.

Return ONLY a JSON array (no markdown, no preamble, no explanation):
[
  {
    "memory_type": "BRAND_VOICE_RULE",
    "content": "descriptive rule in plain English",
    "confidence": <number between 0.3 and 0.95>,
    "reasoning": "evidence for this rule from the edits"
  }
]

Confidence scoring (follow this strictly):
- 0.3-0.5: Pattern seen in 2 edits (tentative)
- 0.5-0.7: Pattern seen in 3-4 edits (emerging)
- 0.7-0.85: Pattern seen in 5+ edits (established)
- 0.85-0.95: Pattern seen consistently with zero counter-examples (strong)
Never assign above 0.95. That requires explicit user confirmation.

Only extract rules visible in 2+ edits. Ignore one-off changes.
Focus on: tone, sentence length, emoji usage, punctuation, word choices,
capitalization, hashtag preferences, CTA style, product name formatting.

If no clear patterns exist, return an empty array [].
```

5. **Parse safely**: Strip markdown fences. Try JSON.parse. If parse fails, log raw response and skip batch (do NOT set processed_at -- retry next run).
6. For each extracted rule:
   - Generate embedding
   - Query existing active memories: cosine similarity > 0.85 AND `superseded_by IS NULL`
   - If similar exists AND content aligns: bump confidence by 0.1 (cap 0.99), merge source_event_ids, update reasoning with new evidence, set `last_updated`
   - If similar exists AND content CONTRADICTS: create new memory, set old memory's `superseded_by` = new id
   - If no similar exists: insert new memory
7. Set `processed_at = NOW()` on source events

---

## Phase 3: Unified Distillation & Self-Reflection Worker

Single background job: `runDistillation()`

**Scheduling**: Match existing scheduler pattern. If nothing exists, use `node-cron`. Daily at 2:00 AM UTC.

**Idempotency**: Acquire lock in `worker_locks` before starting. If lock exists and is < 1 hour old, skip. If > 1 hour, assume crash and proceed. Release lock on completion (success or failure).

### Pass 1: Event Distillation

1. Fetch `memory_events` where `processed_at IS NULL`, ordered by `created_at ASC`
2. Group by `(user_id, brand_id, event_type)`
3. For each group with 3+ events:
   - **Token budget**: Cap at 50 events per LLM call. If more, process in chunks.
   - Run reflection prompt:

```
Review the following events from a commerce platform.

Events:
{events_as_json}

Extract durable knowledge that should persist beyond these individual events.

Return ONLY a JSON array (no markdown, no preamble):
[
  {
    "memory_type": "<one of: USER_PREFERENCE, BRAND_VOICE_RULE, BUSINESS_INSIGHT, WORKFLOW_PATTERN, CORRECTION>",
    "content": "clear, actionable statement",
    "confidence": <number 0.3-0.95>,
    "reasoning": "what evidence supports this"
  }
]

Confidence scoring (follow this strictly):
- 0.3-0.5: Tentative (2-3 events)
- 0.5-0.7: Emerging (4-6 events)
- 0.7-0.85: Established (7+ events)
- 0.85-0.95: Consistent with zero counter-examples
Never above 0.95.

Rules:
- Only extract patterns, not one-off observations
- Be specific and actionable
- Ignore temporary information
- If no patterns, return []
```

4. Upsert with similarity check + supersession logic
5. Set `processed_at` on source events

### Pass 2: Outcome Reflection

**A. `capturePostPerformance(params)`**

Direct function call. Called by Orchestrate module 24hrs after posting.

```typescript
interface CapturePostPerformanceParams {
  userId: string;
  brandId: string;
  postId: string;
  platform: 'instagram';
  metrics: {
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    reach: number;
    impressions: number;
  };
  postContext: {
    caption: string;
    contentType: 'carousel' | 'reel' | 'static' | 'story';
    visualStyle: 'lifestyle' | 'product' | 'ugc' | 'quote' | 'behind_the_scenes';
    hashtags: string[];
    postedAt: string;
    productCategory?: string;
    ruhiGenerated: boolean;
    memoriesUsed?: string[];
  };
}
```

`memoriesUsed` is critical. It links outcomes back to the specific knowledge Ruhi applied. This closes the full learning loop.

Stored as `memory_event` with `event_type = 'campaign_result'`.

**B. Outcome reflection (part of daily worker)**

1. Fetch `campaign_result` events where `processed_at IS NULL` and `created_at` 24+ hours ago
2. Group by `(user_id, brand_id)` -- minimum 3 posts
3. Run outcome reflection prompt:

```
You are analyzing social media post performance for a brand.

Posts with metrics:
{posts_with_metrics_as_json}

Brand's existing learned rules (context only, do not repeat):
{active_distilled_memories}

Analyze performance and extract ACTIONABLE insights.

Return ONLY a JSON array:
[
  {
    "memory_type": "<one of: CREATIVE_PATTERN, CONTENT_STRATEGY, AUDIENCE_INSIGHT, PERFORMANCE_INSIGHT>",
    "content": "specific insight with numbers",
    "confidence": <0.3-0.95>,
    "reasoning": "data supporting this"
  }
]

Confidence scoring:
- 0.3-0.5: Pattern from 3-4 posts (directional)
- 0.5-0.7: Pattern from 5-8 posts (emerging)
- 0.7-0.85: Pattern from 9+ posts (reliable)
- 0.85-0.95: Statistically significant pattern
Never above 0.95.

Rules:
- Patterns across 2+ posts only
- Specific numbers: "Reels got 2.1x more saves" not "Reels better"
- If insufficient data, return []
```

4. Upsert with similarity + supersession
5. **Memory feedback loop**: For posts where `memoriesUsed` is populated:
   - Post outperformed brand average by >20%: bump confidence +0.05 on each referenced memory
   - Post underperformed by >20%: reduce confidence -0.05 on each
   - Log this adjustment in the memory's `reasoning` field: "Confidence adjusted +0.05 based on post XYZ outperforming average by 34%"
6. Set `processed_at` on source events

**C. Weekly strategic rollup**

Runs if Sunday OR 7+ days since last `STRATEGIC_RECOMMENDATION`:

1. Load active distilled memories per brand
2. Load research findings (last 7 days)
3. Run prompt:

```
You are a growth strategist for a brand.

Learned insights:
{active_distilled_memories}

Performance (last 7 days):
{recent_campaign_results}

External intelligence (last 7 days):
{recent_research_findings}

Assessment:
1. What should be doubled down on?
2. What should change?
3. What experiments to try next week?
4. External trends to respond to?

Cross-reference external + internal. Example:
- Research: Instagram boosting Reels + brand data: Reels outperform static → strong signal
- Research: hashtag reach declining + brand relies on hashtags → flag risk

Return ONLY JSON array:
[
  {
    "memory_type": "STRATEGIC_RECOMMENDATION",
    "content": "actionable recommendation",
    "confidence": <0.5-0.9>,
    "reasoning": "evidence"
  }
]
```

4. Store as `STRATEGIC_RECOMMENDATION`
5. Update `learning_velocity`: insert `autonomy_level` (avg confidence of active memories)

---

## Phase 4: Recall (Memory Retrieval)

Internal function `recall()` + HTTP `GET /api/memory/recall`.

```typescript
interface RecallParams {
  userId: string;
  brandId?: string;
  query: string;
  memoryTypes?: string[];
  includeCrossBrand?: boolean;
  limit?: number;               // default 10
  includeReasoning?: boolean;   // default true
}

interface RecallResult {
  memories: Array<{
    id: string;
    memoryType: string;
    content: string;
    confidence: number;
    reasoning: string | null;
    lastUpdated: string;
    score: number;              // similarity * confidence
  }>;
}
```

Logic:
1. Embed the query
2. Query `distilled_memory`:
   - `WHERE superseded_by IS NULL`
   - Filter by userId, brandId, memoryTypes
   - If `includeCrossBrand`: also include `CROSS_BRAND_INSIGHT` matching brand's industry
   - Order by `(1 - (embedding <=> query_embedding)) * confidence` DESC
   - LIMIT
3. Update `last_used = NOW()` on returned memories
4. Return with reasoning

**How Ruhi uses recall during generation (CRITICAL -- this wires the whole system):**

Whenever Ruhi generates content (caption, ad copy, campaign plan, etc.), the generation function MUST follow this sequence:

```typescript
async function generateWithMemory(params: {
  userId: string;
  brandId: string;
  task: string;        // "write instagram caption for product X"
  context: any;
}): Promise<{ content: string; memoriesUsed: string[] }> {

  // 1. Recall relevant memories
  const recalled = await recall({
    userId: params.userId,
    brandId: params.brandId,
    query: params.task,
    includeCrossBrand: true,
    limit: 15
  });

  // 2. Format memories for system prompt injection
  const memoryBlock = recalled.memories.map(m =>
    `[${m.memoryType}] (confidence: ${m.confidence}): ${m.content}`
  ).join('\n');

  // 3. Include memories in generation prompt
  const systemPrompt = `
You are Ruhi, generating content for a brand.

LEARNED KNOWLEDGE (apply these rules, cite them when relevant):
${memoryBlock}

When your output is influenced by a learned rule, mention it naturally.
Example: "Using shorter caption style (your audience engages 43% more under 100 chars)."
`;

  // 4. Generate content using the primary LLM
  const result = await generateContent(systemPrompt, params.task, params.context);

  // 5. Return content AND the memory IDs used (this is how memoriesUsed gets populated)
  return {
    content: result,
    memoriesUsed: recalled.memories.map(m => m.id)
  };
}
```

The returned `memoriesUsed` array is then passed to:
- `capturePostPerformance()` when the post's metrics come in 24hrs later
- `governAction()` when submitting the action for approval
- `action_queue.memories_used` for the audit trail

**This is the critical link.** Without `memoriesUsed` flowing from generation → action → outcome, the confidence feedback loop (Phase 3B step 5) has nothing to adjust. Every generation path in the codebase MUST use `generateWithMemory()` or equivalent.

This transparency is NOT optional. It's what makes users trust autonomy.

---

## Phase 5: Session Summary

`summarizeConversation(conversationId)`

Trigger: conversation exceeds 20 messages, OR conversation inactive for 1 hour.

1. Fetch messages
2. **Token budget**: If >4000 tokens, keep first 5 + last 10 messages, summarize middle
3. LLM call:

```
Summarize this conversation. Return ONLY JSON:
{
  "summary": "2-3 sentences",
  "key_decisions": ["decision 1"],
  "open_threads": ["unresolved 1"]
}
```

4. Store with embedding
5. On next conversation, inject relevant summaries via recall for continuity

---

## Phase 6: External Intelligence (Research & Trends)

### A. Seed topics

Seed script (insert if not exists):

```json
[
  {"topic": "instagram_algorithm", "search_queries": ["Instagram algorithm update 2026", "Instagram reach changes latest", "Instagram engagement tips new"], "frequency": "weekly"},
  {"topic": "instagram_hashtag_strategy", "search_queries": ["Instagram hashtag strategy 2026", "how to use hashtags Instagram latest", "Instagram hashtag reach"], "frequency": "biweekly"},
  {"topic": "linkedin_algorithm", "search_queries": ["LinkedIn algorithm update 2026", "LinkedIn organic reach changes", "LinkedIn content strategy latest"], "frequency": "biweekly"},
  {"topic": "seo_trends", "search_queries": ["SEO strategy 2026", "Google algorithm update latest", "SEO trends ecommerce"], "frequency": "biweekly"},
  {"topic": "social_commerce_trends", "search_queries": ["social commerce trends 2026", "Instagram shopping updates", "ecommerce AI trends latest"], "frequency": "weekly"},
  {"topic": "ai_marketing_tools", "search_queries": ["AI marketing tools new 2026", "AI content creation trends", "AI social media automation"], "frequency": "biweekly"}
]
```

`addResearchTopic()` for dynamic additions (also `POST /api/research/topics`).

### B. Research Worker: `runResearch()`

Separate daily cron. Same lock pattern via `worker_locks`.

**Stage 1: Fetch**

Brave Search API (`BRAVE_SEARCH_API_KEY` env, `https://api.search.brave.com/res/v1/web/search`) + `@extractus/article-extractor` for text extraction. No Playwright. No puppeteer.

1. Fetch active topics past their frequency threshold
2. Per topic:
   a. Per query: Brave Search (top 5 results)
   b. Per URL: HTTP GET + extract text, truncate ~3000 tokens
   c. Skip failures (log, move on)
   d. SHA256 content_hash, INSERT ON CONFLICT DO NOTHING
   e. Update `last_researched`
3. Rate limit: max 2 req/sec to Brave. 500ms delay between page fetches.

**Stage 2: Distill**

1. Fetch `research_raw` where `distilled_at IS NULL`, group by topic
2. Per topic:
   - **Token budget**: cap at 8000 tokens per LLM call
   - Run prompt:

```
You are researching digital marketing developments.

Topic: {topic}
Sources:
{raw_contents_with_urls}

Client context (if brand-specific):
{brand_info}

Return ONLY JSON array:
[
  {
    "distilled_insight": "specific finding",
    "relevance_to_clients": "application",
    "confidence": <0.3-0.9>,
    "time_sensitivity": "evergreen" | "weeks" | "months",
    "source_raw_ids": ["<ids>"],
    "reasoning": "source evidence"
  }
]

Rules:
- Prioritize CHANGES over evergreen advice
- Be specific: "Instagram deprioritizes carousels > 8 slides" not "algorithm changes"
- Flag urgent items (API deprecations, policy changes)
- Ignore listicles. Primary sources and data only.
- If nothing new, return []
```

3. Store in `research_findings` with embeddings
4. Promote confidence > 0.6 to `distilled_memory` as `EXTERNAL_INSIGHT`
5. Set expires_at: evergreen=null, weeks=+14d, months=+90d
6. Set `distilled_at` on processed raw entries

### C. `getLatestResearch()`

Function + `GET /api/research/latest`. Params: topic?, scope?, since?(7d), limit?(10). Filters expired findings.

---

## Phase 7: Self-Directed Evolution

### A. Gap tracking

Inline during operation:
- `logCapabilityGap({ description, userRequest, context })` → memory_event `capability_gap`
- `logManualOverride({ workflow, reason, context })` → memory_event `manual_override`

### B. Monthly Product Reflection

`runProductReflection()` -- cron 1st of month OR triggered by 5+ capability gaps in 7 days.

```
You are Ruhi, iKawn's operating intelligence.

CAPABILITY GAPS:
{gaps_aggregated_by_frequency}

MANUAL OVERRIDES:
{overrides_aggregated}

EXTERNAL TRENDS:
{recent_research}

CURRENT CAPABILITIES:
Agents: Genie, Remix, Prism, Lazarus, Muse, Shopkeeper.
Platforms: Instagram, Telegram, Shopify.
Intelligence: Memory distillation, outcome reflection, research.

Return ONLY JSON array (3-5 ranked by impact):
[
  {
    "suggestion": "specific thing to build",
    "rationale": "grounded in data",
    "impact": "high" | "medium",
    "effort": "small" | "medium" | "large",
    "urgency": "immediate" | "next_sprint" | "quarterly",
    "category": "new_capability" | "improvement" | "integration"
  }
]
```

Store as `PRODUCT_SUGGESTION`, user_id = V's ID.

---

## Phase 8: Cross-Brand Intelligence (The Network Effect)

**This is what makes Ruhi a platform, not a tool.**

### Concept

Multiple brands generate patterns that transcend any single brand. A travel brand's Reels success informs recommendations for the NEXT travel brand from day one. These patterns are anonymized -- no brand's data is exposed to another.

### Implementation

**A. Industry tagging**

```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS industry TEXT;
```

If brands table doesn't exist, create a mapping table. Values: 'travel', 'lifestyle', 'automotive', 'food_beverage', 'fashion', 'real_estate', etc.

**B. Cross-brand distillation (weekly, after individual brand rollups)**

1. Load active memories of types: CREATIVE_PATTERN, CONTENT_STRATEGY, AUDIENCE_INSIGHT, PERFORMANCE_INSIGHT
2. Group by industry
3. For each industry with 2+ brands:

```
Analyzing patterns across brands in {industry}.

Brand A (anonymized):
{insights_no_names}

Brand B (anonymized):
{insights_no_names}

Extract INDUSTRY-LEVEL patterns.

Return ONLY JSON array:
[
  {
    "memory_type": "CROSS_BRAND_INSIGHT",
    "content": "industry-level insight",
    "confidence": <0.3-0.85>,
    "reasoning": "seen across N brands",
    "industry": "{industry}"
  }
]

Rules:
- Patterns across 2+ brands only
- Conservative confidence
- Never include brand names
- Actionable: what works for this industry
```

4. Store in `distilled_memory` with `memory_type = 'CROSS_BRAND_INSIGHT'`, brand_id = NULL

**C. New brand onboarding acceleration**

When new brand onboards with industry tag:
1. recall() with includeCrossBrand=true pulls industry insights
2. Injected into generation context from DAY ONE
3. New brand benefits from ALL prior industry learning

**D. Network effect tracking**

Track in `learning_velocity`:
- `onboarding_acceleration`: days to confidence 0.6 for this brand vs first brand ever managed
- The gap IS the network effect, quantified

---

## Phase 9: Governance Layer (The Trust Infrastructure)

**Stripe doesn't offer optional payment verification. AWS doesn't make budget limits an enterprise add-on. Governance is infrastructure, not a feature.**

Every autonomous action in Ruhi passes through three gates before execution:

1. **Confidence gate**: Does Ruhi know enough? (from Decide module)
2. **Budget gate**: Can the brand afford this action? (from brand_budgets)
3. **Approval gate**: Does a human need to sign off? (from confidence thresholds + action type)

All three must pass. If any one fails, the action does not execute. Period.

### A. `governAction(params)` -- The Central Gate

This is the single function that sits between Decide and Orchestrate. EVERY action flows through it.

```typescript
interface GovernActionParams {
  brandId: string;
  userId: string;
  actionType: string;
  payload: Record<string, any>;
  confidence: number;
  reasoning: string;
  memoriesUsed: string[];
}

interface GovernanceResult {
  actionQueueId: string;
  result: 'auto_approved' | 'awaiting_human' | 'budget_blocked';
  reason: string;
}
```

Logic:

1. **Estimate cost**: Look up `cost_catalog` for action_type + sub_type. Sum all costs. Set `estimated_cost_credits`.

2. **Budget check**: Attempt atomic budget reservation:
   ```sql
   UPDATE brand_budgets
   SET spent_monthly_credits = spent_monthly_credits + $estimated_cost
   WHERE brand_id = $brandId
     AND spent_monthly_credits + $estimated_cost <= budget_monthly_credits
     AND status = 'active'
   RETURNING *;
   ```
   If RETURNING is empty: insert into `action_queue` with `governance_result = 'budget_blocked'`. Log as memory_event `signal` with payload indicating budget exhaustion. Return immediately.

   **Budget warning check**: After successful reservation, if `spent_monthly_credits / budget_monthly_credits >= warn_at_percent / 100`, fire a `signal` memory_event: "Brand X has used {N}% of monthly budget."

3. **Confidence + Approval check**: Evaluate based on brand's approval settings:

   ```typescript
   // Per-brand configurable thresholds (stored in brand_budgets or a brand_settings table)
   // Defaults:
   const THRESHOLDS = {
     auto_approve_above: 0.8,      // confidence above this → auto approve
     human_required_below: 0.6,    // confidence below this → always require human
     // Between 0.6 and 0.8: auto approve with delay (1 hour window for override)
   };

   // Some action types ALWAYS require human regardless of confidence:
   const ALWAYS_HUMAN_ACTIONS = ['run_campaign', 'update_shopify'];
   ```

   Decision:
   - If `actionType` in ALWAYS_HUMAN_ACTIONS → `awaiting_human`
   - If confidence >= auto_approve_above → `auto_approved`
   - If confidence < human_required_below → `awaiting_human`
   - If confidence between thresholds → `auto_approved` with `expires_at = NOW() + 1 hour` (delayed execution, human can override in that window)

4. **Insert into action_queue** with the governance_result, all context, and reasoning.

5. **If auto_approved**: Trigger execution (call Orchestrate). Can be immediate or after the delay window.

6. **If awaiting_human**: Send notification via `notifyForApproval()`:

   ```typescript
   async function notifyForApproval(actionQueueId: string): Promise<void> {
     const action = await getActionFromQueue(actionQueueId);

     const message = formatApprovalMessage({
       actionType: action.action_type,
       reasoning: action.reasoning,
       estimatedCost: action.estimated_cost_credits,
       confidence: action.confidence,
       preview: action.payload // e.g. caption text, image URL
     });

     // Primary channel: Telegram (existing Telegram integration in Orchestrate module)
     // Send message with inline keyboard: [Approve] [Reject] [Revise]
     await sendTelegramMessage(action.user_id, message, {
       inline_keyboard: [
         [
           { text: "✓ Approve", callback_data: `approve:${actionQueueId}` },
           { text: "✗ Reject", callback_data: `reject:${actionQueueId}` },
           { text: "✎ Revise", callback_data: `revise:${actionQueueId}` }
         ]
       ]
     });

     // Secondary: Store in action_queue for Ruhi OS /api/actions/pending endpoint
     // The frontend polls or subscribes to this endpoint to show pending approvals
   }
   ```

   Telegram callback handler calls `reviewAction()` (see B below) with the user's decision.
   If user has no Telegram connected, actions remain in `awaiting_human` state and are visible via `GET /api/actions/pending`.

### B. `executeAction(actionQueueId)` -- Post-Approval Execution

Called when an action is approved (auto or human).

1. Verify action is in `auto_approved` or `approved` state
2. Verify budget reservation still valid (re-check, in case manual budget adjustment happened)
3. Call the appropriate Orchestrate function based on `action_type`
4. On success:
   - Update action_queue: `executed_at = NOW()`
   - Insert into `action_log` with `actual_cost_credits` and `cost_breakdown`
   - If actual cost differs from estimated: adjust `brand_budgets.spent_monthly_credits` by the difference
5. On failure:
   - Update action_queue: `governance_result = 'failed'` (add this to the CHECK constraint)
   - **Refund budget**: `UPDATE brand_budgets SET spent_monthly_credits = spent_monthly_credits - $estimated_cost`
   - Log failure as memory_event for future learning

### C. `reviewAction(actionQueueId, decision, reviewedBy)` -- Human Review

Called from Ruhi OS or Telegram when a human reviews a pending action.

```typescript
interface ReviewParams {
  actionQueueId: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  reviewedBy: string;
  feedback?: string;
}
```

Logic:
- `approved`: Update queue → trigger `executeAction()`
- `rejected`: Update queue → **refund budget reservation** → log as memory_event with event_type `manual_override` (Ruhi learns from rejections). If feedback provided, store it so distillation can extract a CORRECTION.
- `revision_requested`: Update queue → refund budget → Ruhi uses feedback to revise → creates new action_queue entry (a resubmission). The original action's `governance_result` stays as `revision_requested`.

**Rejection as learning signal**: When a human rejects an action, this is HIGH-VALUE training data. The rejection + feedback becomes a memory_event that distillation processes into a CORRECTION memory. Over time, Ruhi stops proposing actions that get rejected. The rejection rate should decrease -- track this in learning_velocity as `rejection_rate`.

### D. Budget Reset Worker

Simple daily cron (or part of existing daily worker):

```
For each brand_budget where current_period_start + 1 month <= NOW():
  SET spent_monthly_credits = 0
  SET current_period_start = date_trunc('month', NOW())
  SET status = 'active' (if was 'exhausted')
```

### E. Cost Intelligence (feeds back into Decide)

After action_log accumulates data, Ruhi can learn cost-per-outcome:

Add to the **weekly strategic rollup** (Phase 3C) prompt:

```
Cost and efficiency data (last 7 days):
{action_log_with_costs_and_outcomes}

Include cost efficiency insights:
- Which action types deliver best engagement per credit spent?
- Are there content types with high cost but low return?
- What's the optimal budget allocation across content types?

Valid additional memory_type for cost insights:
- COST_EFFICIENCY: "Reels cost 20 credits to produce but generate 3.2x engagement vs static posts at 2 credits. ROI per credit is 1.6x higher for static, but absolute engagement favors Reels."
```

This turns Ruhi from a content engine into a **P&L optimization layer**. She doesn't just know what content works -- she knows what content delivers the best return per dollar spent.

### F. Governance API Endpoints

- `POST /api/actions/review` -- human approve/reject/revise
- `GET /api/actions/pending?brandId=X` -- list actions awaiting review
- `GET /api/actions/history?brandId=X` -- action audit trail
- `GET /api/budgets?brandId=X` -- current budget status
- `PUT /api/budgets/:brandId` -- update budget settings

### G. Action Expiration Handler

Part of the daily distillation worker (or its own lightweight cron).

```
For each action_queue where governance_result IN ('pending', 'awaiting_human', 'auto_approved')
  AND expires_at IS NOT NULL AND expires_at < NOW():

  SET governance_result = 'expired'
  REFUND budget: UPDATE brand_budgets SET spent_monthly_credits = spent_monthly_credits - estimated_cost_credits
  Log as memory_event (event_type = 'signal', payload = { reason: 'action_expired', action_id })
```

Expired actions are learning signals too. If actions expire frequently, it may indicate Ruhi is proposing at wrong times or the approval workflow is too slow.

---

## Phase 10: Brand Onboarding Flow

When a new brand is added to Ruhi, a specific initialization sequence must run. Without this, the new brand has no budget, no research topics, and no cross-brand context.

### `onboardBrand(params)`

```typescript
interface OnboardBrandParams {
  brandId: string;
  userId: string;
  brandName: string;
  industry: string;      // 'travel', 'lifestyle', 'automotive', etc.
  monthlyBudget: number; // in credits
  platforms: string[];   // ['instagram'] for now
  description?: string;  // brief brand description for research context
}
```

Sequence (all in one transaction where possible):

1. **Set industry tag**: `UPDATE brands SET industry = $industry WHERE id = $brandId` (or insert mapping)

2. **Create budget**: INSERT into `brand_budgets`:
   ```
   brand_id = $brandId
   budget_monthly_credits = $monthlyBudget
   spent_monthly_credits = 0
   status = 'active'
   ```

3. **Seed brand-specific research topics** based on industry:
   ```typescript
   const industryTopics: Record<string, Array<{topic: string, queries: string[]}>> = {
     travel: [
       { topic: `${brandName}_travel_social`, queries: ["travel Instagram marketing 2026", "tourism social media strategy"] }
     ],
     lifestyle: [
       { topic: `${brandName}_lifestyle_trends`, queries: ["lifestyle brand Instagram 2026", "lifestyle content trends"] }
     ],
     automotive: [
       { topic: `${brandName}_auto_social`, queries: ["automotive social media 2026", "car dealership Instagram strategy"] }
     ],
     // ... extend per industry
   };
   ```
   Insert with `scope = brandId`.

4. **Pull cross-brand intelligence**: Call `recall()` with `includeCrossBrand = true` for this industry. Store the results as a `memory_event` with `event_type = 'signal'` and payload `{ type: 'onboarding_cross_brand', insights: [...] }`. These will be available in the generation prompt from day one.

5. **Initialize learning velocity baseline**:
   ```
   INSERT INTO learning_velocity (brand_id, metric_type, metric_value) VALUES
     ($brandId, 'voice_accuracy', 0),
     ($brandId, 'autonomy_level', 0),
     ($brandId, 'rejection_rate', 0);
   ```

6. **Log onboarding event**:
   ```
   INSERT INTO memory_events (user_id, brand_id, event_type, payload) VALUES
     ($userId, $brandId, 'signal', { type: 'brand_onboarded', industry, platforms, budget: $monthlyBudget });
   ```

Expose as `POST /api/brands/onboard`. Also callable as internal function from Ruhi OS when setting up a new client.

---

## Technical Specifications

### Embedding model
Pin to `text-embedding-3-small` (OpenAI, 1536 dims) via env var `EMBEDDING_MODEL`. Track which model generated each embedding via `embedding_model` column. If model changes, stale embeddings can be identified.

### LLM for reflection
Cheapest sufficient model. Priority: Claude Haiku 3.5 > GPT-4o-mini > Gemini Flash.
Env var: `REFLECTION_LLM_MODEL`.
All prompts say "Return ONLY JSON". Enforce by:
1. Strip markdown fences
2. JSON.parse
3. If fails: log raw response, skip batch, events stay unprocessed for retry

### Worker safety
- Locks via `worker_locks` table
- Database transactions for multi-write operations
- Unprocessed events naturally retry (processed_at stays NULL)
- Structured JSON logging to stdout (Fly.io captures)
- Log: start time, events processed, memories created/updated, errors

### Error handling
Every external call (LLM, Brave, HTTP fetch):
1. Timeout: 30s LLM, 10s HTTP, 5s Brave
2. Catch + log with context
3. Never crash the worker. Skip failed batch, continue.
4. Failed batches retry next run

### API endpoints
Follow existing auth patterns.
- `GET /api/memory/recall`
- `GET /api/research/latest`
- `POST /api/research/topics`
- `GET /api/learning/velocity?brandId=X`
- `GET /api/health/intelligence` -- worker status, last run times, error counts
- `POST /api/actions/review` -- human approve/reject/revise pending actions
- `GET /api/actions/pending?brandId=X` -- actions awaiting human review
- `GET /api/actions/history?brandId=X` -- full action audit trail with costs
- `GET /api/budgets?brandId=X` -- current budget status and spend
- `PUT /api/budgets/:brandId` -- update budget settings
- `POST /api/brands/onboard` -- full brand onboarding sequence

### Cost (2 brands, 6 topics)
- Distillation: ~4-8 LLM calls/day (~$0.03/day)
- Research: ~6-12 LLM calls/week (~$0.08/week)
- Brave: ~30-50 queries/week (free tier: 2000/month)
- Embeddings: ~20-50/day (negligible)
- Total: under $2/day. Scales linearly.

---

## Module Structure

```
src/
  sense/
    events.ts               -- captureEditDelta, capturePostPerformance, logCapabilityGap, logManualOverride
    research/
      topics.ts             -- CRUD + seed
      fetcher.ts            -- Brave + HTTP + article extraction
      distiller.ts          -- raw → findings
      prompts.ts
      worker.ts             -- daily cron with lock
      latest.ts             -- getLatestResearch
  decide/
    distiller.ts            -- event distillation (Pass 1)
    editDelta.ts            -- edits → voice rules
    outcomeReflection.ts    -- results → insights (Pass 2)
    strategicReflection.ts  -- weekly rollup (includes cost intelligence)
    crossBrand.ts           -- cross-brand extraction
    prompts.ts
    recall.ts               -- recall() + endpoint
    sessionSummary.ts
    worker.ts               -- daily cron with lock
  govern/
    governance.ts           -- governAction() -- THE central gate
    executor.ts             -- executeAction() -- post-approval execution
    reviewer.ts             -- reviewAction() -- human review handler
    notifier.ts             -- notifyForApproval() -- Telegram + fallback
    budget.ts               -- budget check, reservation, refund, reset worker, expiration handler
    costCatalog.ts          -- cost lookup, estimation
    thresholds.ts           -- per-brand confidence thresholds, ALWAYS_HUMAN_ACTIONS config
    endpoints.ts            -- /api/actions/*, /api/budgets/*
  onboarding/
    onboardBrand.ts         -- full onboarding sequence + endpoint
    industryTopics.ts       -- industry → default research topics mapping
  evolve/
    productReflection.ts    -- monthly suggestions
    gapTracker.ts           -- gap aggregation
    prompts.ts
  shared/
    embedding.ts            -- embed(), pinned model
    llm.ts                  -- callReflectionLLM(), JSON parse safety, timeout
    locks.ts                -- acquire/release
    logger.ts               -- structured JSON
    similarity.ts           -- cosine check, supersession logic
  schema/
    migrations/
      001_memory_tables.sql
      002_research_tables.sql
      003_learning_velocity.sql
      004_worker_locks.sql
      005_governance_tables.sql
    seed.ts                 -- research topics + cost catalog
  metrics/
    velocity.ts             -- tracking + endpoint
    health.ts               -- /api/health/intelligence
```

---

## Build Order (Strict Sequence)

1. **Phase 1**: Schema migration (ALL 12 tables). Verify pgvector. Seed research topics + cost catalog.
2. **Phase 2**: captureEditDelta + distillEditDeltas + shared/ (embedding, llm, similarity, locks, logger). Test with mock edits.
3. **Phase 3**: Distillation worker (Pass 1 + 2 + weekly). Test with events.
4. **Phase 4**: recall() + generateWithMemory(). Verify memories retrievable AND injected into generation. This is where memoriesUsed gets wired.
5. **Phase 5**: Session summaries.
6. **Phase 6**: Research worker. Test with seeds.
7. **Phase 7**: Product reflection + gap tracking.
8. **Phase 8**: Cross-brand intelligence.
9. **Phase 9**: Governance layer -- governAction(), executeAction(), reviewAction(), notifyForApproval(), budget enforcement, cost catalog, expiration handler. Wire into existing Orchestrate module.
10. **Phase 10**: Brand onboarding flow (onboardBrand + industry topics).
11. **Phase 11**: Learning velocity tracking + endpoint (including rejection_rate, cost metrics).

**Phases 1-4 = Intelligence MVP. Ship and validate.**
**Phase 9 = Governance MVP. Ship immediately after intelligence is validated.**
**Phase 10 = Onboarding. Ship before adding third client.**
**Governance is NOT optional. It ships before any action runs autonomously.**

**After each phase: verify existing functionality still works.**

---

## Success Criteria

### Intelligence MVP (Phases 1-4):
1. Edit deltas captured → voice rules extracted with reasoning
2. Post performance → outcome reflection → insights with evidence
3. recall() returns ranked memories with reasoning
4. Supersession works (old contradicted memories retired cleanly)
5. Worker runs daily, handles failures gracefully
6. Nothing existing is broken

### Governance MVP (Phase 9):
7. Every autonomous action passes through governAction() -- no exceptions
8. Budget check is atomic: action cannot execute if budget insufficient
9. Budget warning fires at configured threshold
10. Actions below confidence 0.6 require human approval
11. Actions above 0.8 auto-execute (with full audit trail)
12. Human can approve/reject/request revision via API
13. Rejected actions become CORRECTION memories (Ruhi learns from rejection)
14. Budget refund on rejection or failure
15. action_log captures actual cost with breakdown for every execution
16. Cost catalog is seeded and configurable without code changes

### Full system (Phases 5-11):
17. Weekly rollup cross-references research + performance + cost efficiency
18. Research fetches, stores raw, distills findings
19. Cross-brand insights when 2+ brands in same industry
20. New brands get industry intelligence from day 1
21. Learning velocity tracked: edit_rate, autonomy_level, rejection_rate, cost_per_outcome
22. Product suggestions grounded in real gaps
23. Cost intelligence: Ruhi knows ROI per content type per brand
24. Brand onboarding creates budget + industry tag + research topics + cross-brand pull in one call
25. Expired actions are cleaned up with budget refunds

### The jaw-drop demo:
24. Learning velocity curve: edit rate dropping 70% → 10% over 3 weeks
25. Ruhi cites reasoning: "Short caption because saves are 2.3x higher under 100 chars (8 posts, confidence 0.84)"
26. New brand gets instant intelligence from cross-brand data on day 1
27. Ruhi proactively: "Instagram changed Reels distribution. Your data shows Reels outperform static 1.8x. Shifting 60% of next week to Reels."
28. Autonomy timeline: Ruhi went from suggesting → acting → autonomous, with full audit trail of WHY at every step
29. Budget dashboard: "Swami Tourism spent 4,200 of 10,000 credits this month. Reels content delivers 3.2x engagement per credit vs static. Recommending budget reallocation."
30. Rejection learning: "Ruhi's rejection rate dropped from 30% to 5% over 6 weeks as she learned what the client actually wants"

---

## Verification Scenarios (Run these after each phase)

Concrete test sequences CC should run to verify each phase works. Use real function calls with test data.

### After Phase 2 (Edit Deltas):

```
TEST: Voice rule extraction from caption edits

1. Call captureEditDelta 5 times for brand "test_brand":
   Edit 1: "Amazing product! Buy now!!!" → "Minimal design. Shop the link."
   Edit 2: "Check out this INCREDIBLE deal!!" → "New arrival. Limited stock."
   Edit 3: "WOW you won't believe this offer!!!" → "Restocked. Link in bio."
   Edit 4: "This gorgeous item is perfect for you!" → "Summer essential. Now available."
   Edit 5: "Don't miss out on this fantastic product!" → "Back in stock."

2. Call distillEditDeltas("test_user", "test_brand")

3. VERIFY:
   - At least 2 BRAND_VOICE_RULE memories created in distilled_memory
   - Expected rules include something about: short sentences, no exclamation marks, minimal/understated tone
   - Each rule has non-empty reasoning field
   - Each rule has confidence between 0.5-0.85
   - Source events are linked via source_event_ids
   - processed_at is set on all 5 memory_events
```

### After Phase 3 (Distillation Worker):

```
TEST: Outcome reflection from post performance

1. Insert 4 campaign_result memory_events for "test_brand":
   Post A: reel, lifestyle, 142 likes, 31 saves, reach 2400
   Post B: static, product, 45 likes, 8 saves, reach 900
   Post C: reel, behind_the_scenes, 198 likes, 52 saves, reach 3100
   Post D: static, product, 38 likes, 5 saves, reach 750

2. Run runDistillation()

3. VERIFY:
   - At least 1 CREATIVE_PATTERN or CONTENT_STRATEGY memory created
   - Should identify reels outperforming static
   - Reasoning references specific post metrics
   - processed_at set on all 4 events
```

### After Phase 4 (Recall):

```
TEST: Memory retrieval and generation integration

1. Ensure distilled_memories exist from previous tests
2. Call recall({ userId: "test_user", brandId: "test_brand", query: "write instagram caption" })

3. VERIFY:
   - Returns memories sorted by score (similarity * confidence)
   - BRAND_VOICE_RULE memories appear in results
   - Each result includes reasoning field
   - last_used updated on returned memories

4. Call generateWithMemory({ userId, brandId, task: "write caption for new summer dress" })

5. VERIFY:
   - Returned content reflects learned voice rules (short, no exclamation marks)
   - memoriesUsed array is populated with memory IDs
   - memoriesUsed IDs match actual memories from recall
```

### After Phase 9 (Governance):

```
TEST: Full governance flow

1. Create brand_budget for test_brand: 1000 credits monthly

2. Call governAction({
     brandId: "test_brand",
     actionType: "post_instagram",
     confidence: 0.5,  // below threshold
     estimatedCost: 15,
     reasoning: "Testing low confidence action"
   })

3. VERIFY: governance_result = 'awaiting_human', spent_monthly_credits incremented by 15

4. Call reviewAction(actionId, { decision: 'rejected', feedback: 'Wrong tone' })

5. VERIFY:
   - governance_result = 'rejected'
   - spent_monthly_credits refunded (back to 0)
   - memory_event created with event_type = 'manual_override'
   - feedback stored in payload for future distillation

6. Call governAction({
     brandId: "test_brand",
     actionType: "post_instagram",
     confidence: 0.85,  // above threshold
     estimatedCost: 15
   })

7. VERIFY: governance_result = 'auto_approved', action executed, action_log entry created

8. Set budget to 10 credits. Call governAction with estimatedCost = 15.

9. VERIFY: governance_result = 'budget_blocked', spent NOT incremented
```

---

## The Autopilot Path

Autopilot is not a feature toggle. It's the result of three systems working together:

**Confidence** (from Decide) answers: "Should Ruhi act?"
**Budget** (from Govern) answers: "Can Ruhi afford to act?"
**Approval** (from Govern) answers: "Does a human agree?"

All three must pass. `governAction()` enforces this on every single action.

### How it works in practice:

**Week 1 (new brand):**
Confidence is low (< 0.6). Every action goes to human approval. Ruhi learns from edits, approvals, and rejections. Budget is monitored but rarely a constraint because volume is low.

**Week 3:**
Confidence rises (0.6-0.8) for common actions. Captions auto-approve with 1-hour delay. Complex actions still require human. Budget warnings fire if approaching limits. Rejection rate is dropping because Ruhi learned the CORRECTION memories from early rejections.

**Week 6+:**
Confidence exceeds 0.8 for most content types. Ruhi acts immediately. Human gets summary notifications with full reasoning. Budget is actively optimized: Ruhi allocates spend toward content types with best ROI per credit. The approval queue is nearly empty because Ruhi rarely proposes actions that would be rejected.

### The audit trail:

Every action has a complete chain:
1. Which memories informed the decision (memories_used)
2. Why Ruhi proposed it (reasoning)
3. What governance decided (governance_result + governance_reason)
4. What it cost (cost_breakdown)
5. What happened (outcome from campaign_result)
6. What Ruhi learned (distilled insights from outcome reflection)

This chain is visible to the user. It's what makes "Ruhi runs my business" not scary but empowering.

### The infrastructure insight:

A tool lets you do things faster. Infrastructure is what you build on top of.

When a brand's entire content operation runs through Sense → Decide → Govern → Orchestrate → Outcome, with every action audited, every cost tracked, every outcome measured, and every lesson learned -- that's not a SaaS subscription. That's the operating layer of the business. Removing it would mean rebuilding the intelligence that took months to accumulate.

That's what makes it irreplaceable. That's what makes it infrastructure.

---

Sense what happened → Decide what it means → Govern whether to act → Orchestrate the response → Measure the Outcome → Sense again.

Every loop makes Ruhi smarter. Every brand makes Ruhi smarter for all brands. Every action is governed, audited, and learned from. Every day the moat deepens.

That's Ruhi. That's iKawn.
