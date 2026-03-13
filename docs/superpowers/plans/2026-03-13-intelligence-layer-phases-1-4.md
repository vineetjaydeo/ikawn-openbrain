# Intelligence Layer (Phases 1-4) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Memory Intelligence & Self-Learning layer to OpenBrain — events flow in, get distilled into knowledge by background workers, and are recalled during generation to improve output quality over time.

**Architecture:** New tables (`memory_events`, `distilled_memory`, `session_summaries`, `learning_velocity`) live alongside existing `memories` table. `captureEditDelta()` dual-writes to both `edit_deltas` (existing mothership pipeline) and `memory_events` (new distillation pipeline). A daily distillation worker processes events via Anthropic Claude into structured knowledge. `recall()` queries both `memories` and `distilled_memory`, merging results by weighted score. `generateWithMemory()` wraps any generation call with recalled knowledge injection.

**Tech Stack:** Node.js (CommonJS), Express, raw SQL (pg Pool), Anthropic SDK (intelligence), OpenAI SDK (embeddings only), JSDoc + `@ts-check` for type safety.

**Key decisions:**
- `VECTOR(1536)` → `float8[]` + existing `cosine_similarity()` PL/pgSQL function
- No `worker_locks` table — in-memory flags (single Fly machine)
- Anthropic Haiku for distillation/reflection, Sonnet for strategy/synthesis
- OpenAI `text-embedding-3-small` for all embeddings (unchanged)
- `recall()` queries both `memories` + `distilled_memory`, configurable via `source` param
- All new files use `// @ts-check` + JSDoc, no build pipeline changes

---

## Chunk 1: Schema + Shared Infrastructure

### Task 1: Database Schema — New Tables

**Files:**
- Modify: `src/db.js:442` (before `console.log('Database schema initialized')`)

**Context:** OpenBrain uses `initSchema()` in `src/db.js` with raw `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements. No migration files. All idempotent. Match this pattern exactly.

- [ ] **Step 1: Read existing db.js to confirm insertion point**

Verify line 442 is `console.log('Database schema initialized (v3)');` — insert new tables BEFORE this line.

- [ ] **Step 2: Add memory_events table**

```javascript
    // ── OpenBrain v5: Intelligence Layer ──

    // memory_events — raw event inbox (append-only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_events_brand_type_created
        ON memory_events (brand_id, event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_events_unprocessed
        ON memory_events (created_at) WHERE processed_at IS NULL;
    `);
```

Note: The original plan uses `user_id UUID`. OpenBrain doesn't have per-user UUIDs — it uses `brand_id VARCHAR(100)` everywhere. Adapt to match existing pattern. brand_id is the tenant key.

- [ ] **Step 3: Add distilled_memory table**

```javascript
    // distilled_memory — learned knowledge with reasoning and embeddings
    await client.query(`
      CREATE TABLE IF NOT EXISTS distilled_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence FLOAT NOT NULL DEFAULT 0.5,
        source_event_ids UUID[] DEFAULT '{}',
        reasoning TEXT,
        superseded_by UUID REFERENCES distilled_memory(id),
        embedding float8[],
        embedding_status VARCHAR(20) DEFAULT 'pending',
        last_used TIMESTAMPTZ,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_distilled_brand_type
        ON distilled_memory (brand_id, memory_type);
      CREATE INDEX IF NOT EXISTS idx_distilled_active_brand
        ON distilled_memory (brand_id)
        WHERE superseded_by IS NULL;
    `);
```

Note: `VECTOR(1536)` → `float8[]` per decision. `embedding_status` follows the existing pattern from `memories` table so the existing embedding worker can process these too.

- [ ] **Step 4: Add session_summaries table**

```javascript
    // session_summaries — compressed conversation history
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL UNIQUE,
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        summary TEXT NOT NULL,
        key_decisions JSONB DEFAULT '[]',
        open_threads JSONB DEFAULT '[]',
        embedding float8[],
        embedding_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
```

- [ ] **Step 5: Add learning_velocity table**

```javascript
    // learning_velocity — metrics tracking improvement over time
    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_velocity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        metric_type TEXT NOT NULL,
        metric_value FLOAT NOT NULL,
        measured_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_velocity_brand
        ON learning_velocity (brand_id, metric_type, measured_at);
    `);
```

- [ ] **Step 6: Run app locally to verify schema creates without errors**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "require('./src/db').initSchema().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"`

Expected: `Database schema initialized (v3)` then `OK` with no errors.

Note: This requires `DATABASE_URL` env var. If not available locally, verify by reading the SQL carefully and confirming all column types match existing patterns.

- [ ] **Step 7: Commit**

```bash
git add src/db.js
git commit -m "feat: add intelligence layer schema (memory_events, distilled_memory, session_summaries, learning_velocity)"
```

---

### Task 2: Anthropic LLM Client + Model Routing

**Files:**
- Modify: `src/utils/llm.js` (add Anthropic client and `callReflectionLLM`)

**Context:** `src/utils/llm.js` currently exports `streamChat`, `chatCompletion` using OpenAI only. The Anthropic SDK (`@anthropic-ai/sdk`) is already in `package.json`. Add the Anthropic client alongside OpenAI — do NOT remove or modify existing OpenAI functions.

- [ ] **Step 1: Add model routing config and Anthropic client to llm.js**

Append after the existing `module.exports` block at line 96 (replace the existing `module.exports` with an expanded one). Add:

```javascript
// @ts-check

const Anthropic = require('@anthropic-ai/sdk');

/** @type {import('@anthropic-ai/sdk').default | null} */
let _anthropicClient = null;

function getAnthropicClient() {
  if (!_anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

/**
 * Model routing config. Each prompt type maps to a provider + model.
 * Change a model by updating this config — no code changes needed.
 * Override all with LLM_MODEL_OVERRIDE env var (for testing).
 */
const MODEL_ROUTING = {
  edit_delta_distillation: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  event_distillation:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  outcome_reflection:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  session_summary:         { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  research_distillation:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  strategic_rollup:        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  product_reflection:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  content_generation:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
};

/**
 * Call LLM for reflection/distillation tasks. Routes to correct provider via MODEL_ROUTING.
 * Returns parsed text content. Handles JSON extraction safety.
 *
 * @param {keyof typeof MODEL_ROUTING} promptType - Key from MODEL_ROUTING
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User content to analyze
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<string>} Raw text response from LLM
 */
async function callReflectionLLM(promptType, systemPrompt, userPrompt, opts = {}) {
  const override = process.env.LLM_MODEL_OVERRIDE;
  const routing = MODEL_ROUTING[promptType];
  if (!routing) {
    throw new Error(`Unknown prompt type: ${promptType}`);
  }

  const provider = override ? 'anthropic' : routing.provider;
  const model = override || routing.model;
  const maxTokens = opts.maxTokens || 4096;

  if (provider === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  // Fallback to OpenAI (if routing ever points there)
  const message = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { model }
  );
  return message.content || '';
}

/**
 * Parse JSON from LLM response. Strips markdown fences, handles trailing commas.
 * Returns null on failure (caller decides whether to retry or skip).
 *
 * @param {string} text - Raw LLM response
 * @returns {any | null} Parsed JSON or null
 */
function parseJSONSafe(text) {
  if (!text) return null;
  // Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  // Fix trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Try to find JSON array or object within text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0].replace(/,\s*([}\]])/g, '$1'));
      } catch (__) {}
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0].replace(/,\s*([}\]])/g, '$1'));
      } catch (__) {}
    }
    return null;
  }
}

/**
 * Estimate token count for budget checking. ~4 chars per token for English.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}
```

Update `module.exports` to include new exports:

```javascript
module.exports = {
  streamChat,
  chatCompletion,
  callReflectionLLM,
  parseJSONSafe,
  estimateTokens,
  MODEL_ROUTING,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_SECONDARY_MODEL,
};
```

- [ ] **Step 2: Verify existing OpenAI functions still work**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const llm = require('./src/utils/llm'); console.log(Object.keys(llm)); console.log('streamChat:', typeof llm.streamChat); console.log('callReflectionLLM:', typeof llm.callReflectionLLM); console.log('parseJSONSafe:', typeof llm.parseJSONSafe);"`

Expected: All functions listed, all `typeof` = `function`.

- [ ] **Step 3: Test parseJSONSafe with edge cases**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "
const { parseJSONSafe } = require('./src/utils/llm');
// Markdown fenced
console.log('fenced:', JSON.stringify(parseJSONSafe('\`\`\`json\n[{\"a\":1}]\n\`\`\`')));
// Trailing comma
console.log('trailing:', JSON.stringify(parseJSONSafe('[{\"a\":1},]')));
// Clean JSON
console.log('clean:', JSON.stringify(parseJSONSafe('[{\"a\":1}]')));
// Garbage
console.log('garbage:', parseJSONSafe('not json at all'));
// Empty
console.log('empty:', parseJSONSafe(''));
"`

Expected: First three return parsed arrays, last two return `null`.

- [ ] **Step 4: Commit**

```bash
git add src/utils/llm.js
git commit -m "feat: add Anthropic client, model routing, and JSON parsing utils to LLM module"
```

---

### Task 3: Cost Guardrails — Shared Worker Infrastructure

**Files:**
- Create: `src/utils/worker-guards.js`

**Context:** Every intelligence worker must have: per-run LLM call cap (20), daily cost ceiling ($5), circuit breaker (3 consecutive failures), exponential backoff on 429. Build this as shared infrastructure before any worker goes live.

- [ ] **Step 1: Create worker-guards.js**

```javascript
// @ts-check
'use strict';

/**
 * Shared worker infrastructure: cost guardrails, circuit breaker, rate limiting.
 * Every intelligence worker MUST use these guards.
 *
 * Usage:
 *   const guard = createWorkerGuard('distillation');
 *   if (!guard.canRun()) return;
 *   guard.startRun();
 *   try {
 *     // ... do work, calling guard.trackLLMCall() per call ...
 *     guard.endRun(true);
 *   } catch (err) {
 *     guard.endRun(false);
 *   }
 */

/** @type {number} */
const MAX_LLM_CALLS_PER_RUN = parseInt(process.env.WORKER_MAX_LLM_CALLS || '20', 10);
/** @type {number} */
const MAX_DAILY_COST_DOLLARS = parseFloat(process.env.WORKER_MAX_DAILY_COST || '5');
/** @type {number} */
const MAX_CONSECUTIVE_FAILURES = 3;
/** @type {number} */
const BACKOFF_BASE_MS = 1000;
/** @type {number} */
const BACKOFF_MAX_MS = 30000;

/**
 * Estimated cost per LLM call by model (input + output, rough average).
 * Used for daily cost ceiling estimation only — not billing.
 */
const COST_PER_CALL = {
  'claude-haiku-4-5-20251001': 0.002,  // ~$0.002 per call avg
  'claude-sonnet-4-6': 0.015,          // ~$0.015 per call avg
  'gpt-4o-mini': 0.001,
  'gpt-4o': 0.01,
};

/** @type {Map<string, { llmCallsToday: number, estimatedCostToday: number, dayStart: string, consecutiveFailures: number, disabled: boolean, isRunning: boolean, lastBackoffMs: number }>} */
const workerStates = new Map();

/**
 * @param {string} workerName
 */
function getState(workerName) {
  const today = new Date().toISOString().slice(0, 10);
  let state = workerStates.get(workerName);
  if (!state || state.dayStart !== today) {
    state = {
      llmCallsToday: 0,
      estimatedCostToday: 0,
      dayStart: today,
      consecutiveFailures: state ? state.consecutiveFailures : 0,
      disabled: state ? state.disabled : false,
      isRunning: false,
      lastBackoffMs: 0,
    };
    workerStates.set(workerName, state);
  }
  return state;
}

/**
 * Create a guard instance for a specific worker.
 * @param {string} workerName
 */
function createWorkerGuard(workerName) {
  let runCallCount = 0;

  return {
    /**
     * Check if the worker can start a new run.
     * @returns {{ allowed: boolean, reason?: string }}
     */
    canRun() {
      const state = getState(workerName);
      if (state.disabled) {
        return { allowed: false, reason: `[${workerName}] Circuit breaker open (${state.consecutiveFailures} consecutive failures). Manual re-enable required.` };
      }
      if (state.isRunning) {
        return { allowed: false, reason: `[${workerName}] Already running` };
      }
      if (state.estimatedCostToday >= MAX_DAILY_COST_DOLLARS) {
        return { allowed: false, reason: `[${workerName}] Daily cost ceiling reached ($${state.estimatedCostToday.toFixed(2)} / $${MAX_DAILY_COST_DOLLARS})` };
      }
      return { allowed: true };
    },

    /** Mark the start of a worker run */
    startRun() {
      const state = getState(workerName);
      state.isRunning = true;
      runCallCount = 0;
    },

    /**
     * Track an LLM call. Returns false if per-run cap exceeded.
     * @param {string} [model] - Model used, for cost estimation
     * @returns {boolean} true if call is allowed, false if cap hit
     */
    trackLLMCall(model) {
      const state = getState(workerName);
      runCallCount++;
      state.llmCallsToday++;
      const cost = COST_PER_CALL[model] || 0.005;
      state.estimatedCostToday += cost;

      if (runCallCount > MAX_LLM_CALLS_PER_RUN) {
        console.warn(`[${workerName}] Per-run LLM call cap (${MAX_LLM_CALLS_PER_RUN}) exceeded. Stopping run.`);
        return false;
      }
      if (state.estimatedCostToday >= MAX_DAILY_COST_DOLLARS) {
        console.warn(`[${workerName}] Daily cost ceiling reached ($${state.estimatedCostToday.toFixed(2)}). Pausing all workers.`);
        return false;
      }
      return true;
    },

    /**
     * Mark end of run. Updates circuit breaker state.
     * @param {boolean} success
     */
    endRun(success) {
      const state = getState(workerName);
      state.isRunning = false;
      if (success) {
        state.consecutiveFailures = 0;
        state.lastBackoffMs = 0;
      } else {
        state.consecutiveFailures++;
        if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          state.disabled = true;
          console.error(`[${workerName}] CIRCUIT BREAKER OPEN: ${state.consecutiveFailures} consecutive failures. Worker disabled.`);
        }
      }
    },

    /**
     * Get backoff delay for rate limit errors (429). Exponential with cap.
     * @returns {number} milliseconds to wait
     */
    getBackoffMs() {
      const state = getState(workerName);
      const backoff = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, state.consecutiveFailures),
        BACKOFF_MAX_MS
      );
      state.lastBackoffMs = backoff;
      return backoff;
    },

    /**
     * Manually re-enable a worker after circuit breaker trips.
     */
    reset() {
      const state = getState(workerName);
      state.consecutiveFailures = 0;
      state.disabled = false;
      state.isRunning = false;
      console.log(`[${workerName}] Worker guard reset`);
    },

    /** Get current state for monitoring */
    getStatus() {
      return { ...getState(workerName), runCallCount };
    },
  };
}

/**
 * Get status of all workers. For admin/monitoring endpoints.
 * @returns {Record<string, any>}
 */
function getAllWorkerStatus() {
  const status = {};
  for (const [name, state] of workerStates) {
    status[name] = { ...state };
  }
  return status;
}

module.exports = { createWorkerGuard, getAllWorkerStatus };
```

- [ ] **Step 2: Test guard logic**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "
const { createWorkerGuard } = require('./src/utils/worker-guards');
const g = createWorkerGuard('test');

// Can run initially
console.log('canRun:', g.canRun());

// Start run
g.startRun();
console.log('canRun while running:', g.canRun());

// Track calls
for (let i = 0; i < 21; i++) {
  const ok = g.trackLLMCall('claude-haiku-4-5-20251001');
  if (!ok) { console.log('Capped at call', i + 1); break; }
}

// End run success
g.endRun(true);
console.log('after success:', g.getStatus());

// Circuit breaker test
g.startRun(); g.endRun(false);
g.startRun(); g.endRun(false);
g.startRun(); g.endRun(false);
console.log('after 3 failures:', g.canRun());

// Reset
g.reset();
console.log('after reset:', g.canRun());
"`

Expected: Cap at call 21, circuit breaker triggers after 3 failures, reset re-enables.

- [ ] **Step 3: Commit**

```bash
git add src/utils/worker-guards.js
git commit -m "feat: add shared worker guard infrastructure (cost ceiling, circuit breaker, rate limiting)"
```

---

## Chunk 2: Edit Delta Capture + Event Writing

### Task 4: Update captureEditDelta to Dual-Write

**Files:**
- Modify: `src/utils/capture.js:51-71`

**Context:** `captureEditDelta()` currently writes to `edit_deltas` only. Add a second write to `memory_events` so the new distillation pipeline can process it. Both writes are fire-and-forget (never throw). The `edit_deltas` → mothership pipeline stays untouched.

- [ ] **Step 1: Read capture.js**

Confirm current `captureEditDelta` at lines 51-71.

- [ ] **Step 2: Add memory_events write to captureEditDelta**

Replace the `captureEditDelta` function (lines 51-71) with:

```javascript
/**
 * Capture edit delta — implicit user signals from generation interactions.
 * Dual-writes to:
 *   1. edit_deltas table (existing mothership pipeline)
 *   2. memory_events table (new distillation pipeline)
 * NEVER throws.
 */
/** @type {Record<string, string>} */
const EVENT_TYPE_MAP = {
  prompt_edit: 'caption_edit',
  output_edit: 'caption_edit',
  selection: 'signal',
  regeneration: 'signal',
  rejection: 'signal',
};

async function captureEditDelta(data) {
  const brandId = data.brand_id || 'ikawn';

  // Write 1: edit_deltas (existing pipeline — unchanged)
  try {
    await pool.query(`
      INSERT INTO edit_deltas (
        brand_id, agent_name, generation_id, session_id,
        delta_type, original_prompt, revised_prompt,
        original_output, edited_output, selected_urls, rejected_urls,
        model_used, user_signal
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      brandId,
      data.agent_name, data.generation_id || null, data.session_id || null,
      data.delta_type, data.original_prompt || null, data.revised_prompt || null,
      data.original_output || null, data.edited_output || null,
      data.selected_urls || [], data.rejected_urls || [],
      data.model_used || null, data.user_signal || 'implicit'
    ]);
  } catch (err) {
    console.error('[EditDelta] edit_deltas write failed:', err.message);
  }

  // Write 2: memory_events (new distillation pipeline)
  try {
    await pool.query(`
      INSERT INTO memory_events (brand_id, event_type, payload)
      VALUES ($1, $2, $3)
    `, [
      brandId,
      EVENT_TYPE_MAP[data.delta_type] || 'caption_edit',
      JSON.stringify({
        agent_name: data.agent_name,
        delta_type: data.delta_type,
        original: data.original_prompt || data.original_output || null,
        edited: data.revised_prompt || data.edited_output || null,
        selected_urls: data.selected_urls || [],
        rejected_urls: data.rejected_urls || [],
        user_signal: data.user_signal || 'implicit',
        generation_id: data.generation_id || null,
      })
    ]);
  } catch (err) {
    console.error('[EditDelta] memory_events write failed:', err.message);
  }
}
```

- [ ] **Step 3: Add captureEvent utility function**

Append before `module.exports` in `capture.js`:

```javascript
/**
 * Capture a raw event into memory_events for distillation.
 * Use for new event types (campaign_result, capability_gap, manual_override, etc.)
 * that don't go through captureEditDelta or captureMessage.
 * NEVER throws.
 *
 * @param {{ brand_id?: string, event_type: string, payload: object }} data
 * @returns {Promise<string|null>} event ID or null on failure
 */
async function captureEvent(data) {
  try {
    const result = await pool.query(`
      INSERT INTO memory_events (brand_id, event_type, payload)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [
      data.brand_id || 'ikawn',
      data.event_type,
      JSON.stringify(data.payload)
    ]);
    return result.rows[0].id;
  } catch (err) {
    console.error('[CaptureEvent] Failed:', err.message, { event_type: data.event_type });
    return null;
  }
}
```

Update `module.exports`:

```javascript
module.exports = { captureMessage, captureEditDelta, captureEvent };
```

- [ ] **Step 4: Verify no existing callers break**

Run: `cd /Users/vineet/ikawn-openbrain && grep -rn "captureEditDelta\|captureMessage\|require.*capture" src/ --include="*.js" | grep -v node_modules`

Confirm all callers use the same signature. The function signature hasn't changed — only internal behavior added.

- [ ] **Step 5: Commit**

```bash
git add src/utils/capture.js
git commit -m "feat: dual-write captureEditDelta to memory_events + add captureEvent utility"
```

---

### Task 5: Extend Embedding Worker for distilled_memory

**Files:**
- Modify: `src/workers/embedding-worker.js`

**Context:** The existing embedding worker processes `memories` where `embedding_status = 'pending'`. It needs to ALSO process `distilled_memory` and `session_summaries` rows with `embedding_status = 'pending'`. Add a second processing step after the existing one.

- [ ] **Step 1: Read embedding-worker.js**

Confirm current structure at lines 1-67.

- [ ] **Step 2: Add distilled_memory embedding processing**

After the existing `processPendingEmbeddings` function (line 53), add a new function and update the interval:

```javascript
async function processPendingDistilledEmbeddings() {
  try {
    const { rows } = await pool.query(`
      SELECT id, content FROM distilled_memory
      WHERE embedding_status = 'pending'
        AND superseded_by IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) return;

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rows.map(r => r.content.slice(0, 8000))
    });

    for (let i = 0; i < rows.length; i++) {
      await pool.query(`
        UPDATE distilled_memory
        SET embedding = $1::float8[],
            embedding_status = 'done'
        WHERE id = $2
      `, [`{${response.data[i].embedding.join(',')}}`, rows[i].id]);
    }

    console.log(`[EmbeddingWorker] Processed ${rows.length} distilled memories`);
  } catch (err) {
    try {
      await pool.query(`
        UPDATE distilled_memory SET embedding_status = 'failed'
        WHERE id IN (
          SELECT id FROM distilled_memory
          WHERE embedding_status = 'pending' AND superseded_by IS NULL
          ORDER BY created_at ASC LIMIT $1
        )
      `, [BATCH_SIZE]);
    } catch (_) {}
    console.error('[EmbeddingWorker] Distilled batch failed:', err.message);
  }
}
```

Modify `startEmbeddingWorker` to run both:

```javascript
function startEmbeddingWorker() {
  console.log('[EmbeddingWorker] Starting (5s interval, batch size 50, memories + distilled)');
  processPendingEmbeddings();
  processPendingDistilledEmbeddings();
  interval = setInterval(async () => {
    await processPendingEmbeddings();
    await processPendingDistilledEmbeddings();
  }, INTERVAL_MS);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/workers/embedding-worker.js
git commit -m "feat: extend embedding worker to process distilled_memory table"
```

---

## Chunk 3: Distillation Worker

### Task 6: Distillation Worker — Edit Delta Processing

**Files:**
- Create: `src/workers/distillation-worker.js`

**Context:** This is the core intelligence worker. It processes unprocessed `memory_events` via Anthropic Claude Haiku, extracts patterns, and upserts into `distilled_memory` with supersession logic. Runs daily at 3am UTC (after mothership at 2am). Also runs on-demand when 5+ unprocessed edit events exist.

- [ ] **Step 1: Create distillation-worker.js**

```javascript
// @ts-check
'use strict';

const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { callReflectionLLM, parseJSONSafe, estimateTokens } = require('../utils/llm');
const { createWorkerGuard } = require('../utils/worker-guards');

const guard = createWorkerGuard('distillation');

/** Minimum events needed before distillation runs for a group */
const MIN_EVENTS_FOR_DISTILLATION = 3;
/** Maximum events per LLM call to control token budget */
const MAX_EVENTS_PER_CALL = 50;
/** Cosine similarity threshold for supersession check */
const SUPERSESSION_THRESHOLD = 0.85;

/**
 * Main distillation entry point. Processes all unprocessed memory_events.
 */
async function runDistillation() {
  const check = guard.canRun();
  if (!check.allowed) {
    console.log(check.reason);
    return;
  }

  guard.startRun();
  let success = true;

  try {
    // Pass 1: Edit delta distillation (caption_edit events)
    await distillEditDeltas();

    // Pass 2: General event distillation (all other event types)
    await distillGeneralEvents();

    console.log('[DistillationWorker] Run complete');
  } catch (err) {
    success = false;
    console.error('[DistillationWorker] Run failed:', err.message);
  } finally {
    guard.endRun(success);
  }
}

/**
 * Pass 1: Process caption_edit events into BRAND_VOICE_RULE memories.
 */
async function distillEditDeltas() {
  const { rows: events } = await pool.query(`
    SELECT id, brand_id, payload, created_at
    FROM memory_events
    WHERE event_type = 'caption_edit'
      AND processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 200
  `);

  if (events.length === 0) return;

  // Group by brand_id
  /** @type {Map<string, typeof events>} */
  const grouped = new Map();
  for (const evt of events) {
    const key = evt.brand_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(evt);
  }

  for (const [brandId, brandEvents] of grouped) {
    if (brandEvents.length < MIN_EVENTS_FOR_DISTILLATION) {
      continue; // Not enough data yet
    }

    // Process in chunks of MAX_EVENTS_PER_CALL
    for (let i = 0; i < brandEvents.length; i += MAX_EVENTS_PER_CALL) {
      const chunk = brandEvents.slice(i, i + MAX_EVENTS_PER_CALL);

      if (!guard.trackLLMCall('claude-haiku-4-5-20251001')) return;

      // Strip to pattern-relevant fields only (token optimization)
      const editsForLLM = chunk.map(e => ({
        original: e.payload.original,
        edited: e.payload.edited,
        agent: e.payload.agent_name,
        type: e.payload.delta_type,
      }));

      const systemPrompt = `You are analyzing content edits for a brand. A user edited AI-generated content.
Extract DURABLE voice and style rules from the editing patterns.

Return ONLY a JSON array (no markdown, no preamble, no explanation):
[
  {
    "memory_type": "BRAND_VOICE_RULE",
    "content": "descriptive rule in plain English",
    "confidence": <number between 0.3 and 0.95>,
    "reasoning": "evidence for this rule from the edits"
  }
]

Confidence scoring (follow strictly):
- 0.3-0.5: Pattern seen in 2 edits (tentative)
- 0.5-0.7: Pattern seen in 3-4 edits (emerging)
- 0.7-0.85: Pattern seen in 5+ edits (established)
- 0.85-0.95: Consistent with zero counter-examples (strong)
Never assign above 0.95.

Only extract rules visible in 2+ edits. Ignore one-off changes.
Focus on: tone, sentence length, emoji usage, punctuation, word choices,
capitalization, hashtag preferences, CTA style, product name formatting.
If no clear patterns exist, return an empty array [].`;

      const userPrompt = `Here are the original and edited versions:\n${JSON.stringify(editsForLLM, null, 2)}`;

      try {
        const raw = await callReflectionLLM('edit_delta_distillation', systemPrompt, userPrompt);
        const rules = parseJSONSafe(raw);

        if (!Array.isArray(rules)) {
          console.warn('[DistillationWorker] Non-array response for edit deltas, skipping chunk');
          continue; // Don't mark processed — retry next run
        }

        for (const rule of rules) {
          if (!rule.content || !rule.memory_type) continue;
          await upsertDistilledMemory(brandId, rule, chunk.map(e => e.id));
        }

        // Mark events as processed
        const eventIds = chunk.map(e => e.id);
        await pool.query(`
          UPDATE memory_events SET processed_at = NOW()
          WHERE id = ANY($1)
        `, [eventIds]);
      } catch (err) {
        if (err.status === 429) {
          const backoff = guard.getBackoffMs();
          console.warn(`[DistillationWorker] Rate limited. Backing off ${backoff}ms`);
          await sleep(backoff);
        } else {
          console.error('[DistillationWorker] Edit delta chunk failed:', err.message);
        }
      }
    }
  }
}

/**
 * Pass 2: Process all non-caption_edit events.
 */
async function distillGeneralEvents() {
  const { rows: events } = await pool.query(`
    SELECT id, brand_id, event_type, payload, created_at
    FROM memory_events
    WHERE event_type != 'caption_edit'
      AND processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 200
  `);

  if (events.length === 0) return;

  // Group by (brand_id, event_type)
  /** @type {Map<string, typeof events>} */
  const grouped = new Map();
  for (const evt of events) {
    const key = `${evt.brand_id}::${evt.event_type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(evt);
  }

  for (const [, groupEvents] of grouped) {
    if (groupEvents.length < MIN_EVENTS_FOR_DISTILLATION) continue;

    for (let i = 0; i < groupEvents.length; i += MAX_EVENTS_PER_CALL) {
      const chunk = groupEvents.slice(i, i + MAX_EVENTS_PER_CALL);

      if (!guard.trackLLMCall('claude-haiku-4-5-20251001')) return;

      const eventsForLLM = chunk.map(e => ({
        type: e.event_type,
        data: e.payload,
      }));

      const systemPrompt = `Review the following events from a commerce platform.
Extract durable knowledge that should persist beyond these individual events.

Return ONLY a JSON array (no markdown, no preamble):
[
  {
    "memory_type": "<one of: USER_PREFERENCE, BRAND_VOICE_RULE, BUSINESS_INSIGHT, WORKFLOW_PATTERN, CORRECTION, CREATIVE_PATTERN, CONTENT_STRATEGY, AUDIENCE_INSIGHT, PERFORMANCE_INSIGHT>",
    "content": "clear, actionable statement",
    "confidence": <number 0.3-0.95>,
    "reasoning": "what evidence supports this"
  }
]

Confidence scoring (follow strictly):
- 0.3-0.5: Tentative (2-3 events)
- 0.5-0.7: Emerging (4-6 events)
- 0.7-0.85: Established (7+ events)
- 0.85-0.95: Consistent with zero counter-examples
Never above 0.95.

Rules:
- Only extract patterns, not one-off observations
- Be specific and actionable
- Ignore temporary information
- If no patterns, return []`;

      const userPrompt = `Events:\n${JSON.stringify(eventsForLLM, null, 2)}`;

      try {
        const raw = await callReflectionLLM('event_distillation', systemPrompt, userPrompt);
        const insights = parseJSONSafe(raw);

        if (!Array.isArray(insights)) {
          console.warn('[DistillationWorker] Non-array response for general events, skipping chunk');
          continue;
        }

        for (const insight of insights) {
          if (!insight.content || !insight.memory_type) continue;
          await upsertDistilledMemory(chunk[0].brand_id, insight, chunk.map(e => e.id));
        }

        const eventIds = chunk.map(e => e.id);
        await pool.query(`
          UPDATE memory_events SET processed_at = NOW()
          WHERE id = ANY($1)
        `, [eventIds]);
      } catch (err) {
        if (err.status === 429) {
          await sleep(guard.getBackoffMs());
        } else {
          console.error('[DistillationWorker] General event chunk failed:', err.message);
        }
      }
    }
  }
}

/**
 * Upsert a distilled memory with supersession logic.
 * If similar active memory exists (cosine > 0.85):
 *   - Content aligns → bump confidence, merge source_event_ids
 *   - Content contradicts → supersede old, insert new
 * Otherwise → insert new.
 *
 * @param {string} brandId
 * @param {{ memory_type: string, content: string, confidence: number, reasoning: string }} insight
 * @param {string[]} sourceEventIds
 */
async function upsertDistilledMemory(brandId, insight, sourceEventIds) {
  // Generate embedding for the new insight
  let embedding;
  try {
    embedding = await getEmbedding(insight.content);
  } catch (err) {
    console.error('[DistillationWorker] Embedding failed for insight, inserting without:', err.message);
    // Insert without embedding — embedding worker will pick it up
    await pool.query(`
      INSERT INTO distilled_memory (brand_id, memory_type, content, confidence, source_event_ids, reasoning, embedding_status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    `, [brandId, insight.memory_type, insight.content, insight.confidence, sourceEventIds, insight.reasoning]);
    return;
  }

  // Check for similar active memories
  const embeddingStr = `{${embedding.join(',')}}`;
  const { rows: similar } = await pool.query(`
    SELECT id, content, confidence, source_event_ids, reasoning,
           cosine_similarity(embedding, $1::float8[]) AS similarity
    FROM distilled_memory
    WHERE brand_id = $2
      AND memory_type = $3
      AND superseded_by IS NULL
      AND embedding IS NOT NULL
    ORDER BY cosine_similarity(embedding, $1::float8[]) DESC
    LIMIT 1
  `, [embeddingStr, brandId, insight.memory_type]);

  if (similar.length > 0 && similar[0].similarity > SUPERSESSION_THRESHOLD) {
    const existing = similar[0];

    // High similarity — ask LLM whether content aligns or contradicts
    if (!guard.trackLLMCall('claude-haiku-4-5-20251001')) return;

    let alignment = 'agree';
    try {
      const alignmentRaw = await callReflectionLLM(
        'edit_delta_distillation',
        'You compare two knowledge rules. Reply with ONLY the word "agree" or "contradict". Nothing else.',
        `Existing rule: "${existing.content}"\nNew rule: "${insight.content}"`
      );
      alignment = alignmentRaw.trim().toLowerCase().includes('contradict') ? 'contradict' : 'agree';
    } catch (err) {
      console.warn('[DistillationWorker] Alignment check failed, defaulting to reinforce:', err.message);
    }

    if (alignment === 'contradict') {
      // Supersede: old rule gets superseded_by pointing to new
      const { rows: [newRow] } = await pool.query(`
        INSERT INTO distilled_memory (brand_id, memory_type, content, confidence, source_event_ids, reasoning, embedding, embedding_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7::float8[], 'done')
        RETURNING id
      `, [brandId, insight.memory_type, insight.content, insight.confidence, sourceEventIds, insight.reasoning, embeddingStr]);

      await pool.query(`
        UPDATE distilled_memory SET superseded_by = $1, last_updated = NOW() WHERE id = $2
      `, [newRow.id, existing.id]);

      console.log(`[DistillationWorker] Superseded memory ${existing.id} → ${newRow.id} (contradiction)`);
    } else {
      // Reinforce: bump confidence, merge evidence
      const newConfidence = Math.min(existing.confidence + 0.1, 0.99);
      const mergedEventIds = [...new Set([...(existing.source_event_ids || []), ...sourceEventIds])];
      const updatedReasoning = `${existing.reasoning || ''}\n[${new Date().toISOString().slice(0, 10)}] Reinforced: ${insight.reasoning}`;

      await pool.query(`
        UPDATE distilled_memory
        SET confidence = $1,
            source_event_ids = $2,
            reasoning = $3,
            last_updated = NOW()
        WHERE id = $4
      `, [newConfidence, mergedEventIds, updatedReasoning.slice(0, 4000), existing.id]);

      console.log(`[DistillationWorker] Reinforced memory ${existing.id} (confidence ${existing.confidence} → ${newConfidence})`);
    }
  } else {
    // No similar memory — insert new
    await pool.query(`
      INSERT INTO distilled_memory (brand_id, memory_type, content, confidence, source_event_ids, reasoning, embedding, embedding_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7::float8[], 'done')
    `, [brandId, insight.memory_type, insight.content, insight.confidence, sourceEventIds, insight.reasoning, embeddingStr]);

    console.log(`[DistillationWorker] New ${insight.memory_type} memory (confidence ${insight.confidence})`);
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Scheduling ──

let scheduledTimeout = null;
let scheduledInterval = null;

/**
 * Start the distillation worker. Runs daily at 3am UTC.
 */
function startDistillationWorker() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[DistillationWorker] ANTHROPIC_API_KEY not set — worker disabled');
    return;
  }

  console.log('[DistillationWorker] Starting (daily at 3am UTC)');

  const now = new Date();
  const next3am = new Date(now);
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  const delay = next3am - now;

  scheduledTimeout = setTimeout(() => {
    runDistillation();
    scheduledInterval = setInterval(runDistillation, 24 * 60 * 60 * 1000);
  }, delay);
}

function stopDistillationWorker() {
  if (scheduledTimeout) clearTimeout(scheduledTimeout);
  if (scheduledInterval) clearInterval(scheduledInterval);
}

module.exports = { startDistillationWorker, stopDistillationWorker, runDistillation };
```

- [ ] **Step 2: Verify module loads without errors**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const w = require('./src/workers/distillation-worker'); console.log(Object.keys(w));"`

Expected: `[ 'startDistillationWorker', 'stopDistillationWorker', 'runDistillation' ]`

- [ ] **Step 3: Wire into index.js**

Add import at top (after line 33):
```javascript
const { startDistillationWorker } = require('./workers/distillation-worker');
```

Add to startup (after line 149, `startMothershipWorker()`):
```javascript
      startDistillationWorker();
```

- [ ] **Step 4: Commit**

```bash
git add src/workers/distillation-worker.js src/index.js
git commit -m "feat: add distillation worker — processes memory_events into distilled_memory via Anthropic"
```

---

## Chunk 4: Recall + generateWithMemory

### Task 7: recall() — Unified Memory Retrieval

**Files:**
- Create: `src/utils/recall.js`

**Context:** `recall()` queries BOTH `memories` (existing) AND `distilled_memory` (new), merges results by weighted score, and returns a unified ranked list. This is the read-side counterpart to the capture/distillation write-side.

- [ ] **Step 1: Create recall.js**

```javascript
// @ts-check
'use strict';

const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

/**
 * @typedef {Object} RecallParams
 * @property {string} brandId
 * @property {string} query - Natural language query to search for
 * @property {string[]} [memoryTypes] - Filter by memory types (e.g. ['BRAND_VOICE_RULE', 'CREATIVE_PATTERN'])
 * @property {'both' | 'memories_only' | 'distilled_only'} [source='both'] - Which tables to query
 * @property {number} [limit=10] - Max results
 * @property {boolean} [includeReasoning=true] - Include reasoning field
 */

/**
 * @typedef {Object} RecalledMemory
 * @property {string} id
 * @property {'memories' | 'distilled'} source - Which table this came from
 * @property {string} memoryType
 * @property {string} content
 * @property {number} confidence
 * @property {string|null} reasoning
 * @property {string} lastUpdated
 * @property {number} score - Combined similarity * confidence
 */

/**
 * Recall relevant memories from both memories and distilled_memory tables.
 * Results are merged by weighted score: similarity * confidence.
 *
 * @param {RecallParams} params
 * @returns {Promise<{ memories: RecalledMemory[] }>}
 */
async function recall(params) {
  const {
    brandId,
    query,
    memoryTypes,
    source = 'both',
    limit = 10,
    includeReasoning = true,
  } = params;

  let embedding;
  try {
    embedding = await getEmbedding(query);
  } catch (err) {
    console.error('[Recall] Embedding failed, falling back to text search:', err.message);
    return recallTextFallback(params);
  }

  const embeddingStr = `{${embedding.join(',')}}`;
  const results = [];

  // Query distilled_memory
  if (source !== 'memories_only') {
    const distilledParams = [embeddingStr, brandId];
    let paramIdx = 3;
    let distilledWhere = `
      WHERE brand_id = $2
        AND superseded_by IS NULL
        AND embedding IS NOT NULL
    `;

    if (memoryTypes && memoryTypes.length > 0) {
      distilledWhere += ` AND memory_type = ANY($${paramIdx++})`;
      distilledParams.push(memoryTypes);
    }

    const distilledQuery = `
      SELECT *, similarity * confidence AS score FROM (
        SELECT id, memory_type, content, confidence, reasoning, last_updated, created_at,
               cosine_similarity(embedding, $1::float8[]) AS similarity
        FROM distilled_memory
        ${distilledWhere}
      ) sub
      ORDER BY score DESC
      LIMIT $${paramIdx}
    `;
    distilledParams.push(limit);

    const { rows } = await pool.query(distilledQuery, distilledParams);

    for (const row of rows) {
      results.push({
        id: row.id,
        source: 'distilled',
        memoryType: row.memory_type,
        content: row.content,
        confidence: row.confidence,
        reasoning: includeReasoning ? row.reasoning : null,
        lastUpdated: (row.last_updated || row.created_at).toISOString(),
        score: (row.similarity || 0) * row.confidence,
      });
    }
  }

  // Query memories (existing table)
  if (source !== 'distilled_only') {
    const memoriesParams = [embeddingStr, brandId];
    let paramIdx = 3;
    let memoriesWhere = `
      WHERE brand_id = $2
        AND embedding IS NOT NULL
        AND (archived IS NULL OR archived = false)
        AND deleted_at IS NULL
    `;

    if (memoryTypes && memoryTypes.length > 0) {
      memoriesWhere += ` AND memory_type = ANY($${paramIdx++})`;
      memoriesParams.push(memoryTypes);
    }

    const memoriesQuery = `
      SELECT * FROM (
        SELECT id, memory_type, content, created_at,
               cosine_similarity(embedding, $1::float8[]) AS similarity
        FROM memories
        ${memoriesWhere}
      ) sub
      ORDER BY similarity DESC
      LIMIT $${paramIdx}
    `;
    memoriesParams.push(limit);

    const { rows } = await pool.query(memoriesQuery, memoriesParams);

    for (const row of rows) {
      results.push({
        id: String(row.id),
        source: 'memories',
        memoryType: row.memory_type || 'note',
        content: row.content,
        confidence: 1.0, // Existing memories treated as confidence 1.0
        reasoning: null,
        lastUpdated: row.created_at.toISOString(),
        score: (row.similarity || 0) * 1.0,
      });
    }
  }

  // Merge and sort by score descending, take top `limit`
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  // Update last_used on distilled memories that were returned
  const distilledIds = topResults
    .filter(r => r.source === 'distilled')
    .map(r => r.id);
  if (distilledIds.length > 0) {
    pool.query(`
      UPDATE distilled_memory SET last_used = NOW() WHERE id = ANY($1)
    `, [distilledIds]).catch(() => {}); // fire-and-forget
  }

  return { memories: topResults };
}

/**
 * Text-based fallback when embedding fails.
 * @param {RecallParams} params
 * @returns {Promise<{ memories: RecalledMemory[] }>}
 */
async function recallTextFallback(params) {
  const { brandId, query, limit = 10 } = params;
  const results = [];

  // Escape LIKE wildcards in query
  const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

  // Search distilled_memory by ILIKE
  const { rows: distilled } = await pool.query(`
    SELECT id, memory_type, content, confidence, reasoning, last_updated, created_at
    FROM distilled_memory
    WHERE brand_id = $1
      AND superseded_by IS NULL
      AND content ILIKE '%' || $2 || '%' ESCAPE '\'
    ORDER BY confidence DESC, last_updated DESC
    LIMIT $3
  `, [brandId, query, limit]);

  for (const row of distilled) {
    results.push({
      id: row.id,
      source: 'distilled',
      memoryType: row.memory_type,
      content: row.content,
      confidence: row.confidence,
      reasoning: row.reasoning,
      lastUpdated: (row.last_updated || row.created_at).toISOString(),
      score: row.confidence * 0.5,
    });
  }

  // Search memories by ILIKE
  const { rows: mems } = await pool.query(`
    SELECT id, memory_type, content, created_at
    FROM memories
    WHERE brand_id = $1
      AND content ILIKE '%' || $2 || '%' ESCAPE '\'
      AND (archived IS NULL OR archived = false)
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $3
  `, [brandId, query, limit]);

  for (const row of mems) {
    results.push({
      id: String(row.id),
      source: 'memories',
      memoryType: row.memory_type || 'note',
      content: row.content,
      confidence: 1.0,
      reasoning: null,
      lastUpdated: row.created_at.toISOString(),
      score: 0.5,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return { memories: results.slice(0, limit) };
}

module.exports = { recall };
```

- [ ] **Step 2: Verify module loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const { recall } = require('./src/utils/recall'); console.log('recall:', typeof recall);"`

Expected: `recall: function`

- [ ] **Step 3: Commit**

```bash
git add src/utils/recall.js
git commit -m "feat: add recall() — unified memory retrieval from memories + distilled_memory"
```

---

### Task 8: generateWithMemory Wrapper

**Files:**
- Create: `src/utils/generate-with-memory.js`

**Context:** Wraps any content generation call with recalled knowledge injection. Returns both the generated content and the memory IDs used (for outcome feedback loop). This is the critical link that makes the learning loop work.

- [ ] **Step 1: Create generate-with-memory.js**

```javascript
// @ts-check
'use strict';

const { recall } = require('./recall');
const { callReflectionLLM } = require('./llm');

/**
 * @typedef {Object} GenerateWithMemoryParams
 * @property {string} brandId
 * @property {string} task - What to generate (e.g. "write instagram caption for product X")
 * @property {object} [context] - Additional context for generation
 * @property {string[]} [memoryTypes] - Filter recalled memories by type
 * @property {number} [memoryLimit=15] - Max memories to recall
 * @property {string} [systemPromptOverride] - Override the default system prompt
 */

/**
 * @typedef {Object} GenerateWithMemoryResult
 * @property {string} content - Generated content
 * @property {string[]} memoriesUsed - IDs of memories that informed this generation
 */

/**
 * Generate content with recalled memory context injected.
 * Returns both content AND memory IDs used (critical for outcome feedback loop).
 *
 * @param {GenerateWithMemoryParams} params
 * @returns {Promise<GenerateWithMemoryResult>}
 */
async function generateWithMemory(params) {
  const {
    brandId,
    task,
    context,
    memoryTypes,
    memoryLimit = 15,
    systemPromptOverride,
  } = params;

  // 1. Recall relevant memories
  const recalled = await recall({
    brandId,
    query: task,
    memoryTypes,
    source: 'both',
    limit: memoryLimit,
    includeReasoning: false,
  });

  // 2. Compress memories into prompt blocks (token optimization)
  const voiceRules = recalled.memories
    .filter(m => m.memoryType === 'BRAND_VOICE_RULE' && m.confidence > 0.5)
    .map(m => `- ${m.content}`)
    .join('\n');

  const contentInsights = recalled.memories
    .filter(m => ['CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT', 'PERFORMANCE_INSIGHT'].includes(m.memoryType))
    .map(m => `- ${m.content}`)
    .join('\n');

  const otherKnowledge = recalled.memories
    .filter(m => !['BRAND_VOICE_RULE', 'CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT', 'PERFORMANCE_INSIGHT'].includes(m.memoryType))
    .map(m => `- [${m.memoryType}] ${m.content}`)
    .join('\n');

  // 3. Build system prompt
  const systemPrompt = systemPromptOverride || `You are Ruhi, generating content for a brand.

BRAND VOICE RULES (follow these strictly):
${voiceRules || 'None learned yet — use professional, clear tone.'}

CONTENT INSIGHTS (consider these):
${contentInsights || 'None learned yet.'}

${otherKnowledge ? `OTHER KNOWLEDGE:\n${otherKnowledge}` : ''}

When your output is influenced by a learned rule, mention it naturally.
Example: "Using shorter caption style (your audience engages 43% more under 100 chars)."`;

  // 4. Generate content
  const userPrompt = context
    ? `Task: ${task}\n\nContext: ${JSON.stringify(context)}`
    : task;

  const content = await callReflectionLLM('content_generation', systemPrompt, userPrompt);

  // 5. Return content + memory IDs for outcome tracking
  return {
    content,
    memoriesUsed: recalled.memories.map(m => m.id),
  };
}

module.exports = { generateWithMemory };
```

- [ ] **Step 2: Verify module loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "const { generateWithMemory } = require('./src/utils/generate-with-memory'); console.log('generateWithMemory:', typeof generateWithMemory);"`

Expected: `generateWithMemory: function`

- [ ] **Step 3: Commit**

```bash
git add src/utils/generate-with-memory.js
git commit -m "feat: add generateWithMemory — wraps generation with recalled knowledge injection"
```

---

### Task 9: Recall API Route

**Files:**
- Create: `src/routes/recall.js`
- Modify: `src/index.js` (mount route)

**Context:** Expose `recall()` as `GET /api/memory/recall` for external consumers (ikawn OS, OpenClaw). Auth via API key or session. Follows existing route patterns.

- [ ] **Step 1: Create recall route**

```javascript
// @ts-check
'use strict';

const { Router } = require('express');
const { recall } = require('../utils/recall');

const router = Router();

/**
 * GET /api/memory/recall
 * Query params:
 *   q (required) - search query
 *   brand_id - defaults to 'ikawn'
 *   types - comma-separated memory types filter
 *   source - 'both' (default), 'memories_only', 'distilled_only'
 *   limit - max results (default 10, max 50)
 *   reasoning - include reasoning (default true)
 */
router.get('/api/memory/recall', async (req, res) => {
  try {
    const { q, brand_id, types, source, limit, reasoning } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const result = await recall({
      brandId: brand_id || 'ikawn',
      query: q,
      memoryTypes: types ? types.split(',') : undefined,
      source: source || 'both',
      limit: Math.min(parseInt(limit) || 10, 50),
      includeReasoning: reasoning !== 'false',
    });

    res.json(result);
  } catch (err) {
    console.error('[Recall API] Error:', err.message);
    res.status(500).json({ error: 'Recall failed' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount in index.js**

Add import after the other route imports (around line 24):
```javascript
const recallRoute = require('./routes/recall');
```

Mount with auth (after the other `requireAuthOrApiKey` routes, around line 109):
```javascript
app.use(requireAuthOrApiKey, recallRoute);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/recall.js src/index.js
git commit -m "feat: add GET /api/memory/recall route for unified memory retrieval"
```

---

### Task 10: Admin Endpoint — Worker Status + Manual Distillation Trigger

**Files:**
- Modify: `src/routes/admin-api.js` (add endpoints)

**Context:** Admin needs to monitor worker health and manually trigger distillation. Add to existing admin routes.

- [ ] **Step 1: Read admin-api.js to find insertion point**

- [ ] **Step 2: Add worker status and trigger endpoints**

Add these routes to the admin router:

Note: `admin-api.js` already has `router.use(requireAdmin)` at line 9 and `const { pool } = require('../db')` at line 4. Do NOT add redundant middleware or imports. Just add the route handlers:

```javascript
// Worker status — GET /admin/api/workers
router.get('/admin/api/workers', (req, res) => {
  const { getAllWorkerStatus } = require('../utils/worker-guards');
  res.json(getAllWorkerStatus());
});

// Manual distillation trigger — POST /admin/api/distill
router.post('/admin/api/distill', async (req, res) => {
  const { runDistillation } = require('../workers/distillation-worker');
  try {
    await runDistillation();
    res.json({ success: true, message: 'Distillation run complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View distilled memories — GET /admin/api/distilled
router.get('/admin/api/distilled', async (req, res) => {
  const { brand_id, type, limit } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT id, brand_id, memory_type, content, confidence, reasoning,
             source_event_ids, superseded_by, last_used, last_updated, created_at
      FROM distilled_memory
      WHERE ($1::text IS NULL OR brand_id = $1)
        AND ($2::text IS NULL OR memory_type = $2)
        AND superseded_by IS NULL
      ORDER BY confidence DESC, last_updated DESC
      LIMIT $3
    `, [brand_id || null, type || null, Math.min(parseInt(limit) || 50, 200)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View unprocessed events — GET /admin/api/events/pending
router.get('/admin/api/events/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT event_type, count(*)::int as count
      FROM memory_events
      WHERE processed_at IS NULL
      GROUP BY event_type
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verify admin-api.js loads**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "require('./src/routes/admin-api'); console.log('OK');"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin-api.js
git commit -m "feat: add admin endpoints for worker status, distillation trigger, and memory inspection"
```

---

## Chunk 5: Integration Verification

### Task 11: End-to-End Smoke Test

**Files:** No new files — verification only.

- [ ] **Step 1: Verify all modules import without errors**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "
// All new modules
require('./src/utils/llm');
require('./src/utils/capture');
require('./src/utils/recall');
require('./src/utils/generate-with-memory');
require('./src/utils/worker-guards');
require('./src/workers/distillation-worker');
require('./src/routes/recall');
// Existing modules (verify no breakage)
require('./src/workers/embedding-worker');
require('./src/workers/moderation-worker');
require('./src/workers/mothership-worker');
require('./src/routes/search');
require('./src/routes/capture');
console.log('All modules load OK');
"`

Expected: `All modules load OK`

- [ ] **Step 2: Verify full app starts**

Run: `cd /Users/vineet/ikawn-openbrain && timeout 10 node src/index.js 2>&1 || true`

Expected: `OpenBrain running on port 3000` followed by worker startup messages. App should start without errors.

Note: Requires `DATABASE_URL`, `OPENAI_API_KEY`. If not available locally, skip this step and verify on deploy.

- [ ] **Step 3: Verify the data flow end-to-end (dry run)**

Run: `cd /Users/vineet/ikawn-openbrain && node -e "
// Simulate the full data flow without actual DB/API calls
const { parseJSONSafe, estimateTokens } = require('./src/utils/llm');
const { createWorkerGuard } = require('./src/utils/worker-guards');

// 1. parseJSONSafe handles LLM responses
const fenced = '\`\`\`json\n[{\"memory_type\":\"BRAND_VOICE_RULE\",\"content\":\"Use short sentences\",\"confidence\":0.6,\"reasoning\":\"3 edits shortened sentences\"}]\n\`\`\`';
const parsed = parseJSONSafe(fenced);
console.log('Parse OK:', parsed.length === 1 && parsed[0].memory_type === 'BRAND_VOICE_RULE');

// 2. Token estimation
console.log('Tokens for 1000 chars:', estimateTokens('x'.repeat(1000)));

// 3. Worker guards
const g = createWorkerGuard('test-e2e');
console.log('Can run:', g.canRun().allowed);
g.startRun();
console.log('Track call:', g.trackLLMCall('claude-haiku-4-5-20251001'));
g.endRun(true);
console.log('After success:', g.getStatus().consecutiveFailures === 0);

console.log('E2E dry run PASSED');
"`

Expected: All checks pass, final line `E2E dry run PASSED`.

- [ ] **Step 4: Final commit with all changes**

Only if there are unstaged changes from integration fixes. Otherwise skip.

---

### Task 12: Deploy to Fly.io

- [ ] **Step 1: Set ANTHROPIC_API_KEY secret on Fly**

Run: `~/.fly/bin/flyctl secrets set ANTHROPIC_API_KEY=<key> --app ikawn-openbrain`

Note: V must provide the Anthropic API key. If not available, the distillation worker will fail with a clear error message and the circuit breaker will disable it after 3 attempts. Everything else continues working.

- [ ] **Step 2: Deploy with --depot=false**

Run: `cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false`

- [ ] **Step 3: Verify deployment**

Run: `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | head -50`

Expected: Startup logs showing all workers started, including `[DistillationWorker] Starting (daily at 3am UTC)`.

- [ ] **Step 4: Verify new tables exist**

Run: `~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain -c "\dt memory_events; \dt distilled_memory; \dt session_summaries; \dt learning_velocity;"`

Expected: All four tables listed.

- [ ] **Step 5: Test recall API**

Run: `curl -s https://ikawn-openbrain.fly.dev/api/memory/recall?q=test -H "x-api-key: $OPENBRAIN_API_KEY" | head -c 200`

Expected: JSON response (likely `{"memories":[]}` since no distilled memories exist yet).

---

## Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Schema (4 new tables) | `src/db.js` | `feat: add intelligence layer schema` |
| 2 | Anthropic client + model routing | `src/utils/llm.js` | `feat: add Anthropic client, model routing` |
| 3 | Cost guardrails | `src/utils/worker-guards.js` (new) | `feat: add shared worker guard infrastructure` |
| 4 | Dual-write captureEditDelta + captureEvent | `src/utils/capture.js` | `feat: dual-write captureEditDelta + captureEvent` |
| 5 | Extend embedding worker | `src/workers/embedding-worker.js` | `feat: extend embedding worker for distilled_memory` |
| 6 | Distillation worker | `src/workers/distillation-worker.js` (new), `src/index.js` | `feat: add distillation worker` |
| 7 | recall() | `src/utils/recall.js` (new) | `feat: add recall()` |
| 8 | generateWithMemory | `src/utils/generate-with-memory.js` (new) | `feat: add generateWithMemory` |
| 9 | Recall API route | `src/routes/recall.js` (new), `src/index.js` | `feat: add recall API route` |
| 10 | Admin endpoints | `src/routes/admin-api.js` | `feat: add admin intelligence endpoints` |
| 11 | E2E verification | — | — |
| 12 | Deploy | — | — |

**New files (5):** `worker-guards.js`, `distillation-worker.js`, `recall.js`, `generate-with-memory.js`, `routes/recall.js`
**Modified files (6):** `db.js`, `llm.js`, `capture.js`, `embedding-worker.js`, `index.js`, `admin-api.js`

**Deferred to future phases:**
- `session_summaries` table created but not populated (Phase 5: Session Summary)
- `learning_velocity` table created but not populated (Phase 5+: metrics recording after distillation validates)
- Outcome reflection (Pass 2 of distillation — needs `campaign_result` events flowing in first)
- Weekly strategic rollup (needs research findings from Phase 6)
- Cross-brand intelligence (Phase 8)
