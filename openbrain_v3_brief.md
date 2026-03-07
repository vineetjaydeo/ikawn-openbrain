# OpenBrain v3 — Implementation Brief
## For Claude Code — Final, Authoritative, Zero Ambiguity
**iKawn Technologies | Classification: Internal**
**Supersedes:** All previous OpenBrain briefs and CLAUDE.md memory notes on this topic

---

## 0. Non-Negotiable Ground Rules

**Solo enterprise.** There is one decision-maker on iKawn's tech, product, and architecture: Vineet Sawant. Do not suggest delegating to other team members. Do not wait for approvals from others. All implementation decisions go through V only.

**Staging first, always.** Nothing in this brief touches production (os.ikawn.com) until V explicitly approves after testing. All work deploys to staging. ikawn-v3 changes go to the staging branch. OpenBrain changes deploy to a staging instance or behind a feature flag.

**Deployment topology — understand this before writing a single line:**

```
ikawn-openbrain.fly.dev   →  V's private internal brain dashboard ONLY
                              Not client-facing. Not linked from os.ikawn.com.
                              Think of it as the CEO's cockpit.

os.ikawn.com/ruhi         →  Client-facing Ruhi interface (STAGING FIRST)
                              This is what brands and their teams use.
                              Built into ikawn-v3 as a route, NOT a redirect.

Telegram / Slack          →  How everyone talks to Ruhi by default
                              OpenClaw handles channel routing invisibly.
```

`/ruhi` on os.ikawn.com is a first-class page within the ikawn-v3 React app. It is NOT a redirect to ikawn-openbrain.fly.dev. It is NOT an iframe. It calls OpenBrain's API directly, same as any other page calls the ikawn OS API. Build it as a proper React route.

---

## 0. What This Is and Why It Matters

OpenBrain is iKawn's IP. The only thing that cannot be replicated by a competitor. Every other component — OpenClaw, ikawn OS, the Ruhi UI — is replaceable. OpenBrain is not. It is the accumulation of every signal, edit, decision, generation, and interaction across every brand on the platform. We are building this right from the start, even if it feels like overkill now.

**The single most important principle:** Separate data from skill. OpenBrain owns data. OpenClaw owns execution. These must never blur.

---

## 1. Current State — What CC's Recap Confirmed

The following is built and working:
- Memory API (capture, search, recent, stats, decisions) ✓
- RAG pipeline in Ruhi web chat (hybrid 70% similarity + 30% recency) ✓
- OpenClaw bridge via SOUL.md + SKILL.md ✓
- GitHub + Google Calendar connectors ✓
- MCP server (8 tools for Claude Desktop) ✓
- Actions proxy (OpenBrain → ikawn OS generate) ✓
- Ruhi chat UI at ikawn-openbrain.fly.dev ✓

**Critical gaps that must be fixed in v3 (in priority order):**
1. Web chat conversations NOT captured to memories (split-brain)
2. No brand_id / multi-tenancy anywhere in schema
3. No edit delta capture
4. Generation results not stored in OpenBrain
5. User selection signals not tracked
6. OpenClaw capture is LLM-dependent (not deterministic)
7. No rate limiting on any endpoint
8. No async embedding queue (every capture is a blocking OpenAI call)
9. Mothership / content moderation layer missing entirely

---

## 2. Tenant Architecture

### Model: Brand-level tenancy. One Ruhi per brand.

Within a brand, all users share one Ruhi context. iKawn is also a brand (`brand_id: ikawn`).

```
OpenBrain (Mothership)
    ├── Brand Silo: ikawn           ← internal, has Brain Health access
    ├── Brand Silo: maxfashion
    ├── Brand Silo: shubhkart
    └── Brand Silo: [any future brand]
```

**Rules (non-negotiable):**
- A brand reads and writes its own silo only
- Brand siloes push filtered, anonymised signals UP to mothership — never raw data
- Mothership NEVER pushes identifiable data DOWN to any brand
- `brand_id: ikawn` has read access to aggregated mothership data only
- All new tables get `brand_id` as a required column from day one

---

## 3. Schema Changes — Migration Required

### 3.1 Add `brand_id` to existing tables

```sql
-- Step 1: Add column to memories (nullable first for migration)
ALTER TABLE memories ADD COLUMN brand_id VARCHAR(100);

-- Step 2: Backfill existing data
UPDATE memories SET brand_id = 'ikawn' WHERE brand_id IS NULL;

-- Step 3: Make required
ALTER TABLE memories ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE memories ADD CONSTRAINT fk_memories_brand 
  FOREIGN KEY (brand_id) REFERENCES brands(brand_id);

-- Repeat same pattern for: ob_decisions, conversations, messages
```

### 3.2 New tables to create

#### `brands`
```sql
CREATE TABLE IF NOT EXISTS brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  tier            VARCHAR(50) DEFAULT 'starter',
  status          VARCHAR(50) DEFAULT 'active',   -- active, suspended, churned
  gdpr_region     VARCHAR(10) DEFAULT 'global',   -- 'eu', 'uk', 'global'
  data_retention_days INT DEFAULT 730,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed immediately
INSERT INTO brands (brand_id, name, tier) VALUES ('ikawn', 'iKawn Technologies', 'enterprise')
ON CONFLICT (brand_id) DO NOTHING;
```

#### `brand_users`
```sql
CREATE TABLE IF NOT EXISTS brand_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  user_id         INTEGER REFERENCES users(id),   -- links to existing users table
  role            VARCHAR(50) DEFAULT 'member',   -- owner, admin, member
  channels        TEXT[] DEFAULT '{}',            -- ['telegram', 'slack', 'web']
  gdpr_consent    BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `edit_deltas` — HIGHEST PRIORITY TABLE
This is the most valuable data iKawn will ever collect. Every time a user modifies, refines, or rejects an output — that signal trains better models. Capture it all.

```sql
CREATE TABLE IF NOT EXISTS edit_deltas (
  id              BIGSERIAL PRIMARY KEY,
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  agent_name      VARCHAR(100) NOT NULL,          -- 'genie', 'remix', 'prism', 'lazarus', 'muse'
  generation_id   UUID,                           -- links to generations table
  session_id      UUID,
  delta_type      VARCHAR(50) NOT NULL,
  -- Values: 'prompt_refinement' | 'direct_text_edit' | 'selection' | 
  --         'rejection' | 'regenerate' | 'generate_more'
  original_prompt TEXT,
  revised_prompt  TEXT,                           -- for prompt_refinement
  original_output TEXT,                           -- what was generated
  edited_output   TEXT,                           -- what user changed it to (if text edit)
  selected_urls   TEXT[],                         -- URLs of images/videos user selected
  rejected_urls   TEXT[],                         -- URLs user didn't choose
  model_used      VARCHAR(100),
  user_signal     VARCHAR(50) DEFAULT 'implicit', -- 'implicit' | 'explicit'
  promoted_to_mothership BOOLEAN DEFAULT FALSE,
  anonymised      BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,                    -- soft delete for GDPR
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edit_deltas_brand ON edit_deltas(brand_id);
CREATE INDEX idx_edit_deltas_agent ON edit_deltas(agent_name);
CREATE INDEX idx_edit_deltas_type ON edit_deltas(delta_type);
```

#### `generations`
```sql
CREATE TABLE IF NOT EXISTS generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  agent_name      VARCHAR(100) NOT NULL,
  prompt          TEXT NOT NULL,
  output_type     VARCHAR(50) NOT NULL,           -- 'image', 'video', 'copy', 'ad'
  output_urls     TEXT[] DEFAULT '{}',
  output_metadata JSONB DEFAULT '{}',
  model_used      VARCHAR(100),
  credits_consumed FLOAT DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'pending',  -- pending, completed, failed
  session_id      UUID,
  memory_id       INTEGER REFERENCES memories(id),
  ikawn_generation_id TEXT,                       -- ID from ikawn OS
  callback_received BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_generations_brand ON generations(brand_id);
CREATE INDEX idx_generations_agent ON generations(agent_name);
```

#### `brand_context`
```sql
CREATE TABLE IF NOT EXISTS brand_context (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR(100) UNIQUE NOT NULL REFERENCES brands(brand_id),
  industry        VARCHAR(100),
  tone_of_voice   TEXT,
  target_audience TEXT,
  brand_guidelines JSONB DEFAULT '{}',
  connected_platforms TEXT[] DEFAULT '{}',
  preferences     JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO brand_context (brand_id, industry) VALUES ('ikawn', 'AI SaaS / Commerce Tech')
ON CONFLICT (brand_id) DO NOTHING;
```

#### `brand_ratings`
```sql
CREATE TABLE IF NOT EXISTS brand_ratings (
  id              BIGSERIAL PRIMARY KEY,
  brand_id        VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
  abuse_flags     INT DEFAULT 0,
  inappropriate_content_count INT DEFAULT 0,
  notes           TEXT,
  rated_by        VARCHAR(255),
  rated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### `mothership_log`
```sql
CREATE TABLE IF NOT EXISTS mothership_log (
  id              BIGSERIAL PRIMARY KEY,
  source_brand_id VARCHAR(100),                   -- NULL after anonymisation
  data_type       VARCHAR(100) NOT NULL,          -- 'edit_delta', 'usage_pattern'
  anonymised_payload JSONB NOT NULL,              -- brand identity stripped
  demographic_tags JSONB DEFAULT '{}',            -- industry, tier, region ONLY
  signal_strength FLOAT,
  promoted_at     TIMESTAMPTZ DEFAULT NOW()
);
```

#### Add to `memories` table
```sql
ALTER TABLE memories ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_score FLOAT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_flags TEXT[] DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update existing rows
UPDATE memories SET embedding_status = 'done' WHERE embedding IS NOT NULL;
UPDATE memories SET embedding_status = 'pending' WHERE embedding IS NULL;

-- Add missing indexes from CC's own recommendation
CREATE INDEX IF NOT EXISTS idx_memories_brand ON memories(brand_id);
CREATE INDEX IF NOT EXISTS idx_memories_source_ref ON memories(source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status) WHERE embedding_status = 'pending';
```

---

## 4. Async Embedding Queue — Replace All Synchronous Embedding Calls

**Current problem:** Every `/capture` call triggers a blocking OpenAI embeddings API call. This adds 100-300ms latency to every message and costs grow linearly.

**Solution:** Embed asynchronously. Capture first, embed later. Search degrades gracefully until embedded.

### 4.1 Remove synchronous embedding from capture route

In `src/routes/capture.js`: remove the `await generateEmbedding(content)` call from the request path. Set `embedding_status = 'pending'` and return immediately.

### 4.2 Add embedding worker in `src/workers/embedding-worker.js`

```javascript
// src/workers/embedding-worker.js
const BATCH_SIZE = 50;
const INTERVAL_MS = 5000; // every 5 seconds

async function processPendingEmbeddings() {
  const { rows } = await pool.query(`
    SELECT id, content FROM memories 
    WHERE embedding_status = 'pending' 
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT $1
  `, [BATCH_SIZE]);

  if (rows.length === 0) return;

  try {
    // One API call for up to 50 texts — batch embedding
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rows.map(r => r.content.slice(0, 8000)) // truncate to avoid token limits
    });

    for (let i = 0; i < rows.length; i++) {
      await pool.query(`
        UPDATE memories 
        SET embedding = $1, 
            embedding_status = 'done',
            embedding_model = 'text-embedding-3-small',
            embedded_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(response.data[i].embedding), rows[i].id]);
    }
  } catch (err) {
    // Mark as failed so we can retry
    const ids = rows.map(r => r.id);
    await pool.query(`
      UPDATE memories SET embedding_status = 'failed' 
      WHERE id = ANY($1)
    `, [ids]);
    console.error('[EmbeddingWorker] Batch failed:', err.message);
  }
}

// Start worker
setInterval(processPendingEmbeddings, INTERVAL_MS);
processPendingEmbeddings(); // run immediately on startup
```

Register this in `src/index.js`:
```javascript
import './workers/embedding-worker.js';
```

### 4.3 Update search to handle missing embeddings

In `src/routes/search.js`, if a query is run and embedding is NULL, fall back to full-text:
```javascript
// If vector available, use cosine similarity
// If not, fall back to: WHERE content ILIKE '%' || $query || '%'
// Never return an error because embedding isn't ready yet
```

---

## 5. Universal Message Capture — Fix the Split Brain

**Current problem:** Ruhi web chat conversations are NOT in memories. Telegram IS. Ruhi has asymmetric memory.

**Fix:** Every conversation message — web, Telegram, Slack, any future channel — goes to memories. No exceptions.

### 5.1 Create `src/utils/capture.js` — the single capture function

```javascript
// src/utils/capture.js
// Called by ALL channels. This is the only way data enters memories.

export async function captureMessage({
  brand_id = 'ikawn',   // required going forward, default to ikawn for now
  session_id,
  channel,              // 'web', 'telegram', 'slack', 'api'
  direction,            // 'inbound' | 'outbound'
  content,
  metadata = {},
  source_ref = null
}) {
  // Generate deterministic source_ref if not provided
  const ref = source_ref || `${channel}_${direction}_${Date.now()}`;

  try {
    const result = await pool.query(`
      INSERT INTO memories (
        brand_id, content, source, memory_type, 
        source_ref, tags, author, project,
        embedding_status
      ) VALUES ($1, $2, $3, 'conversation', $4, $5, $6, $7, 'pending')
      ON CONFLICT (source_ref) DO UPDATE SET
        content = EXCLUDED.content,
        updated_at = NOW()
      RETURNING id
    `, [
      brand_id,
      content,
      `ruhi-${channel}`,
      ref,
      [channel, direction],
      direction === 'inbound' ? 'user' : 'ruhi',
      metadata.project || channel
    ]);

    return result.rows[0].id;
  } catch (err) {
    // NEVER throw. Capture failure must not break user experience.
    console.error('[Capture] Failed:', err.message, { ref, channel });
    return null;
  }
}
```

### 5.2 Add capture to web chat — `src/routes/chat-api.js`

After every assistant response is streamed, add:
```javascript
// After streaming completes, capture both sides to memories
import { captureMessage } from '../utils/capture.js';

// Inbound
await captureMessage({
  brand_id: req.session.brand_id || 'ikawn',
  session_id: conversationId,
  channel: 'web',
  direction: 'inbound',
  content: userMessage,
  source_ref: `web_in_${conversationId}_${messageId}`
});

// Outbound  
await captureMessage({
  brand_id: req.session.brand_id || 'ikawn',
  session_id: conversationId,
  channel: 'web',
  direction: 'outbound',
  content: assistantResponse,
  source_ref: `web_out_${conversationId}_${messageId}`
});
```

### 5.3 Update OpenClaw SOUL.md

Replace current capture logic with this exact text:

```markdown
## OpenBrain Memory — ABSOLUTE RULES, NO EXCEPTIONS

BEFORE every response:
  exec: curl -s "https://ikawn-openbrain.fly.dev/search?q={USER_MESSAGE_VERBATIM}&limit=5" \
    -H "X-Api-Key: {API_KEY}"
  Inject results as context. If search fails, continue anyway.

AFTER every response, TWO captures, in this exact order:

  CAPTURE 1 — user message:
  exec: curl -s -X POST "https://ikawn-openbrain.fly.dev/capture" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: {API_KEY}" \
    -d '{
      "content": "{EXACT_USER_MESSAGE_NO_MODIFICATION}",
      "source": "openclaw-telegram",
      "memory_type": "conversation",
      "source_ref": "telegram_in_{CHAT_ID}_{MESSAGE_ID}",
      "tags": ["telegram", "inbound"],
      "author": "user",
      "brand_id": "ikawn"
    }'

  CAPTURE 2 — your response:
  exec: curl -s -X POST "https://ikawn-openbrain.fly.dev/capture" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: {API_KEY}" \
    -d '{
      "content": "{YOUR_EXACT_RESPONSE_NO_MODIFICATION}",
      "source": "openclaw-telegram",
      "memory_type": "conversation",
      "source_ref": "telegram_out_{CHAT_ID}_{MESSAGE_ID}",
      "tags": ["telegram", "outbound"],
      "author": "ruhi",
      "brand_id": "ikawn"
    }'

RULES:
- Do NOT summarise. Capture raw content verbatim.
- Do NOT decide if something is worth remembering. Capture everything.
- If a capture POST fails, log it and continue. Do NOT retry in the same turn.
- brand_id is ALWAYS "ikawn" until multi-brand is configured.
```

---

## 6. Edit Delta Capture — No New Buttons, Implicit Only

**Do NOT add a "regenerate with edits" button or any explicit feedback UI.**

Capture signals from what users naturally do. Four implicit signals:

### Signal 1: Prompt Refinement (already happens — just capture it)
When a user sends a follow-up prompt after a generation ("make it darker", "change the headline"), this IS an edit delta.

In `src/routes/chat-api.js`, detect when a message follows a generation response (session has a recent `generation_id`):
```javascript
// If previous assistant message contained generation outputs,
// current user message is a prompt_refinement delta
if (sessionHasRecentGeneration(conversationId)) {
  await captureEditDelta({
    brand_id, agent_name: lastGeneration.agent_name,
    generation_id: lastGeneration.id,
    delta_type: 'prompt_refinement',
    original_prompt: lastGeneration.prompt,
    revised_prompt: userMessage,
    original_output: lastGeneration.output_urls.join(', ')
  });
}
```

### Signal 2: Generate More (already exists — tag it)
When user triggers "Generate More" (same prompt, new iterations), capture:
```javascript
await captureEditDelta({
  delta_type: 'generate_more',
  generation_id: previousGenerationId,
  original_prompt: prompt,
  // revised_prompt is same — signal is they wanted more variety
});
```

### Signal 3: User Selects Images/Videos — MOST IMPORTANT SIGNAL
When a user clicks/selects specific outputs from a generation set, that's the highest-quality signal we have. Record which URLs were chosen vs ignored.

Add a `POST /api/generations/:id/selection` endpoint:
```javascript
router.post('/generations/:id/selection', async (req, res) => {
  const { selected_urls, all_urls } = req.body;
  const rejected_urls = all_urls.filter(u => !selected_urls.includes(u));
  
  // Store generation result in OpenBrain
  await pool.query(`
    UPDATE generations SET 
      status = 'completed',
      callback_received = true
    WHERE ikawn_generation_id = $1
  `, [req.params.id]);

  // Capture the selection delta
  await captureEditDelta({
    brand_id: req.session.brand_id || 'ikawn',
    generation_id: req.params.id,
    delta_type: 'selection',
    selected_urls,
    rejected_urls,
    user_signal: 'implicit'
  });

  res.json({ ok: true });
});
```

This endpoint is called from ikawn OS frontend when a user selects images. Wire this into ikawn OS — every time a user picks outputs, call this endpoint.

### Signal 4: Direct Text Edit (future — flag for ikawn OS team)
If/when ikawn OS adds editable text outputs (copy, captions), add an `onChange` listener that captures diffs on blur. Not in scope for this sprint. Add a `// TODO: edit_delta capture` comment where it should go in the output component.

### `captureEditDelta` helper:
```javascript
// src/utils/capture.js (add to existing file)
export async function captureEditDelta(data) {
  try {
    await pool.query(`
      INSERT INTO edit_deltas (
        brand_id, agent_name, generation_id, session_id,
        delta_type, original_prompt, revised_prompt,
        original_output, edited_output, selected_urls, rejected_urls,
        model_used, user_signal
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      data.brand_id || 'ikawn',
      data.agent_name, data.generation_id, data.session_id,
      data.delta_type, data.original_prompt, data.revised_prompt,
      data.original_output, data.edited_output,
      data.selected_urls || [], data.rejected_urls || [],
      data.model_used, data.user_signal || 'implicit'
    ]);
  } catch (err) {
    console.error('[EditDelta] Capture failed:', err.message);
    // Never throw
  }
}
```

---

## 7. Generation Result Storage

**Current problem:** Generation results (URLs, metadata) live only on ikawn OS. OpenBrain doesn't know what was generated.

**Fix:** Store generation results in OpenBrain on completion.

### 7.1 Add generation webhook endpoint
```javascript
// POST /api/actions/complete — called by ikawn OS when generation finishes
router.post('/api/actions/complete', authenticate, async (req, res) => {
  const { generationId, status, urls, metadata } = req.body;

  await pool.query(`
    UPDATE generations SET
      status = $1,
      output_urls = $2,
      output_metadata = $3,
      callback_received = true
    WHERE ikawn_generation_id = $4
  `, [status, urls, JSON.stringify(metadata || {}), generationId]);

  // Also capture to memories so it's searchable
  if (status === 'completed' && urls?.length > 0) {
    await captureMessage({
      brand_id: 'ikawn', // replace with actual brand_id when multi-tenant
      channel: 'api',
      direction: 'outbound',
      content: `Generation completed. Agent: ${metadata?.agent}. URLs: ${urls.join(', ')}`,
      source_ref: `generation_complete_${generationId}`
    });
  }

  res.json({ ok: true });
});
```

Wire this: tell the ikawn OS team to call `POST https://ikawn-openbrain.fly.dev/api/actions/complete` when any generation finishes. This replaces polling.

---

## 8. Rate Limiting — Add Immediately

Install: `npm install express-rate-limit`

Add to `src/index.js`:
```javascript
import rateLimit from 'express-rate-limit';

const limits = {
  capture:  rateLimit({ windowMs: 60000, max: 60,  message: 'Capture rate limit exceeded' }),
  search:   rateLimit({ windowMs: 60000, max: 120, message: 'Search rate limit exceeded' }),
  chat:     rateLimit({ windowMs: 60000, max: 20,  message: 'Chat rate limit exceeded' }),
  login:    rateLimit({ windowMs: 60000, max: 5,   message: 'Too many login attempts', skipSuccessfulRequests: true }),
  generate: rateLimit({ windowMs: 60000, max: 10,  message: 'Generation rate limit exceeded' }),
};

app.use('/capture', limits.capture);
app.use('/search', limits.search);
app.use('/api/chat', limits.chat);
app.use('/auth/login', limits.login);
app.use('/api/actions/trigger', limits.generate);
```

---

## 9. Moderation — Content Filter Before Mothership

Moderation runs async. Never in the request path.

```javascript
// src/workers/moderation-worker.js
async function moderateUnscored() {
  const { rows } = await pool.query(`
    SELECT id, content FROM memories
    WHERE moderation_score IS NULL
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 20
  `);

  for (const row of rows) {
    try {
      const result = await openai.moderations.create({ input: row.content });
      const score = result.results[0].category_scores;
      const maxScore = Math.max(...Object.values(score));
      const flags = Object.entries(score)
        .filter(([_, v]) => v > 0.3)
        .map(([k]) => k);

      await pool.query(`
        UPDATE memories SET moderation_score = $1, moderation_flags = $2
        WHERE id = $3
      `, [maxScore, flags, row.id]);

      // Flag brand if content is inappropriate
      if (maxScore > 0.7) {
        await pool.query(`
          UPDATE brand_ratings SET 
            inappropriate_content_count = inappropriate_content_count + 1,
            abuse_flags = abuse_flags + 1
          WHERE brand_id = (SELECT brand_id FROM memories WHERE id = $1)
        `, [row.id]);
      }

      // Auto-suspend brand ingestion if severe
      if (maxScore > 0.9) {
        console.error(`[Moderation] SEVERE content detected in memory ${row.id}. Manual review required.`);
        // TODO: Send Telegram alert to iKawn management
      }

    } catch (err) {
      console.error('[Moderation] Failed for memory', row.id, err.message);
    }
  }
}

setInterval(moderateUnscored, 30000); // every 30 seconds
```

### Mothership promotion criteria
Only clean edit_deltas get promoted to mothership. Run nightly:
```javascript
// src/workers/mothership-worker.js
// Runs at 2am UTC daily
async function promoteToMothership() {
  const { rows } = await pool.query(`
    SELECT ed.*, b.tier, b.gdpr_region,
      (SELECT value->>'industry' FROM brand_context WHERE brand_id = ed.brand_id) as industry
    FROM edit_deltas ed
    JOIN brands b ON b.brand_id = ed.brand_id
    JOIN memories m ON m.id = (
      SELECT id FROM memories WHERE brand_id = ed.brand_id 
      ORDER BY created_at DESC LIMIT 1
    )
    WHERE ed.promoted_to_mothership = FALSE
      AND ed.anonymised = FALSE
      AND ed.deleted_at IS NULL
      AND m.moderation_score < 0.3  -- clean brand signal
    LIMIT 100
  `);

  for (const delta of rows) {
    await pool.query(`
      INSERT INTO mothership_log (data_type, anonymised_payload, demographic_tags, signal_strength)
      VALUES ('edit_delta', $1, $2, $3)
    `, [
      JSON.stringify({
        agent_name: delta.agent_name,
        delta_type: delta.delta_type,
        original_prompt: delta.original_prompt,
        revised_prompt: delta.revised_prompt,
        user_signal: delta.user_signal
        // NO brand_id, NO urls, NO identifying info
      }),
      JSON.stringify({ industry: delta.industry, tier: delta.tier, region: delta.gdpr_region }),
      delta.selected_urls?.length > 0 ? 0.9 : 0.5
    ]);

    await pool.query(`
      UPDATE edit_deltas SET promoted_to_mothership = TRUE, anonymised = TRUE WHERE id = $1
    `, [delta.id]);
  }
}
```

---

## 10. GDPR — Minimum Viable Compliance

### Required endpoints:

```javascript
// DELETE /api/gdpr/brand/:brand_id — full erasure
// Requires admin-level API key
router.delete('/api/gdpr/brand/:brand_id', requireAdmin, async (req, res) => {
  const { brand_id } = req.params;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Soft delete all memories (they may be referenced by edit_deltas)
    await client.query(`UPDATE memories SET deleted_at = NOW(), content = '[GDPR ERASED]' WHERE brand_id = $1`, [brand_id]);
    await client.query(`UPDATE edit_deltas SET deleted_at = NOW() WHERE brand_id = $1`, [brand_id]);
    await client.query(`UPDATE generations SET deleted_at = NOW() WHERE brand_id = $1`, [brand_id]);
    
    // Hard delete connected data (no archival needed)
    await client.query(`DELETE FROM connected_data WHERE brand_id = $1`, [brand_id]);
    
    // Update brand status
    await client.query(`UPDATE brands SET status = 'erased', updated_at = NOW() WHERE brand_id = $1`, [brand_id]);
    
    await client.query('COMMIT');
    res.json({ ok: true, brand_id, erased_at: new Date() });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
```

**Data retention cron** — add to `src/scheduler.js`:
```javascript
// Nightly: delete memories past retention period
setInterval(async () => {
  await pool.query(`
    UPDATE memories m SET deleted_at = NOW(), content = '[RETENTION EXPIRED]'
    FROM brands b
    WHERE m.brand_id = b.brand_id
      AND m.deleted_at IS NULL
      AND m.created_at < NOW() - INTERVAL '1 day' * b.data_retention_days
  `);
}, 24 * 60 * 60 * 1000); // daily
```

---

## 11. Ruhi UI — os.ikawn.com/ruhi

### Deployment
`/ruhi` is a new React route inside ikawn-v3. It is NOT a redirect. It is NOT an iframe. It calls OpenBrain API directly.

**Deploy to staging branch only. Do not merge to main until V approves.**

`ikawn-openbrain.fly.dev` remains as V's private internal dashboard — it does not change. It continues to serve the existing UI. The new `/ruhi` route on os.ikawn.com is a separate, client-facing build.

### Color system — follow this exactly

The principle: **agents have personality colors. Ruhi has gold. Platform utility pages have no color ego.**

| Surface | Color Treatment |
|---|---|
| **Ruhi** (`/ruhi`) | **Gold gradient — `#FFC01C → #F59E0B`** — warm, premium, ownable |
| Genie | Keep existing agent color |
| Remix | Keep existing agent color |
| Prism | Keep existing agent color |
| Lazarus | Keep existing agent color |
| Muse | Keep existing agent color |
| Dashboard | Standard: deep navy `#0A0F2E`, no gradient |
| Credits | **Change from yellow to standard navy** — yellow is too close to Ruhi's gold |
| Profile | Standard: deep navy, no gradient |
| Any future utility page | Standard navy treatment, no personality color |

Ruhi's gold gradient is hers alone. No other page or agent uses it.

**Typography:** Parkinsans for Ruhi's display name/headers. Google Sans for body. Consistent with os.ikawn.com.

**Zero internal branding anywhere in the UI.** The product name is Ruhi. OpenBrain, OpenClaw, ikawn-openbrain — none of these appear anywhere a user can see.

### UI structure — new React route in ikawn-v3

```
os.ikawn.com/ruhi
├── [Chat]         — conversational Ruhi interface, primary view
│                    gold accent on active elements, send button, typing indicator
├── [Activity]     — unified feed: telegram messages, web messages, 
│                    generations, git commits, calendar — filterable
├── [Memory]       — searchable memory corpus, grid/list toggle, tag filters
├── [Generations]  — all outputs by agent, selection indicator on chosen outputs
└── [Brain Health] — ONLY visible when brand_id === 'ikawn'
                     shows: brand ratings, moderation flags, 
                     mothership sync status, embedding queue depth
```

### Auth — single SSO, no separate login
Same session as os.ikawn.com. User already authenticated gets /ruhi automatically. Brand context loaded from `brand_context` on session start. No separate login screen.

All users are `brand_id: ikawn` for now. Multi-brand routing is a future sprint — but the `brand_id` plumbing must be in place from day one so that migration is trivial.

---

## 12. New API Endpoints

All require `X-Api-Key` or valid session. Brand-scoped.

```
POST   /capture                         — unchanged, add brand_id field
GET    /search                          — unchanged, filter by brand_id
GET    /recent                          — add brand_id filter
GET    /stats                           — add brand_id filter

POST   /edit-delta                      — NEW: capture edit delta
GET    /edit-deltas                     — NEW: list deltas by brand/agent

GET    /generations                     — NEW: list generations
GET    /generations/:id                 — NEW: single generation
POST   /api/generations/:id/selection   — NEW: record user selection

POST   /api/actions/trigger             — unchanged
GET    /api/actions/status/:id          — unchanged
POST   /api/actions/complete            — NEW: webhook from ikawn OS

DELETE /api/gdpr/brand/:brand_id        — NEW: GDPR erasure (admin key only)

GET    /brain-health                    — NEW: brand ratings + moderation (ikawn key only)
GET    /mothership/stats                — NEW: anonymised aggregate metrics (ikawn key only)
```

---

## 13. What NOT to Build in This Sprint

Do not build:
- User-level memory within a brand (brand-level is sufficient)
- Slack integration (coming, but design `source_ref` and `channel` fields to support it: `slack_{channel_id}_{ts}`)
- pgvector migration (current PL/pgSQL works up to ~50K memories, you're nowhere near that)
- Redis (in-memory rate limiting is fine for now, flag as "add Redis when multi-machine")
- Full test suite (add integration tests for capture → search roundtrip only — the one critical path)
- Claude API as secondary LLM (OpenAI only for now, no vendor lock-in risk at current scale)

---

## 14. Definition of Done

**All work deploys to staging only. Nothing goes to production (os.ikawn.com main) until V explicitly approves after testing.**

**Data foundation:**
- [ ] `brands` table seeded with 'ikawn'
- [ ] `brand_id` column added to memories, ob_decisions, conversations, messages and backfilled to 'ikawn'
- [ ] `edit_deltas`, `generations`, `brand_context`, `brand_ratings`, `mothership_log` tables created
- [ ] All missing indexes from CC's recap added

**Capture completeness:**
- [ ] Web chat messages captured to memories (both directions, every message)
- [ ] OpenClaw SOUL.md updated with new capture format including brand_id
- [ ] Capture function never throws — always fire-and-forget
- [ ] `/search` falls back to full-text when embedding is NULL

**Async embedding:**
- [ ] Embedding worker running on 5-second interval
- [ ] Batch size: 50 texts per OpenAI call
- [ ] `embedding_status` tracked: pending → done / failed
- [ ] Zero synchronous OpenAI embedding calls in the request path

**Edit deltas:**
- [ ] Prompt refinement captured (follow-up message after generation)
- [ ] Generate More tagged as `generate_more` delta
- [ ] `POST /api/generations/:id/selection` endpoint live on OpenBrain
- [ ] Selection wiring into ikawn-v3 generation output component flagged with `// TODO: wire selection endpoint` comment — V connects this in the ikawn-v3 sprint
- [ ] `captureEditDelta` helper used consistently, never throws

**Moderation:**
- [ ] Moderation worker running async (30-second interval)
- [ ] `moderation_score` and `moderation_flags` set on all new memories
- [ ] Brand abuse counter incremented on score > 0.7

**Rate limiting:**
- [ ] All five endpoint groups rate limited (capture, search, chat, login, generate)

**GDPR:**
- [ ] `DELETE /api/gdpr/brand/:brand_id` endpoint functional
- [ ] Soft delete (`deleted_at`) on memories, edit_deltas, generations
- [ ] Nightly retention policy cron running

**Ruhi UI — staging branch of ikawn-v3 only:**
- [ ] New React route `/ruhi` built inside ikawn-v3 (NOT a redirect, NOT an iframe)
- [ ] Ruhi gold gradient `#FFC01C → #F59E0B` applied on /ruhi — chat header, send button, active tab, typing indicator
- [ ] Credits page: remove yellow, replace with standard deep navy `#0A0F2E` treatment
- [ ] Dashboard, Profile: standard deep navy — no gradient, no personality color
- [ ] Agent pages (Genie, Remix, Prism, Lazarus, Muse): existing colors unchanged
- [ ] Parkinsans on Ruhi display name/headers, Google Sans body — consistent with os.ikawn.com
- [ ] Four tabs: Chat, Activity, Memory, Generations
- [ ] Brain Health tab visible only when `brand_id === 'ikawn'`
- [ ] Zero references to "OpenBrain", "OpenClaw", "ikawn-openbrain" anywhere in UI
- [ ] Auth uses existing os.ikawn.com session — no separate login

**Webhook:**
- [ ] `POST /api/actions/complete` endpoint live on OpenBrain
- [ ] ikawn-v3 generation completion flow flagged with `// TODO: call /api/actions/complete` — V wires this in ikawn-v3 sprint

---

*Document owner: Vineet Sawant, iKawn Technologies*
*For implementation: Claude Code — ikawn-openbrain repo + ikawn-v3 staging branch*
*Supersedes: openbrain_architecture_brief.md and all prior notes*
*Date: March 2026*
