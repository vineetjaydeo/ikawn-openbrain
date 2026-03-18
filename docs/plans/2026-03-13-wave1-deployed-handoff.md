# Wave 1 Deployed + Wave 2 Ready — Session Handoff

**Date**: 2026-03-13
**Repo**: `/Users/vineet/ikawn-openbrain` (main, commit 1f95e99)
**Status**: Wave 1 DEPLOYED and VERIFIED. Wave 2 prompt written at `/Users/vineet/ikawn-v3/docs/plans/wave2-org-model-prompt.md`.

---

## What Was Done This Session

### 1. Wave 1: User-Scoped Intelligence Layer — DEPLOYED

Added `user_id` awareness to the intelligence pipeline. Personal memories (voice rules, corrections) are scoped per-user. Shared memories (business insights, patterns) remain brand-level.

**3 commits deployed to ikawn-openbrain.fly.dev:**

| Commit | Description |
|--------|-------------|
| `6803e0f` | Ruhi chat switched from OpenAI `streamChat` to Anthropic `streamChatAnthropic` (claude-sonnet-4-6) |
| `84575a2` | Wave 1 — user_id columns, memory-types classification, scoped distillation + recall |
| `1f95e99` | Housekeeping — Dockerfile CACHE_BUST, planning docs, todo updates |

**Files changed (Wave 1 core):**

| File | Change |
|------|--------|
| `src/db.js` | `user_id VARCHAR(100)` columns on `memory_events`, `distilled_memory`, `session_summaries`, `api_keys` + indexes |
| `src/utils/memory-types.js` | NEW — `isPersonalMemory()` classifies 4 personal types vs 10 shared types |
| `src/utils/capture.js` | `captureEditDelta` + `captureEvent` write `user_id` to `memory_events` |
| `src/workers/distillation-worker.js` | Groups by brand+user, passes userId, scoped supersession via `isPersonalMemory()` |
| `src/utils/recall.js` | `userId` param → returns personal memories for THIS user + shared brand memories |
| `src/utils/generate-with-memory.js` | Passes `userId` through to `recall()` |
| `src/routes/recall.js` | Extracts `user_id` from query params |
| `src/auth.js` | SELECTs `user_id` from `api_keys`, sets `req.userId` |

**Ruhi→Claude migration (bonus):**

| File | Change |
|------|--------|
| `src/utils/llm.js` | Added `streamChatAnthropic()` — SSE streaming via Anthropic SDK |
| `src/routes/ruhi-chat.js` | Switched from OpenAI GPT-4o to claude-sonnet-4-6, removed DB model lookup |

### 2. Verification Results — ALL PASS

**Pre-deploy regression:**
- POST /capture — 201 OK
- POST /edit-delta — 201 OK
- GET /search — 200 OK
- GET /api/memory/recall — 200 OK (with and without user_id)
- GET /recent — 200 OK
- GET /stats — 200 OK
- All 40+ JS files — syntax OK
- All 4 workers start cleanly (Embedding, Moderation, Mothership, Distillation)

**Wave 1 isolation test:**
- Inserted 3 caption_edit events for user_A (emoji-adding) and 3 for user_B (emoji-removing) on brand "wave1-test"
- Triggered distillation manually → 4 BRAND_VOICE_RULE memories created
- user_A recall → returned ONLY emoji-adding rules
- user_B recall → returned ONLY emoji-removing rules (3 distinct rules)
- No user_id recall → returned 0 personal memories (correct — no leakage)
- All test data cleaned up after verification

### 3. Deploy Notes

- **Fly machine image issue**: `fly deploy` reported success but machine stayed on old image. Required `fly machine update <id> --image <new-tag>` to force the swap. Watch for this in future deploys.
- **Schema migration**: `initSchema()` ran successfully on startup — confirmed all 4 `user_id` columns + 2 new indexes exist.
- **`--depot=false` flag**: Still mandatory to bypass Depot's stale layer caching.

---

## Current System State

### OpenBrain (ikawn-openbrain.fly.dev)

- **Schema v5** with user_id columns on: `memory_events`, `distilled_memory`, `session_summaries`, `api_keys`
- **Ruhi chat** now on Claude Sonnet 4.6 (was GPT-4o)
- **Distillation worker** groups by brand+user, scopes supersession per-user for personal types
- **Recall** returns personal + shared when user_id provided, shared-only when not
- **All existing data** has `user_id = NULL` (backward compatible — treated as shared/unscoped)
- **Embedding worker** running healthy (~7-9 memories per 5s batch)

### Key Architecture Detail

The `/edit-delta` route (`src/routes/edit-deltas.js`) does a **direct INSERT into edit_deltas** — it does NOT call `captureEditDelta()` from `src/utils/capture.js`. This means:
- The route writes to `edit_deltas` only (no `memory_events` dual-write)
- The `captureEditDelta()` utility (which dual-writes) is called by ikawn-v3 code, not this route
- `memory_events` table has 0 production rows currently — distillation pipeline activates when ikawn-v3 starts sending events with the utility

This is not a bug — the route predates the distillation pipeline. Consider unifying later.

---

## What's Next: Wave 2 — Organization Model

**Prompt**: `/Users/vineet/ikawn-v3/docs/plans/wave2-org-model-prompt.md`

Wave 2 adds multi-tenant org structure across both systems:

### ikawn-v3 Changes (bulk of work)
1. **Schema**: Extend `organizations` table (+type, +seats_limit, +brands_limit, +plan), add `organization_id` + `org_role` to users, create `org_brands` junction table
2. **API endpoints**: `/api/org/setup`, `/api/org/brands` (CRUD), `/api/org/seats` (CRUD), `/api/org/api-keys` (bridge to OpenBrain)
3. **UI**: Brand/project switcher for agencies, seats management page, brands management page

### OpenBrain Changes (minimal)
1. `api_keys` table: add `org_id VARCHAR(100)` column
2. New endpoint: `POST /api/brands/setup` (idempotent brand initialization)
3. Verify api_keys creation accepts `org_id`

### Key Design Decisions (from V)
- Two org types: `agency` (multi-brand) and `brand` (single-brand, brands_limit=1)
- Two roles only: `owner` and `member` (no manager yet)
- Agency users see ALL brands under their agency (no per-brand ACL)
- Plan tiers: starter (5 seats), growth (25 seats), enterprise (999 seats)
- `brand_id` in `org_brands` matches `brand_id` in OpenBrain — this is the cross-system bridge

### Build Sequence
Wave 2 is primarily an ikawn-v3 task (schema + API + UI). OpenBrain changes are 3 small items that extend what Wave 1 already built.

---

## Credentials Used This Session

- **OPENBRAIN_API_KEY**: `ob_cc6b2e7ff620202982db802853e1aa2ac2865401be3f208f` (used for API regression tests)
- **Fly SSH**: Used for schema verification and distillation trigger
- **Prod DB**: Accessed via `fly ssh console` + inline node scripts (no direct postgres connect due to interactive session issues)

---

## Open Items / Known Issues

1. **edit-deltas route not using captureEditDelta()**: The `/edit-delta` POST route does direct SQL INSERT, bypassing the `memory_events` dual-write pipeline. Not blocking — ikawn-v3 callers use the utility correctly.
2. **Embedding worker volume**: Processing 7-9 memories per 5s tick. This is the backlog from previous captures. Will settle down once backlog clears.
3. **Fly deploy image swap**: The `fly deploy` command can report success without actually swapping the machine image. Use `fly machine list` to verify the deployment tag matches, and `fly machine update` to force if needed.
