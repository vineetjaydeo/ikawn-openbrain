# P2 Multi-Tenant Scale Prep — Handoff

## Context

P0 + P1 multi-tenant data isolation is **DEPLOYED** (commit `0be23f7`, 2026-03-20).

Every query in OpenBrain now enforces `brand_id` via `requireBrand` middleware (mounted globally in `src/index.js`). The middleware sets `req.brand_id` on every request with resolution order: API key `org_id` → `x-brand-id` header → session `brand_id` → default `'ikawn'`.

**Audit report**: `audits/2026-03-20-multi-tenant-isolation.md`
**Implementation plan**: `tasks/todo.md` (P0 + P1 checked off, P2 items listed)

## What's Done (P0 + P1)

- `requireBrand` middleware mounted globally, sets `req.brand_id` on every request
- All read endpoints enforce `AND brand_id = req.brand_id` (search, recent, decisions, generations, edit-deltas, stats, governance, recall)
- All RAG searches scoped by brand (chat-api.js, ruhi-chat.js, webhooks.js)
- Agent mention lookup scoped by brand
- All write endpoints use `req.brand_id`
- `task_runs` table has `brand_id` column (added, backfilled, indexed)
- Mission Control: all queries use `req.brand_id`
- All `captureMessage()` callers and tool contexts use `req.brand_id`
- Webhook approval: brand-scoped JOIN prevents cross-brand approval
- MCP server: configurable via `MCP_BRAND_ID` env var

## What Needs Building (P2) — Full Spec

### P2.1: R2 Storage Brand Namespacing

**File**: `src/utils/storage.js`

Current state: All uploads go to `openbrain/` prefix in R2.

Change:
- Modify upload functions to use `openbrain/{brandId}/` prefix
- The `brandId` parameter must be passed through from callers
- Existing files stay at `openbrain/` — no migration needed, only new uploads get namespaced
- Key callers to update:
  - `src/routes/upload.js` — file uploads from web UI
  - `src/routes/webhooks.js` — Telegram media uploads
  - Any other place that calls storage upload functions

**Verification**: Upload a file via web UI, check R2 that it lands under `openbrain/ikawn/` prefix.

### P2.2: Per-Brand Persona

Current state: `src/ruhi/persona.js` exports a static `buildSystemPrompt()` that returns the same Ruhi persona for all brands.

Change:
- New table: `brand_context` (or use existing `brands` table if it has the right columns)
  ```sql
  CREATE TABLE IF NOT EXISTS brand_context (
    id SERIAL PRIMARY KEY,
    brand_id VARCHAR(100) UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    industry TEXT,
    tone TEXT,            -- e.g. 'professional', 'casual', 'luxury'
    system_prompt_override TEXT,  -- full override, or NULL for default
    context_injection TEXT,       -- appended to default prompt
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- Modify `buildSystemPrompt()` to accept `brandId`, load brand context, inject brand name/industry/tone
- Fall back to default iKawn persona if no brand-specific data exists
- Cache brand context in-memory with 5-min TTL (use a simple Map + timestamp, no Redis)
- Callers to update:
  - `src/routes/ruhi-chat.js` line ~180: `buildSystemPrompt(userName, userRole, memoryContext, customInstructions)` → add `brandId` param
  - `src/routes/webhooks.js`: Telegram handler system prompt construction

**Verification**: Insert a `brand_context` row for 'ikawn', verify persona includes brand-specific content. Test with a second brand_id, verify different persona.

### P2.3: Per-Brand Knowledge Base

Current state: `src/index.js` lines 48-60 load `docs/soul.md`, `memory.md`, `tools.md`, `user.md` into `global.ruhiKnowledge` — a single Map shared by all brands.

Change:
- New table:
  ```sql
  CREATE TABLE IF NOT EXISTS brand_knowledge (
    id SERIAL PRIMARY KEY,
    brand_id VARCHAR(100) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,  -- 'soul', 'memory', 'tools', 'user'
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, doc_type)
  );
  ```
- Create a `loadBrandKnowledge(brandId)` function that:
  1. Checks in-memory cache (Map keyed by brandId, 5-min TTL)
  2. If miss: query `brand_knowledge` for that brand
  3. If no rows: fall back to global `docs/` files (current behavior)
  4. Return knowledge Map
- Update `src/routes/ruhi-chat.js` and `src/routes/chat-api.js` to call `loadBrandKnowledge(req.brand_id)` instead of reading `global.ruhiKnowledge`
- Admin UI: Add a "Knowledge Base" section to the admin or brand settings page where brand-specific docs can be edited

**Verification**: Default brand returns global docs. Brand with custom `brand_knowledge` rows returns those instead.

### P2.4: API Key → Brand Mapping

Current state: `src/auth.js` `requireAuthOrApiKey()` resolves `req.orgId` from the API key's `org_id` column. The `requireBrand` middleware already uses `req.orgId` as first priority in its resolution order.

Change:
- Need a mapping: `api_keys.org_id` → `brands.brand_id`
- Either:
  - (A) Store `brand_id` directly on `api_keys` table, OR
  - (B) Add a `brands` table with `org_id` column, and resolve in `requireBrand`
- Option A is simpler. Add `brand_id` column to `api_keys`:
  ```sql
  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
  ```
- In `requireAuthOrApiKey()`, after resolving the key, set `req.brand_id_from_key = key.brand_id`
- In `requireBrand()`, add `req.brand_id_from_key` to the resolution order (highest priority for API-authenticated requests)

**Verification**: Create an API key with `brand_id = 'test-corp'`. Make an API request with that key. Verify `req.brand_id` resolves to `'test-corp'`.

### P2.5: Conversation-Level Brand Scoping

Current state: `src/routes/chat-api.js` conversation CRUD queries filter by `user_id` only, not `brand_id`. This means a multi-brand user could see conversations from all their brands mixed together.

Change:
- Add `AND brand_id = $N` to all conversation queries in `chat-api.js`:
  - `GET /api/conversations` (list)
  - `GET /api/conversations/:id` (get)
  - `PUT /api/conversations/:id` (update)
  - `DELETE /api/conversations/:id` (delete)
  - The conversation creation `INSERT` already has `brand_id` from session
- Also scope in `src/routes/ruhi-chat.js`:
  - Conversation lookup/creation should use `req.brand_id`

Key files:
- `src/routes/chat-api.js` — grep for `FROM conversations` and `FROM messages` queries
- `src/routes/ruhi-chat.js` — conversation history loading

**Verification**: Create conversations under two brands for the same user. List conversations — should only return current brand's conversations.

### P2.6: Brand Admin Isolation

Current state: Admin users see everything. No brand-level access control.

Change:
- Check if `brand_users` table exists (the audit mentions it does). If not, create:
  ```sql
  CREATE TABLE IF NOT EXISTS brand_users (
    id SERIAL PRIMARY KEY,
    brand_id VARCHAR(100) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES ob_users(id),
    role VARCHAR(50) DEFAULT 'member',  -- 'admin', 'member', 'viewer'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, user_id)
  );
  ```
- Add `requireBrandAccess` middleware that checks the user belongs to the requested brand
- Super-admin (role = 'admin' on `ob_users`) sees all brands
- Regular users only see brands they belong to
- Apply to all admin-facing routes (Mission Control, admin-api, etc.)

**Verification**: Create two brands with different users. User A cannot access Brand B's Mission Control, memories, or conversations.

## Architecture Notes

### Key files to read first
- `src/auth.js` — middleware definitions, `requireBrand` is at line 79
- `src/index.js` — route mounting order, `requireBrand` at line 86
- `src/db.js` — all schema definitions (ALTER TABLEs are idempotent, add at end of `initSchema()`)
- `src/ruhi/persona.js` — current static system prompt builder
- `src/utils/storage.js` — R2 upload functions

### Patterns to follow
- Schema changes go in `src/db.js` `initSchema()` as idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS`
- In-memory caching: use `Map` with TTL check, not Redis (Redis is banned per CLAUDE.md)
- Brand resolution is always `req.brand_id` (guaranteed by middleware)
- Default brand is always `'ikawn'` — backward compatibility is non-negotiable

### Deploy
```bash
# OpenBrain deploys directly to production (no staging)
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false
# If --depot=false fails with h2c errors, try without the flag (uses Depot builder)
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only
```

## Execution Order

| Item | Effort | Dependencies |
|------|--------|-------------|
| P2.4 API key → brand | 1hr | None — do first, enables testing everything else |
| P2.5 Conversation scoping | 2hr | None |
| P2.1 R2 namespacing | 2hr | None |
| P2.2 Per-brand persona | 3hr | P2.4 (need brand resolution for testing) |
| P2.3 Per-brand knowledge | 4hr | P2.2 (similar pattern, build on persona cache) |
| P2.6 Brand admin isolation | 4hr | P2.4 + P2.5 (need brand_users + conversation scoping) |

**Total: ~16 hours**

## Testing Strategy

After each P2 item:
1. Insert a test brand: `INSERT INTO brands (brand_id, name) VALUES ('test-corp', 'Test Corp') ON CONFLICT DO NOTHING`
2. Test with `x-brand-id: test-corp` header (or API key with brand)
3. Verify zero data leakage between 'ikawn' and 'test-corp'
4. Clean up test data

After ALL P2:
- Full E2E: create two brands, two users, conversations in each, memories in each
- Verify: search, RAG, decisions, generations, conversations, Mission Control, Telegram — all isolated
- Verify: default 'ikawn' brand still works perfectly (backward compat)
- Verify: workers (embedding, moderation, distillation) process both brands
- Verify: R2 uploads go to brand-scoped paths
