# OpenBrain Tri-System Orchestration — Complete Recap

**Date:** 2026-03-07
**Scope:** Everything achieved across OpenBrain, OpenClaw, and ikawn OS — connections, gaps, strengths, weaknesses

---

## 1. System Topology

```
Telegram User (@ruhi_assistbot)
        |
        v
OpenClaw (VPS 72.60.203.110, Docker)
  - Antfarm agent runtime, GPT-5.2
  - Skills: openbrain-bridge (always-on), web-browse, codex-cli
  - Telegram long-polling (getUpdates)
  - Ports: 46533 (gateway), 3333 (dashboard)
        |
        | REST API (X-Api-Key: ob_...)
        v
OpenBrain (ikawn-openbrain.fly.dev, Fly.io)
  - Memory API: /capture, /search, /recent, /stats, /decisions
  - Chat API: /api/chat/send (SSE, RAG, Brave search, tool calling)
  - Actions proxy: /api/actions/trigger, /status/:id, /complete
  - MCP server: 8 tools for Claude Desktop
  - Workers: embedding (5s), moderation (30s), mothership (2am daily)
  - Connectors: GitHub (30min), Google Calendar (2hr)
  - Postgres (Fly managed), R2 storage (shared bucket)
        |
        | REST API (Bearer: ik_...)
        v
ikawn OS (os.ikawn.com, Fly.io)
  - External API: POST /api/external/generate, GET /api/external/generations/:id
  - Agents: Genie, Remix, Prism, Lazarus (Muse not exposed externally)
  - Credit-based billing per user API key
  - Fal.ai for image/video generation
  - Ruhi Layer 1 chatbot (self-contained, NOT connected to OpenBrain)
```

---

## 2. What Has Been Achieved

### A. OpenClaw (VPS)

| Component | Status | Details |
|-----------|--------|---------|
| Telegram bot | DEPLOYED | @ruhi_assistbot, long-polling via Antfarm runtime |
| openbrain-bridge skill | DEPLOYED, ALWAYS-ON | 4-step loop: search -> respond -> capture user -> capture response |
| /generate command | WORKING | Triggers ikawn OS via OpenBrain proxy, polls until complete |
| /remember command | WORKING | Saves explicit memory via POST /capture |
| /recall command | WORKING | Searches memory via GET /search |
| /decide command | WORKING | Logs decisions via POST /decisions |
| web-browse skill | DEPLOYED | Playwright headless browsing (scripts/browse.js) |
| codex-cli skill | DEPLOYED | Delegates coding tasks to OpenAI Codex CLI |
| Skill auto-discovery | WORKING | Any dir with _meta.json + SKILL.md auto-loads |

### B. OpenBrain (Fly.io)

| Component | Status | Details |
|-----------|--------|---------|
| Memory capture | DEPLOYED | POST /capture with source_ref UPSERT idempotency |
| Semantic search | DEPLOYED | Custom cosine_similarity PL/pgSQL (no pgvector), hybrid 70% similarity + 30% recency |
| Async embedding | DEPLOYED | Worker every 5s, batch 50, text-embedding-3-small (1536-dim) |
| Moderation worker | DEPLOYED | Every 30s, OpenAI moderation API, flags at >0.3, alerts at >0.7 |
| Mothership worker | DEPLOYED | 2am UTC daily, anonymised edit_delta promotion |
| Ruhi web chat | DEPLOYED | SSE streaming, RAG, file uploads, web search (Brave), link extraction |
| Knowledge base | DEPLOYED | soul.md + memory.md + tools.md + user.md loaded at startup, injected into chat prompts |
| Actions proxy | DEPLOYED | /api/actions/trigger -> os.ikawn.com/api/external/generate |
| MCP server | DEPLOYED | 8 tools: capture_thought, search_memory, list_recent, get_decisions, log_decision, get_stats, trigger_sync, ask_ruhi |
| GitHub connector | DEPLOYED | 30-min sync, commits/issues/PRs, webhook receiver with HMAC |
| Google Calendar | DEPLOYED | 2-hr sync, OAuth service account |
| Decision logging | DEPLOYED | Dual-write to memories + ob_decisions |
| Edit deltas | DEPLOYED | POST /edit-delta, GET /edit-deltas, selection endpoint |
| Generation tracking | DEPLOYED | GET /generations, POST /generations/:id/selection |
| GDPR erasure | DEPLOYED | DELETE /api/gdpr/brand/:brand_id (soft-delete + transaction) |
| Brain health | DEPLOYED | GET /brain-health, GET /mothership/stats |
| Rate limiting | DEPLOYED | express-rate-limit on all public endpoints |
| Multi-brand schema | DEPLOYED | brand_id on all tables, brands/brand_users/brand_context tables |
| Web chat -> memory bridge | DEPLOYED | captureMessage() after every assistant response in chat-api.js |
| Auth | DEPLOYED | Cookie-session + bcrypt + API key (X-Api-Key) for machine callers |
| Admin panel | DEPLOYED | User CRUD, role management, suspend/activate |
| Password reset | DEPLOYED | Email via Resend, 6-digit codes |
| Telegram notify | DEPLOYED | POST /api/notify/telegram -> Bot API direct (bypasses OpenClaw) |
| Retention cron | DEPLOYED | Nightly soft-delete past brands.data_retention_days |

### C. ikawn OS (os.ikawn.com)

| Component | Status | Details |
|-----------|--------|---------|
| External generate API | DEPLOYED | POST /api/external/generate — auth, content safety, dynamic pricing, credit deduction, Fal submit |
| Generation polling | DEPLOYED | GET /api/external/generations/:id — returns status + resultUrls when complete |
| API key management | DEPLOYED | ik_ + 32 hex chars, stored in users.api_key, regenerate endpoint |
| OpenBrain HTTP client | DEPLOYED | server/utils/openbrain.ts — openbrainFetch<T>() with X-Api-Key auth |
| Admin OpenBrain proxies | DEPLOYED | /api/ruhi/openbrain/brain-health, /generations, /memories — read-only admin windows |
| Ruhi Layer 1 chatbot | DEPLOYED | POST /api/ruhi/chat — SSE, Gemini Flash, probing detection, intelligence scoring, ticket escalation |
| Content safety | DEPLOYED | checkPromptSafety() + checkContentSafety() on external API |
| Dynamic pricing | DEPLOYED | model_pricing DB table, 1-min cache, per-agent per-quality costs |

### D. Cross-System E2E Flows (Tested 2026-03-07)

| Flow | Status |
|------|--------|
| Telegram msg -> OpenClaw -> search OpenBrain -> respond -> capture to OpenBrain | WORKING |
| /generate -> OpenClaw -> OpenBrain /api/actions/trigger -> ikawn OS generate -> poll -> return | WORKING |
| Web chat -> Ruhi -> RAG from memories -> stream response -> capture to memories | WORKING |
| GitHub commit -> scheduler -> capture to memories -> async embed -> searchable | WORKING |
| Claude Desktop -> MCP -> capture_thought/search_memory | WORKING |
| OpenBrain -> Telegram direct notification (POST /api/notify/telegram) | WORKING |

---

## 3. Authentication Map

| Caller | Target | Mechanism | Key Format | Storage |
|--------|--------|-----------|------------|---------|
| OpenClaw | OpenBrain | X-Api-Key header | ob_cc6b2e7ff... | Hardcoded in SKILL.md |
| OpenClaw | ikawn OS (via bridge) | Authorization: Bearer | ik_f3f080eab9... | Hardcoded in SKILL.md |
| OpenBrain | ikawn OS | Authorization: Bearer | ik_f3f080eab9... | Fly secret IKAWN_API_KEY |
| Claude Desktop | OpenBrain | Direct DB (no HTTP) | N/A | MCP stdio, same process |
| ikawn OS admin UI | OpenBrain | X-Api-Key header | ob_... | Fly secret OPENBRAIN_API_KEY |
| Browser | OpenBrain chat | Cookie session | Session cookie | express cookie-session |
| Browser | ikawn OS | Cookie session | nuxt-auth session | Nuxt session |

---

## 4. Data Flow Details

### OpenClaw Bridge (per Telegram message)

```
1. GET /search?q={user_message}&limit=5  (X-Api-Key)
   -> OpenBrain generates embedding, cosine search
   -> Returns top 5 relevant memories as context

2. OpenClaw LLM (GPT-5.2) builds response using memory context

3. POST /capture (user message)
   { content, source: "openclaw-telegram", memory_type: "conversation",
     source_ref: "telegram_in_{CHAT_ID}_{MESSAGE_ID}", author: "user" }
   -> UPSERT via source_ref, embedding_status = 'pending'

4. POST /capture (assistant response)
   { content, source: "openclaw-telegram", memory_type: "conversation",
     source_ref: "telegram_out_{CHAT_ID}_{MESSAGE_ID}", author: "ruhi" }

5. Background: embedding worker picks up pending -> vectorizes -> searchable
```

### Generation via Telegram

```
User: /generate a sunset over mountains

OpenClaw -> POST /api/actions/trigger
  { action: "generate", agent: "genie", prompt: "a sunset over mountains" }

OpenBrain -> POST os.ikawn.com/api/external/generate
  { agent: "genie", prompt: "a sunset over mountains" }
  Authorization: Bearer ik_f3f080eab9...

ikawn OS:
  1. validateApiKey() -> finds user by ik_ key
  2. checkPromptSafety() + checkContentSafety()
  3. loadPricing() -> creditCost from model_pricing table
  4. agents.genie.analyze() -> enhanced prompt + model selection
  5. deductCredits() + INSERT generations (atomic transaction)
  6. provider.submit() -> Fal.ai -> pollSingleRequest()
  7. Returns { generationId, status: 'generating' }

OpenClaw polls GET /api/actions/status/{id}
  -> OpenBrain proxies to os.ikawn.com/api/external/generations/{id}
  -> Returns { status, resultUrls } when complete
```

### Ruhi Web Chat (OpenBrain dashboard)

```
POST /api/chat/send (SSE stream)
  1. Saves user message to messages table
  2. searchMemories(query) -> embed query -> cosine search -> hybrid re-rank
     -> Top 8 memories with date/source/type/content
  3. Injects: soul.md + memory.md + tools.md + RAG context + 11 rules
  4. Fetches last 50 messages for conversation history
  5. Non-streaming check for web_search tool call
  6. If tool call: Brave Search -> append result
  7. Stream response via SSE
  8. captureMessage() for both inbound + outbound -> memories table
```

### Ruhi Layer 1 (ikawn OS) — SEPARATE SYSTEM

```
POST /api/ruhi/chat (SSE stream)
  - Uses Gemini Flash (NOT OpenAI)
  - Own memory in ikawn OS Postgres (ruhi_conversations, ruhi_messages, ruhi_user_memory)
  - Does NOT connect to OpenBrain
  - Knowledge from forAgents.md + operationalAgents config
  - Probing detection + intelligence scoring
  - Action: create_ticket only
```

---

## 5. Strengths

### Architecture
- **Idempotent capture via source_ref**: UPSERT pattern prevents duplicates even on retry. Clean and battle-tested.
- **Async-everything embedding**: Never blocks request path. Capture returns instantly, embedding worker handles the rest. Search falls back to ILIKE when embedding isn't ready.
- **Hybrid RAG scoring**: 70% cosine similarity + 30% recency decay (exp(-ageDays/7)) prevents stale memory dominance. Thoughtful design.
- **captureMessage() single door**: All data enters memories through one function that never throws. Failures are logged and swallowed. User experience never degrades from infrastructure issues.
- **Brand-scoped from day one**: brand_id on every table, every query. Multi-tenant ready at the data layer even though single-tenant today.
- **Actions proxy pattern**: OpenBrain holds the ikawn OS API key so OpenClaw doesn't need it directly. Clean separation of concerns.
- **Knowledge base injection**: soul.md/memory.md/tools.md loaded once at startup into global. Zero per-request disk I/O.

### Operations
- **Source_ref dedup on connectors**: GitHub and Calendar syncs are idempotent. Safe to run repeatedly.
- **Moderation pipeline**: Async scoring with abuse flag escalation. Mothership worker respects moderation gates before promoting signals.
- **GDPR-ready**: Soft delete pattern, retention cron, dedicated erasure endpoint, mothership anonymization.

### Integration
- **Three entry points to the same memory**: Telegram (via OpenClaw bridge), Web UI (via chat-api.js), Claude Desktop (via MCP). All write to the same memories table. All searchable from any channel.
- **MCP server is production-quality**: 8 tools with proper input schemas, trigger_sync for on-demand connector runs, ask_ruhi for inline RAG chat.

---

## 6. Weaknesses

### Critical

| Issue | Impact | Details |
|-------|--------|---------|
| **OpenClaw capture is LLM-dependent** | Memory gaps | GPT-5.2 decides whether to follow SOUL.md/SKILL.md instructions. Not deterministic. Earlier testing showed it ignoring captures entirely until instructions were moved to SOUL.md. Still fragile. |
| **No webhook from ikawn OS to OpenBrain** | Polling waste | External API sets webhookUrl: undefined. OpenClaw must poll /api/actions/status/:id repeatedly. No push notification on completion. |
| **API keys hardcoded in SKILL.md** | Security risk | Both ob_ and ik_ keys are plaintext in SKILL.md on the VPS. If VPS is compromised, full memory + generation access. Should be Docker env vars. |
| **Lazarus hardcoded 5s duration** | Incorrect billing | External API charges 5s * per-second rate regardless of actual video length. No way to specify duration via external API. |
| **No tests anywhere** | Regression risk | Zero tests across all three systems for the orchestration layer. OpenBrain has no test suite. OpenClaw skills are untestable (pure prompt). ikawn OS external API has no dedicated integration tests. |

### Significant

| Issue | Impact | Details |
|-------|--------|---------|
| **Failed embeddings never retry** | Data holes | embedding_status = 'failed' stays failed permanently. No retry mechanism. Those memories are never vector-searchable, only ILIKE fallback. |
| **Moderation worker is sequential** | Slow | Processes items one-by-one (one API call per loop iteration) vs embedding worker's batch approach. At scale, moderation falls behind. |
| **Custom cosine_similarity** | Scale ceiling | PL/pgSQL full table scan. Fine for <10K entries. At 50K+, search becomes slow. No pgvector on Fly Postgres. |
| **Single API key for all of OpenClaw** | No audit trail | One ik_ key charges one user's credits. No per-service accounting. Can't distinguish OpenClaw generations from direct API use. |
| **captureMessage() rule violated** | Data inconsistency | ruhi-chat.js (line 131-141) does direct pool.query INSERT into memories. MCP server's capture_thought and log_decision also bypass captureMessage(). |
| **user.md loaded but unused** | Wasted knowledge | Loaded into global.ruhiKnowledge.user at startup but never injected into any system prompt in chat-api.js or ruhi-chat.js. |
| **No token budget management** | Potential failures | Chat loads last 50 messages + RAG + knowledge docs. No token counting. Long conversations could exceed context window. |
| **ruhi-chat.js crash risk** | Potential error | Line 134 references obUser.name.toLowerCase() — if admin without ob_users entry, obUser is undefined, crashes. |
| **In-memory password reset codes** | Lost on restart | Reset codes stored in process memory. Lost on Fly restart. Not shared across machines. |

### Architectural Gaps

| Gap | Details |
|-----|---------|
| **Ruhi Layer 1 (ikawn OS) is completely disconnected from OpenBrain** | Has its own memory in ikawn OS Postgres. Does NOT use OpenBrain for RAG. The three /api/ruhi/openbrain/* endpoints are admin read-only proxies, not used by Ruhi's responses. Two separate memory systems. |
| **No row-level security on memories** | access_level column exists but never enforced in search/recent queries. Any API key holder sees all memories. ob_users.access_levels array exists but unchecked. |
| **No /api/actions/* in ikawn OS** | If OpenBrain's /api/actions/complete webhook tries to notify ikawn OS, there's no receiver. The complete endpoint exists on OpenBrain's side (for ikawn OS to call), but ikawn OS never calls it. |
| **No error tracking/alerting on OpenBrain** | Console.log only. No equivalent of ikawn-v3's error_logs table. Failures are silent. Must manually check fly logs. |
| **No backup/DR tested** | Fly Postgres has snapshots but no tested restore. No memory export. No R2 backup. |

---

## 7. Gaps & Blind Spots

### Things That Could Break Silently

1. **OpenClaw stops capturing**: If GPT-5.2 model update changes behavior, captures could silently stop. No monitoring to detect this. The only evidence would be a gap in memories table timestamps.

2. **Embedding worker fails**: If OpenAI embedding API has an outage, all captures pile up as 'pending'. Worker marks them 'failed' with no retry. Search degrades to ILIKE only. No alert.

3. **GitHub/Calendar sync stalls**: setInterval-based, no retry on failure, no dead-letter queue. A single error could silently stop all future syncs until restart.

4. **Memory quality decay**: No deduplication of semantically similar content. Near-duplicate memories pollute search results over time. No archival strategy active (column exists, no automation beyond retention cron).

5. **Actions proxy has no timeout**: If ikawn OS is slow/down, the proxy hangs. No circuit breaker, no fallback response to OpenClaw.

### Things Not Yet Thought Through

1. **Multi-channel Ruhi consistency**: Ruhi on Telegram (via OpenClaw, GPT-5.2) and Ruhi on web (via chat-api.js, GPT-4o) are two different LLMs with different personas. They share memory but not personality. A user could get contradictory responses across channels.

2. **OpenClaw skill versioning**: Skills are files on disk. No version control on the VPS. SKILL.md changes are immediate but not tracked. The local backup at /Users/vineet/ikawn-openclaw may be stale vs what's on the VPS.

3. **Credit drain via Telegram**: /generate command charges ik_f3f080eab9... user's credits. No budget cap, no notification when credits are low. Could drain to zero without warning.

4. **Completion notification to user**: When /generate finishes, how does the user know? OpenClaw must poll, detect completion, and send the result URL back to Telegram. If OpenClaw's polling loop fails or times out, the user never gets their image.

5. **OpenBrain's /api/actions/complete webhook**: The endpoint exists on OpenBrain to receive completion callbacks from ikawn OS, including storing results and capturing to memory. But ikawn OS's external API never calls it (webhookUrl: undefined). This entire code path is dead.

6. **Muse not exposed externally**: The external API whitelist is genie|remix|prism|lazarus. Muse templates are not accessible via OpenClaw/Telegram.

7. **No generation result storage in OpenBrain**: When a generation completes, the result URLs live only on ikawn OS. OpenBrain's generations table tracks metadata but doesn't receive completion data (because the webhook path is dead). Memory search can't find "show me that sunset image I generated yesterday."

---

## 8. What Needs To Be Done

### Priority 1: Fix What's Broken/Risky

- [ ] **Move API keys from SKILL.md to Docker env vars** on VPS. Update openbrain-bridge to read from env instead of hardcoded values.
- [ ] **Enable completion webhook**: Have ikawn OS call POST /api/actions/complete on OpenBrain when external API generations finish. Wire up webhookUrl in generate.post.ts for external API callers.
- [ ] **Add embedding retry**: Worker should re-process 'failed' items (max 3 attempts with backoff). Add retry_count column to memories.
- [ ] **Fix captureMessage() violations**: Update ruhi-chat.js and MCP server to use captureMessage() instead of direct pool.query INSERTs.
- [ ] **Fix ruhi-chat.js crash**: Guard against undefined obUser before accessing .name.
- [ ] **Add OpenClaw capture monitoring**: Simple heartbeat check — if no telegram captures in last 30 minutes, send alert via /api/notify/telegram.

### Priority 2: Close Architecture Gaps

- [ ] **Connect Ruhi Layer 1 to OpenBrain**: Have ikawn OS's /api/ruhi/chat call OpenBrain /search for RAG context before responding. This unifies memory across all channels.
- [ ] **Fix Lazarus duration in external API**: Accept duration parameter, default to 5s, calculate cost dynamically.
- [ ] **Expose Muse via external API**: Add 'muse' to the agent whitelist with template parameter support.
- [ ] **Add error tracking to OpenBrain**: Port ikawn-v3's error_logs pattern (fingerprinting + email alerts).
- [ ] **Add token budget management**: Count tokens before LLM call, truncate oldest messages if needed. Preserve system prompt + RAG + last 5 messages.
- [ ] **Inject user.md into chat prompts**: It's loaded but unused. Either inject it or remove the dead code.

### Priority 3: Harden for Growth

- [ ] **Add integration tests**: Capture -> search roundtrip, actions proxy -> mock ikawn OS, auth flows.
- [ ] **Batch moderation worker**: Process 20 items per API call instead of sequential loop.
- [ ] **OpenClaw skill version control**: Git repo on VPS, or sync mechanism from local backup.
- [ ] **Credit monitoring**: OpenBrain checks credit balance before proxying /generate, warns if low.
- [ ] **Circuit breaker on actions proxy**: Timeout + fallback if ikawn OS is unreachable.
- [ ] **Redis layer**: Session store (survives restarts), rate limit backing store, embedding cache.
- [ ] **pgvector migration**: When Fly supports it or if moving to Supabase/Neon. 100x faster at scale.

---

## 9. File Reference

### OpenClaw (VPS + local backup)
| File | Purpose |
|------|---------|
| `/Users/vineet/ikawn-openclaw/skills/openbrain-bridge/SKILL.md` | Bridge integration — all API calls, commands, capture pattern |
| `/Users/vineet/ikawn-openclaw/skills/web-browse/scripts/browse.js` | Headless Playwright browser |
| `/Users/vineet/ikawn-openclaw/tasks/handoff.md` | Session history, E2E test results, VPS access |
| `/Users/vineet/ikawn-openclaw/tasks/todo.md` | Wave status, known bugs, architecture notes |
| `/Users/vineet/ikawn-openclaw/openclaw_ruhi_os.md` | Original 6-component integration spec |

### OpenBrain (Fly.io)
| File | Purpose |
|------|---------|
| `src/index.js` | Entry point, route order (memory routes BEFORE chatApi), knowledge base loading, worker startup |
| `src/db.js` | Full schema (CREATE IF NOT EXISTS), pool, auto-init |
| `src/auth.js` | requireAuth + requireAdmin + requireAuthOrApiKey middleware |
| `src/routes/actions.js` | Actions proxy: /trigger, /status/:id, /complete |
| `src/routes/capture.js` | POST /capture — external memory ingestion |
| `src/utils/capture.js` | captureMessage() + captureEditDelta() — "only door" for memories |
| `src/routes/search.js` | GET /search — vector + ILIKE fallback |
| `src/routes/chat-api.js` | Web chat: RAG, SSE streaming, tool calling, knowledge injection |
| `src/routes/ruhi-chat.js` | /chat endpoint for OpenClaw bridge (secondary model, no tools) |
| `src/workers/embedding-worker.js` | Async batch embedding (5s interval) |
| `src/workers/moderation-worker.js` | Content moderation (30s interval) |
| `src/workers/mothership-worker.js` | Nightly anonymised signal promotion |
| `src/mcp/server.js` | MCP stdio server (8 tools) |
| `src/connectors/github.js` | GitHub REST API sync |
| `src/connectors/gcal.js` | Google Calendar sync |
| `docs/soul.md` | Ruhi identity (injected into every web chat) |

### ikawn OS (os.ikawn.com)
| File | Purpose |
|------|---------|
| `packages/app/server/api/external/generate.post.ts` | External generate endpoint — auth, safety, pricing, credit deduction, Fal submit |
| `packages/app/server/api/external/generations/[id].get.ts` | Generation polling endpoint |
| `packages/app/server/utils/apikey.ts` | validateApiKey() — Bearer token auth |
| `packages/app/server/utils/openbrain.ts` | openbrainFetch<T>() — HTTP client to OpenBrain |
| `packages/app/server/api/ruhi/openbrain/brain-health.get.ts` | Admin proxy to OpenBrain /brain-health |
| `packages/app/server/api/ruhi/openbrain/generations.get.ts` | Admin proxy to OpenBrain /generations |
| `packages/app/server/api/ruhi/openbrain/memories.get.ts` | Admin proxy to OpenBrain /search or /recent |
| `packages/app/server/api/ruhi/chat.post.ts` | Ruhi Layer 1 chatbot (self-contained, Gemini Flash) |
| `packages/app/server/utils/ruhi-prompt.ts` | Ruhi system prompt builder |
| `packages/app/server/utils/ruhi-actions.ts` | Action handler (create_ticket only) |
| `packages/app/server/api/webhooks/fal.post.ts` | Fal completion webhook (internal, not exposed to external API) |
| `packages/app/server/utils/fal-poller.ts` | Polling fallback + all completion logic |
| `packages/app/server/utils/sse-store.ts` | In-process + Redis pub/sub SSE delivery |

---

## 10. Database Schema Summary

### OpenBrain (Fly Postgres)

**Core tables**: memories (vector search, 1536-dim), conversations, messages, users, settings, ob_decisions, ob_ingestion_log, ob_users, ob_groups, ob_conversations

**v3 tables**: brands, brand_users, brand_context, brand_ratings, edit_deltas, generations, mothership_log

**Custom function**: cosine_similarity(float8[], float8[]) — manual dot product / norms (no pgvector)

**Key indexes**: source_ref (unique), brand_id, created_at DESC, embedding_status WHERE pending, archived WHERE false

### ikawn OS (Fly Postgres)

**Relevant tables**: users (api_key column), generations, model_pricing, ruhi_conversations, ruhi_messages, ruhi_user_memory, support_tickets

---

## 11. Strategic Assessment

### What's Working Well
The tri-system architecture is operational end-to-end. A Telegram message flows through OpenClaw -> OpenBrain -> ikawn OS and back. Memory accumulates from three channels (Telegram, web chat, Claude Desktop). RAG search works across all channels. The async embedding pattern is elegant. The source_ref idempotency is rock-solid.

### The Biggest Gap
**Ruhi Layer 1 on ikawn OS is a completely separate brain.** It has its own memory, its own LLM (Gemini Flash vs GPT-4o), and zero connection to OpenBrain. A customer talking to Ruhi at os.ikawn.com/ruhi exists in a different universe from Telegram Ruhi. This is the single biggest architectural inconsistency — the vision is one nervous system, but there are currently two.

### The Biggest Risk
**OpenClaw capture reliability is non-deterministic.** The entire memory pipeline depends on an LLM (GPT-5.2) choosing to follow SKILL.md instructions. Model updates, prompt drift, or edge cases can silently break memory capture. There is no monitoring to detect when this happens. The only evidence is a gap in the memories table.

### The North Star
All three systems serve different functions but share one brain (OpenBrain). Every interaction across every channel is captured, embedded, and searchable. Ruhi speaks with one voice regardless of channel. Agents learn from user signals via edit deltas. The mothership aggregates anonymised patterns across brands. The system gets smarter with every interaction.

**Current state: ~70% of this vision is operational. The remaining 30% is the Ruhi unification, completion webhooks, monitoring, and reliability hardening.**
