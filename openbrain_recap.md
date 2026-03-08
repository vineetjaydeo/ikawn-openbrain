# OpenBrain — Complete System Recap

**Date:** 2026-03-08
**Status:** Production (ikawn-openbrain.fly.dev)
**Purpose:** Hand this to Claude AI on web for discussion. Contains everything about the system.

---

## 1. System Topology

```
Telegram User (@ruhi_assistbot)
        |
        v
OpenBrain (Fly.io, ikawn-openbrain.fly.dev)
  - Receives Telegram webhook
  - Forwards to OpenClaw FIRST (critical path)
  - Captures message to memories DB (async)
        |
        | Relay via VPS (port 46535)
        v
OpenClaw (VPS 72.60.203.110, Docker)
  - Agent runtime, GPT-5-mini default
  - Skills: openbrain-bridge (always-on), ikawn-shopify, ikawn-analytics
  - Telegram webhook listener (port 3333)
  - Searches OpenBrain /search before responding
  - Captures both sides to OpenBrain /capture after responding
        |
        | REST API (Bearer token)
        v
ikawn OS (Fly.io, os.ikawn.com)
  - Visual generation agents (Genie, Remix, Prism, Lazarus, Muse)
  - Credit billing, generation lifecycle
  - Callbacks to OpenBrain /api/actions/complete
```

**Also feeding OpenBrain:**
- GitHub webhooks (commits, PRs, issues) — real-time + 30-min sync
- Google Calendar — 2-hr sync
- Web chat at ruhi.ikawn.in — SSE streaming, conversation history
- MCP server (8 tools for Claude Desktop)
- OpenClaw self-reports via POST /api/ingest/openclaw

---

## 2. What's Delivered & Working

### Core Infrastructure
- **Express 4.21** app on Fly.io (sin region, 512MB, min 1 machine)
- **Postgres** (ikawn-openbrain-db, 3GB volume) — no pgvector, custom `cosine_similarity` PL/pgSQL function
- **R2 storage** — shared bucket with ikawn-v3, all keys prefixed `openbrain/`
- **Password auth** + admin panel + user management
- **Rate limiting** — capture 60/min, search 120/min, chat 20/min, login 5/min

### Memory & Intelligence
- **captureMessage()** — single entry point for ALL data into memories table. No exceptions.
- **Async embedding worker** — 5s interval, batches of 50, text-embedding-3-small (1536-dim)
- **RAG search** — hybrid scoring (70% vector similarity + 30% recency), ILIKE fallback when embedding unavailable
- **Hashtag suggestion** — keyword-based auto-tagging against 24-tag taxonomy (zero LLM calls, instant)
- **Decision logging** — dual-write to memories + ob_decisions table

### Chat UI (ruhi.ikawn.in)
- SSE streaming with conversation history
- Sidebar with conversation management (create, rename, delete)
- UUID-based URLs (conversations.uuid externally, integer PK internally)
- Ruhi persona system (docs/soul.md, docs/memory.md, docs/tools.md, docs/user.md)
- Deep indigo theme, Google Sans, centered layout

### Telegram Real-Time Sync (fixed 2026-03-08)
- **Architecture:** Telegram webhook → OpenBrain (forward + capture) → VPS relay → OpenClaw
- **Critical fix:** Forward MUST happen before res.json() — Fly.io kills async continuation after response
- Relay service at /opt/telegram-relay.js (port 46535, systemd)
- OpenClaw webhook listener at port 3333
- Health-monitor auto-restarts telegram provider when idle ~35min (normal)

### Data Capture (unified 2026-03-08)
- **Web chat** → messages table + memories table (via captureMessage)
- **Telegram** → memories table (via saveMessageToDB)
- **Ruhi /chat** → memories table (via captureMessage — fixed from raw INSERT)
- **Generations** → generations table + memories table (ALL outcomes: success, error, empty)
- **GitHub/Calendar** → memories table (via connectors)
- **MCP** → memories table (capture_thought, log_decision)
- **OpenClaw self-report** → memories table (POST /api/ingest/openclaw)

### Workers
| Worker | Interval | What it does |
|--------|----------|--------------|
| Embedding | 5s | Batch embed pending memories (50/call), text-embedding-3-small |
| Moderation | 30s | OpenAI moderation API on new memories, sets score + flags |
| Scheduler | 30min/2hr | GitHub sync (30min), Calendar sync (2hr) |

### Admin Dashboard
- **Cost Monitor** — GET /admin/costs (15-min cache), Brain Health widget
- **User Management** — CRUD on ob_users
- **Settings** — primary/secondary model selection
- **Error Logs** — (on ikawn-v3 side, not OpenBrain)

### Connectors
- **GitHub** — commits, issues, PRs via webhook + scheduled sync
- **Google Calendar** — event sync every 2hrs
- **Telegram** — webhook-based real-time capture + relay to OpenClaw

---

## 3. API Endpoints (Complete)

### Memory API (X-Api-Key or session)
| Method | Path | Description |
|--------|------|-------------|
| POST | /capture | Capture any content to memories |
| GET | /search?q=&limit= | RAG search (vector + recency) |
| GET | /recent?limit= | Recent memories |
| GET | /stats | Memory statistics |

### Chat (session auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | Chat UI (HTML) |
| POST | /api/chat | SSE streaming chat |
| GET | /api/chat/conversations | List conversations |
| POST | /api/chat/conversations | Create conversation |
| GET | /api/chat/:uuid/messages | Get messages |
| POST | /api/chat/:uuid/messages | Send message |
| DELETE | /api/chat/:uuid | Delete conversation |

### Ruhi Chat (session auth)
| Method | Path | Description |
|--------|------|-------------|
| POST | /chat | SSE streaming with RAG + persona |

### Edit Deltas (X-Api-Key or session)
| Method | Path | Description |
|--------|------|-------------|
| POST | /edit-delta | Capture user signal |
| GET | /edit-deltas?agent=&type= | Retrieve deltas |

### Generations (X-Api-Key or session)
| Method | Path | Description |
|--------|------|-------------|
| GET | /generations | List generation results |
| GET | /generations/:id | Get single generation |
| POST | /api/generations/:id/selection | User picks outputs |

### Actions Proxy (X-Api-Key or session)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/actions/trigger | Trigger generation on ikawn OS |
| GET | /api/actions/status/:id | Poll generation status |
| POST | /api/actions/complete | ikawn OS completion callback |

### Webhooks (token in URL or signature)
| Method | Path | Description |
|--------|------|-------------|
| POST | /webhooks/github | GitHub push/issue/PR events |
| POST | /webhooks/telegram/:token | Telegram updates |

### Admin (admin session only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/costs | OpenAI cost breakdown (JSON) |
| GET | /admin/brain-health | Brain Health dashboard (HTML) |
| GET | /admin/api/users | List users |
| POST | /admin/api/users | Create user |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Login |
| POST | /auth/logout | Logout |
| POST | /auth/change-password | Change password |

### GDPR
| Method | Path | Description |
|--------|------|-------------|
| DELETE | /api/gdpr/brand/:brand_id | Soft-delete all brand data |

---

## 4. Database Schema

### Core Tables
- **memories** — brand_id, content, source, memory_type, source_ref (unique partial index), embedding float8[], embedding_status, moderation_score, moderation_flags, hashtags, author, access_level, project, archived, deleted_at
- **conversations** — id, uuid (UUID for external URLs), title, user_id, brand_id
- **messages** — id, conversation_id, role, content, brand_id
- **users** — id, username, password_hash, role (admin/user)
- **ob_users** — id, name, email, role, access_levels[], brand_id
- **ob_conversations** — id, title, group_id, access_level, created_by
- **ob_decisions** — id, content, context, brand_id
- **ob_ingestion_log** — source, status, records_added, created_at
- **settings** — key/value store (primary_model, secondary_model, etc.)

### v3 Tables
- **brands** — brand_id (unique), name, tier, status, gdpr_region, data_retention_days
- **brand_users** — brand_id → user_id mapping, role, channels, gdpr_consent
- **edit_deltas** — brand_id, agent_name, delta_type, original/revised prompt, selected/rejected URLs
- **generations** — brand_id, agent_name, prompt, output_urls, status, ikawn_generation_id
- **brand_context** — industry, tone_of_voice, target_audience, preferences
- **brand_ratings** — rating, abuse_flags, inappropriate_content_count

### Key Indexes
- `idx_memories_source_ref_unique` — UNIQUE partial index on source_ref WHERE NOT NULL
- `idx_memories_brand` — brand_id
- `idx_memories_created_at` — created_at DESC
- `idx_memories_embedding_status` — WHERE embedding_status = 'pending'

---

## 5. Bugs Fixed This Session (2026-03-08)

| Bug | Root Cause | Fix | Commit |
|-----|-----------|-----|--------|
| Telegram forwarding to OpenClaw never executed | Forward happened after res.json() — Fly killed async continuation | Reorder: forward FIRST, then respond, then capture | 983ebcd |
| Embedding worker failing on ALL 202 memories | JSON.stringify() → "[...]" but Postgres float8[] needs "{...}" | Use Postgres array literal format | 983ebcd |
| Embedding error handler invalid SQL | UPDATE...ORDER BY...LIMIT not valid Postgres | Use subquery | 983ebcd |
| captureMessage() silently failing since day 1 | ON CONFLICT (source_ref) didn't match partial unique index | Add WHERE source_ref IS NOT NULL to ON CONFLICT | 741216a |
| Ruhi chat raw INSERTs, no idempotency | Bypassed captureMessage(), no source_ref | Switched to captureMessage() | edf7e86 |
| Generation errors invisible to search | Only successful completions captured | Capture ALL outcomes | edf7e86 |
| suggestHashtags burning LLM tokens + adding 2-5s latency | gpt-4o-mini called for every capture/telegram/MCP message | Replaced with keyword matcher — zero LLM, instant | pending |
| Title generation using expensive model | Used primary_model (gpt-4o) for 3-5 word titles | Hardcoded to gpt-4o-mini | pending |

---

## 6. What Can Be Improved

### P0 — Fix Before Next Brand

1. **Mothership nightly worker** — Referenced in CLAUDE.md v3 spec but NOT implemented. Should promote clean edit_deltas to anonymised mothership_log nightly at 2am UTC.

2. **Moderation alerting** — Worker runs but score > 0.9 does nothing. Should notify V via Telegram.

3. **OpenClaw SOUL.md update** — v3 CLAUDE.md defines exact curl format for search-before-respond + capture-after-respond. VPS SOUL.md may not match current format.

4. ~~**suggestHashtags latency**~~ ✅ **FIXED** — Replaced gpt-4o-mini LLM call with keyword-based matcher against the 24-tag taxonomy. Zero LLM calls, instant, deterministic. Also hardcoded title generation to gpt-4o-mini (was using primary model, potentially gpt-4o).

### P1 — Technical Debt

5. **Two conversation tables** — `conversations` (web chat) and `ob_conversations` (Ruhi chat) serve similar purposes. Could merge.

6. **Two user tables** — `users` (auth) and `ob_users` (access control). Access_levels on ob_users, role on users. Should consolidate.

7. **Dead code in telegram.js** — `conversationBuffers`, `flushConversation`, `startFlushTimer` — all unused since switching to direct DB writes. Remove.

8. **No input validation** — No Joi/Zod schemas on any endpoint. Accepts whatever comes in.

9. **No structured logging** — console.log/error only. Should use pino for structured JSON logs with request IDs.

10. **No test suite** — Zero tests. Should have at minimum: capture → embed → search roundtrip, webhook signature verification, rate limit behavior.

### P2 — Scale Preparation

11. **No monitoring/alerting** — No Datadog, Prometheus, or custom metrics. Cost spikes discovered manually.

12. **No backup strategy** — Fly Postgres has snapshots but no documented restore procedure.

13. **Session secret rotation** — Single SESSION_SECRET in env. No rotation mechanism.

14. **brand_id enforcement** — Column exists but not enforced at middleware level. Relies on individual routes to filter.

15. **API documentation** — No OpenAPI/Swagger spec. 20+ endpoints undocumented for external consumers.

### P3 — Nice to Have

16. **Token budget management** — Long conversations send full history to LLM. Should truncate/summarize.

17. **Embedding cache** — Same content re-embedded on conflict update. Could skip if content unchanged.

18. **pgvector migration** — When Fly supports it or moving to Supabase/Neon. Would simplify cosine_similarity.

19. **Redis** — For session store + rate limit + embedding cache. Evaluated and removed as premature (correct decision for current scale).

---

## 7. Key Files Reference

```
src/
  index.js              — Express app, middleware, route mounting (ORDER MATTERS)
  db.js                 — Postgres pool, schema init, all CREATE TABLE/ALTER TABLE
  auth.js               — requireAuth, requireAdmin, requireBrand, requireAuthOrApiKey
  embeddings.js         — getEmbedding() for search queries
  scheduler.js          — Cron: GitHub (30min), Calendar (2hr), retention (nightly)

  routes/
    webhooks.js         — GitHub + Telegram webhooks, OpenClaw ingest
    chat-api.js         — Web chat CRUD + SSE streaming
    chat-page.js        — Chat UI HTML/CSS/JS (server-rendered)
    ruhi-chat.js        — Ruhi persona chat with RAG
    capture.js          — POST /capture endpoint
    search.js           — GET /search (vector + recency hybrid)
    recent.js           — GET /recent
    stats.js            — GET /stats
    edit-deltas.js      — Edit delta capture + retrieval
    generations.js      — Generation results + selection
    actions.js          — ikawn OS proxy (trigger, status, complete)
    admin-api.js        — Admin user management
    brain-health.js     — Cost monitor + Brain Health dashboard
    gdpr.js             — GDPR erasure
    auth-routes.js      — Login, logout, change password
    pages.js            — Login page, admin page, settings page HTML

  workers/
    embedding-worker.js — Async batch embedding (5s, 50/batch)
    moderation-worker.js— Content moderation (30s)

  utils/
    capture.js          — captureMessage() + captureEditDelta() — THE ONLY DOOR
    llm.js              — OpenAI chat completions (streaming + non-streaming)
    storage.js          — R2 upload
    web-search.js       — Brave Search API
    link-reader.js      — URL → Readability
    doc-parser.js       — PDF/text extraction
    hashtags.js         — Keyword-based hashtag suggestion (no LLM)

  connectors/
    github.js           — Commit/issue/PR sync
    gcal.js             — Calendar event sync
    telegram.js         — Telegram message processing + OpenClaw self-report

  ruhi/
    persona.js          — Ruhi system prompt builder

  mcp/
    server.js           — MCP stdio server (8 tools for Claude Desktop)

  docs/
    soul.md             — Ruhi's personality + knowledge
    memory.md           — Memory system docs
    tools.md            — Available tools
    user.md             — User context
```

---

## 8. Credentials & Access

```
# OpenBrain
URL: https://ikawn-openbrain.fly.dev
API Key: ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f
Deploy: ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --no-cache
Logs: ~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail
DB: ~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain

# OpenClaw (VPS)
SSH: root@72.60.203.110 (password: (U9QEkTsZnoFAyZd4))
Gateway Token: gSDVB49ChsSZlDNJdkp9IWrJP18vxaS3
Container: openclaw-hn3b-openclaw-1

# ikawn OS
URL: https://os.ikawn.com
API Key: ik_f3f080eab9a4053ab87aecb30ed1f27e
```

---

## 9. Non-Negotiable Rules

1. **captureMessage() is the ONLY door** — No direct INSERTs into memories anywhere
2. **Never expose OpenClaw/OpenBrain names** in UI — product name is Ruhi
3. **Always deploy with --no-cache** — Depot builder caches stale src layers
4. **Route order matters** in index.js — Memory API routes BEFORE chatApi
5. **ON CONFLICT with partial indexes** needs matching WHERE clause
6. **Fly.io kills async work after res.json()** — do critical work before responding
7. **brand_id = 'ikawn'** is default until multi-tenant is live

---

*Last updated: 2026-03-08 by Claude Code session (commits 983ebcd, 741216a, edf7e86 + LLM optimization pass)*
