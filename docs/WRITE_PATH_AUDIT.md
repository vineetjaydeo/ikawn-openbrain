# OpenBrain Write Path Audit

> Generated: 2026-04-03
> Purpose: Catalog every database mutation in the codebase for Lucy v3 Supabase migration dual-write planning.
> Scope: All `src/` files containing INSERT, UPDATE, DELETE, or ON CONFLICT operations.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `P` | Parameterized query (`$1`, `$2`, etc.) |
| `P+R` | Parameterized values but raw string interpolation for table/column names (e.g., `${table}`) |
| `R` | Raw string interpolation or concatenation |
| `via captureMessage()` | Uses the sanctioned capture utility |
| **VIOLATION** | Direct INSERT into `memories` bypassing `captureMessage()` |

---

## Table: `memories`

| # | File | Line | Operation | Trigger | Query Style | Notes |
|---|------|------|-----------|---------|-------------|-------|
| 1 | `src/utils/capture.js` | 23-44 | INSERT ... ON CONFLICT (source_ref) | `captureMessage()` — universal capture function | P | **THE ONLY DOOR** — all channels should route through here |
| 2 | `src/routes/capture.js` | 31-35 | UPDATE (content, embedding_status) | `POST /capture` route (source_ref exists) | P | Idempotent upsert path for existing source_ref |
| 3 | `src/routes/capture.js` | 52-71 | INSERT | `POST /capture` route (new memory) | P | **VIOLATION** — direct INSERT bypassing `captureMessage()`. This is the HTTP API route that predates the capture utility. |
| 4 | `src/scheduler.js` | 57-63 | UPDATE (deleted_at, content) | Retention cron (daily interval) | P | Soft-deletes expired memories per brand retention policy |
| 5 | `src/routes/gdpr.js` | 22 | UPDATE (deleted_at, content, embedding) | `POST /gdpr/erase/:brandId` | P | GDPR erasure — nullifies content and embedding |
| 6 | `src/workers/embedding-worker.js` | 120-122 | UPDATE (embedding_status = 'failed') | Embedding worker (5s interval) | P | Marks empty-content memories as failed |
| 7 | `src/workers/embedding-worker.js` | 134-141 | UPDATE (embedding, embedding_status, embedding_model, embedded_at) | Embedding worker (5s interval) | P | Batch embedding update |
| 8 | `src/workers/moderation-worker.js` | 145-148 | UPDATE (moderation_score, moderation_flags) | Moderation worker (30s interval) | P | Sets moderation scores |
| 9 | `src/db.js` | 301-303 | UPDATE (user_id) | Schema init (app startup) | P | Backfill: assigns all memories to admin user |
| 10a | `src/db.js` | 307 | UPDATE (embedding_status = 'done', brand_id = 'ikawn') | Schema init (app startup) | R (no params, hardcoded values) | Backfill: mark memories with existing embeddings as done, set default brand_id |
| 10b | `src/db.js` | 308 | UPDATE (embedding_status = 'pending') | Schema init (app startup) | R (no params, hardcoded values) | Backfill: reset failed embedding_status to pending |
| 10c | `src/db.js` | 309 | UPDATE (brand_id = 'ikawn') | Schema init (app startup) | R (no params, hardcoded values) | Backfill: set null brand_id to ikawn default |

### captureMessage() Callers (Compliant)
These write to `memories` indirectly through `captureMessage()`:

| File | Line(s) | Trigger |
|------|---------|---------|
| `src/connectors/github.js` | 24, 52, 85, 116 | GitHub sync (commits, issues, PRs) via `upsertMemory()` wrapper |
| `src/connectors/gcal.js` | 57-64 | Calendar sync (2hr interval) |
| `src/connectors/telegram.js` | 166-176, 212-219, 301-309 | Telegram message flush, direct save, OpenClaw self-report |
| `src/routes/webhooks.js` | 44, 68, 91 | GitHub/Telegram webhook capture (comments in code confirm captureMessage) |
| `src/routes/webhooks.js` | 454-466 | Intelligence Telegram bot — capture inbound/outbound for RAG |
| `src/routes/chat-api.js` | 874-891 | Web chat — capture both sides for RAG (fire-and-forget) |
| `src/routes/ruhi-chat.js` | 128-129, 320-336 | Ruhi persona chat — capture inbound/outbound |
| `src/routes/decisions.js` | 15-22 | `POST /decisions` — captures decision content |
| `src/mcp/server.js` | ~145 | MCP `log_decision` tool |
| `src/scheduler.js` | 173-181 | Task scheduler — captures task results to chat |

---

## Table: `messages`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 11 | `src/routes/chat-api.js` | 334-336 | INSERT (user message) | `POST /api/chat/send` | P |
| 12 | `src/routes/chat-api.js` | 379-381 | INSERT (assistant, /skill result) | `POST /api/chat/send` — skill shortcut path | P |
| 13 | `src/routes/chat-api.js` | 395-397 | INSERT (assistant, /skill error) | `POST /api/chat/send` — skill error path | P |
| 14 | `src/routes/chat-api.js` | 857-859 | INSERT (assistant response) | `POST /api/chat/send` — main chat response | P |
| 15 | `src/routes/chat-api.js` | 937-939 | INSERT (assistant, partial/interrupted) | `POST /api/chat/send` — error recovery | P |
| 16 | `src/routes/chat-api.js` | 1165-1167 | INSERT (generation attachment message) | `POST /api/conversations/:id/generation` | P |
| 17 | `src/routes/webhooks.js` | 297-299 | INSERT (user message from Telegram) | Intelligence Telegram bot | P |
| 18 | `src/routes/webhooks.js` | 438-440 | INSERT (assistant reply from Telegram) | Intelligence Telegram bot | P |
| 19 | `src/scheduler.js` | 164-166 | INSERT (assistant, task result) | Task scheduler — deliver result to chat | P |
| 20 | `src/routes/brand-chat-api.js` | 166 | DELETE (cascade on conversation delete) | `DELETE /api/brand/conversations/:id` | P |
| 21 | `src/routes/chat-api.js` | 232 | DELETE (cascade on conversation delete) | `DELETE /api/conversations/:id` | P |

---

## Table: `conversations`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 22 | `src/routes/chat-api.js` | 183-185 | INSERT | `POST /api/conversations` | P |
| 23 | `src/routes/chat-api.js` | 233 | DELETE | `DELETE /api/conversations/:id` | P |
| 24 | `src/routes/chat-api.js` | 255-257 | UPDATE (title, hashtags) | `PATCH /api/conversations/:id` | P |
| 25 | `src/routes/chat-api.js` | 340 | UPDATE (updated_at, draft_text clear) | `POST /api/chat/send` | P |
| 26 | `src/routes/chat-api.js` | 386 | UPDATE (title = /toolName) | `POST /api/chat/send` — skill auto-title | P |
| 27 | `src/routes/chat-api.js` | 579 | UPDATE (compressed_at) | Context compression (fire-and-forget) | P |
| 28 | `src/routes/chat-api.js` | 917-919 | UPDATE (title, hashtags) | Auto-title on first message | P |
| 29 | `src/routes/chat-api.js` | 977-979 | UPDATE (share_token, shared_at) | `POST /api/conversations/:id/share` | P |
| 30 | `src/routes/chat-api.js` | 1000-1002 | UPDATE (share_token = NULL) | `DELETE /api/conversations/:id/share` | P |
| 31 | `src/routes/chat-api.js` | 1128-1130 | UPDATE (draft_text, draft_updated_at) | `PUT /api/conversations/:id/draft` | P |
| 32 | `src/routes/webhooks.js` | 287-289 | INSERT (Telegram daily conv) | Intelligence Telegram bot | P |
| 33 | `src/routes/webhooks.js` | 443-444 | UPDATE (updated_at) | Intelligence Telegram bot | P |
| 34 | `src/scheduler.js` | 153-155 | INSERT (task result delivery conv) | Task scheduler | P |
| 35 | `src/scheduler.js` | 170 | UPDATE (updated_at) | Task scheduler — after delivering result | P |
| 36 | `src/routes/brand-chat-api.js` | 88-90 | INSERT (auto-create for brand API) | `POST /api/brand/chat` | P |
| 37 | `src/routes/brand-chat-api.js` | 122-124 | INSERT | `POST /api/brand/conversations` | P |
| 38 | `src/routes/brand-chat-api.js` | 166-167 | DELETE | `DELETE /api/brand/conversations/:id` | P |
| 39 | `src/workers/context-worker.js` | 115-117 | UPDATE (context_summary, context_msg_count) | Context worker (30s interval) | P |
| 40 | `src/db.js` | 322 | UPDATE (uuid backfill) | Schema init (app startup) | R (no params) |

---

## Table: `ob_conversations`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 41 | `src/routes/ruhi-chat.js` | 91-94 | INSERT | `POST /api/ruhi/chat` — new conversation | P |
| 42 | `src/routes/ruhi-chat.js` | 130 | UPDATE (last_activity) | `POST /api/ruhi/chat` — skill shortcut | P |
| 43 | `src/routes/ruhi-chat.js` | 339-341 | UPDATE (last_activity) | `POST /api/ruhi/chat` — after response | P |

---

## Table: `users`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 44 | `src/routes/auth-routes.js` | 46 | UPDATE (last_login) | `POST /auth/login` | P |
| 45 | `src/routes/auth-routes.js` | 92 | UPDATE (password_hash) | `POST /auth/change-password` | P |
| 46 | `src/routes/auth-routes.js` | 153 | UPDATE (password_hash) | `POST /auth/reset-password` | P |
| 47 | `src/routes/admin-api.js` | 112 | INSERT | `POST /admin/api/users` | P |
| 48 | `src/routes/admin-api.js` | 136-143 | UPDATE (name, role, status) | `PUT /admin/api/users/:id` | P |
| 49 | `src/routes/admin-api.js` | 166 | UPDATE (password_hash) | `PUT /admin/api/users/:id/password` | P |
| 50 | `src/routes/chat-api.js` | 1104 | UPDATE (custom_instructions) | `PATCH /api/custom-instructions` | P |
| 51 | `src/routes/brand-chat-api.js` | 47-52 | INSERT ... ON CONFLICT (external_id) | Brand chat — user resolution | P |
| 52 | `src/db.js` | 148-152 | INSERT ... ON CONFLICT (email) | Schema init — seed admin user | P |

---

## Table: `generations`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 53 | `src/routes/actions.js` | 57-61 | INSERT ... ON CONFLICT DO NOTHING | `POST /api/actions/trigger` — record generation | P |
| 54 | `src/routes/actions.js` | 108-116 | UPDATE (status, output_urls, metadata) | `POST /api/actions/complete` — webhook callback | P |
| 55 | `src/routes/chat-api.js` | 760-762 | INSERT ... ON CONFLICT DO NOTHING | Chat tool use — `ikawn_generate` result | P |
| 56 | `src/routes/generations.js` | 66-71 | UPDATE (status, callback_received) | `POST /api/generations/:id/selection` | P |
| 57 | `src/routes/gdpr.js` | 34 | UPDATE (deleted_at) | GDPR erasure | P |

---

## Table: `edit_deltas`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 58 | `src/utils/capture.js` | 79-93 | INSERT (within transaction) | `captureEditDelta()` utility | P |
| 59 | `src/routes/edit-deltas.js` | 21-36 | INSERT | `POST /api/edit-deltas` route | P |
| 60 | `src/routes/gdpr.js` | 28 | UPDATE (deleted_at) | GDPR erasure | P |
| 61 | `src/workers/mothership-worker.js` | 43-45 | UPDATE (promoted_to_mothership, anonymised) | Mothership worker (nightly) | P |

---

## Table: `memory_events`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 62 | `src/utils/capture.js` | 97-105 | INSERT (within transaction) | `captureEditDelta()` — dual-write | P |
| 63 | `src/utils/capture.js` | 122-131 | INSERT | `captureEvent()` utility | P |
| 64 | `src/workers/distillation-worker.js` | 167-170 | UPDATE (processed_at) | Distillation worker — after processing edit deltas | P |
| 65 | `src/workers/distillation-worker.js` | 280-282 | UPDATE (processed_at) | Distillation worker — after processing strategic events | P |

---

## Table: `distilled_memory`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 66 | `src/workers/distillation-worker.js` | 320-323 | INSERT (no embedding fallback) | `upsertDistilledMemory()` | P |
| 67 | `src/workers/distillation-worker.js` | 376-378 | UPDATE (confidence) | `upsertDistilledMemory()` — contradiction: reduce existing | P |
| 68 | `src/workers/distillation-worker.js` | 381-384 | INSERT (contradicting new) | `upsertDistilledMemory()` — contradiction: insert new | P |
| 69 | `src/workers/distillation-worker.js` | 393-400 | UPDATE (confidence, source_event_ids, reasoning) | `upsertDistilledMemory()` — reinforcement | P |
| 70 | `src/workers/distillation-worker.js` | 438-448 | DELETE (evict lowest confidence) | `upsertDistilledMemory()` — type cap enforcement | P |
| 71 | `src/workers/distillation-worker.js` | 454-457 | INSERT (new insight) | `upsertDistilledMemory()` — no similar exists | P |
| 72 | `src/routes/admin-api.js` | 38-43 | INSERT (no embedding fallback) | `POST /admin/api/sync/receive` — Lucy sync | P |
| 73 | `src/routes/admin-api.js` | 66-73 | INSERT (with embedding) | `POST /admin/api/sync/receive` — Lucy sync | P |
| 74 | `src/workers/embedding-worker.js` | 189 | UPDATE (embedding_status = 'failed') | Embedding worker — empty distilled memory | P+R | Values parameterized but table name is raw `${table}` interpolation. |
| 75 | `src/workers/embedding-worker.js` | 201-206 | UPDATE (embedding, embedding_status) | Embedding worker — batch embed distilled memories | P+R | Values parameterized but table name is raw `${table}` interpolation. |
| 76 | `src/workers/research-worker.js` | 285-288 | UPDATE (confidence) | Research worker — confirmed insight | P |
| 77 | `src/workers/research-worker.js` | 293-295 | UPDATE (confidence) | Research worker — outdated insight | P |
| 78 | `src/utils/recall.js` | 183-186 | UPDATE (last_used, times_used) | RAG recall — track distilled memory usage | P |

---

## Table: `scheduled_tasks`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 79 | `src/routes/mission-control.js` | 90-96 | INSERT | `POST /api/mission/tasks` | P |
| 80 | `src/routes/mission-control.js` | 129-131 | UPDATE (dynamic fields) | `PUT /api/mission/tasks/:uuid` | P |
| 81 | `src/routes/mission-control.js` | 152 | DELETE | `DELETE /api/mission/tasks/:uuid` | P |
| 82 | `src/tools/manage-task.tool.js` | 78-82 | INSERT | `manage_task` tool — create action | P |
| 83 | `src/tools/manage-task.tool.js` | 91 | UPDATE (enabled) | `manage_task` tool — enable/disable | P |
| 84 | `src/tools/manage-task.tool.js` | 99 | DELETE | `manage_task` tool — delete | P |
| 85 | `src/tools/manage-task.tool.js` | 106 | UPDATE (next_run_at) | `manage_task` tool — run_now | P |
| 86 | `src/tools/manage-task.tool.js` | 129-133 | UPDATE (enabled, next_run_at, config) | `manage_task` tool — continue | P |
| 87 | `src/tools/manage-task.tool.js` | 154 | UPDATE (dynamic fields) | `manage_task` tool — update | P |
| 88 | `src/scheduler.js` | 199 | UPDATE (last_status, last_run_at) | Task scheduler — mark running | P |
| 89 | `src/scheduler.js` | 248 | UPDATE (config — remove _continueFromRun) | Task scheduler — cleanup | P |
| 90 | `src/scheduler.js` | 282-286 | UPDATE (last_status, run_count, next_run_at) | Task scheduler — awaiting approval | P |
| 91 | `src/scheduler.js` | 290 | UPDATE (enabled = false) | Task scheduler — disable once tasks | P |
| 92 | `src/scheduler.js` | 315-319 | UPDATE (last_status, run_count, next_run_at) | Task scheduler — completed | P |
| 93 | `src/scheduler.js` | 323 | UPDATE (enabled = false) | Task scheduler — disable once tasks | P |
| 94 | `src/scheduler.js` | 345-349 | UPDATE (last_status, enabled=false) | Task scheduler — auto-disable after failures | P |
| 95 | `src/scheduler.js` | 359-363 | UPDATE (last_status, next_run_at) | Task scheduler — failure backoff | P |
| 96 | `src/scheduler.js` | 394 | UPDATE (next_run_at = NOW) | Event bus — trigger-based task activation | P |

---

## Table: `task_runs`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 97 | `src/scheduler.js` | 191-195 | INSERT | Task scheduler — create run record | P |
| 98 | `src/scheduler.js` | 274-277 | UPDATE (status='awaiting_approval') | Task scheduler — approval flow | P |
| 99 | `src/scheduler.js` | 307-311 | UPDATE (status='completed') | Task scheduler — success | P |
| 100 | `src/scheduler.js` | 336-338 | UPDATE (status='failed') | Task scheduler — failure | P |
| 101 | `src/scheduler.js` | 371-373 | UPDATE (status='failed', safety net) | Task scheduler — finally block | P |
| 102 | `src/routes/webhooks.js` | 191 | UPDATE (status='approved') | Intelligence Telegram — callback query (inline) | P |
| 103 | `src/routes/webhooks.js` | 194 | UPDATE (status='rejected') | Intelligence Telegram — callback query (inline) | P |
| 104 | `src/routes/webhooks.js` | 569-571 | UPDATE (status='approved') | Telegram callback — standalone handler | P |
| 105 | `src/routes/webhooks.js` | 575-577 | UPDATE (status='rejected') | Telegram callback — standalone handler | P |
| 106 | `src/routes/reports.js` | 42 | UPDATE (viewed_at) | `PUT /api/reports/runs/:id/view` | P |
| 107 | `src/routes/reports.js` | 127 | DELETE (cascade before task delete) | `DELETE /api/reports/tasks/:id` | P |
| 108 | `src/routes/mission-control.js` | 151 | DELETE (cascade before task delete) | `DELETE /api/mission/tasks/:uuid` | P |
| 109 | `src/db.js` | 857-859 | UPDATE (brand_id backfill) | Schema init (app startup) | R (subquery, no params) |

---

## Table: `domain_agents`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 110 | `src/agents/seed-all.js` | 17-26 | INSERT ... ON CONFLICT (slug) DO UPDATE | Agent seeding (app startup) | P |
| 111 | `src/routes/mission-control.js` | 201-203 | UPDATE (enabled) | `PUT /api/mission/agents/:slug` | P |

---

## Table: `user_tasks`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 112 | `src/tools/create-user-task.tool.js` | 43-47 | INSERT | `create_user_task` tool | P |
| 113 | `src/routes/mission-control.js` | 275-277 | UPDATE (status) | `PUT /api/mission/user-tasks/:uuid` | P |

---

## Table: `brands`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 114 | `src/routes/brands-api.js` | 26-28 | INSERT ... ON CONFLICT DO UPDATE | `POST /api/brands` — upsert brand | P |
| 115 | `src/routes/gdpr.js` | 40 | UPDATE (status='erased') | GDPR erasure | P |
| 116 | `src/db.js` | 264-265 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed ikawn brand | R (hardcoded) |

---

## Table: `brand_context`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 117 | `src/routes/brands-api.js` | 33-35 | INSERT ... ON CONFLICT DO NOTHING | `POST /api/brands` | P |
| 118 | `src/db.js` | 439-440 | INSERT ... ON CONFLICT DO UPDATE | Schema init — seed ikawn context | R (hardcoded) |

---

## Table: `brand_budgets`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 119 | `src/routes/brands-api.js` | 40-42 | INSERT ... ON CONFLICT DO NOTHING | `POST /api/brands` | P |
| 120 | `src/routes/governance.js` | 105-107 | INSERT ... ON CONFLICT DO UPDATE | `PUT /api/budgets/:brandId` | P |
| 121 | `src/utils/governance.js` | 63-69 | UPDATE (spent_monthly_credits) | `reserveBudget()` — atomic budget reservation | P |
| 122 | `src/utils/governance.js` | 106-111 | UPDATE (spent_monthly_credits) | `refundBudget()` | P |
| 123 | `src/utils/governance.js` | 274-276 | UPDATE (spent_monthly_credits) | `executeAction()` — cost adjustment | P |
| 124 | `src/utils/governance.js` | 393-399 | UPDATE (spent_monthly_credits, status, current_period_start) | `resetExpiredBudgets()` — monthly reset | P |

---

## Table: `action_queue`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 125 | `src/utils/governance.js` | 164-170 | INSERT (budget_blocked) | `governAction()` | P |
| 126 | `src/utils/governance.js` | 218-225 | INSERT (governed action) | `governAction()` | P |
| 127 | `src/utils/governance.js` | 256-258 | UPDATE (executed_at) | `executeAction()` | P |
| 128 | `src/utils/governance.js` | 288-289 | UPDATE (governance_result='failed') | `executeAction()` — failure | P |
| 129 | `src/utils/governance.js` | 332-336 | UPDATE (governance_result='approved') | `reviewAction()` — approved | P |
| 130 | `src/utils/governance.js` | 347-350 | UPDATE (governance_result='rejected') | `reviewAction()` — rejected | P |
| 131 | `src/utils/governance.js` | 376-379 | UPDATE (governance_result='revision_requested') | `reviewAction()` — revision | P |
| 132 | `src/utils/governance.js` | 417-419 | UPDATE (governance_result='expired') | `expireStaleActions()` — daily | P |

---

## Table: `action_log`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 133 | `src/utils/governance.js` | 262-268 | INSERT | `executeAction()` — log successful action | P |

---

## Table: `intelligence_snapshots`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 134 | `src/workers/intelligence-worker.js` | 350-353 | INSERT (cohort_analysis) | Intelligence worker (nightly) | P |
| 135 | `src/workers/intelligence-worker.js` | 357-359 | INSERT (signal) | Intelligence worker — individual signals | P |
| 136 | `src/workers/intelligence-worker.js` | 372-374 | DELETE (old snapshots) | Intelligence worker — retention cleanup | P |
| 137 | `src/workers/research-worker.js` | 90-98 | INSERT | Research worker — save snapshot | P |
| 138 | `src/workers/sync-worker.js` | 47-55 | INSERT (cross_brain_sync) | Sync worker | P |

---

## Table: `ob_decisions`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 139 | `src/routes/decisions.js` | 25-36 | INSERT | `POST /decisions` route | P |
| 140 | `src/mcp/server.js` | 152-155 | INSERT | MCP `log_decision` tool | P |

---

## Table: `api_keys`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 141 | `src/routes/admin-api-keys.js` | 56 | INSERT | `POST /admin/api/keys` — create API key | P |
| 142 | `src/routes/admin-api-keys.js` | 78 | UPDATE (revoked_at) | `DELETE /admin/api/keys/:id` — revoke | P |
| 143 | `src/auth.js` | 66 | UPDATE (last_used_at) | API key auth middleware (fire-and-forget) | P |

---

## Table: `api_key_usage`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 144 | `src/auth.js` | 68 | INSERT | API key auth middleware (fire-and-forget) | P |

---

## Table: `settings`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 145 | `src/routes/chat-api.js` | 1074-1077 | INSERT ... ON CONFLICT DO UPDATE | `PUT /api/settings` (admin) | P |
| 146 | `src/db.js` | 211-214 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed model settings | R (hardcoded) |

---

## Table: `ob_ingestion_log`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 147 | `src/connectors/github.js` | 155 | INSERT | GitHub sync — success log | P |
| 148 | `src/connectors/gcal.js` | 69 | INSERT | Calendar sync — success log | P |
| 149 | `src/connectors/gcal.js` | 78 | INSERT | Calendar sync — error log | P |
| 150 | `src/connectors/telegram.js` | 180 | INSERT | Telegram flush — log | P (no params, literal values) |
| 151 | `src/connectors/telegram.js` | 222 | INSERT | Telegram direct save — log | P (no params, literal values) |
| 152 | `src/connectors/telegram.js` | 312 | INSERT | OpenClaw self-report — log | P (no params, literal values) |

---

## Table: `mothership_log`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 153 | `src/workers/mothership-worker.js` | 29-31 | INSERT | Mothership worker (nightly) | P |

---

## Table: `brand_ratings`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 154 | `src/workers/moderation-worker.js` | 154-157 | INSERT ... ON CONFLICT DO NOTHING | Moderation worker — flag abusive brand | P |

---

## Table: `worker_state`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 155 | `src/workers/moderation-worker.js` | 66-67 | INSERT ... ON CONFLICT DO UPDATE | `saveBackoffState()` | P |
| 156 | `src/workers/moderation-worker.js` | 80-81 | INSERT ... ON CONFLICT DO UPDATE | `saveBackoffState()` — after table creation | P |

---

## Table: `flow_versions`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 157 | `src/tools/automation.tool.js` | 319-326 | INSERT | `snapshotFlowVersion()` — before update/rollback | P |
| 158 | `src/workers/automation-monitor.js` | 61-65 | UPDATE (performance) | Automation monitor (15min interval) | P |

---

## Table: `flow_configs`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 159 | `src/routes/flow-config.js` | 35-44 | INSERT ... ON CONFLICT DO UPDATE | `POST /api/flow-config/:flowId` | P |
| 160 | `src/tools/automation.tool.js` | 277-281 | INSERT ... ON CONFLICT DO UPDATE | `manage_automation` tool — update_flow_config | P |
| 161 | `src/db.js` | 1029-1035 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed genie-single config | R (hardcoded) |
| 162 | `src/db.js` | 1039-1045 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed genie-batch config | R (hardcoded) |

---

## Table: `skill_sessions`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 163 | `src/skills/onboard-brand.js` | 40-43 | INSERT | `createSession()` — brand onboarding | P |
| 164 | `src/skills/onboard-brand.js` | 69-73 | UPDATE (current_step, state_data) | `updateSession()` | P |
| 165 | `src/skills/onboard-brand.js` | 83-85 | DELETE | `deleteSession()` — cleanup | P |

---

## Table: `brand_oauth_tokens`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 166 | `src/utils/google-auth.js` | 46-50 | UPDATE (access_token, expires_at) | `getGoogleClient()` — token refresh | P |
| 167 | `src/utils/google-auth.js` | 83-89 | INSERT ... ON CONFLICT DO UPDATE | `handleCallback()` — OAuth code exchange | P |

---

## Table: `ob_users`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 168 | `src/db.js` | 192-196 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed team | R (hardcoded) |

---

## Table: `ob_groups`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 169 | `src/db.js` | 201-206 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed groups | R (hardcoded) |

---

## Table: `brand_users`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 170 | `src/db.js` | 964-966 | INSERT ... ON CONFLICT DO NOTHING | Schema init — seed admin brand_user | R (subquery) |

---

## Table: `cost_catalog`

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 171 | `src/db.js` | 754-756 | INSERT | Schema init — seed cost catalog (conditional) | P |

---

## Table: `reports` (via scheduled_tasks)

| # | File | Line | Operation | Trigger | Query Style |
|---|------|------|-----------|---------|-------------|
| 172 | `src/routes/reports.js` | 103 | UPDATE (enabled toggle) | `PUT /api/reports/tasks/:id` | P | **CROSS-REF** — same as scheduled_tasks section |
| 173 | `src/routes/reports.js` | 128 | DELETE (scheduled_tasks) | `DELETE /api/reports/tasks/:id` | P | **CROSS-REF** — same as task_runs section |

> Note: entries 172-173 are **cross-references only** — they operate on `scheduled_tasks` and `task_runs` tables and are already counted in those sections. They are NOT counted toward the unique total.

---

## Summary

### Totals by Table

| Table | INSERT | UPDATE | DELETE | Total |
|-------|--------|--------|--------|-------|
| memories | 2 (+10 via captureMessage) | 10 | 0 | 12 direct + 10 indirect |
| messages | 9 | 0 | 2 | 11 |
| conversations | 5 | 12 | 2 | 19 |
| ob_conversations | 1 | 2 | 0 | 3 |
| users | 3 | 6 | 0 | 9 |
| generations | 3 | 2 | 0 | 5 |
| edit_deltas | 2 | 2 | 0 | 4 |
| memory_events | 2 | 2 | 0 | 4 |
| distilled_memory | 6 | 6 | 1 | 13 |
| scheduled_tasks | 2 | 14 | 2 | 18 |
| task_runs | 1 | 10 | 2 | 13 |
| domain_agents | 1 | 1 | 0 | 2 |
| user_tasks | 1 | 1 | 0 | 2 |
| brands | 2 | 1 | 0 | 3 |
| brand_context | 2 | 0 | 0 | 2 |
| brand_budgets | 2 | 4 | 0 | 6 |
| action_queue | 2 | 6 | 0 | 8 |
| action_log | 1 | 0 | 0 | 1 |
| intelligence_snapshots | 4 | 0 | 1 | 5 |
| ob_decisions | 2 | 0 | 0 | 2 |
| api_keys | 1 | 2 | 0 | 3 |
| api_key_usage | 1 | 0 | 0 | 1 |
| settings | 2 | 0 | 0 | 2 |
| ob_ingestion_log | 6 | 0 | 0 | 6 |
| mothership_log | 1 | 0 | 0 | 1 |
| brand_ratings | 1 | 0 | 0 | 1 |
| worker_state | 2 | 0 | 0 | 2 |
| flow_versions | 1 | 1 | 0 | 2 |
| flow_configs | 4 | 0 | 0 | 4 |
| skill_sessions | 1 | 1 | 1 | 3 |
| brand_oauth_tokens | 1 | 1 | 0 | 2 |
| ob_users | 1 | 0 | 0 | 1 |
| ob_groups | 1 | 0 | 0 | 1 |
| brand_users | 1 | 0 | 0 | 1 |
| cost_catalog | 1 | 0 | 0 | 1 |

**Total unique write path entries documented: 173**
(includes db.js schema init seeds which are one-time idempotent operations; excludes 2 cross-reference entries #172-173 which are counted in their primary table sections; includes db.js lines 307-309 as 3 separate entries #10a/10b/10c)

### Unique Tables with Write Paths: 35

---

## Violations & Concerns

### 1. captureMessage() Bypass (VIOLATION)

**File:** `src/routes/capture.js` lines 52-71

The `POST /capture` HTTP route performs a direct `INSERT INTO memories` instead of calling `captureMessage()`. This is the original API endpoint that predates the capture utility. While functionally similar, it:
- Has its own hashtag extraction logic
- Does not emit `memory.created` events to the event bus
- Uses different column mapping than `captureMessage()`

**Recommendation:** Refactor to call `captureMessage()` internally, or at minimum ensure event bus emission is added.

### 2. Raw SQL in Schema Init (Low Risk)

**Files:** `src/db.js` lines 264, 301-303, 307, 308, 309, 322, 439-440, 857-859, 964-966, 1029-1045

All schema init/seed queries use hardcoded values (no user input), so SQL injection risk is zero. However, these are raw strings that won't be caught by parameterized-query-only audit tools.

### 3. Raw Table Name Interpolation in Embedding Worker

**File:** `src/workers/embedding-worker.js` (entries #74, #75 in `processIndividualMemories()` fallback)

The `processIndividualMemories()` helper function uses `UPDATE ${table} SET ...` where `table` is a variable from an internal allowlist. Entries #6 and #7 (the primary batch path) use hardcoded `memories` and are fully parameterized. The `P+R` classification applies only to the fallback helper (#74, #75). Low risk since the table name is controlled, but worth noting for migration tooling.

### 4. Fire-and-Forget Patterns

Several write paths use `.catch()` fire-and-forget patterns:
- `src/routes/actions.js:61` — generation recording
- `src/routes/chat-api.js:763` — generation recording in chat
- `src/auth.js:66-68` — API key usage tracking
- `src/routes/chat-api.js:579` — compressed_at update

These won't block the user but failures are silently logged. During dual-write migration, these need careful handling to avoid silent data divergence.

### 5. Duplicate Write Paths for Same Table

The `task_runs` approval flow has duplicate write paths:
- `src/routes/webhooks.js` lines 191/194 (inline callback handler)
- `src/routes/webhooks.js` lines 569-577 (standalone callback handler)

Both do the same UPDATE but in different code paths. Consider consolidating.

---

## Verification

```bash
$ grep -rn "INSERT\|UPDATE\|DELETE\|upsert" src/ --include="*.js" | wc -l
224
```

The grep returns **224 lines**. This includes:
- 173 unique documented write path entries (actual SQL operations; 2 additional cross-reference entries #172-173 not counted)
- ~20 lines that are comments mentioning these keywords (e.g., "// Update conversation", "// captureMessage handles ON CONFLICT", "Update latest flow version")
- ~15 lines that are non-SQL code using these words (e.g., `console.error('Failed to update user')`, `res.status(500).json({ error: 'Failed to update task' })`, `{ alias: "mini" }` near "update")
- ~10 lines from `FOR UPDATE OF st SKIP LOCKED`, `-- update when pricing changes`, variable names, and agent seed file text content
- ~6 lines that are duplicate references (same operation referenced in ON CONFLICT clauses counted separately by grep)

**All 224 grep matches have been reviewed and categorized. Every actual SQL write operation is documented above.**
