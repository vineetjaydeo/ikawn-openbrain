# Lucy Long-Horizon Reliability: Compaction-on-Snapshot, learned from holaOS

Status: design writeup / brainstorm input. No code. Resume aid for the paused
"Lucy Long-Horizon Reliability" brainstorm.
Date: 2026-06-03.

Reference source: holaOS @ `runtime/api-server/src/session-checkpoint.ts` (1454 lines),
caller `runtime/api-server/src/claimed-input-executor.ts`.

---

## 1. The problem (Lucy long-horizon drift)

When Lucy runs a long autonomous task sequence (many reasoning turns, many tool calls,
large tool outputs), her conversation context grows until it either overflows the model
window or, worse, dilutes the signal so badly that she loses the thread — forgets earlier
decisions, repeats work, contradicts herself. The naive fix (summarize the old part of the
conversation and splice the summary back in) is *destructive and racy*: it mutates the live
message array in place, it can run while the agent is mid-turn, and a bad/empty summary
silently throws away history with no way to detect that the live session has moved on since
the summary was computed. Lucy needs compaction that (a) reserves headroom *before* the
window is full, (b) never corrupts the live session, and (c) is safe to run asynchronously.

---

## 2. holaOS's snapshot-compaction mechanism, step by step

holaOS treats the agent's conversation as an **append-only branch of entries** managed by a
`SessionManager` over a `.jsonl` session file. Each entry has an `id`; the tip is the
`leafId`. Compaction does not delete entries — it appends a special **compaction entry**
that says "summary S replaces everything before entry `firstKeptEntryId`." The assembler
later reads from the latest compaction forward. This is the same shape OpenBrain's v2 already
has (a `compaction_boundary` item — see §4), which is why holaOS maps cleanly.

### 2a. The 70% threshold (when it triggers)

`session-checkpoint.ts:17`
```
const PI_COMPACTION_USAGE_THRESHOLD_RATIO = 0.7;
```
`sessionCheckpointThresholdTokens(contextWindow)` (line 487) returns
`floor(contextWindow * 0.7)`. `shouldQueueSessionCheckpoint()` (line 534) fires when
`effectiveSessionTokens > thresholdTokens`. So compaction is *recommended at 70% of the
model's context window* — i.e. roughly the bottom 30% of the window is held back as
headroom so the next turn's fresh reasoning + tool results still fit. (It is a usage trigger,
not a hard "reserve 70% for reasoning" split; the practical effect is ~30% headroom reserved
above the compaction line.)

### 2b. Two trigger paths

holaOS runs compaction in two places, both in `claimed-input-executor.ts`:

1. **Post-run, asynchronous (the common case).** After a turn finishes, if usage crossed
   70%, `enqueueSessionCheckpointJob()` (line 685) enqueues a `session_checkpoint`
   background job (priority 10) keyed by an idempotency key
   `session_checkpoint:{sessionId}:{harnessSessionFile}:{leafId}` (line 717) so the same
   checkpoint is never queued twice. The job is processed later by
   `processSessionCheckpointJob()` (line 1290) — off the critical path, so the user's turn
   is never blocked by summarization.

2. **Pre-run, synchronous (overflow guard).** Before dispatching the *next* turn,
   `evaluatePreRunSessionCompaction()` (line 555) projects
   `currentSessionTokens + estimatedRequestTokens` against the target model's window. If the
   decision is `would_overflow` or `threshold_exceeded`, it calls
   `forceCompactSessionWithSnapshotMerge()` *inline* (claimed-input-executor.ts:5087) and
   re-evaluates. If even after compaction the prompt still won't fit and there is no
   snapshot to compact, it throws `SessionResetRequiredError` (line 5078) rather than send a
   doomed request. This path also handles **model downshift** (switching to a
   smaller-window model mid-session): the new, smaller window can put an already-fine session
   over threshold, and the pre-run check catches that.

### 2c. Snapshot → compact → guarded merge (the core, `forceCompactSessionWithSnapshotMerge`, line 1143)

This is the heart of the design. It runs under a per-session in-process lock
(`withSessionCompactionLock`, line 1107, keyed `{workspaceId}:{sessionId}`) so two
compactions can't race on one session.

1. **Snapshot.** Copy the live session file to a throwaway path
   `…​.checkpoint-{uuid}.jsonl` (`snapshotSessionPath`, line 773; `fs.copyFileSync`,
   line 1188). All expensive work happens on this *copy*, never the live file.
2. **Compact the copy.** Spawn the harness host subprocess `compact-pi-session`
   (`runPiSessionCompaction`, line 803) against the snapshot with `force_compaction: true`.
   The subprocess produces an LLM summary and writes a compaction entry into the snapshot.
   The result carries `firstKeptEntryId`, `tokensBefore`, the `summary`, and diagnostics
   (`PiCompactionCommandResult`, line 38).
3. **Re-check the live session still matches (drift guard — see §3).** Before touching the
   live file, verify three things:
   - the live binding still points at the same harness session file
     (`binding_changed` → abort, line 1220);
   - the live file still exists (`session_missing` → abort, line 1231);
   - `canMergeCheckpointIntoLiveSession()` (line 970) still returns true — i.e. the
     `baseLeafId` captured at snapshot time is still present in the live branch **and** the
     live branch's latest compaction id is unchanged (`merge_guard_failed` → abort,
     line 1242).
4. **Merge back, append-only.** If the guard passes, `appendSnapshotCompactionToLiveSession()`
   (line 988) reads the compaction entry computed on the snapshot and *appends an equivalent
   compaction entry onto the live branch* via `liveSession.appendCompaction(...)`
   (line 1010), but only after re-confirming `firstKeptEntryId` is actually present in the
   live branch (line 1000). It never rewrites existing entries; it just adds the boundary.
5. **Clean up.** The snapshot file is always deleted in a `finally` (line 1284).

Every outcome is recorded as a typed `SessionCheckpointResultOutcome` (line 47):
`merged`, `merged_without_boundary`, `binding_changed`, `session_missing`,
`merge_guard_failed`, `merge_failed`, `not_compacted`, `skipped_below_threshold`,
`deferred_busy`, `soft_provider_422`, `error`. Note `deferred_busy` (line 1323): if the
session is `BUSY` (agent mid-turn) the job throws to requeue rather than merge into a moving
session. And a provider 422 during summarization is treated as a *soft* failure
(`soft_provider_422`, line 955) — logged as a warning, the live session left untouched — not
a hard error.

### 2d. Data structures that hold the checkpoint

- **`SessionCheckpointJobPayload`** (line 28): the durable queued record — `harness`,
  `base_harness_session_id` (the live file path), `base_session_fingerprint` (sha256 of the
  file at queue time, line 291), `base_leaf_id`, `base_latest_compaction_id`,
  `context_usage`, `effective_session_tokens`. The leaf id + latest compaction id are the
  "what the session looked like when I decided to compact" stamp that the merge guard checks
  against.
- **`PiCompactionBranchEntry`** (line 85): the in-file compaction entry —
  `summary`, `firstKeptEntryId`, `tokensBefore`, `details`, `fromHook`. This is what gets
  copied from snapshot to live.
- **`SessionCheckpointSessionOps`** (line 118): the three injectable primitives —
  `currentLeafCheckpointState`, `canMergeCheckpointIntoLiveSession`,
  `appendSnapshotCompactionToLiveSession` — which makes the whole thing unit-testable with
  fakes.
- **`SessionCheckpointCompactionRecord`** (line 70) / `checkpoint_result` payload
  (line 511): the telemetry written back onto the job for observability.

---

## 3. The key insight: why "merge-back only if the live session still matches" avoids drift

Summarization is slow (an LLM call). During that time the live agent may keep running and
append new turns. If you summarized the conversation as it was at T0 and then blindly spliced
that summary in at T1, you would either drop the turns that happened in (T0, T1] or stitch a
stale summary onto a branch it no longer describes — silent context corruption, exactly the
"loses the thread" failure.

holaOS avoids this by computing the summary on an immutable **snapshot** and treating the
live session as the source of truth that must be *re-validated* at merge time. The
`baseLeafId` + `baseLatestCompactionId` captured at snapshot time are a cheap optimistic-
concurrency token. At merge, `canMergeCheckpointIntoLiveSession()` asks: "is the leaf I
snapshotted still in the live branch, and is the live branch's latest compaction still the
one I based on?" If yes, nothing destructive happened in the gap and the append is safe. If
no, the merge is **abandoned** (`merge_guard_failed`) and the live session is left completely
untouched — the wasted summary is cheap; corrupting the thread is not. Because the merge is
append-only (add a boundary, never rewrite), even a successful merge can't lose an entry. The
worst case is "we did a summary and threw it away," never "we damaged Lucy's memory of the
task." That asymmetry — costly-but-safe failure vs. cheap-but-corrupting failure — is the
whole point.

---

## 4. What OpenBrain does today for context growth (honest assessment)

OpenBrain has a **dual brain** (`CLAUDE.md` → "OPENBRAIN_BRAIN flag"): v1 is the production
reasoning loop in `src/engine/reasoning-loop.js` + `src/routes/chat-api.js`; v2 is the
`packages/agent-api/` TurnEngine, gated behind `OPENBRAIN_BRAIN=v2`, soaking on Lucy.

### v1 — the production path

- **`src/engine/reasoning-loop.js`** (the loop, max 8 iterations) does **no compaction at
  all.** It grows `messages` in place every turn (`messages.push(...)`, lines 381 & 491) and
  never measures or trims context. Its only long-horizon controls are: a Jaccard
  word-overlap **convergence check** that bails after turn 6 if recent turns are ~85% similar
  (`checkConvergence`, line 50), a `maxIterations` cap (default 8), a dollar budget cap, and
  a wall-clock timeout. None of these manage context *size* — they just stop the loop.
- **`src/routes/chat-api.js`** does compaction *outside and before* the loop. At line 681 it
  calls `compressContext(openaiMessages, { keepRecent: 8 })` from
  **`src/utils/context-compressor.js`** once, on the message array it's about to hand to the
  loop. That compressor:
  - triggers at a flat **40 000-token** threshold (`DEFAULT_THRESHOLD`,
    `utils/context-compressor.js:7`), *not* a fraction of the model window;
  - keeps the last 8 messages verbatim, concatenates everything older into text, and asks
    Haiku for a summary, then **replaces** the old messages with one summary message
    (destructive, in place);
  - is **debounced by a 1-hour `compressed_at` timestamp** on the conversation row
    (chat-api.js:677), so within an hour of a compaction it skips entirely.

  This is the naive splice: no snapshot, no drift guard, no append-only boundary. It is
  synchronous on the user's request path, and because it mutates the array it hands to the
  loop, an in-flight or concurrent turn on the same conversation has no protection.

- **`src/engine/context-compressor.js`** is a *second, better-structured* compressor
  (`compressMessages`, 70% threshold of a 150k limit, preserves recent tool_results and
  working memory, returns a non-mutating result object). **It is dead code — grep shows it is
  imported nowhere.** Only the cruder `utils` one is wired.

### v2 — the TurnEngine

- `packages/agent-api/src/engine/runState.js:11` lists `compaction_boundary` as a valid run-
  state item type, and **`ContextAssembler.js` already reads it**: `_historySinceLastBoundary`
  (line 123) slices history to start at the most recent `compaction_boundary`, and
  `_itemToMessage` (line 139) renders a boundary as a `system` "Earlier conversation summary"
  message. The assembler also computes a token budget and **sheds injected lessons** to stay
  under `config.inputTokenBudget` (line 53), but it does **not** trim or compact actual
  conversation history — if history alone exceeds budget it just logs.
- Crucially: **nothing in v2 ever *writes* a `compaction_boundary`.** grep finds only readers
  and the enum entry — no `appendCompaction`, no compaction job, no summarizer. The boundary
  mechanism is a wired socket with no plug.

**Bottom line:** v1 has a naive, destructive, synchronous compressor on the request path and
a strictly-better unused one sitting next to it. v2 has the *read* half of a boundary-based
compaction system already built but no writer, no snapshot, and no drift guard. There is no
"reserve headroom at 70% of the model window," no async checkpoint, and no merge-back safety
anywhere.

---

## 5. The gap, and how holaOS's approach slots in

The gap is precisely the three things holaOS has and OpenBrain lacks: **(1) a window-relative
70% headroom trigger, (2) summarize-on-an-immutable-snapshot, (3) append-only merge guarded
by an optimistic-concurrency token.** Mapping:

### Into v2 (the natural home — recommended)

v2 is the better fit because its run-state is *already* an append-only item list with a
`compaction_boundary` type that the assembler reads. holaOS's session-as-append-only-branch
maps almost 1:1.

- **Trigger.** Port `sessionCheckpointThresholdTokens` / `shouldQueueSessionCheckpoint`:
  after each turn, compare `estimatedInputTokens` (ContextAssembler already computes this,
  line 82) against `0.7 * modelContextWindow` for the active model. Replace OpenBrain's flat
  40k threshold with this window-relative one.
- **Snapshot.** OpenBrain stores run-state in Postgres (`PgSession`), not a `.jsonl` file, so
  the "snapshot" is *read the item list up to the current leaf into memory* and stamp the
  current tip id + latest-boundary id — the analog of `baseLeafId` /
  `baseLatestCompactionId`. Summarize the items before the chosen `firstKeptItemId` (reuse
  the dead `engine/context-compressor.js` summarizer, which already preserves tool_results +
  working memory).
- **Guarded merge.** Before writing the boundary, re-read the live run-state and verify the
  stamped tip/boundary are unchanged (the Postgres equivalent of
  `canMergeCheckpointIntoLiveSession`). If unchanged, append a new `compaction_boundary` item
  (the writer that's missing today). If changed, discard the summary — append-only means a
  successful write can never lose an item, and a discarded one costs only an LLM call. A row
  version / `updated_at` / `xmin` check, or a conditional `INSERT … WHERE tip_id = $stamped`,
  gives the optimistic-concurrency guard cheaply.
- **Async vs. inline.** OpenBrain has no Fly-job queue and a hard "never add Redis" rule, but
  it does have background workers (e.g. `embedding-worker`, scheduler). The post-run
  checkpoint can run as fire-and-forget after `res.json()` is sent — except note the standing
  rule "Fly kills async work after `res.json()`" (CLAUDE.md), so the safe pattern is either
  (a) do it *before* responding when over a hard ceiling (holaOS's pre-run overflow path), or
  (b) run it on the next turn / a worker tick. The drift guard is what makes deferring safe.

### Into v1 (tactical, if v2 cutover slips)

Don't rewrite the loop. Two surgical moves: first, **swap the wired
`utils/context-compressor` for the dead `engine/context-compressor`** (70%-of-150k,
non-mutating, tool-result-preserving) — strictly better with near-zero risk. Second, make
the trigger **window-relative** instead of flat 40k. Full snapshot/merge-guard machinery is
hard in v1 because the loop mutates one shared `messages` array with no leaf ids; the most
v1 can cheaply gain is "compute the summary, but only swap it in if the array length / tail
hash hasn't changed since you started" — a poor-man's merge guard.

---

## 6. Open questions for V (to resume the brainstorm)

1. **v1 or v2 as the target?** holaOS's design wants append-only entries with ids — that's
   v2's run-state, not v1's flat array. Do we invest the compaction work in v2 (and let it
   double as a reason to finish the v2 cutover), accept the weaker tactical v1 fix, or both
   (cheap v1 swap now, real design in v2)?
2. **What is "the window"?** holaOS keys 70% off the *selected model's* context window and
   even handles mid-session model downshift. OpenBrain's model-router can pick different
   tiers per turn. Do we compact relative to the smallest model Lucy might downshift to, the
   current model, or a fixed conservative window?
3. **Async without a queue.** holaOS leans on a durable post-run job queue (priority +
   idempotency key). Given "never add Redis" and "Fly kills work after res.json()", what's
   the OpenBrain substrate — a Postgres-backed `compaction_jobs` table polled by an existing
   worker, inline pre-run only, or next-turn lazy compaction? The idempotency-key idea ports
   to a Postgres unique constraint regardless.
4. **Optimistic-concurrency token in Postgres.** What's the cheapest correct stamp for
   "session unchanged since snapshot" — a monotonic run-state sequence number, the last item
   id, `xmin`, or a conditional insert? This is the single most important detail to get right;
   it's what makes deferred compaction safe.
5. **Reset-required behavior.** holaOS throws `SessionResetRequiredError` when even compaction
   can't make the next prompt fit. What should Lucy do at that wall — hard-summarize
   aggressively, spawn a fresh sub-session seeded with the summary, or surface "starting
   fresh" to the user? (Relevant to the paused brainstorm's "cutover I/II/III" question.)
6. **Summary quality bar.** holaOS treats a provider 422 during summarization as a *soft*
   failure and leaves the session untouched. What's our fallback when the Haiku summary is
   empty/garbage — keep raw history and retry next turn, or downgrade gracefully? (The dead
   `engine/context-compressor.js` already returns `unchanged` on failure, which is the right
   instinct.)
