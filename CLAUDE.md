# iKawn OpenBrain — CLAUDE.md
**Last updated: March 2026 | v3 Architecture**

---

## What OpenBrain Is

OpenBrain is iKawn's IP. The single component that cannot be replicated. Every conversation, edit, decision, generation, and interaction across every brand on the platform flows through here. It is the nervous system of the iKawn ecosystem.

**Do not treat this as a chat app with memory bolted on. It is a data intelligence layer that happens to have a chat interface.**

Three roles:
1. **Memory infrastructure** — captures, embeds, and searches everything across all channels
2. **Ruhi's soul** — powers the Ruhi interface at os.ikawn.com/ruhi
3. **Orchestration proxy** — routes actions from Ruhi/OpenClaw to ikawn OS agents

---

## Non-Negotiable Operating Rules

**Solo enterprise.** One decision-maker: Vineet Sawant (v@ikawn.com). No approvals from others. No suggestions to delegate.

**Staging first, always.** Changes to ikawn-v3 (os.ikawn.com) go to staging branch only. OpenBrain API changes deploy to Fly but must not break existing endpoints. V explicitly approves before any production merge.

**OpenBrain is API-only going forward.** The chat UI at ikawn-openbrain.fly.dev is V's private internal dashboard — it stays. The client-facing Ruhi interface lives at os.ikawn.com/ruhi (built inside ikawn-v3 as a React route). Never redirect /ruhi to ikawn-openbrain.fly.dev. Never iframe it.

**Zero internal branding in any user-facing surface.** The product name is Ruhi. OpenBrain, OpenClaw, ikawn-openbrain — none of these appear anywhere a user sees.

---

## Auths & Credentials

```
# OpenClaw (Hostinger VPS)
SSH: root@72.60.203.110
SSH Password: (U9QEkTsZnoFAyZd4)
Gateway Token: gSDVB49ChsSZlDNJdkp9IWrJP18vxaS3

# ikawn OS API
Key: ik_f3f080eab9a4053ab87aecb30ed1f27e

# OpenBrain
URL: https://ikawn-openbrain.fly.dev
API Key: ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f

# Repos
OpenBrain: https://github.com/vineonardo/ikawn-openbrain.git
ikawn-v3:  os.ikawn.com (separate Fly app — do not touch unless building /ruhi route on staging)
```

---

## Deployment Topology

```
ikawn-openbrain.fly.dev    →  V's private internal brain dashboard ONLY
                               API + existing chat UI for V
                               Not linked from os.ikawn.com

os.ikawn.com/ruhi          →  Client-facing Ruhi interface
                               Built as React route inside ikawn-v3
                               STAGING BRANCH ONLY until V approves

Telegram (@ruhi_assistbot) →  Channel via OpenClaw on VPS
Slack (coming)             →  Channel via OpenClaw on VPS
```

---

## Architecture

```
User (Telegram / os.ikawn.com/ruhi / Slack)
        ↓
OpenClaw (VPS 72.60.203.110) — orchestration & channel routing
        ↓ REST (X-Api-Key)
OpenBrain (ikawn-openbrain.fly.dev) — memory, RAG, intelligence
        ↓ REST (Bearer token)
ikawn OS (os.ikawn.com) — Genie, Remix, Prism, Lazarus, Muse
```

**OpenClaw's role:** execution and channel routing. It has no memory of its own that matters. All memory lives in OpenBrain.

**OpenBrain's role:** capture everything, embed async, search on demand, proxy to ikawn OS, enforce moderation, manage tenancy.

**ikawn OS's role:** dumb executor. It generates images/videos/copy on request. It doesn't think.

---

## Project Structure

```
ikawn-openbrain/
  src/
    index.js              # Express app entry (port 3000)
    db.js                 # Postgres pool + schema init (auto-runs on startup)
    auth.js               # requireAuth + requireAdmin + requireBrand middleware
    embeddings.js         # OpenAI text-embedding-3-small (1536-dim)
    scheduler.js          # GitHub (30min), GCal (2hr), retention cron (nightly)
    workers/
      embedding-worker.js # Async batch embedding (5s interval, 50 texts/call)
      moderation-worker.js# Async content moderation (30s interval)
      mothership-worker.js# Nightly anonymised signal promotion
    utils/
      capture.js          # captureMessage() + captureEditDelta() — ONLY way data enters memories
      llm.js              # OpenAI chat completions (streaming + non-streaming)
      storage.js          # R2 upload (all keys prefixed openbrain/)
      web-search.js       # Brave Search API
      link-reader.js      # URL → Readability
      doc-parser.js       # PDF/text extraction
    routes/
      auth-routes.js      # /auth/*
      admin-api.js        # /admin/api/*
      pages.js            # /login, /admin, /settings
      chat-page.js        # GET / — Ruhi internal dashboard UI
      chat-api.js         # Chat CRUD + SSE streaming + RAG
      capture.js          # POST /capture
      search.js           # GET /search
      recent.js           # GET /recent
      stats.js            # GET /stats
      edit-deltas.js      # POST /edit-delta, GET /edit-deltas
      generations.js      # GET /generations, GET /generations/:id, POST /generations/:id/selection
      actions.js          # POST /api/actions/trigger, GET /api/actions/status/:id, POST /api/actions/complete
      gdpr.js             # DELETE /api/gdpr/brand/:brand_id
      brain-health.js     # GET /brain-health, GET /mothership/stats (ikawn-only)
    mcp/
      server.js           # MCP stdio server (8 tools for Claude Desktop)
    connectors/
      github.js           # Commit/issue/PR sync
      gcal.js             # Calendar event sync
    ruhi/
      persona.js          # Ruhi system prompt builder
```

---

## Database Schema

### Existing tables (v1 — keep, add brand_id)

```sql
-- memories — core memory store (ADD brand_id, embedding_status, moderation columns)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_score FLOAT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_flags TEXT[] DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Set embedding_status for existing rows
UPDATE memories SET embedding_status = 'done', brand_id = 'ikawn' WHERE embedding IS NOT NULL AND brand_id IS NULL;

-- conversations, messages — add brand_id
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';

-- ob_decisions — add brand_id
ALTER TABLE ob_decisions ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
```

### New tables (v3)

```sql
-- Tenancy
CREATE TABLE IF NOT EXISTS brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  tier            VARCHAR(50) DEFAULT 'starter',
  status          VARCHAR(50) DEFAULT 'active',
  gdpr_region     VARCHAR(10) DEFAULT 'global',
  data_retention_days INT DEFAULT 730,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO brands (brand_id, name, tier) VALUES ('ikawn', 'iKawn Technologies', 'enterprise')
ON CONFLICT (brand_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS brand_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  user_id         INTEGER REFERENCES users(id),
  role            VARCHAR(50) DEFAULT 'member',
  channels        TEXT[] DEFAULT '{}',
  gdpr_consent    BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Edit deltas — highest priority, most valuable training data
CREATE TABLE IF NOT EXISTS edit_deltas (
  id              BIGSERIAL PRIMARY KEY,
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  agent_name      VARCHAR(100) NOT NULL,
  generation_id   UUID,
  session_id      UUID,
  delta_type      VARCHAR(50) NOT NULL,
  -- delta_type values: 'prompt_refinement' | 'direct_text_edit' | 'selection' | 'rejection' | 'generate_more'
  original_prompt TEXT,
  revised_prompt  TEXT,
  original_output TEXT,
  edited_output   TEXT,
  selected_urls   TEXT[] DEFAULT '{}',
  rejected_urls   TEXT[] DEFAULT '{}',
  model_used      VARCHAR(100),
  user_signal     VARCHAR(50) DEFAULT 'implicit',
  promoted_to_mothership BOOLEAN DEFAULT FALSE,
  anonymised      BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Generation results
CREATE TABLE IF NOT EXISTS generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  agent_name      VARCHAR(100) NOT NULL,
  prompt          TEXT NOT NULL,
  output_type     VARCHAR(50) NOT NULL,
  output_urls     TEXT[] DEFAULT '{}',
  output_metadata JSONB DEFAULT '{}',
  model_used      VARCHAR(100),
  credits_consumed FLOAT DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'pending',
  session_id      UUID,
  memory_id       INTEGER REFERENCES memories(id),
  ikawn_generation_id TEXT,
  callback_received BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Brand context
CREATE TABLE IF NOT EXISTS brand_context (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) UNIQUE NOT NULL REFERENCES brands(brand_id),
  industry        VARCHAR(100),
  tone_of_voice   TEXT,
  target_audience TEXT,
  brand_guidelines JSONB DEFAULT '{}',
  connected_platforms TEXT[] DEFAULT '{}',
  preferences     JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO brand_context (brand_id, industry) VALUES ('ikawn', 'AI SaaS / Commerce Tech')
ON CONFLICT (brand_id) DO NOTHING;

-- Brand ratings (iKawn management view)
CREATE TABLE IF NOT EXISTS brand_ratings (
  id              BIGSERIAL PRIMARY KEY,
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
  abuse_flags     INT DEFAULT 0,
  inappropriate_content_count INT DEFAULT 0,
  notes           TEXT,
  rated_by        VARCHAR(255),
  rated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Mothership (anonymised signal store)
CREATE TABLE IF NOT EXISTS mothership_log (
  id              BIGSERIAL PRIMARY KEY,
  source_brand_id VARCHAR(100),
  data_type       VARCHAR(100) NOT NULL,
  anonymised_payload JSONB NOT NULL,
  demographic_tags JSONB DEFAULT '{}',
  signal_strength FLOAT,
  promoted_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### Required indexes

```sql
CREATE INDEX IF NOT EXISTS idx_memories_brand ON memories(brand_id);
CREATE INDEX IF NOT EXISTS idx_memories_source_ref ON memories(source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status) WHERE embedding_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_edit_deltas_brand ON edit_deltas(brand_id);
CREATE INDEX IF NOT EXISTS idx_edit_deltas_agent ON edit_deltas(agent_name);
CREATE INDEX IF NOT EXISTS idx_generations_brand ON generations(brand_id);
```

---

## Universal Capture Rule

**Every message that enters or leaves the system goes through `captureMessage()`. No exceptions. No direct INSERT into memories anywhere else.**

```javascript
// src/utils/capture.js
export async function captureMessage({ brand_id = 'ikawn', session_id, channel, direction, content, source_ref = null }) {
  const ref = source_ref || `${channel}_${direction}_${Date.now()}`;
  try {
    const result = await pool.query(`
      INSERT INTO memories (brand_id, content, source, memory_type, source_ref, tags, author, embedding_status)
      VALUES ($1, $2, $3, 'conversation', $4, $5, $6, 'pending')
      ON CONFLICT (source_ref) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      RETURNING id
    `, [brand_id, content, `ruhi-${channel}`, ref, [channel, direction], direction === 'inbound' ? 'user' : 'ruhi']);
    return result.rows[0].id;
  } catch (err) {
    console.error('[Capture] Failed:', err.message, { ref, channel });
    return null; // NEVER throw. Capture must not break user experience.
  }
}
```

**Web chat capture** — add to `chat-api.js` after every assistant response:
```javascript
await captureMessage({ brand_id: req.session.brand_id || 'ikawn', session_id: conversationId, channel: 'web', direction: 'inbound', content: userMessage, source_ref: `web_in_${conversationId}_${messageId}` });
await captureMessage({ brand_id: req.session.brand_id || 'ikawn', session_id: conversationId, channel: 'web', direction: 'outbound', content: assistantResponse, source_ref: `web_out_${conversationId}_${messageId}` });
```

---

## Async Embedding Worker

Embeddings are NEVER computed synchronously in the request path. Remove any blocking `generateEmbedding()` calls from capture route. Set `embedding_status = 'pending'` and return.

Worker in `src/workers/embedding-worker.js`:
- Runs every 5 seconds
- Fetches up to 50 `embedding_status = 'pending'` memories
- One batch OpenAI embeddings API call for all 50
- Updates `embedding`, `embedding_status = 'done'`, `embedded_at`
- On failure: sets `embedding_status = 'failed'`, logs error

Search falls back to `ILIKE` full-text when `embedding IS NULL`. Never return error because embedding isn't ready.

---

## Edit Delta Capture

**No UI buttons. All signals are implicit.**

Four capture points — implement all four:

1. **Prompt refinement** — user sends follow-up after generation → `delta_type: 'prompt_refinement'`
2. **Generate More** — user triggers generate more with same prompt → `delta_type: 'generate_more'`
3. **Selection** — `POST /api/generations/:id/selection` with `{selected_urls, all_urls}` → `delta_type: 'selection'` with rejected_urls computed as diff
4. **Direct text edit** — future, flag with `// TODO: edit_delta capture` in output component

Selection endpoint called from ikawn-v3 when user picks outputs. Flag in ikawn-v3 with `// TODO: wire selection endpoint` — V connects this in separate ikawn-v3 sprint.

---

## OpenClaw SOUL.md — Update to This Exactly

```markdown
## OpenBrain Memory — ABSOLUTE RULES, NO EXCEPTIONS

BEFORE every response:
  exec: curl -s "https://ikawn-openbrain.fly.dev/search?q={USER_MESSAGE_VERBATIM}&limit=5" \
    -H "X-Api-Key: ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f"
  Inject results as context. If search fails, continue anyway.

AFTER every response, TWO captures in this exact order:

  CAPTURE 1 — user message:
  exec: curl -s -X POST "https://ikawn-openbrain.fly.dev/capture" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f" \
    -d '{"content":"{EXACT_USER_MESSAGE}","source":"openclaw-telegram","memory_type":"conversation","source_ref":"telegram_in_{CHAT_ID}_{MESSAGE_ID}","tags":["telegram","inbound"],"author":"user","brand_id":"ikawn"}'

  CAPTURE 2 — your response:
  exec: curl -s -X POST "https://ikawn-openbrain.fly.dev/capture" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f" \
    -d '{"content":"{YOUR_EXACT_RESPONSE}","source":"openclaw-telegram","memory_type":"conversation","source_ref":"telegram_out_{CHAT_ID}_{MESSAGE_ID}","tags":["telegram","outbound"],"author":"ruhi","brand_id":"ikawn"}'

RULES:
- Capture raw content verbatim. No summarising. No filtering.
- Every single message. No exceptions.
- If POST fails, log and continue. Do NOT retry in same turn.
- brand_id is always "ikawn" until multi-brand is configured.
```

---

## API Endpoints

All require `X-Api-Key` header or valid session cookie. All responses filtered by `brand_id`.

```
# Memory (existing — add brand_id filter)
POST   /capture
GET    /search?q=&brand_id=&limit=
GET    /recent?brand_id=&limit=
GET    /stats?brand_id=

# Edit deltas (new)
POST   /edit-delta
GET    /edit-deltas?brand_id=&agent=&type=

# Generations (new)
GET    /generations?brand_id=&agent=
GET    /generations/:id
POST   /api/generations/:id/selection      ← called from ikawn-v3 on user selection

# Actions proxy (existing + new webhook)
POST   /api/actions/trigger
GET    /api/actions/status/:id
POST   /api/actions/complete               ← NEW: ikawn OS calls this when generation finishes

# GDPR (new — admin key only)
DELETE /api/gdpr/brand/:brand_id

# iKawn-internal only (new — ikawn brand key only)
GET    /brain-health
GET    /mothership/stats

# Existing
POST   /auth/login, /auth/logout, /auth/change-password
GET    /admin/api/users  etc.
GET    /decisions, POST /decisions
```

---

## Rate Limiting

Add `express-rate-limit` to all public endpoints:

```javascript
import rateLimit from 'express-rate-limit';
app.use('/capture',              rateLimit({ windowMs: 60000, max: 60 }));
app.use('/search',               rateLimit({ windowMs: 60000, max: 120 }));
app.use('/api/chat',             rateLimit({ windowMs: 60000, max: 20 }));
app.use('/auth/login',           rateLimit({ windowMs: 60000, max: 5, skipSuccessfulRequests: true }));
app.use('/api/actions/trigger',  rateLimit({ windowMs: 60000, max: 10 }));
```

---

## Content Moderation

Runs async in `src/workers/moderation-worker.js` — 30-second interval. Never in request path.

- Uses OpenAI moderation API on every new memory
- Sets `moderation_score` (0.0–1.0) and `moderation_flags`
- Score > 0.7: increment `brand_ratings.abuse_flags`
- Score > 0.9: log SEVERE alert — TODO add Telegram notification to V

---

## Mothership (Nightly Worker)

`src/workers/mothership-worker.js` — runs at 2am UTC.

Promotes clean edit_deltas to `mothership_log` with brand identity stripped. Only what goes up: `agent_name`, `delta_type`, `delta_summary`, `user_signal` + demographic tags (`industry`, `tier`, `gdpr_region`). Never: brand_id, content, URLs, any identifying info.

Criteria to promote: `promoted_to_mothership = FALSE` AND `moderation_score < 0.3` AND `deleted_at IS NULL`.

---

## GDPR

- `DELETE /api/gdpr/brand/:brand_id` — soft-deletes memories/edit_deltas/generations, hard-deletes connected_data, sets brand status to 'erased'. Runs in transaction.
- Nightly retention cron: marks memories as deleted where `created_at < NOW() - brands.data_retention_days`
- All deletable tables have `deleted_at TIMESTAMPTZ` column — use soft delete, never hard delete during retention period

---

## Ruhi UI (os.ikawn.com/ruhi)

Built as a React route inside ikawn-v3. **Staging branch only until V approves.**

**Color system:**
- Ruhi: gold gradient `#FFC01C → #F59E0B` — chat header, send button, active tab, typing indicator
- Credits page: remove yellow → replace with standard `#0A0F2E` deep navy
- Dashboard, Profile, all utility pages: standard `#0A0F2E` deep navy, no gradient
- Agent pages (Genie, Remix, Prism, Lazarus, Muse): keep existing colors unchanged

**Tabs:** Chat | Activity | Memory | Generations | Brain Health (ikawn brand only)

**Auth:** Existing os.ikawn.com session. No separate login.

**No internal names in UI.** Product name = Ruhi. That's it.

---

## Key Architecture Decisions

- **No pgvector**: Fly Postgres doesn't include it. Custom `cosine_similarity` PL/pgSQL function. Fine for <50K entries — way beyond current scale.
- **Async embeddings**: Never block on embedding. Capture first, embed in background worker.
- **brand_id everywhere**: Every table, every query, every API response filtered by brand_id. Non-negotiable from v3 forward.
- **captureMessage() is the only door**: No direct INSERTs into memories from anywhere except this function.
- **Shared R2 bucket**: Same bucket as ikawn-v3, all keys prefixed `openbrain/`.
- **SSE streaming**: Chat uses POST + SSE (not WebSocket) — simpler, works through proxies.
- **OpenAI only**: No vendor lock-in concern at current scale. Claude API is an option later.

---

## Fly.io Resources

```
App:       ikawn-openbrain (sin region, shared-cpu-1x, 512MB, auto-stop)
Postgres:  ikawn-openbrain-db (sin region, 3GB volume)
URL:       https://ikawn-openbrain.fly.dev
Deploy:    ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only
Logs:      ~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail
DB:        ~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain
```

---

## Secrets (Fly)

```
DATABASE_URL, OPENAI_API_KEY, SESSION_SECRET, NODE_ENV=production
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
RESEND_API_KEY, BRAVE_SEARCH_API_KEY
GITHUB_TOKEN, GITHUB_ORG, GITHUB_REPOS
GOOGLE_API_KEY, CALENDAR_ID
TELEGRAM_BOT_TOKEN
IKAWN_API_KEY, OPENBRAIN_API_KEY
```

---

## Done (v1–v2)

- [x] Password auth, admin panel, user management
- [x] Chat UI — SSE streaming, conversations, markdown, sidebar
- [x] R2 uploads (images, PDFs), Brave web search, link extraction
- [x] GitHub connector (30-min), Google Calendar connector (2-hr)
- [x] OpenClaw ↔ OpenBrain bridge (search + capture + actions)
- [x] Actions proxy to ikawn OS
- [x] Decision logging (memories + ob_decisions dual-write)
- [x] MCP server (8 tools for Claude Desktop)
- [x] Idempotent capture via source_ref
- [x] RAG pipeline (70% similarity + 30% recency hybrid scoring)

## TODO — v3

### Critical (do first)
- [x] Add brand_id to all tables + backfill to 'ikawn' — db.js schema init
- [x] Create new v3 tables (brands, brand_users, edit_deltas, generations, brand_context, brand_ratings, mothership_log) — db.js
- [x] Add missing indexes — db.js (10 indexes including unique source_ref)
- [x] Replace synchronous embedding with async worker — workers/embedding-worker.js (5s, batch 50)
- [x] Fix web chat → memories bridge (captureMessage in chat-api.js) — both directions captured
- [ ] Update OpenClaw SOUL.md with new capture format — requires SSH to VPS (format defined in CLAUDE.md section "OpenClaw SOUL.md")
- [x] Rate limiting on all endpoints — express-rate-limit on capture/search/chat/login/generate
- [x] Sync embedding removed from ALL insert paths (connectors, webhooks, decisions, mcp, ruhi-chat) — only search uses getEmbedding now

### Important
- [x] Edit delta capture — routes/edit-deltas.js (POST /edit-delta, GET /edit-deltas)
- [x] Selection endpoint — routes/generations.js (POST /api/generations/:id/selection)
- [x] captureEditDelta helper — utils/capture.js (never throws)
- [x] Generation result storage + /api/actions/complete webhook — routes/actions.js
- [x] Moderation worker (async, 30s interval) — workers/moderation-worker.js
- [x] GDPR erasure endpoint — routes/gdpr.js (DELETE /api/gdpr/brand/:brand_id)
- [x] Nightly retention cron — scheduler.js

### Brain Health & Mothership
- [x] Brain health endpoint — routes/brain-health.js (GET /brain-health, GET /mothership/stats)
- [x] Mothership nightly worker — workers/mothership-worker.js (2am UTC daily)

### Ruhi UI (ikawn-v3 staging branch)
- [ ] New React route /ruhi
- [ ] Ruhi gold gradient `#FFC01C → #F59E0B`
- [ ] Credits page: remove yellow → navy
- [ ] Dashboard/Profile: standard navy
- [ ] Four tabs: Chat, Activity, Memory, Generations
- [ ] Brain Health tab (ikawn brand only)
- [ ] Single SSO with os.ikawn.com session

### Later
- [ ] Slack channel integration
- [ ] Token budget management (truncate on long conversations)
- [ ] pgvector migration (when/if Fly supports it or moving to Supabase/Neon)
- [ ] Redis for session store + rate limit + embedding cache
- [ ] Integration test: capture → search roundtrip

---

## Important Notes

- **STANDALONE project.** Do NOT touch ikawn-v3 main branch. Staging branch only for /ruhi work.
- **All Fly resources prefixed** `ikawn-openbrain`.
- **R2 bucket shared** with ikawn-v3 — all keys must use `openbrain/` prefix.
- **Fly CLI** at `~/.fly/bin/flyctl` (not in PATH).
- **captureMessage()** is the only way data enters the memories table. Enforce this.
- **brand_id = 'ikawn'** is the default for all data until multi-brand routing is built.
