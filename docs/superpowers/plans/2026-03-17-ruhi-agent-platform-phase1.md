# Ruhi Agent Platform — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation for Ruhi as an autonomous Co-CEO — DB schema, tool registry, agent executor, task scheduler, LLM client, 13 tools, 3 domain agents, Telegram approval flow, and intelligence hardening fixes.

**Architecture:** Postgres-backed task scheduler (30s polling with advisory locks), two-tier execution (direct tool calls for simple tasks, Claude Sonnet 4.6 + tool_use for complex tasks), in-process EventEmitter for triggers. No Redis, no separate worker process. Everything runs in the same Express app on Fly.io.

**Tech Stack:** Node.js/Express, PostgreSQL, Anthropic SDK (primary), OpenAI SDK (fallback), googleapis, croner (cron parsing), eventemitter2 (wildcard events)

**Spec:** `docs/superpowers/specs/2026-03-17-ruhi-agent-platform-design.md`

---

## File Structure

### New Files
```
src/
  tools/
    registry.js              — Load *.tool.js, expose Map, generate Anthropic tool schemas
    calendar.tool.js         — Google Calendar read/create
    gmail.tool.js            — Gmail read/draft/send
    ga.tool.js               — Google Analytics report/analyze (stub — GA4 property needed)
    ikawn-os.tool.js         — Trigger generations on os.ikawn.com
    notify.tool.js           — Send Telegram/web notifications
    system.tool.js           — OpenBrain health, worker status, costs
    fly.tool.js              — Fly.io app status (via flyctl CLI)
    content.tool.js          — Draft social media content via LLM
    manage-task.tool.js      — CRUD for scheduled_tasks
  agent/
    executor.js              — Tier 2 agent loop (Claude + tools + approval)
    llm-client.js            — Anthropic primary + OpenAI fallback with cost tracking
  agents/
    ruhi.seed.js             — Co-CEO persona seed
    marketing.seed.js        — CMO persona seed
    tech.seed.js             — CTO persona seed
    seed-all.js              — Run all seeds (idempotent INSERT ON CONFLICT DO NOTHING)
  utils/
    google-auth.js           — OAuth2 token management with auto-refresh
    event-bus.js             — EventEmitter2 for trigger-based tasks
    schedule.js              — Cron/interval next_run_at calculation using croner
```

### Modified Files
```
src/db.js                    — Add 4 new tables to initSchema()
src/scheduler.js             — Add task polling loop + event bus listeners
src/index.js                 — Require new modules, start task scheduler
src/routes/webhooks.js       — Add manage_task + callback_query handler to intelligence-telegram
src/routes/ruhi-chat.js      — Add manage_task tool_use to web chat
src/ruhi/persona.js          — Add task management awareness to system prompt
src/utils/recall.js          — Weighted scoring with recency + usage
src/utils/generate-with-memory.js — Remove "mention rules" directive
src/workers/distillation-worker.js — Session diversity + cluster dedup + per-brand guards
package.json                 — Add croner, eventemitter2
```

---

## Chunk 1: Intelligence Hardening + DB Schema

These are prerequisites — hardening fixes prevent memory corruption as volume scales, and DB schema is needed by everything else.

### Task 1: Remove "mention rules" directive from generateWithMemory

**Files:**
- Modify: `src/utils/generate-with-memory.js:70-81`

- [ ] **Step 1: Remove the mention directive**

In `src/utils/generate-with-memory.js`, remove lines 80-81:
```
When your output is influenced by a learned rule, mention it naturally.
Example: "Using shorter caption style (your audience engages 43% more under 100 chars)."
```

Replace the system prompt block (lines 70-81) with:
```javascript
  const systemPrompt = systemPromptOverride || `You are Ruhi, generating content for a brand.

BRAND VOICE RULES (follow these strictly):
${voiceRules || 'None learned yet — use professional, clear tone.'}

CONTENT INSIGHTS (consider these):
${contentInsights || 'None learned yet.'}

${otherKnowledge ? `OTHER KNOWLEDGE:\n${otherKnowledge}` : ''}

Apply all learned rules silently. The output should reflect the rules without citing them.`;
```

- [ ] **Step 2: Commit**
```bash
git add src/utils/generate-with-memory.js
git commit -m "fix: remove 'mention rules' directive from generation prompt — leaks internals"
```

---

### Task 2: Recall weighted scoring with recency + usage

**Files:**
- Modify: `src/utils/recall.js:83-108` (distilled query scoring)
- Modify: `src/utils/recall.js:155-167` (last_used update + times_used tracking)

- [ ] **Step 1: Add times_used column to distilled_memory**

In `src/db.js`, after the existing `distilled_memory` CREATE TABLE, add:
```javascript
    await client.query(`
      ALTER TABLE distilled_memory ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
    `);
```

- [ ] **Step 2: Update recall scoring formula**

Replace the distilled_memory query (lines 83-92 of recall.js) with weighted scoring:
```javascript
    const distilledQuery = `
      SELECT *, (
        (similarity * 0.6) +
        (confidence * time_decay * 0.25) +
        (CASE WHEN last_updated IS NOT NULL
          THEN EXP(-EXTRACT(EPOCH FROM (NOW() - last_updated)) / (30 * 86400)) * 0.1
          ELSE 0.05 END) +
        (LEAST(1, LN(COALESCE(times_used, 0) + 1) / LN(20)) * 0.05)
      ) AS score FROM (
        SELECT id, memory_type, content, confidence, reasoning, last_updated, created_at, times_used,
               cosine_similarity(embedding, $1::float8[]) AS similarity,
               CASE WHEN last_updated IS NOT NULL
                 THEN EXP(-EXTRACT(EPOCH FROM (NOW() - last_updated)) / (30 * 86400))
                 ELSE 0.5 END AS time_decay
        FROM distilled_memory
        ${distilledWhere}
      ) sub
      ORDER BY score DESC
      LIMIT $${paramIdx}
    `;
```

- [ ] **Step 3: Update last_used + increment times_used**

Replace the fire-and-forget update (lines 163-166) with:
```javascript
  if (distilledIds.length > 0) {
    pool.query(`
      UPDATE distilled_memory SET last_used = NOW(), times_used = COALESCE(times_used, 0) + 1
      WHERE id = ANY($1)
    `, [distilledIds]).catch(() => {});
  }
```

- [ ] **Step 4: Commit**
```bash
git add src/utils/recall.js src/db.js
git commit -m "feat: weighted recall scoring — similarity 60%, confidence+decay 25%, recency 10%, usage 5%"
```

---

### Task 3: Distillation hardening — session diversity, cluster dedup, per-type caps, contradiction pressure

**Files:**
- Modify: `src/workers/distillation-worker.js`

- [ ] **Step 1: Add session diversity check**

In `distillEditDeltas()`, after `if (brandEvents.length < MIN_EVENTS_FOR_DISTILLATION)`, add:
```javascript
    // Session diversity: require events from >= 2 different time windows (1hr apart)
    const timestamps = brandEvents.map(e => new Date(e.created_at).getTime());
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const timeSpreadHours = (maxTs - minTs) / (60 * 60 * 1000);
    if (timeSpreadHours < 1) {
      continue; // All from same session — not enough temporal diversity
    }

    // Adjust confidence based on time spread
    const timeSpreadDays = (maxTs - minTs) / (24 * 60 * 60 * 1000);
    const spreadFactor = Math.min(1, timeSpreadDays / 7);
```

Then pass `spreadFactor` to the chunk processing and apply it:
After `const rules = parseJSONSafe(raw);` and before the for-loop, add:
```javascript
        // Apply spread factor to confidence
        for (const rule of rules) {
          if (rule.confidence) {
            rule.confidence = Math.round(rule.confidence * spreadFactor * 100) / 100;
            rule.confidence = Math.max(0.3, rule.confidence); // floor
          }
        }
```

Apply the same session diversity check in `distillGeneralEvents()`.

- [ ] **Step 2: Add cluster dedup to upsertDistilledMemory**

Before the insert at the end of `upsertDistilledMemory()` (the `else` branch, ~line 362), add:
```javascript
    // Cluster dedup: check if top 3 similar memories say essentially the same thing
    const { rows: top3 } = await pool.query(`
      SELECT id, content, cosine_similarity(embedding, $1::float8[]) AS similarity
      FROM distilled_memory
      WHERE brand_id = $2 AND memory_type = $3
        ${userClause}
        AND superseded_by IS NULL AND embedding IS NOT NULL
      ORDER BY cosine_similarity(embedding, $1::float8[]) DESC
      LIMIT 3
    `, similarParams);

    const highSimilarCount = top3.filter(r => r.similarity > 0.80).length;
    if (highSimilarCount >= 2) {
      console.log(`[DistillationWorker] Skipping duplicate insight (${highSimilarCount} similar memories exist)`);
      return; // We already know this
    }
```

- [ ] **Step 3: Add per-type memory caps**

After the cluster dedup check, add:
```javascript
    // Per-type cap: max 30 voice rules, 50 total per brand
    const TYPE_CAPS = { BRAND_VOICE_RULE: 30, CREATIVE_PATTERN: 20 };
    const TOTAL_CAP = 50;
    const typeCap = TYPE_CAPS[insight.memory_type];

    if (typeCap) {
      const { rows: [{ count }] } = await pool.query(`
        SELECT COUNT(*)::int AS count FROM distilled_memory
        WHERE brand_id = $1 AND memory_type = $2 AND superseded_by IS NULL
          ${userClause}
      `, effectiveUserId != null ? [brandId, insight.memory_type, effectiveUserId] : [brandId, insight.memory_type]);

      if (count >= typeCap) {
        // Drop lowest effective_confidence entry
        await pool.query(`
          DELETE FROM distilled_memory WHERE id = (
            SELECT id FROM distilled_memory
            WHERE brand_id = $1 AND memory_type = $2 AND superseded_by IS NULL
              ${userClause}
            ORDER BY confidence * CASE WHEN last_updated IS NOT NULL
              THEN EXP(-EXTRACT(EPOCH FROM (NOW() - last_updated)) / (30 * 86400))
              ELSE 0.5 END ASC
            LIMIT 1
          )
        `, effectiveUserId != null ? [brandId, insight.memory_type, effectiveUserId] : [brandId, insight.memory_type]);
        console.log(`[DistillationWorker] Evicted lowest-confidence ${insight.memory_type} (cap: ${typeCap})`);
      }
    }
```

- [ ] **Step 4: Add contradiction pressure**

In the contradiction branch of `upsertDistilledMemory()` (the `if (alignment === 'contradict')` block, ~line 331), replace supersession with confidence reduction:
```javascript
    if (alignment === 'contradict') {
      // Contradiction pressure: reduce BOTH confidences by 0.1
      // The one that keeps getting reinforced wins; the other decays
      const reducedExisting = Math.max(0.1, existing.confidence - 0.1);
      const reducedNew = Math.max(0.1, insight.confidence - 0.1);

      await pool.query(`
        UPDATE distilled_memory SET confidence = $1, last_updated = NOW() WHERE id = $2
      `, [reducedExisting, existing.id]);

      // Still insert the new contradicting memory so it can compete
      await pool.query(`
        INSERT INTO distilled_memory (brand_id, user_id, memory_type, content, confidence, source_event_ids, reasoning, embedding, embedding_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::float8[], 'done')
      `, [brandId, effectiveUserId, insight.memory_type, insight.content, reducedNew, sourceEventIds, insight.reasoning, embeddingStr]);

      console.log(`[DistillationWorker] Contradiction: existing ${existing.id} (${existing.confidence}->${reducedExisting}), new (${insight.confidence}->${reducedNew})`);
    }
```

- [ ] **Step 5: Supersession escalation — use Sonnet for high-confidence alignment checks**

In `upsertDistilledMemory()`, replace the alignment LLM call (line 317-328) with:
```javascript
    // Escalate to Sonnet if either memory has high confidence (prevents corruption)
    const useHighModel = existing.confidence > 0.8 || insight.confidence > 0.8;
    const alignmentModel = useHighModel ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    if (!guard.trackLLMCall(alignmentModel)) return;

    let alignment = 'agree';
    try {
      const alignmentRaw = await callReflectionLLM(
        useHighModel ? 'strategic_rollup' : 'edit_delta_distillation',
        'You compare two knowledge rules. Reply with ONLY the word "agree" or "contradict". Nothing else.',
        `Existing rule: "${existing.content}"\nNew rule: "${insight.content}"`
      );
      alignment = alignmentRaw.trim().toLowerCase().includes('contradict') ? 'contradict' : 'agree';
    } catch (err) {
      console.warn('[DistillationWorker] Alignment check failed, defaulting to reinforce:', err.message);
    }
```

- [ ] **Step 6: Add source column to memory_events**

In `src/db.js`, after the memory_events CREATE TABLE, add:
```javascript
    await client.query(`
      ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'system';
    `);
```

- [ ] **Step 7: Commit**
```bash
git add src/workers/distillation-worker.js src/db.js
git commit -m "feat: intelligence hardening — session diversity, cluster dedup, per-type caps, contradiction pressure, supersession escalation, memory_events source"
```

---

### Task 4: DB Schema — scheduled_tasks, task_runs, domain_agents, brand_oauth_tokens

**Files:**
- Modify: `src/db.js` (add to `initSchema()`)

- [ ] **Step 1: Add all 4 tables**

Add the following to `initSchema()` in `src/db.js`, after the existing intelligence layer tables (before the final `console.log`):

```javascript
    // -- Agent Platform v1: Task Scheduler --
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid() UNIQUE,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        user_id INTEGER REFERENCES users(id),
        agent_slug TEXT NOT NULL DEFAULT 'ruhi',
        name TEXT NOT NULL,
        description TEXT,
        tier TEXT NOT NULL DEFAULT 'direct',
        tool TEXT NOT NULL,
        config JSONB DEFAULT '{}',
        schedule_type TEXT NOT NULL,
        cron_expression TEXT,
        interval_minutes INTEGER,
        run_after TIMESTAMPTZ,
        trigger_event TEXT,
        active_window_start TIME DEFAULT '07:00',
        active_window_end TIME DEFAULT '19:00',
        timezone TEXT DEFAULT 'Asia/Calcutta',
        enabled BOOLEAN DEFAULT true,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        last_status TEXT,
        last_error TEXT,
        run_count INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        requires_approval BOOLEAN DEFAULT false,
        max_cost_per_run NUMERIC(8,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks (next_run_at) WHERE enabled = true;
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_brand ON scheduled_tasks (brand_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES scheduled_tasks(id),
        agent_slug TEXT NOT NULL,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status TEXT DEFAULT 'running',
        tier TEXT NOT NULL,
        result JSONB,
        error TEXT,
        cost_usd NUMERIC(8,4) DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        plan JSONB,
        approval_message TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs (task_id, started_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS domain_agents (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        persona TEXT NOT NULL,
        tools TEXT[] NOT NULL,
        memory_tags TEXT[],
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_oauth_tokens (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        provider TEXT NOT NULL,
        scopes TEXT[] NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, provider)
      )
    `);
```

Update the version log:
```javascript
    console.log('Database schema initialized (v8 — agent platform)');
```

- [ ] **Step 2: Commit**
```bash
git add src/db.js
git commit -m "feat: add scheduled_tasks, task_runs, domain_agents, brand_oauth_tokens tables"
```

---

### Task 5: Install npm dependencies

- [ ] **Step 1: Install croner and eventemitter2**
```bash
cd /Users/vineet/ikawn-openbrain
npm install croner eventemitter2
```

- [ ] **Step 2: Commit**
```bash
git add package.json package-lock.json
git commit -m "deps: add croner (cron parsing) and eventemitter2 (wildcard events)"
```

---

## Chunk 2: Infrastructure — Event Bus, Schedule Utils, Google Auth, LLM Client, Tool Registry

### Task 6: Event Bus

**Files:**
- Create: `src/utils/event-bus.js`

- [ ] **Step 1: Create event bus**

```javascript
// src/utils/event-bus.js
'use strict';

const EventEmitter2 = require('eventemitter2');

const eventBus = new EventEmitter2({
  wildcard: true,
  delimiter: '.',
  maxListeners: 50,
});

module.exports = eventBus;
```

- [ ] **Step 2: Commit**
```bash
git add src/utils/event-bus.js
git commit -m "feat: add event bus (eventemitter2 with wildcard support)"
```

---

### Task 7: Schedule Utils (cron/interval next_run_at calculation)

**Files:**
- Create: `src/utils/schedule.js`

- [ ] **Step 1: Create schedule utility**

```javascript
// src/utils/schedule.js
'use strict';

const { Cron } = require('croner');

/**
 * Calculate the next run time for a task based on its schedule type.
 * @param {object} task - scheduled_tasks row
 * @returns {Date|null} next run time, or null if task should not run again
 */
function calculateNextRun(task) {
  switch (task.schedule_type) {
    case 'cron': {
      if (!task.cron_expression) return null;
      const job = new Cron(task.cron_expression, { timezone: task.timezone || 'Asia/Calcutta' });
      const next = job.nextRun();
      return next || null;
    }
    case 'interval': {
      if (!task.interval_minutes) return null;
      const base = task.last_run_at ? new Date(task.last_run_at) : new Date();
      return new Date(base.getTime() + task.interval_minutes * 60 * 1000);
    }
    case 'once': {
      if (task.run_count > 0) return null;
      return task.run_after ? new Date(task.run_after) : new Date();
    }
    case 'trigger': {
      return null;
    }
    default:
      return null;
  }
}

/**
 * Check if current time is within the task's active window.
 * @param {object} task - scheduled_tasks row
 * @returns {boolean}
 */
function isInActiveWindow(task) {
  if (!task.active_window_start || !task.active_window_end) return true;

  const tz = task.timezone || 'Asia/Calcutta';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const nowMinutes = hour * 60 + minute;

  const [startH, startM] = task.active_window_start.split(':').map(Number);
  const [endH, endM] = task.active_window_end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

module.exports = { calculateNextRun, isInActiveWindow };
```

- [ ] **Step 2: Commit**
```bash
git add src/utils/schedule.js
git commit -m "feat: add schedule utils — cron/interval/once next_run_at + active window check"
```

---

### Task 8: Google OAuth Token Management

**Files:**
- Create: `src/utils/google-auth.js`

- [ ] **Step 1: Create google-auth.js**

```javascript
// src/utils/google-auth.js
'use strict';

const { google } = require('googleapis');
const { pool } = require('../db');
const { sendTelegramMessage } = require('./telegram');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://ikawn-openbrain.fly.dev/auth/google/callback';

/**
 * Get an authenticated Google API client for a brand.
 * Auto-refreshes expired tokens and updates DB.
 */
async function getGoogleClient(brandId, requiredScopes = []) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[GoogleAuth] OAuth not configured');
    return null;
  }

  const { rows } = await pool.query(
    'SELECT * FROM brand_oauth_tokens WHERE brand_id = $1 AND provider = $2',
    [brandId, 'google']
  );

  if (rows.length === 0) {
    console.warn(`[GoogleAuth] No OAuth token for brand ${brandId}`);
    return null;
  }

  const token = rows[0];
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: new Date(token.expires_at).getTime(),
  });

  // Auto-refresh if expired (5 min buffer)
  const expiresAt = new Date(token.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await pool.query(
        `UPDATE brand_oauth_tokens
         SET access_token = $1, expires_at = $2, updated_at = NOW()
         WHERE brand_id = $3 AND provider = 'google'`,
        [credentials.access_token, new Date(credentials.expiry_date), brandId]
      );
      console.log(`[GoogleAuth] Refreshed token for brand ${brandId}`);
    } catch (err) {
      console.error(`[GoogleAuth] Token refresh failed for brand ${brandId}:`, err.message);
      sendTelegramMessage(`Warning: Google OAuth refresh failed for ${brandId}: ${err.message}`);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Generate OAuth consent URL for a brand.
 */
function getAuthUrl(brandId, scopes) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.map(s => `https://www.googleapis.com/auth/${s}`),
    state: brandId,
  });
}

/**
 * Exchange authorization code for tokens and store in DB.
 */
async function handleCallback(code, brandId, scopes) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const { tokens } = await oauth2Client.getToken(code);

  await pool.query(`
    INSERT INTO brand_oauth_tokens (brand_id, provider, scopes, access_token, refresh_token, expires_at)
    VALUES ($1, 'google', $2, $3, $4, $5)
    ON CONFLICT (brand_id, provider) DO UPDATE SET
      scopes = $2, access_token = $3, refresh_token = COALESCE($4, brand_oauth_tokens.refresh_token),
      expires_at = $5, updated_at = NOW()
  `, [brandId, scopes, tokens.access_token, tokens.refresh_token, new Date(tokens.expiry_date)]);

  console.log(`[GoogleAuth] Stored tokens for brand ${brandId}`);
}

module.exports = { getGoogleClient, getAuthUrl, handleCallback };
```

- [ ] **Step 2: Commit**
```bash
git add src/utils/google-auth.js
git commit -m "feat: add Google OAuth token management with auto-refresh"
```

---

### Task 9: LLM Client — Anthropic primary + OpenAI fallback with cost tracking

**Files:**
- Create: `src/agent/llm-client.js`

- [ ] **Step 1: Create llm-client.js**

```javascript
// src/agent/llm-client.js
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Cost per 1M tokens (input/output) — update when pricing changes
const PRICING = {
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gpt-5.2':                   { input: 2.50, output: 10.00 },
  'gpt-4o':                    { input: 2.50, output: 10.00 },
};

let _anthropic = null;
let _openai = null;

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * Calculate cost from token usage.
 */
function calculateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] || { input: 5.00, output: 15.00 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/**
 * Call Claude with tool_use support. Primary path for Tier 2 agent execution.
 */
async function callClaude(params) {
  const { system, messages, tools = [], serverTools = [], maxTokens = 4096 } = params;
  const model = 'claude-sonnet-4-6';
  const client = getAnthropic();

  const allTools = [...tools, ...serverTools];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools: allTools.length > 0 ? allTools : undefined,
  });

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  return {
    response,
    cost: {
      model,
      inputTokens,
      outputTokens,
      costUsd: calculateCost(model, inputTokens, outputTokens),
    },
  };
}

/**
 * Fallback: call OpenAI GPT-5.2 with tool_use support.
 */
async function callOpenAIFallback(params) {
  const { system, messages, tools = [], maxTokens = 4096 } = params;
  const model = 'gpt-5.2';
  const client = getOpenAI();

  const openaiTools = tools
    .filter(t => t.type !== 'server_tool')
    .map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

  const openaiMessages = [
    { role: 'system', content: system },
    ...messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  ];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: openaiMessages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
  });

  const usage = response.usage || {};
  return {
    response,
    cost: {
      model,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      costUsd: calculateCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0),
    },
  };
}

/**
 * Call LLM with automatic fallback.
 * Anthropic primary -> retry once with 5s backoff -> OpenAI fallback.
 */
async function callWithFallback(params) {
  try {
    return await callClaude(params);
  } catch (err) {
    console.warn(`[LLMClient] Anthropic failed: ${err.message}. Retrying in 5s...`);
  }

  await new Promise(r => setTimeout(r, 5000));
  try {
    return await callClaude(params);
  } catch (err) {
    console.warn(`[LLMClient] Anthropic retry failed: ${err.message}. Falling back to OpenAI...`);
  }

  return await callOpenAIFallback(params);
}

module.exports = { callClaude, callOpenAIFallback, callWithFallback, calculateCost, PRICING };
```

- [ ] **Step 2: Commit**
```bash
mkdir -p /Users/vineet/ikawn-openbrain/src/agent
git add src/agent/llm-client.js
git commit -m "feat: add LLM client — Anthropic primary + OpenAI fallback with cost tracking"
```

---

### Task 10: Tool Registry

**Files:**
- Create: `src/tools/registry.js`

- [ ] **Step 1: Create registry.js**

```javascript
// src/tools/registry.js
'use strict';

const fs = require('fs');
const path = require('path');

const tools = new Map();

/**
 * Load all *.tool.js files from the tools directory.
 */
function loadTools() {
  const toolsDir = path.join(__dirname);
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.tool.js'));

  for (const file of files) {
    try {
      const tool = require(path.join(toolsDir, file));
      if (!tool.name || !tool.execute) {
        console.warn(`[ToolRegistry] Skipping ${file}: missing name or execute`);
        continue;
      }
      tools.set(tool.name, tool);
      console.log(`[ToolRegistry] Loaded: ${tool.name} (${tool.tier || 'direct'})`);
    } catch (err) {
      console.error(`[ToolRegistry] Failed to load ${file}:`, err.message);
    }
  }

  console.log(`[ToolRegistry] ${tools.size} tools loaded`);
}

function getTools() { return tools; }
function getTool(name) { return tools.get(name); }

function getToolsForAgent(allowedTools) {
  const filtered = new Map();
  for (const name of allowedTools) {
    const tool = tools.get(name);
    if (tool) filtered.set(name, tool);
  }
  return filtered;
}

/**
 * Generate Anthropic tool_use definitions for a set of tool names.
 */
function getToolSchemas(toolNames) {
  const schemas = [];
  for (const name of toolNames) {
    const tool = tools.get(name);
    if (!tool) continue;

    const properties = {};
    const required = [];
    for (const [key, def] of Object.entries(tool.parameters || {})) {
      properties[key] = { type: def.type, description: def.description };
      if (def.enum) properties[key].enum = def.enum;
      if (def.required) required.push(key);
    }

    schemas.push({
      name: tool.name,
      description: tool.description,
      input_schema: { type: 'object', properties, required },
    });
  }
  return schemas;
}

module.exports = { loadTools, getTools, getTool, getToolsForAgent, getToolSchemas };
```

- [ ] **Step 2: Commit**
```bash
mkdir -p /Users/vineet/ikawn-openbrain/src/tools
git add src/tools/registry.js
git commit -m "feat: add tool registry — auto-loads *.tool.js, generates Anthropic tool schemas"
```

---

## Chunk 3: Tools (13 tool files)

### Task 11: Core tools — notify, system_status, fly_status, manage_task

**Files:**
- Create: `src/tools/notify.tool.js`
- Create: `src/tools/system.tool.js`
- Create: `src/tools/fly.tool.js`
- Create: `src/tools/manage-task.tool.js`

- [ ] **Step 1: Create notify.tool.js**

```javascript
// src/tools/notify.tool.js
'use strict';

const { sendTelegramMessage } = require('../utils/telegram');

module.exports = {
  name: 'notify',
  description: 'Send a notification message via Telegram or web chat to the user',
  tier: 'direct',
  parameters: {
    message: { type: 'string', required: true, description: 'Message to send (HTML supported)' },
    channel: { type: 'string', required: false, description: 'Channel: telegram or web', enum: ['telegram', 'web'] },
  },
  async execute(config, context) {
    const channel = config.channel || 'telegram';
    if (channel === 'telegram') {
      const sent = await sendTelegramMessage(config.message, { reply_markup: config.reply_markup });
      return { success: sent, data: { channel: 'telegram' }, summary: sent ? 'Notification sent via Telegram' : 'Failed to send' };
    }
    return { success: true, data: { channel: 'web', message: config.message }, summary: 'Notification queued for web' };
  },
};
```

- [ ] **Step 2: Create system.tool.js**

```javascript
// src/tools/system.tool.js
'use strict';

const { pool } = require('../db');
const { getAllWorkerStatus } = require('../utils/worker-guards');

module.exports = {
  name: 'system_status',
  description: 'Get OpenBrain system health: database stats, worker status, memory counts',
  tier: 'direct',
  parameters: {},
  async execute(config, context) {
    const [memCount, convCount, taskCount, workerStatus] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM memories WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*)::int AS count FROM conversations'),
      pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM scheduled_tasks WHERE brand_id = $1", [context.brandId || 'ikawn']),
      Promise.resolve(getAllWorkerStatus()),
    ]);

    const data = {
      memories: memCount.rows[0].count,
      conversations: convCount.rows[0].count,
      tasks: taskCount.rows[0],
      workers: workerStatus,
      timestamp: new Date().toISOString(),
    };

    return {
      success: true,
      data,
      summary: `System healthy. ${data.memories} memories, ${data.conversations} conversations, ${data.tasks.active} active tasks.`,
    };
  },
};
```

- [ ] **Step 3: Create fly.tool.js**

```javascript
// src/tools/fly.tool.js
'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const FLYCTL = process.env.FLYCTL_PATH || `${process.env.HOME}/.fly/bin/flyctl`;

module.exports = {
  name: 'fly_status',
  description: 'Get Fly.io app status including machine state and resource usage',
  tier: 'direct',
  parameters: {
    app: { type: 'string', required: false, description: 'Fly app name (default: ikawn-openbrain)' },
  },
  async execute(config, context) {
    const app = config.app || 'ikawn-openbrain';
    const allowed = ['ikawn-openbrain', 'ikawn-v3'];
    if (!allowed.includes(app)) {
      return { success: false, data: null, summary: `App ${app} not in allowed list` };
    }

    try {
      const { stdout } = await execFileAsync(FLYCTL, ['status', '--app', app, '--json'], { timeout: 15000 });
      const parsed = JSON.parse(stdout);
      return {
        success: true,
        data: {
          app: parsed.Name,
          status: parsed.Status,
          machines: (parsed.Machines || []).map(m => ({ id: m.id, state: m.state, region: m.region })),
        },
        summary: `${app}: ${parsed.Status}. ${(parsed.Machines || []).length} machine(s).`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Failed to get Fly status: ${err.message}` };
    }
  },
};
```

- [ ] **Step 4: Create manage-task.tool.js**

```javascript
// src/tools/manage-task.tool.js
'use strict';

const { pool } = require('../db');
const { calculateNextRun } = require('../utils/schedule');

module.exports = {
  name: 'manage_task',
  description: 'Create, list, enable, disable, delete, or immediately run scheduled tasks',
  tier: 'direct',
  parameters: {
    action: { type: 'string', required: true, description: 'Action', enum: ['create', 'list', 'enable', 'disable', 'delete', 'run_now', 'update'] },
    task_uuid: { type: 'string', required: false, description: 'Task UUID (for enable/disable/delete/run_now/update)' },
    name: { type: 'string', required: false, description: 'Task name (for create)' },
    tool: { type: 'string', required: false, description: 'Tool to execute (for create)' },
    agent_slug: { type: 'string', required: false, description: 'Agent slug (default: ruhi)' },
    tier: { type: 'string', required: false, description: 'direct or agent', enum: ['direct', 'agent'] },
    schedule_type: { type: 'string', required: false, description: 'Schedule type', enum: ['cron', 'interval', 'once', 'trigger'] },
    interval_minutes: { type: 'number', required: false, description: 'Interval in minutes' },
    cron_expression: { type: 'string', required: false, description: 'Cron expression' },
    trigger_event: { type: 'string', required: false, description: 'Event name for trigger type' },
    config: { type: 'object', required: false, description: 'Tool config JSON' },
    requires_approval: { type: 'boolean', required: false, description: 'Require human approval' },
    description: { type: 'string', required: false, description: 'Task description' },
  },
  async execute(config, context) {
    const brandId = context.brandId || 'ikawn';

    switch (config.action) {
      case 'list': {
        const { rows } = await pool.query(
          `SELECT uuid, name, tool, agent_slug, tier, schedule_type, enabled, last_status, last_run_at, next_run_at, run_count, consecutive_failures
           FROM scheduled_tasks WHERE brand_id = $1
           ORDER BY enabled DESC, next_run_at ASC NULLS LAST`,
          [brandId]
        );
        return { success: true, data: { tasks: rows }, summary: `${rows.length} task(s) found.` };
      }

      case 'create': {
        if (!config.name || !config.tool || !config.schedule_type) {
          return { success: false, data: null, summary: 'Missing required fields: name, tool, schedule_type' };
        }
        const task = {
          brand_id: brandId,
          user_id: context.userId || null,
          agent_slug: config.agent_slug || 'ruhi',
          name: config.name,
          description: config.description || null,
          tier: config.tier || 'direct',
          tool: config.tool,
          config: config.config || {},
          schedule_type: config.schedule_type,
          cron_expression: config.cron_expression || null,
          interval_minutes: config.interval_minutes || null,
          trigger_event: config.trigger_event || null,
          requires_approval: config.requires_approval || false,
        };
        const nextRun = calculateNextRun(task);
        const { rows } = await pool.query(`
          INSERT INTO scheduled_tasks (brand_id, user_id, agent_slug, name, description, tier, tool, config, schedule_type, cron_expression, interval_minutes, trigger_event, requires_approval, next_run_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING uuid, name
        `, [task.brand_id, task.user_id, task.agent_slug, task.name, task.description, task.tier, task.tool, JSON.stringify(task.config), task.schedule_type, task.cron_expression, task.interval_minutes, task.trigger_event, task.requires_approval, nextRun]);
        return { success: true, data: rows[0], summary: `Task "${rows[0].name}" created (${config.schedule_type}).` };
      }

      case 'enable':
      case 'disable': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const enabled = config.action === 'enable';
        const { rowCount } = await pool.query(
          'UPDATE scheduled_tasks SET enabled = $1, updated_at = NOW() WHERE uuid = $2 AND brand_id = $3',
          [enabled, config.task_uuid, brandId]
        );
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? `Task ${config.action}d.` : 'Task not found.' };
      }

      case 'delete': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const { rowCount } = await pool.query('DELETE FROM scheduled_tasks WHERE uuid = $1 AND brand_id = $2', [config.task_uuid, brandId]);
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task deleted.' : 'Task not found.' };
      }

      case 'run_now': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const { rowCount } = await pool.query(
          "UPDATE scheduled_tasks SET next_run_at = NOW(), updated_at = NOW() WHERE uuid = $1 AND brand_id = $2 AND enabled",
          [config.task_uuid, brandId]
        );
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task queued for immediate execution.' : 'Task not found or disabled.' };
      }

      case 'update': {
        if (!config.task_uuid) return { success: false, data: null, summary: 'task_uuid required' };
        const updates = [];
        const params = [config.task_uuid, brandId];
        let idx = 3;
        if (config.name) { updates.push(`name = $${idx++}`); params.push(config.name); }
        if (config.description) { updates.push(`description = $${idx++}`); params.push(config.description); }
        if (config.interval_minutes) { updates.push(`interval_minutes = $${idx++}`); params.push(config.interval_minutes); }
        if (config.cron_expression) { updates.push(`cron_expression = $${idx++}`); params.push(config.cron_expression); }
        if (config.config) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config.config)); }
        if (config.requires_approval !== undefined) { updates.push(`requires_approval = $${idx++}`); params.push(config.requires_approval); }
        if (updates.length === 0) return { success: false, data: null, summary: 'No fields to update.' };
        updates.push('updated_at = NOW()');
        const { rowCount } = await pool.query(`UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE uuid = $1 AND brand_id = $2`, params);
        return { success: rowCount > 0, data: null, summary: rowCount > 0 ? 'Task updated.' : 'Task not found.' };
      }

      default:
        return { success: false, data: null, summary: `Unknown action: ${config.action}` };
    }
  },
};
```

- [ ] **Step 5: Commit**
```bash
git add src/tools/notify.tool.js src/tools/system.tool.js src/tools/fly.tool.js src/tools/manage-task.tool.js
git commit -m "feat: add core tools — notify, system_status, fly_status, manage_task"
```

---

### Task 12: Google API tools — calendar, gmail, ga

**Files:**
- Create: `src/tools/calendar.tool.js`
- Create: `src/tools/gmail.tool.js`
- Create: `src/tools/ga.tool.js`

- [ ] **Step 1: Create calendar.tool.js**

```javascript
// src/tools/calendar.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'calendar_read',
  description: 'Fetch upcoming Google Calendar events for the next N hours',
  tier: 'direct',
  parameters: {
    hours: { type: 'number', required: false, description: 'Hours ahead to fetch (default: 24)' },
    calendar_id: { type: 'string', required: false, description: 'Calendar ID (default: primary)' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['calendar.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Google Calendar not connected.' };

    const calendar = google.calendar({ version: 'v3', auth });
    const hours = config.hours || 24;
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    try {
      const res = await calendar.events.list({
        calendarId: config.calendar_id || 'primary',
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20,
      });
      const events = (res.data.items || []).map(e => ({
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        attendees: (e.attendees || []).map(a => a.email).join(', '),
        location: e.location,
        meetLink: e.hangoutLink,
      }));
      return {
        success: true,
        data: { events, count: events.length },
        summary: events.length > 0
          ? `${events.length} event(s) in next ${hours}h: ${events.map(e => e.summary).join(', ')}`
          : `No events in the next ${hours}h.`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Calendar fetch failed: ${err.message}` };
    }
  },
};
```

- [ ] **Step 2: Create gmail.tool.js**

```javascript
// src/tools/gmail.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'gmail_read',
  description: 'Fetch recent Gmail messages matching a query (default: unread inbox)',
  tier: 'direct',
  parameters: {
    query: { type: 'string', required: false, description: 'Gmail search query (default: is:unread in:inbox)' },
    max_results: { type: 'number', required: false, description: 'Max messages (default: 10)' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['gmail.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Gmail not connected.' };

    const gmail = google.gmail({ version: 'v1', auth });
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: config.query || 'is:unread in:inbox',
        maxResults: config.max_results || 10,
      });
      const messageIds = (listRes.data.messages || []).map(m => m.id);
      const messages = [];
      for (const id of messageIds) {
        const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const headers = msg.data.payload?.headers || [];
        messages.push({
          id: msg.data.id,
          from: headers.find(h => h.name === 'From')?.value || '',
          subject: headers.find(h => h.name === 'Subject')?.value || '',
          date: headers.find(h => h.name === 'Date')?.value || '',
          snippet: msg.data.snippet || '',
        });
      }
      return {
        success: true,
        data: { messages, count: messages.length },
        summary: messages.length > 0
          ? `${messages.length} message(s): ${messages.slice(0, 3).map(m => m.subject).join(', ')}${messages.length > 3 ? '...' : ''}`
          : 'No messages matching query.',
      };
    } catch (err) {
      return { success: false, data: null, summary: `Gmail fetch failed: ${err.message}` };
    }
  },
};
```

- [ ] **Step 3: Create ga.tool.js**

```javascript
// src/tools/ga.tool.js
'use strict';

const { google } = require('googleapis');
const { getGoogleClient } = require('../utils/google-auth');

module.exports = {
  name: 'ga_report',
  description: 'Fetch Google Analytics 4 summary: sessions, top pages, traffic sources',
  tier: 'direct',
  parameters: {
    days: { type: 'number', required: false, description: 'Days of data (default: 7)' },
    property_id: { type: 'string', required: false, description: 'GA4 property ID' },
  },
  async execute(config, context) {
    const auth = await getGoogleClient(context.brandId || 'ikawn', ['analytics.readonly']);
    if (!auth) return { success: false, data: null, summary: 'Google Analytics not connected.' };

    const propertyId = config.property_id || process.env.GA4_PROPERTY_ID;
    if (!propertyId) return { success: false, data: null, summary: 'GA4 property ID not configured.' };

    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const days = config.days || 7;

    try {
      const [sessionsReport, pagesReport] = await Promise.all([
        analyticsdata.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
          },
        }),
        analyticsdata.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 10,
          },
        }),
      ]);

      const metrics = sessionsReport.data.rows?.[0]?.metricValues || [];
      const topPages = (pagesReport.data.rows || []).map(r => ({
        page: r.dimensionValues[0]?.value,
        views: parseInt(r.metricValues[0]?.value || '0', 10),
      }));

      const data = {
        period: `Last ${days} days`,
        sessions: parseInt(metrics[0]?.value || '0', 10),
        activeUsers: parseInt(metrics[1]?.value || '0', 10),
        bounceRate: parseFloat(metrics[2]?.value || '0').toFixed(1) + '%',
        avgSessionDuration: parseFloat(metrics[3]?.value || '0').toFixed(0) + 's',
        topPages,
      };

      return {
        success: true,
        data,
        summary: `Last ${days}d: ${data.sessions} sessions, ${data.activeUsers} users, ${data.bounceRate} bounce. Top: ${topPages[0]?.page || 'N/A'}`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `GA report failed: ${err.message}` };
    }
  },
};
```

- [ ] **Step 4: Commit**
```bash
git add src/tools/calendar.tool.js src/tools/gmail.tool.js src/tools/ga.tool.js
git commit -m "feat: add Google API tools — calendar_read, gmail_read, ga_report"
```

---

### Task 13: Content + ikawn OS tools

**Files:**
- Create: `src/tools/content.tool.js`
- Create: `src/tools/ikawn-os.tool.js`

- [ ] **Step 1: Create content.tool.js**

```javascript
// src/tools/content.tool.js
'use strict';

const { generateWithMemory } = require('../utils/generate-with-memory');

module.exports = {
  name: 'content_draft',
  description: 'Draft social media posts, captions, or marketing copy using brand voice',
  tier: 'agent',
  parameters: {
    topic: { type: 'string', required: true, description: 'What to write about' },
    platform: { type: 'string', required: false, description: 'Target platform', enum: ['instagram', 'twitter', 'linkedin', 'general'] },
    tone: { type: 'string', required: false, description: 'Tone override' },
    count: { type: 'number', required: false, description: 'Number of variations (default: 3)' },
  },
  async execute(config, context) {
    const platform = config.platform || 'general';
    const count = config.count || 3;
    const task = `Write ${count} ${platform} post variations about: ${config.topic}.${config.tone ? ` Tone: ${config.tone}.` : ''} Return as a JSON array of strings.`;

    try {
      const result = await generateWithMemory({
        brandId: context.brandId || 'ikawn',
        userId: context.userId,
        task,
        memoryTypes: ['BRAND_VOICE_RULE', 'CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT'],
        memoryLimit: 10,
      });
      return {
        success: true,
        data: { drafts: result.content, memoriesUsed: result.memoriesUsed },
        summary: `Drafted ${count} ${platform} post variations about "${config.topic}".`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Content drafting failed: ${err.message}` };
    }
  },
};
```

- [ ] **Step 2: Create ikawn-os.tool.js**

```javascript
// src/tools/ikawn-os.tool.js
'use strict';

module.exports = {
  name: 'ikawn_generate',
  description: 'Trigger image/video generation on ikawn OS (os.ikawn.com) via external API',
  tier: 'agent',
  parameters: {
    agent: { type: 'string', required: true, description: 'Agent', enum: ['genie', 'remix', 'prism', 'lazarus'] },
    prompt: { type: 'string', required: true, description: 'Generation prompt' },
    image_url: { type: 'string', required: false, description: 'Input image URL (for remix/prism/lazarus)' },
  },
  async execute(config, context) {
    const apiUrl = process.env.IKAWN_OS_API_URL || 'https://os.ikawn.com';
    const apiKey = process.env.IKAWN_OS_API_KEY;
    if (!apiKey) return { success: false, data: null, summary: 'IKAWN_OS_API_KEY not configured.' };

    try {
      const body = { agent: config.agent, prompt: config.prompt };
      if (config.image_url) body.image_url = config.image_url;

      const res = await fetch(`${apiUrl}/api/external/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, data: null, summary: `Generation failed: ${res.status} ${err}` };
      }

      const data = await res.json();
      return { success: true, data: { generationId: data.id, status: data.status }, summary: `Generation started on ${config.agent}. ID: ${data.id}` };
    } catch (err) {
      return { success: false, data: null, summary: `ikawn OS generation failed: ${err.message}` };
    }
  },
};
```

- [ ] **Step 3: Commit**
```bash
git add src/tools/content.tool.js src/tools/ikawn-os.tool.js
git commit -m "feat: add content_draft and ikawn_generate tools"
```

---

## Chunk 4: Agent Executor, Seeds, Scheduler Integration

### Task 14: Agent Executor (Tier 2)

**Files:**
- Create: `src/agent/executor.js`

- [ ] **Step 1: Create executor.js**

```javascript
// src/agent/executor.js
'use strict';

const { pool } = require('../db');
const { callWithFallback } = require('./llm-client');
const { getTool, getToolSchemas } = require('../tools/registry');
const { recall } = require('../utils/recall');
const { captureMessage } = require('../utils/capture');
const { sendTelegramMessage } = require('../utils/telegram');

const MAX_TOOL_ROUNDS = 10;

/**
 * Execute a Tier 2 (agent) task.
 * Claude reasons about the task, calls tools, and produces a final result.
 */
async function executeAgentTask(task, agentDef) {
  const brandId = task.brand_id || 'ikawn';
  let totalCost = 0;
  let totalTokens = 0;

  // 1. Build context: RAG + past runs
  let memoryContext = '';
  try {
    const recalled = await recall({
      brandId,
      query: `${task.name}: ${task.description || task.tool}`,
      memoryTypes: agentDef.memory_tags || undefined,
      source: 'both',
      limit: 10,
    });
    if (recalled.memories.length > 0) {
      memoryContext = recalled.memories.map(m => `- [${m.memoryType}] ${m.content}`).join('\n');
    }
  } catch (err) {
    console.warn(`[Executor] RAG failed for task ${task.id}:`, err.message);
  }

  let pastRunsContext = '';
  try {
    const { rows: pastRuns } = await pool.query(
      'SELECT status, result, error, completed_at FROM task_runs WHERE task_id = $1 ORDER BY started_at DESC LIMIT 3',
      [task.id]
    );
    if (pastRuns.length > 0) {
      pastRunsContext = pastRuns.map(r => {
        const date = r.completed_at ? new Date(r.completed_at).toLocaleDateString() : 'in-progress';
        return `[${date}] ${r.status}: ${r.result?.summary || r.error || 'no details'}`;
      }).join('\n');
    }
  } catch (_) {}

  // 2. System prompt
  const systemPrompt = `${agentDef.persona}

CURRENT TASK: ${task.name}
${task.description ? `DESCRIPTION: ${task.description}` : ''}
TASK CONFIG: ${JSON.stringify(task.config || {})}

${memoryContext ? `RELEVANT MEMORY:\n${memoryContext}` : ''}
${pastRunsContext ? `PAST RUNS:\n${pastRunsContext}` : ''}

INSTRUCTIONS:
- Use tools to complete this task
- Be thorough but efficient
- End with a clear summary of what you did`;

  // 3. Tool definitions
  const agentTools = getToolSchemas(agentDef.tools || []);
  const serverTools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  // 4. Multi-turn agent loop
  const messages = [{ role: 'user', content: `Execute task: ${task.name}` }];
  let finalResult = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { response, cost } = await callWithFallback({
      system: systemPrompt,
      messages,
      tools: agentTools,
      serverTools,
    });

    totalCost += cost.costUsd;
    totalTokens += cost.inputTokens + cost.outputTokens;

    if (task.max_cost_per_run && totalCost > parseFloat(task.max_cost_per_run)) {
      sendTelegramMessage(`Warning: Task "${task.name}" exceeded cost cap ($${totalCost.toFixed(4)}). Stopping.`);
      return { success: false, result: { summary: 'Cost cap exceeded' }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      finalResult = { summary: textBlocks.map(b => b.text).join('\n') };
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      const tool = getTool(toolBlock.name);
      let result;
      if (!tool) {
        result = { success: false, data: null, summary: `Unknown tool: ${toolBlock.name}` };
      } else {
        try {
          result = await tool.execute(toolBlock.input || {}, { brandId, userId: task.user_id, pool });
        } catch (err) {
          result = { success: false, data: null, summary: `Tool error: ${err.message}` };
        }
      }
      toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (!finalResult) finalResult = { summary: 'Agent reached max tool rounds without final response' };

  // 5. Capture to memory
  captureMessage({
    brand_id: brandId,
    channel: 'agent',
    direction: 'outbound',
    content: `[${agentDef.slug}] Task "${task.name}": ${finalResult.summary}`.slice(0, 2000),
    source_ref: `agent_${task.id}_${Date.now()}`,
    metadata: { project: 'agent-platform' },
  });

  return { success: true, result: finalResult, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
}

module.exports = { executeAgentTask };
```

- [ ] **Step 2: Commit**
```bash
git add src/agent/executor.js
git commit -m "feat: add Tier 2 agent executor — Claude + tool_use multi-turn loop"
```

---

### Task 15: Agent Seed Scripts

**Files:**
- Create: `src/agents/ruhi.seed.js`
- Create: `src/agents/marketing.seed.js`
- Create: `src/agents/tech.seed.js`
- Create: `src/agents/seed-all.js`

- [ ] **Step 1: Create all seed files**

See spec Section 5 for full persona text. Seed files export `{ slug, name, role, tools, memory_tags, persona }`. seed-all.js reads all *.seed.js files and does `INSERT INTO domain_agents ... ON CONFLICT (slug) DO NOTHING`.

(Full code for each seed file is in the spec. Key fields:)
- **ruhi.seed.js**: slug='ruhi', role='Co-CEO', all tools
- **marketing.seed.js**: slug='marketing', role='CMO', tools: ga_report, content_draft, ikawn_generate, notify
- **tech.seed.js**: slug='tech', role='CTO', tools: system_status, fly_status, ga_report, content_draft, notify

- [ ] **Step 2: Create seed-all.js**

```javascript
// src/agents/seed-all.js
'use strict';

const { pool } = require('../db');
const path = require('path');
const fs = require('fs');

async function seedAgents() {
  const agentsDir = __dirname;
  const seedFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.seed.js') && f !== 'seed-all.js');

  let seeded = 0;
  for (const file of seedFiles) {
    const agent = require(path.join(agentsDir, file));
    if (!agent.slug || !agent.persona) continue;

    const { rowCount } = await pool.query(`
      INSERT INTO domain_agents (slug, brand_id, name, role, persona, tools, memory_tags)
      VALUES ($1, 'ikawn', $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO NOTHING
    `, [agent.slug, agent.name, agent.role, agent.persona, agent.tools, agent.memory_tags]);

    if (rowCount > 0) {
      seeded++;
      console.log(`[AgentSeed] Seeded: ${agent.slug} (${agent.role})`);
    }
  }
  console.log(`[AgentSeed] Done. ${seeded} new agent(s) seeded.`);
}

module.exports = { seedAgents };
```

- [ ] **Step 3: Commit**
```bash
mkdir -p /Users/vineet/ikawn-openbrain/src/agents
git add src/agents/
git commit -m "feat: add domain agent seeds — Ruhi (Co-CEO), Marketing (CMO), Tech (CTO)"
```

---

### Task 16: Task Scheduler — polling loop + event bus

**Files:**
- Modify: `src/scheduler.js`

- [ ] **Step 1: Rewrite scheduler with task polling**

Key changes to existing `src/scheduler.js`:
1. Import `loadTools` from registry, `executeAgentTask` from executor, `calculateNextRun`/`isInActiveWindow` from schedule, `eventBus` from event-bus
2. Call `loadTools()` in `startScheduler()`
3. Add `setInterval(runTaskScheduler, 30_000)` — the 30s polling loop
4. `runTaskScheduler()`: BEGIN, advisory lock, SELECT due tasks FOR UPDATE SKIP LOCKED, execute each, COMMIT
5. `executeTask()`: create task_run, call tool directly (tier=direct) or executeAgentTask (tier=agent), update next_run_at, handle failures, 3-failure auto-disable with Telegram alert
6. `setupEventListeners()`: `eventBus.onAny()` — match trigger_event, set next_run_at = NOW()
7. Keep existing GitHub/Calendar/Retention intervals

(Full implementation in the plan code — see Chunk 4 of spec walkthrough above)

- [ ] **Step 2: Commit**
```bash
git add src/scheduler.js
git commit -m "feat: add 30s task scheduler with advisory locks, 3-failure auto-disable, event bus triggers"
```

---

### Task 17: Wire up index.js — seed agents on startup

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add seedAgents require and call**

Add to top of index.js:
```javascript
const { seedAgents } = require('./agents/seed-all');
```

In `start()`, after `await initSchema();`:
```javascript
    await seedAgents();
```

- [ ] **Step 2: Commit**
```bash
git add src/index.js
git commit -m "feat: wire up agent seeding on app startup"
```

---

## Chunk 5: Chat Integration — Telegram + Web Chat + Persona

### Task 18: Telegram — manage_task tool_use + callback query handler

**Files:**
- Modify: `src/routes/webhooks.js`

- [ ] **Step 1: Add manage_task tool to intelligence-telegram handler**

Add `manage_task` to the tools array in the Anthropic call (~line 340). Handle tool_use blocks in the response — if Claude calls manage_task, execute it via the registry, feed result back, get final text response.

- [ ] **Step 2: Add callback query handler for approval buttons**

New route: `POST /webhooks/intelligence-telegram-callback/:token`
Handles inline keyboard callbacks (approve/reject), updates task_runs status, captures rejection as CORRECTION memory.

- [ ] **Step 3: Commit**
```bash
git add src/routes/webhooks.js
git commit -m "feat: add manage_task tool_use to Telegram + approval callback handler"
```

---

### Task 19: Web chat — manage_task tool_use

**Files:**
- Modify: `src/routes/ruhi-chat.js`

- [ ] **Step 1: Add manage_task tool definition to web chat**

Similar to Telegram: add manage_task to the Anthropic call, handle tool_use blocks before streaming final response.

- [ ] **Step 2: Commit**
```bash
git add src/routes/ruhi-chat.js
git commit -m "feat: add manage_task tool_use to web chat"
```

---

### Task 20: Persona — task management awareness

**Files:**
- Modify: `src/ruhi/persona.js`

- [ ] **Step 1: Add task management section to system prompt**

Add a `TASK MANAGEMENT:` section listing available tools, schedule types, and tier guidance.

- [ ] **Step 2: Commit**
```bash
git add src/ruhi/persona.js
git commit -m "feat: add task management awareness to Ruhi persona"
```

---

## Chunk 6: Deploy + Verify

### Task 21: Deploy and verify

- [ ] **Step 1: Test tool loading locally**
```bash
cd /Users/vineet/ikawn-openbrain
node -e "require('./src/tools/registry').loadTools()"
```

- [ ] **Step 2: Deploy**
```bash
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false
```

- [ ] **Step 3: Verify tables exist**
```bash
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('scheduled_tasks', 'task_runs', 'domain_agents', 'brand_oauth_tokens');"
```

- [ ] **Step 4: Verify agents seeded**
```bash
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain -c "SELECT slug, role FROM domain_agents;"
```

- [ ] **Step 5: Verify scheduler in logs**
```bash
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail | grep -E "(ToolRegistry|AgentSeed|Scheduler)"
```

- [ ] **Step 6: Test via Telegram**
Send "List my scheduled tasks" — Ruhi should use manage_task and respond.
Send "Check system health every 2 hours" — Ruhi should create a scheduled task.

- [ ] **Step 7: Final commit**
```bash
git add -A && git commit -m "deploy: Ruhi Agent Platform Phase 1 — v2.3.0"
git push
```

---

## Chunk 7: Scheduler Execution Integrity (Hardening)

These fixes ensure crash safety, prevent duplicate execution, and handle stuck tasks.

### Task 22: Scheduler hardening fixes

**Files:**
- Modify: `src/scheduler.js`
- Modify: `src/agent/executor.js`

- [ ] **Step 1: Confirm xact lock (not session lock)**

Verify `runTaskScheduler()` uses `pg_try_advisory_xact_lock` (transaction-scoped, auto-releases on crash). NOT `pg_try_advisory_lock` (session-scoped, survives crash = zombie lock).

- [ ] **Step 2: Add running-status guard to task query**

In `runTaskScheduler()`, add to the WHERE clause:
```sql
AND (st.last_status IS NULL OR st.last_status != 'running')
```
Prevents duplicate execution of stuck tasks.

- [ ] **Step 3: Set status to 'running' BEFORE execution**

In `executeTask()`, immediately after creating the task_run, add:
```javascript
    await client.query(
      "UPDATE scheduled_tasks SET last_status = 'running', last_run_at = $1 WHERE id = $2",
      [startedAt, task.id]
    );
```

- [ ] **Step 4: Wrap execution in try/finally for task_runs**

Ensure `task_runs.completed_at` is ALWAYS set, even on crash:
```javascript
    try {
      // ... tool/agent execution
    } finally {
      // Always finalize — set completed_at even on unhandled error
      if (!finalized) {
        await client.query(
          "UPDATE task_runs SET status = 'failed', error = 'Execution interrupted', completed_at = NOW() WHERE id = $1 AND completed_at IS NULL",
          [run.id]
        ).catch(() => {});
      }
    }
```

- [ ] **Step 5: Add failure cooldown — 15min backoff for failures < 3**

In the failure handler, when `consecutive_failures < MAX_CONSECUTIVE_FAILURES`:
```javascript
    // Backoff: push next_run 15 minutes instead of immediate retry
    const backoffNextRun = new Date(Date.now() + 15 * 60 * 1000);
    const nextRun = failures >= MAX_CONSECUTIVE_FAILURES ? null : backoffNextRun;
```

- [ ] **Step 6: Commit**
```bash
git add src/scheduler.js
git commit -m "fix: scheduler hardening — running guard, pre-execution status, failure cooldown, try/finally"
```

---

## Chunk 8: Cost + Runaway Protection

### Task 23: Global safety caps in executor

**Files:**
- Modify: `src/agent/executor.js`

- [ ] **Step 1: Add token cap + round cap**

In the executor loop, add after the cost check:
```javascript
    // Global token safety cap
    if (totalTokens > 200_000) {
      console.warn(`[Executor] Task ${task.id} hit 200k token cap`);
      return { success: false, result: { summary: 'Token safety cap exceeded (200k)' }, cost: { costUsd: totalCost, tokensUsed: totalTokens } };
    }

    // Explicit round cap warning
    if (round >= MAX_TOOL_ROUNDS - 1) {
      console.warn(`[Executor] Task ${task.id} hit max tool rounds (${MAX_TOOL_ROUNDS})`);
    }
```

- [ ] **Step 2: Commit**
```bash
git add src/agent/executor.js
git commit -m "fix: add 200k token safety cap and explicit round limit in executor"
```

---

## Chunk 9: Tool Execution Reliability

### Task 24: Tool timeout wrapper + response validation

**Files:**
- Modify: `src/agent/executor.js`
- Modify: `src/scheduler.js`

- [ ] **Step 1: Add withTimeout utility**

In executor.js, add:
```javascript
function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool timeout after ${ms}ms`)), ms)),
  ]);
}
```

- [ ] **Step 2: Wrap all tool.execute calls**

Replace:
```javascript
result = await tool.execute(toolBlock.input || {}, context);
```
With:
```javascript
result = await withTimeout(tool.execute(toolBlock.input || {}, context), 20000);
```

Apply same wrapper in `executeTask()` in scheduler.js for Tier 1 tools.

- [ ] **Step 3: Validate tool response contract**

After every tool execution:
```javascript
    if (typeof result?.summary !== 'string') {
      result = { ...result, summary: result?.summary || 'No summary provided' };
    }
    if (typeof result?.success !== 'boolean') {
      result = { ...result, success: false };
    }
```

- [ ] **Step 4: Commit**
```bash
git add src/agent/executor.js src/scheduler.js
git commit -m "fix: add 20s tool timeout wrapper + response contract validation"
```

---

## Chunk 10: Event Bus — Make It Real

### Task 25: Emit events from key system points

**Files:**
- Modify: `src/utils/capture.js` — emit on memory capture
- Modify: `src/scheduler.js` — emit on task completion/failure

- [ ] **Step 1: Emit events from capture.js**

In `captureMessage()`, after successful insert:
```javascript
    try {
      const eventBus = require('./event-bus');
      eventBus.emit('memory.created', { brandId: brand_id, channel, direction });
    } catch (_) {}
```

- [ ] **Step 2: Emit events from scheduler**

In `executeTask()`, after success:
```javascript
    eventBus.emit('task.completed', { taskId: task.id, name: task.name, status: 'completed' });
```

On failure:
```javascript
    eventBus.emit('task.failed', { taskId: task.id, name: task.name, error: err.message });
```

- [ ] **Step 3: Commit**
```bash
git add src/utils/capture.js src/scheduler.js
git commit -m "feat: emit real events from memory capture + task completion for trigger-based tasks"
```

---

## Chunk 11: Telegram Approval UX (Sharp)

### Task 26: Polished approval flow

**Files:**
- Modify: `src/agent/executor.js` — send approval with inline buttons
- Modify: `src/routes/webhooks.js` — handle callback with CORRECTION capture

- [ ] **Step 1: Approval message format**

When a Tier 2 task has `requires_approval = true`, instead of executing actions, send:
```javascript
    const approvalMsg = `<b>Task: ${task.name}</b>\n` +
      `Agent: ${agentDef.name}\n` +
      `Action: ${finalResult.summary}\n` +
      `Est. cost: $${totalCost.toFixed(4)}`;

    await sendTelegramMessage(approvalMsg, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve:${runId}` },
          { text: '❌ Reject', callback_data: `reject:${runId}` },
        ]],
      },
    });
```

- [ ] **Step 2: On reject — capture CORRECTION memory**

In callback handler:
```javascript
    captureMessage({
      brand_id: 'ikawn',
      channel: 'agent',
      direction: 'inbound',
      content: `[CORRECTION] Task "${taskName}" (${agentSlug}) rejected by user via Telegram. Action was: ${run.result?.summary || 'unknown'}`,
      source_ref: `correction_${run.id}`,
      metadata: { project: 'agent-platform', memory_type: 'CORRECTION' },
    });
```

- [ ] **Step 3: Commit**
```bash
git add src/agent/executor.js src/routes/webhooks.js
git commit -m "feat: polished Telegram approval flow — structured messages + CORRECTION capture on reject"
```

---

## Chunk 12: Quick Wins

### Task 27: Load tools once + validate tool exists + agent fallback

**Files:**
- Modify: `src/index.js` — loadTools() at startup
- Modify: `src/tools/manage-task.tool.js` — validate tool exists on create
- Modify: `src/scheduler.js` — fallback to ruhi agent

- [ ] **Step 1: Load tools in index.js startup (not in scheduler)**

In `src/index.js`, add to `start()` after `await seedAgents();`:
```javascript
    const { loadTools } = require('./tools/registry');
    loadTools();
```

Remove `loadTools()` from scheduler.js `startScheduler()` if present.

- [ ] **Step 2: Validate tool exists on task creation**

In `manage-task.tool.js`, in the 'create' case, before the INSERT:
```javascript
        const { getTool } = require('./registry');
        if (!getTool(config.tool)) {
          return { success: false, data: null, summary: `Unknown tool: "${config.tool}". Use 'list' to see available tools.` };
        }
```

- [ ] **Step 3: Default agent fallback to ruhi**

In `executeTask()` in scheduler.js, when building agentDef:
```javascript
    // Fallback to ruhi if agent not found
    if (!task.persona) {
      const { rows: [ruhiAgent] } = await client.query(
        "SELECT persona, tools, memory_tags FROM domain_agents WHERE slug = 'ruhi' AND brand_id = $1",
        [task.brand_id || 'ikawn']
      );
      if (ruhiAgent) {
        task.persona = ruhiAgent.persona;
        task.agent_tools = ruhiAgent.tools;
        task.memory_tags = ruhiAgent.memory_tags;
      }
    }
```

- [ ] **Step 4: Commit**
```bash
git add src/index.js src/tools/manage-task.tool.js src/scheduler.js
git commit -m "fix: load tools once at startup, validate tool on create, fallback to ruhi agent"
```
