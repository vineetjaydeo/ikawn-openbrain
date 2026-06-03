# holaOS LLM-Reranker + Hybrid-Retrieval Port → OpenBrain Recall

Status: PLAN ONLY — no code written. Behind a feature flag. Lucy-first.

---

## Goal & expected win

OpenBrain's `recall()` returns the top-K memories by a fixed arithmetic score
(`similarity × confidence`, plus a recency/usage blend for distilled rows). That score is
purely lexical-blind vector proximity: the *most semantically similar* row wins, which is
not the same as the *most decision-relevant* row. holaOS solves this with a two-stage
funnel — over-fetch a wide candidate set, then let a cheap LLM rerank to a tight final set
using intent, freshness, and high-signal cues. Porting this gives us a recall pass that
surfaces blockers, constraints, and recent changes ahead of stale-but-similar trivia,
measurably improving the memory context Ruhi/Lucy injects into chat — at the cost of one
extra Haiku call per recall (flag-gated, ~$0.001/call).

---

## What holaOS does (transferable mechanics only)

holaOS' `buildMemoryHybridRetrievalResult` (`memory-hybrid-retrieval.ts`) and
`memory-reranker.ts` implement a candidate → rerank → pack pipeline. The transferable core:

1. **Wide candidate gather.** Lexical + semantic hits are merged (`mergeHybridCandidates`,
   dedup by `category:node_id`, keep max score, union "reasons"). Each candidate keeps a
   `baseScore`, a `tokenKey` (token set of title+summary), a `relationKey` (entity/provider
   grouping for diversity), and a `signalScore`.
2. **Intent inference** (`memory-retrieval-intent.ts`): cheap keyword/phrase classifier maps
   the query into one of `fact_lookup | procedure_lookup | briefing | planning | delta`. No
   LLM. This intent steers all downstream weighting.
3. **Deterministic rerank** (`rerankMemoryCandidates`): adds intent-specific bonuses
   (query-overlap, recency, novelty, urgency, actionability, contradiction-risk, user-impact),
   a freshness adjustment (fresh/stable/stale × low/med/high bias), an optional neighbor bonus
   (candidates sharing a relationKey/tokenKey with a top-3 anchor), then a greedy selection
   loop that applies **category + relation penalties** so one source can't crowd out the set
   (coverage/diversity).
4. **LLM rerank** (`rerankMemoryCandidatesWithLlm`): the deterministic ranking is computed
   first, then its top **12** are shown to the model as a numbered shortlist (id, category,
   kind, freshness, title, summary). The model returns **strict JSON**: `ranked_ids` (reorder),
   per-item `assessments` (bucket: known_fact/high_signal/constraint/blocker/open_question,
   `requires_live_verification`, `reason`), and `recommended_next_source`. Output = LLM head +
   any un-ranked shortlist tail + deterministic tail. If the LLM returns nothing usable, it
   falls back to the deterministic order (`usedLlm:false`). 8s timeout.
5. **Pack + coverage/gaps**: final evidence is sliced to `max_evidence` (default 8, cap 20)
   and grouped into known_facts/high_signal/constraints/blockers/open_questions; coverage
   confidence is derived from the top score.

For our port we take items **1, 2, 3 (lite), 4**. We skip the integration/interaction tree
model, the full retrieval-pack structure, and the gap/coverage scaffolding — OpenBrain has no
"live source" to verify against, so `recommended_next_source` / `needs_live_verification` are
out of scope.

---

## What OpenBrain does today

`src/utils/recall.js` — `recall(params)`:

- **Embed once** (`recall.js:50-56`): `getEmbedding(query)` → 768-dim gemini-embedding-001
  vector; on failure delegates to `recallTextFallback` (ILIKE).
- **distilled_memory query** (`recall.js:62-126`): vector cosine `1 - (embedding <=> $1)`
  combined in SQL with a hand-tuned blend —
  `similarity*0.6 + confidence*time_decay*0.25 + recency_exp*0.1 + usage_log*0.05`
  (`recall.js:91-98`) — but the JS-side `score` pushed into results is recomputed as the
  simpler `similarity * confidence` (`recall.js:123`). Tenant isolation: `brand_id = $2`,
  `superseded_by IS NULL`, `embedding IS NOT NULL`, and user scoping
  `(user_id = $N OR user_id IS NULL)` (`recall.js:72-78`).
- **memories query** (`recall.js:129-175`): vector ORDER BY `embedding <=> $1`, `archived`/
  `deleted_at` guards, same brand+user scoping (`recall.js:140-144`), `confidence` fixed at
  1.0, `score = similarity * 1.0` (`recall.js:172`).
- **Merge** (`recall.js:177-179`): concat both arrays, `sort by score desc`, `slice(0, limit)`.
- **Side effect** (`recall.js:181-194`): bump `last_used`/`times_used` on returned distilled rows.

So today: fetch ~`limit` per table by vector → naive `similarity*confidence` merge → top
`limit`. No intent, no lexical overlap, no diversity, no freshness bias beyond the SQL decay.

(Note: the chat-context injection path in `src/engine/memory-augmenter.js:38` actually calls
`searchMemory` from `src/engine/memory-search.js`, a parallel retrieval over
`episodic_memories`/`semantic_knowledge`. This port targets `recall.js` as instructed; the
rerank stage is written as a standalone module so it can later be applied to `searchMemory`'s
output with zero changes. See "Future" note.)

---

## The delta to implement

A single optional **rerank stage** bolted onto `recall()`, gated by a flag. When OFF, behavior
is byte-identical to today.

### Flow when flag ON

1. **Over-fetch.** Multiply the per-table `LIMIT` by an over-fetch factor: fetch
   `N = max(limit, RERANK_FETCH_N)` (default **30**) candidates per source instead of `limit`.
   Same WHERE clauses — tenant isolation untouched. The existing merge still runs, producing a
   merged candidate array of up to ~`2N` rows.
2. **Intent inference (no LLM).** Port `inferMemoryRetrievalIntent(query)` verbatim to JS as a
   small pure helper. Returns one of the 5 intents.
3. **Deterministic pre-rank (lite).** For each merged candidate compute:
   - `tokenKey` = token set of `content` (we have no separate title/summary; use first ~200
     chars as the "summary" surface).
   - `signalScore` = ported `highSignalScore(content)`.
   - `freshnessState` from `lastUpdated`: `<= STALE_DAYS(45)` → `fresh`, else `stale`;
     distilled rows with very high confidence treated `stable`.
   - `baseScore` = the existing `recall` score (keep current math as the floor).
   - Add intent/recency/novelty/urgency bonuses + freshness adjustment (port the relevant
     scoring fns), then the greedy diversity loop with a **single** penalty axis: dedup by
     `source` (distilled vs memories) is too coarse, so use `relationKey = memoryType` to stop
     one memory_type from dominating. Keep this lite — it is a *pre-ranker* to pick the
     shortlist, not the final answer.
4. **Haiku LLM rerank.** Take the deterministic top **`RERANK_SHORTLIST` (default 12)**, build
   the strict-JSON prompt below, call **Haiku** via the existing client, parse `ranked_ids`,
   reorder (LLM head + unranked shortlist tail + deterministic tail), attach `llm_bucket`/
   `reason` onto each evidence's existing `reasoning` field (non-destructive). On timeout /
   parse-fail / any error → fall back to deterministic order. **Never throw out of `recall()`.**
5. **Slice to K.** Return `slice(0, limit)` (default **8**). Side-effect `last_used` bump runs
   on the *final* returned distilled ids (unchanged behavior, just different inputs).

### Haiku rerank prompt shape

Reuses `callClaude({ model: 'claude-haiku-4-5-20251001', ... })` (the `fast` tier id from
`model-router.js:9`). `max_tokens: 512`. No tools. System + one user message:

```
SYSTEM:
You rerank durable memory candidates for an assistant. Return STRICT JSON only:
{"ranked_ids":["id"],"assessments":[{"id":"id","bucket":"known_fact|high_signal|constraint|blocker|open_question|other","reason":"short"}]}
Rank most decision-relevant first for the given intent — not most similar wording.
- briefing: prioritize urgency, novelty, blockers, direct user impact.
- delta: prioritize changed/newly observed over old static facts.
- planning: prioritize owners, dependencies, blockers, deadlines, constraints.
- fact_lookup/procedure_lookup: prioritize specific, current, on-topic facts/steps.
Use each id at most once, only from the shortlist. Do not invent ids.

USER:
Query: <query>
Intent: <intent>

Candidates:
1. id: <id>
   type: <memoryType>  freshness: <fresh|stale|stable>  age_days: <n>
   content: <first 280 chars of content>
2. ...
```

JSON parse: strip code fences, `JSON.parse`, validate `ranked_ids` are known ids; if 0 valid →
deterministic fallback. (Mirror holaOS' guard at `memory-reranker.ts:545-558`.)

### Scoring / merge

- Deterministic `baseScore` = existing recall score (no regression to the floor).
- Final order = LLM `ranked_ids` order for the head; ties/unranked keep deterministic order.
- We do **not** overwrite the numeric `score` field with LLM output (LLM gives an ordering, not
  a calibrated scalar) — we reorder and annotate. This keeps the public `RecalledMemory.score`
  meaning stable for any downstream consumer.

### Freshness bias

Derived from intent (no new param): `delta`/`briefing` → `high`; `planning` → `medium`;
`fact_lookup`/`procedure_lookup` → `low`. Adjustment values ported from
`freshnessAdjustment` (`memory-reranker.ts:315-326`).

### Feature flag

- Env var: **`RECALL_RERANK`** — unset/`off` = current behavior; `on` = rerank stage active.
  (Matches the `OPENBRAIN_BRAIN` flag convention in CLAUDE.md.)
- Tunables (env, with defaults): `RECALL_RERANK_FETCH_N=30`, `RECALL_RERANK_SHORTLIST=12`,
  `RECALL_RERANK_STALE_DAYS=45`, `RECALL_RERANK_TIMEOUT_MS=8000`.

---

## File-by-file change list (kept small)

**1. New: `src/utils/recall-reranker.js`** (~180 LOC, the whole port lives here)
- `function inferIntent(query): string` — ported intent classifier.
- `function highSignalScore(text): number` — ported.
- `function deterministicPrerank({ query, intent, candidates, freshnessBias, staleDays }): RecalledMemory[]`
  — lite scoring + greedy diversity, returns reordered array.
- `async function rerankWithHaiku({ query, intent, candidates, shortlistN, timeoutMs }): Promise<RecalledMemory[]>`
  — builds prompt, calls `callClaude` (Haiku), parses JSON, reorders, annotates `reasoning`.
  Returns deterministic order on ANY failure.
- `async function applyRerank({ query, candidates, limit, env }): Promise<RecalledMemory[]>`
  — orchestrates prerank → Haiku → slice. The only export `recall.js` calls.
- `module.exports = { applyRerank, inferIntent, highSignalScore, deterministicPrerank }`.

**2. Edit: `src/utils/recall.js`** (~15 LOC delta)
- Top: `const RERANK_ON = process.env.RECALL_RERANK === 'on';` and read fetch-N/shortlist envs.
- In `recall()`: when `RERANK_ON`, set the per-table `LIMIT` to `fetchN` (lines `recall.js:108`
  and `recall.js:157`) instead of `limit`. (One `const effectiveLimit = RERANK_ON ? fetchN : limit;`.)
- Replace the merge/slice block (`recall.js:177-179`) with:
  ```js
  let topResults;
  if (RERANK_ON && results.length > limit) {
    topResults = await require('./recall-reranker').applyRerank({ query, candidates: results, limit });
  } else {
    results.sort((a, b) => b.score - a.score);
    topResults = results.slice(0, limit);
  }
  ```
- The `last_used` bump (`recall.js:181-194`) stays as-is; it operates on `topResults`.
- No change to tenant WHERE clauses, fallback path, or `recallTextFallback`.

**3. New tests: `tests/unit/recall-reranker.test.js`**
- intent inference cases (one per intent), `highSignalScore` thresholds, deterministic
  diversity (no single memoryType dominates), Haiku-failure → deterministic fallback (mock
  `callClaude` to throw and to return garbage JSON), flag-off identity.
- Add to the existing `npm run pre-deploy` gate (no new runner).

**No DB migration. No schema change. No new dependency.** `callClaude` and `getEmbedding`
already exist.

---

## A/B test plan

**What we compare:** rerank-ON vs rerank-OFF *ordering quality* of `recall()` for the same
query set, holding the candidate pool fixed.

**Mechanism (offline, no prod risk):**
1. Build a fixed eval set of ~30 real (brand_id, user_id, query, expected-relevant-memory-ids)
   tuples from Lucy chat history where we know which memory *should* have surfaced.
2. Run `recall()` twice per query — flag off, then on — against the same DB snapshot.
3. **Metric: nDCG@8 and Recall@8** of the expected ids against each ordering. Secondary:
   "blocker/constraint surfaced in top-3" hit-rate (the qualitative win holaOS targets), and
   p50/p95 added latency from the Haiku call.
4. Ship a tiny harness `scripts/eval-rerank.js` (reads the tuple file, prints a comparison
   table). Not part of the deploy gate.

**Online flagging:** deploy with `RECALL_RERANK` unset to Lucy first (zero behavior change),
then flip `RECALL_RERANK=on` on **Lucy only** and soak ≥1 week (per `feedback_lucy_first_ruhi_safe.md`).
Log `usedLlm`, intent, and added-latency per recall behind a `[Recall][rerank]` tag for spot
auditing. Promote to `ruhi-os-brain` only with V's explicit approval.

```bash
# enable on Lucy
~/.fly/bin/flyctl secrets set RECALL_RERANK=on --app ikawn-openbrain
# instant rollback
~/.fly/bin/flyctl secrets unset RECALL_RERANK --app ikawn-openbrain
```

---

## Risks & rollback

| Risk | Mitigation |
|------|------------|
| Extra Haiku call adds latency (~300-800ms) | Flag-gated; 8s hard timeout; deterministic fallback on timeout so recall never blocks |
| Token spend ($10-burn history) | **Haiku only** (`fast` tier, $0.80/$4 per M). Shortlist capped at 12 candidates × ~280 chars ≈ <1.5k input tok, 512 output → ≈ $0.001/recall. No Sonnet/Opus path. Background/cheap-task rule honored. |
| LLM returns bad/empty JSON | Strict parse + id-validation; 0 valid ids → deterministic order (`usedLlm:false`) |
| Tenant leak via reranker | Reranker is post-filter only — it reorders an already brand/user-scoped candidate set; it never queries the DB. Isolation stays entirely in `recall.js` SQL. |
| Over-fetch (30/table) slows the vector query | Marginal — same index, larger LIMIT. Measure in A/B; lower `RECALL_RERANK_FETCH_N` if p95 regresses |
| Behavior drift on Ruhi SaaS | Never enabled on `ruhi-os-brain` without V approval; Lucy soak ≥1 week first |

**Rollback:** `flyctl secrets unset RECALL_RERANK` → instant return to current code path
(the new module is simply not invoked). No data migration to reverse.

---

## Effort estimate

- `recall-reranker.js` (port + adapt holaOS scoring/prompt/parse): **~4-5 hr**
- `recall.js` wiring + env flags: **~0.5 hr**
- Unit tests + fallback coverage: **~1.5 hr**
- `scripts/eval-rerank.js` + tuple eval set from Lucy history: **~2 hr**
- Deploy to Lucy, flip flag, soak monitoring setup: **~0.5 hr**

**Total: ~1 focused day (8-9 hr).** Lucy-only, flag-gated, no schema change, no new deps.

---

## Future (out of scope, noted only)

`memory-augmenter.js` injects context via `searchMemory` (`memory-search.js`), not `recall()`.
Because `applyRerank` takes a plain candidate array, the same module can later rerank
`searchMemory`'s output by adapting its rows to `{ id, content, memoryType, lastUpdated, score }`.
Deferred — this plan ships the `recall.js` path first.
