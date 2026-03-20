# Multi-Tenant Data Isolation — Implementation Status

## Phase P0 — Stop the Bleeding ✅ COMPLETE

- [x] P0.1: Mount `requireBrand` middleware globally in `index.js`
- [x] P0.2: Enhance `requireBrand` with resolution order + fallback warning
- [x] P0.3: Enforce brand_id in all read endpoints (search, recent, decisions, generations, edit-deltas, stats, governance, recall)
- [x] P0.4: Enforce brand_id in RAG searches (chat-api.js, ruhi-chat.js, webhooks.js)
- [x] P0.5: Enforce brand_id in agent mention lookup (chat-api.js)
- [x] P0.6: Enforce brand_id in write endpoints (decisions POST, capture, edit-deltas)

## Phase P1 — Structural Fixes ✅ COMPLETE

- [x] P1.1: Add `brand_id` column to `task_runs` + propagate in scheduler
- [x] P1.2: Scope Mission Control — all 8 hardcoded 'ikawn' replaced with `req.brand_id`
- [x] P1.3: Scope `captureMessage()` callers (chat-api.js, ruhi-chat.js, webhooks.js)
- [x] P1.4: Scope tool execution context (chat-api.js, ruhi-chat.js, webhooks.js)
- [x] P1.5: Scope webhook approval with brand_id JOIN
- [x] P1.6: MCP server — configurable brand via `MCP_BRAND_ID` env var
- [x] BONUS: Scoped actions.js (generation recording + captureMessage)
- [x] BONUS: Scoped all MCP queries (search, recent, stats, decisions, ask_ruhi RAG)

## Phase P2 — Scale Prep (FUTURE — after first external brand onboards)

- [ ] P2.1: R2 storage brand namespacing
- [ ] P2.2: Per-brand persona
- [ ] P2.3: Per-brand knowledge base
- [ ] P2.4: API key → brand mapping
- [ ] P2.5: Conversation-level brand scoping
- [ ] P2.6: Brand admin isolation

## Files Modified (18 files)

### P0
1. `src/auth.js` — enhanced `requireBrand` with resolution order + warning
2. `src/index.js` — mounted `requireBrand` globally
3. `src/routes/search.js` — mandatory brand filter
4. `src/routes/recent.js` — mandatory brand filter
5. `src/routes/decisions.js` — brand filter on GET + POST
6. `src/routes/generations.js` — brand filter on list + get
7. `src/routes/edit-deltas.js` — brand filter on GET + POST
8. `src/routes/stats.js` — mandatory brand filter
9. `src/routes/governance.js` — brand filter on 3 endpoints
10. `src/routes/recall.js` — use req.brand_id

### P0 (RAG critical)
11. `src/routes/chat-api.js` — RAG brand filter + agent mention + tool context + captureMessage
12. `src/routes/ruhi-chat.js` — RAG brand filter + tool context + captureMessage
13. `src/routes/webhooks.js` — RAG brand filter + captureMessage + tool context + approval

### P1
14. `src/db.js` — task_runs brand_id column + index + backfill
15. `src/scheduler.js` — propagate brand_id to task_runs
16. `src/routes/mission-control.js` — 8 hardcoded 'ikawn' → req.brand_id
17. `src/routes/actions.js` — generation recording + captureMessage
18. `src/mcp/server.js` — configurable MCP_BRAND_ID + all queries scoped

## Verification Checklist

- [ ] Deploy to production
- [ ] Verify web chat RAG returns relevant memories
- [ ] Verify Telegram bot responds correctly
- [ ] Verify Mission Control shows tasks/agents
- [ ] Check logs for `[BrandFallback]` warnings
- [ ] Test `/search?q=test` only returns brand-scoped results
- [ ] Test `/decisions` only returns brand-scoped decisions
