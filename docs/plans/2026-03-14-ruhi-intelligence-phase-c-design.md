# Ruhi Intelligence Layer — Phase C (Cohort Intelligence)

**Date:** 2026-03-14
**Status:** Design approved, pending implementation plan
**Scope:** OpenBrain (ikawn-openbrain)

---

## Vision

Ruhi evolves from a memory system (reactive filing cabinet) to an intelligence system
(proactive analyst). Before orchestration, Ruhi must filter signals from noise.

**Phasing:** C (Cohorts) → A (Contacts) → B (Identity Graph)
- **Phase C (this spec):** Cohort-level behavioral intelligence. No individual identity resolution. Anonymized patterns, segment analysis, proactive alerts.
- **Phase A (future):** `contacts` table with deterministic matching (email, Shopify customer). Individual user profiles.
- **Phase B (future):** Probabilistic identity graph. Device fingerprints, merge rules, confidence scores.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Start with cohorts, not individuals | C → A → B | Demo-able fast, no identity resolution needed, delivers value immediately |
| Pull model for data ingestion | Worker pulls from ikawn-v3 DB | No real-time needed for pattern analysis; 60-min cadence is plenty |
| Layer 2 only (anonymized) for now | Central Ruhi, no brand split | Single user (V), admin can query raw data directly when PII needed |
| Proactive alerts via Telegram | Own bot via direct Telegram Bot API (not VPS relay) | Makes intelligence visible and demo-able; shared `src/utils/telegram.js` reused by governance later |
| Demo = dashboard + chat | Cards for visual hook, chat for interactive depth | Dashboard is the hook, conversational drill-down is the closer |
| Direct DB read access to ikawn-v3 | `IKAWN_OS_DATABASE_URL` env var | Same Fly org, single shared Postgres, multi-tenant via userId/orgId. Swap to API endpoints when architecture demands it |

---

## Architecture

```
ikawn-v3 Postgres (read-only) ──→ Intelligence Worker (OpenBrain)
                                        │
                                   ┌────┴────┐
                                   │ Distill  │
                                   │(gpt-4.1- │
                                   │  mini)   │
                                   │via callReflectionLLM()
                                   └────┬────┘
                                        │
                              ┌─────────┴─────────┐
                              │  intelligence_     │
                              │  snapshots table   │
                              └─────────┬─────────┘
                                        │
                          ┌─────────────┼─────────────┐
                          │             │             │
                    Dashboard      Ruhi Chat     Telegram Bot API
                    (/admin/       (RAG context   (direct, own bot
                    intelligence)  injection)      via src/utils/telegram.js)
```

---

## 1. Data Ingestion — Intelligence Worker

**File:** `src/workers/intelligence-worker.js`
**Interval:** Every 60 minutes
**Connection:** Read-only to ikawn-v3 Postgres via `IKAWN_OS_DATABASE_URL`
**LLM:** Uses existing `callReflectionLLM()` + `createWorkerGuard('intelligence')` from `src/utils/llm.js`

### Queries (4 total, one connection per run)

**Q1: User Summary**
```sql
SELECT
  id, email, user_type, credits, created_at,
  organization_id, suspended_at, deleted_at,
  (SELECT MAX(created_at) FROM generations WHERE user_id = u.id) AS last_generation_at
FROM users u
WHERE deleted_at IS NULL
```

**Q2: Generation Stats (grouped by user)**
```sql
SELECT
  user_id,
  COUNT(*) AS total_generations,
  COUNT(DISTINCT agent) AS agents_used,
  array_agg(DISTINCT agent) AS agent_list,
  SUM(credit_cost) AS total_credits_spent,
  MAX(created_at) AS last_generated_at,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS generations_7d,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS generations_24h
FROM generations
WHERE status = 'complete'
GROUP BY user_id
```

**Q3: Commerce Connections**
```sql
SELECT
  user_id, platform, shop_domain, status, last_synced_at,
  (SELECT COUNT(*) FROM commerce_products cp
   WHERE cp.connection_id = cc.id) AS product_count
FROM commerce_connections cc
WHERE status != 'disconnected'
```

**Q4: Credit Purchase History**
```sql
SELECT
  user_id,
  COUNT(*) AS purchase_count,
  SUM(amount) AS total_spent_inr,
  MAX(created_at) AS last_purchase_at
FROM credit_transactions
WHERE source = 'purchase'
GROUP BY user_id
```

### Processing Flow

1. Open read-only connection to ikawn-v3 DB
2. Run all 4 queries
3. Join results in memory by `user_id`
4. Pass joined dataset to distillation step
5. Close connection
6. Store results if changed from previous snapshot

**Rate limiting:** 5-second minimum between queries. Connection pooling: max 2 connections, idle timeout 10s, statement_timeout 10s. Worker must not impact ikawn-v3 performance.

**Connection config:**
```javascript
const ikawnPool = new Pool({
  connectionString: process.env.IKAWN_OS_DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});
// Per-connection: SET statement_timeout = 10000 before running queries
```

If any query takes >10s, it's a sign of DB pressure and the worker should back off.

---

## 2. Distillation — Cohort Analysis

After data pull, the worker calls gpt-4.1-mini via existing `callReflectionLLM('intelligence_distillation', ...)` with worker guards (cost ceiling, circuit breaker).

New MODEL_ROUTING entry in `src/utils/llm.js`:
```javascript
intelligence_distillation: { provider: 'openai', model: 'gpt-4.1-mini' },
```

### Cohort Definitions (Initial Set)

| Cohort | Criteria |
|--------|----------|
| `power-user-not-monetized` | 10+ generations, 0 purchases |
| `churning` | Was active (5+ gens), no activity in 7+ days |
| `new-and-exploring` | Signed up < 7 days ago, < 5 generations |
| `commerce-connected-dormant` | Shopify connected, 0 generations in 7 days |
| `converted` | At least 1 credit purchase |
| `whale` | 2+ purchases OR total spend > ₹1000 |
| `credit-wall` | 0 credits, last generation attempt failed (or last gen used remaining credits) |
| `window-shopper` | Signed up 7+ days ago, 0 generations |

Cohort definitions are stored in the worker file as a configuration object — not in DB. They evolve as Ruhi learns what segments matter.

### Engagement Scoring (0-100)

Calculated per account, deterministic (no LLM needed):

```
recency      = decay(days_since_last_activity, halflife=7)  × 30 points
frequency    = min(generations_7d / 10, 1.0)                × 25 points
breadth      = agents_used / total_agents                   × 15 points
commerce     = shopify_connected ? 15 : 0                   × 15 points
monetization = has_purchased ? 15 : 0                       × 15 points
```

Score = sum of all components, capped at 100.

### LLM Distillation Pass

**Model:** gpt-4.1-mini
**Purpose:** Generate natural language summary + detect non-obvious signals
**Input:** Cohort counts, engagement score distribution, week-over-week changes
**Output:** JSON with `summary` (text), `signals` (array of notable changes), `recommendations` (array)

The LLM does NOT see raw user data. It sees aggregated cohort counts and anonymized stats only.

### Signal Detection

Signals are notable changes between current and previous snapshot:

- Cohort size changes (e.g., `power-user-not-monetized` grew from 3 → 5)
- Individual account score drops > 20 points (anonymized ID only)
- Credit wall hits (users who ran out and stopped)
- New commerce connections
- Conversion events (first purchase)
- Unusual generation spikes

Signals are classified: `opportunity` (green), `risk` (amber), `info` (blue).

---

## 3. Storage — `intelligence_snapshots` Table

```sql
CREATE TABLE intelligence_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_type VARCHAR(50) NOT NULL,  -- 'cohort_analysis', 'signal', 'trend'
  period VARCHAR(20) NOT NULL,         -- '2026-03-14', 'week-2026-11'
  data JSONB NOT NULL,                 -- structured analysis data
  summary TEXT,                        -- LLM-generated natural language
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_type_period ON intelligence_snapshots(snapshot_type, period);
CREATE INDEX idx_snapshots_created ON intelligence_snapshots(created_at DESC);
```

### Snapshot Types

**`cohort_analysis`** — One per meaningful change (not every 30-min run). Contains:
```json
{
  "total_accounts": 45,
  "active_7d": 12,
  "new_signups_7d": 3,
  "cohorts": {
    "power-user-not-monetized": { "count": 5, "avg_score": 72, "change": "+2" },
    "churning": { "count": 3, "avg_score": 28, "change": "0" },
    ...
  },
  "score_distribution": { "0-20": 15, "21-40": 8, "41-60": 10, "61-80": 7, "81-100": 5 },
  "conversion_rate": 0.11,
  "agents_popularity": { "genie": 234, "remix": 89, "prism": 45, "lazarus": 12 }
}
```

**`signal`** — Individual notable events:
```json
{
  "type": "opportunity",
  "signal": "credit_wall_hit",
  "description": "2 users hit credit wall today without purchasing",
  "affected_count": 2,
  "affected_ids": ["anon_a7x3k", "anon_m9p2q"],  // sha256(userId + salt)
  "suggested_action": "Consider re-engagement or trial credit offer"
}
```

**`trend`** — Weekly rollup (generated Sunday midnight):
```json
{
  "week": "2026-11",
  "signup_trend": [3, 5, 2, 4],  // last 4 weeks
  "conversion_trend": [0.08, 0.10, 0.11, 0.11],
  "generation_volume": [120, 145, 132, 167],
  "top_growing_cohort": "new-and-exploring",
  "top_shrinking_cohort": "churning"
}
```

### Anonymization

All account references in `intelligence_snapshots` use anonymized IDs:
```javascript
const anonId = crypto.createHash('sha256')
  .update(userId + process.env.ANON_SALT)
  .digest('hex')
  .slice(0, 10);  // "anon_" + first 10 chars
```

**One-way anonymization. No reverse-lookup exists or should be built.** If the admin needs to investigate a specific account, they query ikawn-v3 directly where PII lives. This boundary is by design — "Data in our intelligence layer is irreversibly anonymized."

---

## 4. Proactive Alerts

### Telegram Alerts (Own Bot — Direct API)

OpenBrain uses its own Telegram bot via direct Bot API calls. Does NOT use the VPS relay.

**Shared utility:** `src/utils/telegram.js` — exports `sendTelegramMessage(text, opts)`.
Reused by intelligence worker (alerts) and future governance layer (approval notifications).

```javascript
// Intelligence worker usage:
const { sendTelegramMessage } = require('../utils/telegram');
await sendTelegramMessage(
  '🧠 Ruhi Intelligence\n\n2 users hit credit wall today.\nCohort power-user-not-monetized grew to 5.\n\nDrill deeper: ruhi.ikawn.in/chat'
);

// Future governance usage (with inline keyboard):
await sendTelegramMessage(approvalMessage, {
  reply_markup: {
    inline_keyboard: [[
      { text: '✓ Approve', callback_data: `approve:${actionId}` },
      { text: '✗ Reject', callback_data: `reject:${actionId}` },
    ]]
  }
});
```

**Env vars:** `INTELLIGENCE_TELEGRAM_BOT_TOKEN` (from @BotFather), `INTELLIGENCE_TELEGRAM_CHAT_ID` (V's chat ID or group ID).

### Throttling

- Max **3 alerts per day** (configurable via env var `MAX_INTELLIGENCE_ALERTS_PER_DAY`)
- Batch multiple signals into one message if they occur in the same worker run
- Minimum 4 hours between alerts
- `opportunity` signals prioritized over `info`
- `risk` signals always sent (bypass throttle)

### Alert Storage

Track sent alerts to prevent duplicates:
```sql
-- Reuse intelligence_snapshots with snapshot_type = 'alert_sent'
-- data contains: signal_ids sent, telegram_message_id
```

---

## 5. Intelligence Dashboard

### Page: `/admin/intelligence`

**Auth:** Admin only (same as Brain Health)
**Theme:** Deep indigo, consistent with existing Brain Health page
**No charting library** — CSS bars, numbers, minimal JS

### Card 1: Platform Pulse

```
┌─────────────────────────────────────┐
│  PLATFORM PULSE                     │
│                                     │
│  45 total accounts                  │
│  12 active this week  (↑3)          │
│   3 new signups       (↓1)          │
│                                     │
│  [sparkline: 4-week activity trend] │
└─────────────────────────────────────┘
```

Sparkline = 4 CSS bars (no JS chart library), height proportional to weekly active count.

### Card 2: Cohort Breakdown

```
┌─────────────────────────────────────────┐
│  COHORTS                                │
│                                         │
│  ████████████░░░░░░░░  converted (5)    │
│  ██████████░░░░░░░░░░  power-user (5)   │
│  ████████░░░░░░░░░░░░  exploring (8)    │
│  ██████░░░░░░░░░░░░░░  churning (3)     │
│  ████░░░░░░░░░░░░░░░░  window-shop (15) │
│  ███░░░░░░░░░░░░░░░░░  commerce (2)     │
│  █░░░░░░░░░░░░░░░░░░░  whale (1)        │
│                                         │
│  change indicators: ↑↓ vs last week     │
└─────────────────────────────────────────┘
```

Horizontal CSS bars. Color-coded by segment.

### Card 3: Signals Feed

```
┌──────────────────────────────────────────────┐
│  SIGNALS                              filter │
│                                              │
│  🟢 3h ago  2 new commerce connections       │
│  🟠 6h ago  credit wall: 2 users ran dry     │
│  🔵 1d ago  genie usage +40% week over week  │
│  🟢 1d ago  first purchase: anon_k8m2        │
│  🟠 2d ago  churning: 3 users inactive 7d+   │
│                                              │
│  [show more]                                 │
└──────────────────────────────────────────────┘
```

Last 10 signals. Color dots: green (opportunity), amber (risk), blue (info).

### Card 4: Conversion Funnel

```
┌─────────────────────────────────────────┐
│  CONVERSION FUNNEL                      │
│                                         │
│  Signup          45  ████████████████ 100%
│  First gen       28  ██████████░░░░░  62%
│  5+ gens         14  █████░░░░░░░░░░  31%
│  First purchase   5  ██░░░░░░░░░░░░░  11%
│  Repeat purchase  1  █░░░░░░░░░░░░░░   2%
│                                         │
└─────────────────────────────────────────┘
```

Static funnel with percentages. Updated each worker run.

### API Endpoint

`GET /admin/intelligence` — Returns the HTML page (server-rendered, same pattern as Brain Health)

`GET /api/intelligence/latest` — Returns latest snapshot JSON (for Ruhi chat context injection)

---

## 6. Ruhi Chat Integration

### Context Injection

When a user chats with Ruhi on ruhi.ikawn.in, the system prompt includes the latest intelligence snapshot:

```javascript
// In ruhi-chat.js or chat-api.js, before building system prompt:
const latestIntel = await db.query(`
  SELECT summary, data FROM intelligence_snapshots
  WHERE snapshot_type = 'cohort_analysis'
  ORDER BY created_at DESC LIMIT 1
`);

// Inject into system prompt:
const intelContext = latestIntel.rows[0]
  ? `\n\nCURRENT PLATFORM INTELLIGENCE:\n${latestIntel.rows[0].summary}\n\nRaw data: ${JSON.stringify(latestIntel.rows[0].data)}`
  : '';
```

This gives Ruhi conversational access to intelligence without additional API calls.

### PII Boundary

Intelligence snapshots contain only anonymized IDs. Ruhi cannot resolve anonymized IDs to real
users from within OpenBrain. If the admin needs to investigate a specific account, they use
ikawn-v3 directly where PII lives. This boundary is by design and must not be bypassed.

There is no `deepSearchAccount()` function. There is no reverse-lookup. The `ANON_SALT` exists
to prevent rainbow table attacks, not to enable de-anonymization. This is a provable security
claim: "Data in our intelligence layer is irreversibly anonymized. We cannot reverse it. We
don't store the mapping."

---

## 7. Environment & Configuration

### New Fly Secrets (ikawn-openbrain)

| Secret | Purpose |
|--------|---------|
| `IKAWN_OS_DATABASE_URL` | Read-only connection string to ikawn-v3 Postgres |
| `ANON_SALT` | Salt for anonymizing user IDs in snapshots |
| `MAX_INTELLIGENCE_ALERTS_PER_DAY` | Alert throttle (default: 3) |
| `INTELLIGENCE_TELEGRAM_BOT_TOKEN` | Bot token from @BotFather (own bot, not VPS relay) |
| `INTELLIGENCE_TELEGRAM_CHAT_ID` | V's chat ID or group ID for alerts |

### ikawn-v3 DB Access Setup

```bash
# On ikawn-v3's Fly Postgres, create a read-only user:
CREATE ROLE openbrain_reader WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE ikawn_os TO openbrain_reader;
GRANT USAGE ON SCHEMA public TO openbrain_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO openbrain_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO openbrain_reader;
```

### Worker Configuration

```javascript
const INTELLIGENCE_CONFIG = {
  intervalMs: 60 * 60 * 1000,       // 60 minutes
  maxConnectionPoolSize: 2,          // minimal footprint on ikawn-v3
  connectionIdleTimeoutMs: 10000,    // close idle connections fast
  connectionTimeoutMs: 5000,         // fail fast if ikawn-v3 DB unreachable
  statementTimeoutMs: 10000,         // 10s max per query — back off if exceeded
  snapshotRetentionDays: 90,         // auto-cleanup old snapshots
  alertCooldownMs: 4 * 60 * 60 * 1000, // 4 hours between alerts
};
// LLM: uses callReflectionLLM('intelligence_distillation', ...) — model configured in MODEL_ROUTING
```

---

## 8. Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/workers/intelligence-worker.js` | Main worker: pull → distill → store → alert |
| `src/routes/intelligence.js` | Dashboard page + API endpoint |
| `src/utils/telegram.js` | Shared Telegram Bot API utility (intelligence alerts + future governance) |

### Modified Files
| File | Change |
|------|--------|
| `src/db.js` | Add `intelligence_snapshots` table schema + ikawn-v3 connection pool |
| `src/index.js` | Mount intelligence routes, start intelligence worker |
| `src/routes/ruhi-chat.js` | Inject latest intelligence snapshot into system prompt |
| `src/utils/llm.js` | Add `intelligence_distillation` to MODEL_ROUTING |

### Total Estimated LOC
- intelligence-worker.js: ~250 lines
- intelligence.js (routes + dashboard HTML): ~300 lines
- telegram.js: ~40 lines
- Modifications to existing files: ~60 lines
- **Total: ~650 lines**

---

## 9. What This Enables (Demo Script)

1. Open `ruhi.ikawn.in/admin/intelligence`
2. Show the 4 cards: "Here's what Ruhi sees across all accounts, in real-time"
3. Point to Signals: "These are things Ruhi noticed on her own — nobody asked"
4. Point to Cohorts: "She's categorized every user by behavior, not by what they told us"
5. Switch to Ruhi chat: "Now watch — I can ask her anything about this"
6. Ask: "Who are my warmest leads right now?"
7. Ask: "Why aren't power users converting?"
8. Ask: "What should I do about the churning users?"
9. Show Telegram: "And she messages me when something important happens"

---

## 10. Explicitly Out of Scope

- Individual contact profiles (Phase A)
- GA4/GSC data ingestion into OpenBrain (separate worker, future)
- Identity resolution / probabilistic matching (Phase B)
- Automated action execution (emails, WhatsApp, retargeting)
- Brand-specific vs central Ruhi view split
- Custom cohort definitions via UI (hardcoded in worker for now)
