# Answers to CC's Questions

Good analysis. You did exactly the right thing reading the codebase first. Here are the decisions.

---

## 1. pgvector: Keep float8[]

The CLAUDE.md constraint stands. Use float8[] everywhere the plan says VECTOR(1536). Use the existing cosine_similarity() PL/pgSQL function for all similarity queries. The architecture doesn't change -- just the datatype. When we move to Supabase/Neon later, we swap to pgvector in one migration.

Every schema in the plan that has `embedding VECTOR(1536)` becomes `embedding float8[]`. Same for indexes -- use the existing pattern for similarity lookups.

---

## 2. TypeScript: Stick with JS

Correct. Write everything in plain CommonJS JS matching the existing codebase. Treat the TypeScript interfaces in the plan as **documentation/JSDoc comments** describing expected shapes, not as implementation requirements. Zero build pipeline changes.

Example -- where the plan says:
```typescript
interface CaptureEditDeltaParams {
  userId: string;
  brandId: string;
  ...
}
```

Implement as:
```javascript
/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.brandId
 * ...
 */
async function captureEditDelta(params) { ... }
```

---

## 3. Dual memory system: Parallel, merge later

Your recommendation is exactly right. Here's the decision:

- **`memories` table stays untouched.** captureMessage() keeps working. All existing flows (chat RAG, search, MCP, Telegram capture, GitHub/Calendar sync) continue hitting `memories` as-is. Nothing breaks.

- **`memory_events` is a NEW table** for the new event types: caption_edit, campaign_result, capability_gap, manual_override, signal, etc. It does NOT replace memories.

- **`distilled_memory` is a NEW table** for learned knowledge extracted from memory_events by the distillation worker.

- **`recall()` queries BOTH tables.** It searches `memories` (existing) AND `distilled_memory` (new) using the same cosine_similarity function, merges results by score, and returns a unified ranked list. Existing memories are treated as if they have confidence = 1.0 for scoring purposes.

- **captureMessage() and captureEvent() coexist.** captureMessage() feeds `memories` (existing flow). A new captureEvent() feeds `memory_events` (new flow). Different entry points, different tables, unified retrieval via recall().

- **Migration is future work.** Over time, as distilled_memory proves itself, we may migrate memories data. But NOT now. The existing system must keep working exactly as-is.

For the existing captureEditDelta() in src/utils/capture.js that writes to edit_deltas: update it to ALSO write to memory_events. The edit_deltas table and mothership worker keep working. We're adding a new data path, not replacing the old one.

For brand_context.industry: reuse it. Don't create a new column.

---

## 4. Scope: Intelligence MVP (Phases 1-4) first

Build Phases 1-4 as a unit. They form one complete learning loop:

Phase 1: Schema (new tables alongside existing)
Phase 2: captureEditDelta → voice rules (immediate client value)
Phase 3: Distillation worker (without this, events accumulate but never get distilled -- the loop doesn't close)
Phase 4: recall() querying both memories + distilled_memory (Ruhi can now USE what she learned)

Do NOT skip Phase 3 in the first batch. Without the worker, there's no learning -- just logging. The whole point is: events in → distillation → knowledge out → recall during generation.

After 1-4 ship and validate, the next priority is Phase 9 (governance) before any autonomous action goes live.

Phases 5-8, 10-11 come after, in the order specified in the plan.

---

## 5. Brave Search API key

I'll get the key. Build Phase 6 (research worker) with the Brave Search integration as specified. If the key isn't ready when you reach Phase 6, stub the fetcher with a clear interface so I can plug it in.

Don't let this block Phases 1-4 -- research is Phase 6.

---

## 6. Module structure: Follow existing patterns, new naming

Put files where the existing codebase expects them:

- Routes → `src/routes/` (e.g., `src/routes/governance.js`, `src/routes/recall.js`)
- Workers → `src/workers/` (e.g., `src/workers/distillation-worker.js`, `src/workers/research-worker.js`)
- Utilities → `src/utils/` (e.g., `src/utils/recall.js`, `src/utils/edit-delta.js`, `src/utils/similarity.js`)

Use Sense/Decide/Govern as naming conventions for the files, not directory structure. For example:
- `src/workers/sense-research-worker.js`
- `src/workers/decide-distillation-worker.js`
- `src/utils/govern-action.js`

Or simpler: just name files after what they do. `distillation-worker.js`, `recall.js`, `governance.js`. The plan's conceptual modules map to files, not directories.

---

## Summary of changes to the plan

| Plan says | Actually do |
|---|---|
| VECTOR(1536) | float8[] + existing cosine_similarity() |
| TypeScript interfaces | JSDoc comments in plain JS |
| memory_events replaces memories | memory_events lives alongside memories |
| recall() queries distilled_memory only | recall() queries memories + distilled_memory, merges results |
| src/sense/, src/decide/, src/govern/ dirs | Files in existing src/routes/, src/workers/, src/utils/ |
| ALTER TABLE brands ADD industry | Reuse brand_context.industry |
| New captureEditDelta() replaces old | Update existing to ALSO write to memory_events |

---

## On cost burn risk

Good flag on the $4+ incident. Every worker must have:

1. **Per-run LLM call cap**: Max 20 LLM calls per worker run. If hit, log warning and stop.
2. **429 backoff**: Exponential backoff on rate limits, max 3 retries then skip batch.
3. **Daily cost tracking**: Log total LLM calls + estimated cost per worker run. If daily cost exceeds $5, pause all workers and alert.
4. **Circuit breaker**: If a worker fails 3 consecutive runs, auto-disable and log error.

Add these as part of the shared worker infrastructure in Phase 1-2, before any worker goes live.

---

## Build order confirmed

1. Phase 1: Schema (6 new tables: memory_events, distilled_memory, session_summaries, learning_velocity, worker_locks + cost tables for governance prep). Verify float8[] + cosine_similarity works.
2. Phase 2: Edit delta capture (update existing captureEditDelta + new distillEditDeltas). Shared utils (embedding, LLM caller, similarity, locks, logger).
3. Phase 3: Distillation worker (Pass 1 + Pass 2 + weekly rollup).
4. Phase 4: recall() querying both tables + generateWithMemory wrapper.

Ship, validate, then governance (Phase 9).

Go.
