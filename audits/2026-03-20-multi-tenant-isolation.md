# Multi-Tenant Data Isolation Audit — OpenBrain

**Date:** 2026-03-20
**Scope:** Read-only, all layers
**Status:** NOT SAFE for multi-brand
**Auditor:** Claude (automated static analysis)

---

## Architecture Context

### ruhi.ikawn.in and os.ikawn.com/ruhi are DIFFERENT deployments.

| | ruhi.ikawn.in (OpenBrain) | os.ikawn.com/ruhi (Ruhi OS) |
|---|---|---|
| **Fly app** | `ikawn-openbrain` | `ikawn-os` |
| **Codebase** | `/Users/vineet/ikawn-openbrain` (Express) | `/Users/vineet/ikawn-v3` (Nuxt 3) |
| **Database** | `ikawn-openbrain-db` | `ikawn-os-db` |
| **LLM** | Claude Sonnet 4.6 (Anthropic SDK) | Google Gemini |
| **Tools** | 10 MCP tools (manage_task, gmail, calendar, etc.) | Local agents (Genie, Remix, Prism, Lazarus) |

### Request Paths

**os.ikawn.com/ruhi (Ruhi OS):**
User → `api/ruhi/chat.post.ts` → Gemini LLM → local tool execution → pushes conversation to OpenBrain `/capture` (fire-and-forget). RAG context fetched from OpenBrain `/search`.

**ruhi.ikawn.in (OpenBrain):**
User → `src/routes/ruhi-chat.js` → Claude Sonnet 4.6 → local MCP tools → local vector search on OpenBrain DB. No dependency on ikawn-v3.

---

## Audit Results

| # | Layer | Scoped by brand_id? | Where enforced? | Leakage Risk |
|---|-------|---------------------|-----------------|--------------|
| 1 | **Memory/RAG — search** | Optional param | `search.js:46-50` — only filters if `?brand_id=` provided | CRITICAL — omitting param returns ALL brands' memories |
| 2 | **Memory/RAG — Ruhi chat RAG** | No | `ruhi-chat.js:11-36` — `searchMemory()` has zero brand filter | CRITICAL — Ruhi pulls RAG context from all brands |
| 3 | **Memory/RAG — recall API** | Defaults to 'ikawn' | `recall.js:28` — but caller can pass any `?brand_id=` | HIGH — no auth check on brand ownership |
| 4 | **Memory/RAG — recent** | Optional param | `recent.js:15-18` — only filters if `?brand_id=` provided | CRITICAL — returns all brands' memories |
| 5 | **Memory/RAG — embedding worker** | No | `embedding-worker.js:11-17` — processes all brands in one batch | LOW — stateless per-row, no cross-contamination |
| 6 | **Memory/RAG — distillation worker** | Yes | `distillation-worker.js:73-79` — groups by `brand_id::user_id` | LOW |
| 7 | **Memory/RAG — moderation worker** | No | `moderation-worker.js:40-46` — no brand filter at all | MEDIUM — scores cross-brand, flags may misattribute |
| 8 | **Conversations — CRUD** | Yes (user_id) | `chat-api.js:113-197` — all queries filter by `user_id` | LOW — user-level isolation is tight |
| 9 | **Conversations — context loading** | No brand filter | `ruhi-chat.js:40-44` — loads conversation by ID only | MEDIUM — relies on user_id not brand_id |
| 10 | **OAuth tokens — storage/retrieval** | Yes | `google-auth.js:23-51` — `WHERE brand_id = $1 AND provider = $2` | LOW |
| 11 | **Task management — scheduler** | Yes | `scheduler.js:99-106` — fetches tasks with brand_id filter | LOW |
| 12 | **Task management — Mission Control** | Hardcoded 'ikawn' | `mission-control.js:51,91,128,144,166,184,199` — all queries use `'ikawn'` literal | MEDIUM — won't scale, but no cross-brand leak today |
| 13 | **Task management — webhook approval** | No | `webhooks.js:546-551` — queries `task_runs` by ID only, no brand join | CRITICAL — can approve/reject any brand's tasks by ID |
| 14 | **Task management — task_runs table** | Missing column | No `brand_id` column on `task_runs` — must JOIN to `scheduled_tasks` | HIGH — structural gap |
| 15 | **Tool execution — 8/10 tools** | Yes | Tools receive `context.brandId`, use in queries | LOW |
| 16 | **Tool execution — analyze_brand** | No | `brand-analysis.tool.js:19-47` — no brand param, results unscoped | HIGH |
| 17 | **Tool execution — ikawn_generate** | No | `ikawn-os.tool.js:13-38` — no brand_id passed to external API | HIGH |
| 18 | **Tool context creation** | Defaults to 'ikawn' | `chat-api.js:555`, `ruhi-chat.js:109` — `brandId: req.session?.brand_id \|\| 'ikawn'` | MEDIUM — no dynamic resolution |
| 19 | **Persona/system prompt** | Global | `persona.js:3-84` — static constant, no brand injection | MEDIUM — identical Ruhi for all brands |
| 20 | **Knowledge base** | Global | `index.js:48-60` — `global.ruhiKnowledge` single Map for all brands | MEDIUM |
| 21 | **File storage (R2)** | No | `storage.js:4` — prefix `openbrain/`, no brand segment in keys | HIGH — files indistinguishable across brands |
| 22 | **In-process: notifyCounts** | No | `notify.tool.js:7` — keyed by conversationId, not brand | MEDIUM — unbounded Map, no brand prefix |
| 23 | **In-process: conversationBuffers** | No | `telegram.js:11` — keyed by chatId only | MEDIUM — same chatId across brands would share buffer |
| 24 | **In-process: alert throttle** | Global | `intelligence-worker.js:36-38` — module-level vars | LOW — acceptable for single-brand |
| 25 | **Agent mention lookup** | No | `chat-api.js:361` — `WHERE LOWER(slug) = $1` with no brand filter | CRITICAL — loads wrong brand's agent persona |
| 26 | **Decisions endpoint** | No | `decisions.js:49-76` — GET has zero brand filter; POST hardcodes 'ikawn' | CRITICAL |

---

## Root Cause

`requireBrand()` middleware exists in `auth.js:79-83` but is **never mounted in `index.js`**. Brand context never enters the request lifecycle. Routes either ignore brand_id entirely or treat it as an optional query parameter.

---

## Summary by Severity

| Severity | Count | Layers |
|----------|-------|--------|
| **CRITICAL** (data leaks today) | 6 | Search, Ruhi RAG, Recent, Decisions, Webhook approval, Agent mentions |
| **HIGH** (structural gaps) | 5 | Recall auth, task_runs schema, R2 paths, analyze_brand tool, ikawn_generate tool |
| **MEDIUM** (won't scale) | 8 | Mission Control hardcoded, persona global, knowledge base global, context defaults, moderation, notify state, telegram buffers, conversation context |
| **LOW** (acceptable) | 7 | Conversations CRUD, OAuth, scheduler, embedding worker, distillation, 8/10 tools, alert throttle |

---

## Critical Attack Scenarios

### 1. Cross-brand memory leakage via search
```
GET /search?q=revenue
--> Returns memories from ALL brands (no brand_id filter)
```

### 2. Enumerate all decision logs
```
GET /decisions
--> Returns ALL decisions across ALL brands (no brand filter at all)
```

### 3. Cross-brand RAG context in Ruhi chat
```
POST /ruhi/chat with message "What's our Q2 strategy?"
--> searchMemory() pulls context from ALL brands' memories
--> May leak Brand B's strategy into Brand A's conversation
```

### 4. Approve another brand's tasks via webhook
```
Telegram callback: approve:42
--> webhooks.js queries task_runs by ID only (no brand join)
--> Can approve/reject any brand's scheduled task runs
```

### 5. Load wrong brand's agent persona
```
User types: @sales in chat
--> chat-api.js:361 queries domain_agents WHERE slug = 'sales' with no brand filter
--> May load Brand A's sales agent persona for Brand B's user
```

---

## Remediation Priority

### P0 — Must fix before any second brand goes live

1. **Mount `requireBrand()` middleware** in `index.js` before all routes
2. **Enforce brand_id in search.js** — make it required, not optional
3. **Add brand_id filter to `searchMemory()`** in `ruhi-chat.js`
4. **Add brand_id filter to recent.js** — make it required
5. **Add brand_id filter to decisions.js** GET endpoint
6. **Add brand join to webhook approval** in `webhooks.js:546-551`
7. **Add brand_id filter to agent mention lookup** in `chat-api.js:361`

### P1 — High-risk structural gaps

8. Add `brand_id` column to `task_runs` table
9. Fix `analyze_brand` and `ikawn_generate` tools to accept/use brandId
10. Add brand_id prefix to R2 file keys (`openbrain/{brand_id}/...`)
11. Add auth check on recall API — validate caller owns the requested brand_id

### P2 — Scale preparation

12. Replace hardcoded `'ikawn'` in mission-control.js with dynamic `req.brand_id`
13. Support per-brand persona/system prompt injection
14. Support per-brand knowledge base loading
15. Scope `notifyCounts` and `conversationBuffers` Maps by brand
16. Replace tool context default from hardcoded `'ikawn'` to `req.brand_id`

---

## Verdict

**Do NOT onboard a second brand until the 7 P0 items are resolved.** The schema supports multi-tenancy but the query layer does not enforce it. Any brand added today would have its memories, decisions, and agent personas visible to all other brands.

**Estimated remediation:** P0 items are mechanical (add WHERE clauses + mount middleware). P1/P2 require schema changes and architectural decisions.
