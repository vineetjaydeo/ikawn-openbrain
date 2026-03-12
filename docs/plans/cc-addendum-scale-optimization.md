# Addendum: Scale, TypeScript, and LLM Optimization

Add this to the existing CC instructions. These apply across all phases.

---

## TypeScript Decision

**Add TypeScript to the project before starting Phase 1.**

Migration approach (minimal disruption):

1. Add dependencies: `typescript`, `tsx` (for dev), `@types/node`
2. Add `tsconfig.json` with `allowJs: true`, `strict: true`, `outDir: ./dist`
3. Existing .js files stay as .js -- they work under allowJs
4. ALL new files for the intelligence/governance layer are written in .ts
5. Add build script to package.json: `"build": "tsc"`
6. Dev runs via `tsx` (no build step needed during development)
7. Production runs compiled JS from `dist/`

This means:
- Zero changes to existing code
- New code gets full type safety
- Gradual migration of existing files as they're touched
- No risk of breaking existing functionality

Type the key interfaces properly. Especially:
- Memory event payloads (discriminated union on event_type)
- Distilled memory types (discriminated union on memory_type)
- Recall params and results
- Governance action params and state transitions
- LLM response parsing (the most common runtime error source)

---

## Database Scaling Considerations

The current float8[] + cosine_similarity() approach works for now but has a hard ceiling. Design with these constraints in mind:

**1. Partition awareness in recall():**

recall() must ALWAYS filter by user_id and/or brand_id BEFORE computing similarity. Never scan the full distilled_memory table.

```sql
-- CORRECT: filtered first, similarity on subset
SELECT * FROM distilled_memory
WHERE user_id = $1
  AND brand_id = $2
  AND superseded_by IS NULL
ORDER BY cosine_similarity(embedding, $3) * confidence DESC
LIMIT 10;

-- WRONG: similarity scan across all rows
SELECT * FROM distilled_memory
ORDER BY cosine_similarity(embedding, $1) * confidence DESC
LIMIT 10;
```

**2. Add composite indexes that support filtered similarity:**

```sql
CREATE INDEX IF NOT EXISTS idx_distilled_active_user_brand
  ON distilled_memory (user_id, brand_id)
  WHERE superseded_by IS NULL;
```

This lets Postgres filter to a small rowset before the similarity function runs.

**3. Connection pooling:**

Ensure the database connection uses pooling (pg Pool, not individual Client connections). At thousands of I/O per second, connection exhaustion is the first thing that breaks.

If not already using it, add:
```javascript
const pool = new Pool({
  max: 20, // or match Fly.io's connection limit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});
```

---

## LLM Token Optimization (Apply to ALL prompts)

### Rule 1: Minimal JSON in prompts

When sending events to LLM for reflection, strip unnecessary fields. Send only what the LLM needs to identify patterns.

```javascript
// WRONG: sending full event payload
const events = rawEvents.map(e => e.payload); // includes timestamps, IDs, metadata

// CORRECT: send only pattern-relevant fields
const events = rawEvents.map(e => ({
  original: e.payload.original,
  edited: e.payload.edited,
  // skip: id, user_id, brand_id, created_at, processed_at, etc.
}));
```

### Rule 2: Pre-aggregate before LLM calls

For outcome reflection, don't send 15 raw post objects. Pre-compute summaries:

```javascript
// Instead of sending 15 full post payloads, send:
const summary = {
  totalPosts: 15,
  byType: {
    reel: { count: 8, avgLikes: 156, avgSaves: 34 },
    static: { count: 5, avgLikes: 42, avgSaves: 8 },
    carousel: { count: 2, avgLikes: 89, avgSaves: 19 }
  },
  topPerformer: { type: 'reel', style: 'lifestyle', likes: 312, saves: 67 },
  bottomPerformer: { type: 'static', style: 'product', likes: 21, saves: 2 }
};
```

This cuts token usage by 70-80% and often produces BETTER insights because the LLM sees the pattern directly.

### Rule 3: Compressed memory injection for generation

When recall() returns 10-15 memories for generation context, don't inject all of them raw. Compress into a rules block:

```javascript
// Instead of injecting 15 memory objects (~2000 tokens):
const memoryBlock = memories.map(m =>
  `[${m.memoryType}] (confidence: ${m.confidence}): ${m.content}`
).join('\n');

// Compress to a concise rules block (~400 tokens):
const voiceRules = memories
  .filter(m => m.memoryType === 'BRAND_VOICE_RULE' && m.confidence > 0.6)
  .map(m => `- ${m.content}`)
  .join('\n');

const contentInsights = memories
  .filter(m => ['CREATIVE_PATTERN', 'CONTENT_STRATEGY'].includes(m.memoryType))
  .map(m => `- ${m.content}`)
  .join('\n');

const systemContext = `
BRAND VOICE RULES (follow these):
${voiceRules || 'None learned yet.'}

CONTENT INSIGHTS (consider these):
${contentInsights || 'None learned yet.'}
`;
```

Track memoriesUsed from the full recall result (all 15 IDs), but inject the compressed version into the prompt.

### Rule 4: Per-prompt-type model routing

Not every LLM call needs the same model. Configure per prompt type:

```javascript
const MODEL_ROUTING = {
  edit_delta_distillation: 'haiku',     // pattern matching, cheapest
  event_distillation: 'haiku',          // pattern matching
  outcome_reflection: 'haiku',          // data analysis
  strategic_rollup: 'sonnet',           // synthesis, worth the upgrade
  research_distillation: 'haiku',       // extraction
  product_reflection: 'sonnet',         // strategic thinking
  session_summary: 'haiku',             // compression
  content_generation: 'sonnet',         // client-facing output quality matters
};
```

Store in config, not hardcoded. Env var override: `LLM_MODEL_OVERRIDE=sonnet` forces all calls to one model (useful for testing).

### Rule 5: Token counting before LLM calls

Before every LLM call, estimate token count. If it exceeds the model's context window minus 2000 (for output), truncate the input.

Use a lightweight tokenizer estimate: ~4 chars per token for English text.

```javascript
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

const MAX_INPUT_TOKENS = {
  haiku: 180000,   // 200k context, save 20k for output
  sonnet: 180000,
};

function truncateToTokenBudget(text, model) {
  const maxChars = MAX_INPUT_TOKENS[model] * 4;
  if (text.length > maxChars) {
    return text.slice(0, maxChars) + '\n[TRUNCATED]';
  }
  return text;
}
```

---

## Worker Scaling Design

Design workers so parallelism is a config change, not a rewrite.

```javascript
// Current (sequential, fine for 2 brands):
for (const brand of brands) {
  await processDistillation(brand);
}

// Future-ready (parallel with concurrency limit):
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '1');

async function processInParallel(brands, processor) {
  const chunks = [];
  for (let i = 0; i < brands.length; i += CONCURRENCY) {
    chunks.push(brands.slice(i, i + CONCURRENCY));
  }
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(processor));
  }
}
```

Default concurrency = 1 (sequential). Change to 5 when you have 20+ brands. No code changes needed.

---

## Cost Guardrails (Repeat for emphasis)

These are non-negotiable. Build into shared worker infrastructure BEFORE any worker goes live.

```javascript
const COST_LIMITS = {
  maxLlmCallsPerWorkerRun: 20,
  maxDailyCostDollars: 5,
  maxConsecutiveFailures: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
};
```

1. **Per-run cap**: After 20 LLM calls in a single worker run, stop and log. Resume next run.
2. **Daily cost ceiling**: Track cumulative LLM calls per day. If estimated cost exceeds $5, pause all workers. Log alert.
3. **Circuit breaker**: If a worker fails 3 consecutive runs, auto-disable. Require manual re-enable.
4. **429 backoff**: Exponential backoff on rate limits. 1s → 2s → 4s → 8s → max 30s. After 3 retries, skip batch.
5. **Dead letter logging**: Any batch that fails 3 times gets logged to a `worker_failures` table with full context for debugging. Events stay unprocessed for manual review.

---

## Summary

These optimizations don't change the architecture. They make it production-grade:

| Concern | Solution |
|---|---|
| Type safety at scale | TypeScript for all new files, gradual migration |
| Database query scaling | Always filter before similarity, composite indexes |
| LLM cost at scale | Pre-aggregate, compress memory injection, per-prompt model routing |
| Worker scaling | Configurable concurrency, default sequential |
| Cost protection | Hard caps, circuit breakers, daily ceiling |
| Connection management | Pool with proper limits |
