# Wave 1: User-Scoped Intelligence Layer — Implementation Handoff

**Created**: 2026-03-13
**Status**: READY TO IMPLEMENT (all code read, plan verified)
**Repo**: `/Users/vineet/ikawn-openbrain`
**Deploy**: `~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false`

---

## What This Does

Adds `user_id` awareness to the intelligence layer so two users on the same brand don't have context leakage. Personal memories (voice rules, corrections) are scoped to `user_id + brand_id`. Shared memories (creative patterns, business insights) remain brand-level (`user_id = NULL`).

---

## Files to Modify (8 files, ~100 LOC of changes)

### 1. `src/db.js` (lines 442-521)
Add `user_id` columns + indexes after existing CREATE TABLE statements:

```javascript
// After line 454 (memory_events table creation):
await client.query(`ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_memory_events_user ON memory_events (brand_id, user_id, event_type, created_at)`);

// After line 488 (distilled_memory indexes):
await client.query(`ALTER TABLE distilled_memory ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_distilled_user_brand ON distilled_memory (brand_id, user_id, memory_type) WHERE superseded_by IS NULL`);

// After line 503 (session_summaries table):
await client.query(`ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);

// After line 419 (api_keys table):
await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);
```

### 2. NEW: `src/utils/memory-types.js`
```javascript
const PERSONAL_MEMORY_TYPES = ['USER_PREFERENCE', 'BRAND_VOICE_RULE', 'CORRECTION', 'WORKFLOW_PATTERN'];
const SHARED_MEMORY_TYPES = ['BUSINESS_INSIGHT', 'CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT', 'PERFORMANCE_INSIGHT', 'STRATEGIC_RECOMMENDATION', 'EXTERNAL_INSIGHT', 'CROSS_BRAND_INSIGHT', 'PRODUCT_SUGGESTION', 'COST_EFFICIENCY'];
function isPersonalMemory(memoryType) { return PERSONAL_MEMORY_TYPES.includes(memoryType); }
module.exports = { PERSONAL_MEMORY_TYPES, SHARED_MEMORY_TYPES, isPersonalMemory };
```

### 3. `src/utils/capture.js`
- `captureEditDelta()` (line 86-93): Change INSERT to include `user_id` = `data.user_id || null`
- `captureEvent()` (line 105-108): Change INSERT to include `user_id` = `data.user_id || null`

### 4. `src/workers/distillation-worker.js`
- `distillEditDeltas()` (line 51): Add `user_id` to SELECT. Line 66: group by `${evt.brand_id}::${evt.user_id || '_system'}`. Line 128: pass userId to `upsertDistilledMemory(brandId, userId, rule, ...)`
- `distillGeneralEvents()` (line 154): Same pattern — SELECT user_id, group by brand+user, pass userId
- `upsertDistilledMemory()` (line 256): Add `userId` param. Use `isPersonalMemory()` to determine `effectiveUserId`. **CRITICAL**: similarity check must include `AND user_id = $X` for personal types, `AND user_id IS NULL` for shared types. Supersession must NEVER cross users.

### 5. `src/utils/recall.js`
- Add `userId` to RecallParams typedef (line 9)
- `recall()` (line 36): Accept `userId` from params. Distilled query (line 61-82): add `AND (user_id = $X OR user_id IS NULL)` when userId provided, `AND user_id IS NULL` when not. Same for text fallback (line 166-221).

### 6. `src/utils/generate-with-memory.js`
- Add `userId` to typedef (line 9) and destructure (line 32)
- Pass `userId` to `recall()` call (line 41-48)

### 7. `src/routes/recall.js`
- Line 21: Extract `user_id` from `req.query`
- Line 27-34: Pass `userId: user_id || undefined` to `recall()`

### 8. `src/auth.js`
- `requireAuthOrApiKey()` (line 42-69): After finding DB key, also SELECT `user_id` from `api_keys`. Set `req.userId = key.user_id || null`.

---

## Key Rules

1. **Personal types** (need user_id): USER_PREFERENCE, BRAND_VOICE_RULE, CORRECTION, WORKFLOW_PATTERN
2. **Shared types** (user_id = NULL): Everything else
3. **Supersession isolation**: A personal memory for User A must NEVER supersede User B's. The similarity WHERE clause must include user_id matching.
4. **Recall returns both**: When userId provided → personal memories for THIS user + shared brand memories. When not provided → shared only.
5. **Don't touch**: `memories` table (legacy), `learning_velocity`, `embedding-worker`, `worker-guards`

---

## Verification Test

After implementing, test with:
```bash
# Capture edits for two different users on same brand
curl -X POST https://ikawn-openbrain.fly.dev/api/edit-delta -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -d '{"brand_id":"test","user_id":"user_a","delta_type":"prompt_edit","original_prompt":"Buy now","revised_prompt":"Shop the look ✨","agent_name":"genie"}'
# (repeat 3x for user_a with emoji pattern, 3x for user_b without emojis)

# Run distillation manually (or wait for 3am UTC)
# Then recall for each user:
curl "https://ikawn-openbrain.fly.dev/api/memory/recall?q=voice+rules&brand_id=test&user_id=user_a" -H "X-Api-Key: $KEY"
# Should return emoji-heavy voice rules

curl "https://ikawn-openbrain.fly.dev/api/memory/recall?q=voice+rules&brand_id=test&user_id=user_b" -H "X-Api-Key: $KEY"
# Should return NO emoji voice rules — different user, different pattern
```

---

## Context From This Session

- **Lobster-bot sync fixed**: `bridge.py` on VPS updated with retry + visible logging (`logger.warning`/`logger.error` instead of `logger.debug`). Bot restarted.
- **Universal connector vision saved**: See `/Users/vineet/.claude/projects/-Users-vineet/memory/universal-connector-vision.md`
- **Org model decision**: agencies (multi-brand) vs brands (single-brand). Owner + member roles only. No manager yet.
- **Build sequence**: Wave 1 (this — OpenBrain user scoping) → Wave 2 (ikawn-v3 org model) → Wave 3 (WhatsApp/Slack connectors)
