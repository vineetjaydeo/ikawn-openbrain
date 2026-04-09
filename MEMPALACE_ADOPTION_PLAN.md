# MemPalace → Lucy: Adoption Plan

> **Status:** APPROVED for implementation  
> **Target:** OpenBrain (Lucy) — `/Users/vineet/ikawn-openbrain` on `main` branch  
> **Source:** MemPalace analysis on `mempalace` branch  
> **Deploy:** Lucy ONLY (`ikawn-openbrain`). NEVER touch `ruhi-os-brain` without V's approval.  
> **Date:** 2026-04-10

---

## Context

MemPalace (github.com/milla-jovovich/mempalace) achieves 96.6% R@5 on LongMemEval with zero API calls. Lucy's memory system is production-deployed but lacks three capabilities that MemPalace handles well:

1. **Temporal Knowledge Graph** — "what was true when?" queries
2. **Layered Context Loading** — tiered token-budget memory injection
3. **Structured Memory Navigation** — domain/topic taxonomy for filtered search

This plan ports these three ideas into Lucy's existing PostgreSQL + Node.js architecture. We do NOT adopt MemPalace's raw-only philosophy — Lucy's episodic+semantic split is better for multi-tenant SaaS.

---

## Phase 1: Temporal Knowledge Graph

**Why:** Lucy's `superseded_by` field is a weak version of temporal tracking. She can't answer "what did we decide about auth in January?" or "when did the pricing strategy change?" MemPalace's triples with `valid_from/valid_to` solve this.

### 1.1 Schema Migration

**File:** `src/db.js` — add to `initializeTables()` after the `semantic_knowledge` table creation.

```sql
-- Knowledge Graph: Entities
CREATE TABLE IF NOT EXISTS kg_entities (
  id TEXT PRIMARY KEY,                         -- normalized: "alice", "max_smith"
  brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
  name TEXT NOT NULL,                          -- display: "Alice", "Max Smith"
  entity_type VARCHAR(30) DEFAULT 'unknown',   -- person | brand | concept | product | campaign
  properties JSONB DEFAULT '{}',               -- arbitrary metadata
  seen_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_entities_brand ON kg_entities(brand_id);
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(brand_id, entity_type);

-- Knowledge Graph: Triples (subject-predicate-object with temporal validity)
CREATE TABLE IF NOT EXISTS kg_triples (
  id BIGSERIAL PRIMARY KEY,
  brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
  subject TEXT NOT NULL REFERENCES kg_entities(id),
  predicate VARCHAR(100) NOT NULL,             -- works_at, decided, prefers, uses, etc.
  object TEXT NOT NULL REFERENCES kg_entities(id),
  valid_from TIMESTAMPTZ,                      -- when this fact became true
  valid_to TIMESTAMPTZ,                        -- when invalidated (NULL = still current)
  confidence NUMERIC(3,2) DEFAULT 0.8,
  source_type VARCHAR(30),                     -- 'distillation', 'explicit', 'tool_result'
  source_ref TEXT,                             -- episodic_memory ID or session ID
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_triples_brand ON kg_triples(brand_id);
CREATE INDEX IF NOT EXISTS idx_kg_triples_subject ON kg_triples(subject);
CREATE INDEX IF NOT EXISTS idx_kg_triples_object ON kg_triples(object);
CREATE INDEX IF NOT EXISTS idx_kg_triples_temporal ON kg_triples(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_kg_triples_active ON kg_triples(brand_id) WHERE valid_to IS NULL;
```

**Entity ID normalization** (same as MemPalace):
```javascript
function entityId(name) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/'/g, '');
}
// "Max Smith" → "max_smith"
```

### 1.2 Knowledge Graph Module

**New file:** `src/engine/knowledge-graph.js`

```javascript
// Core API:
async function addEntity(brandId, name, type, properties = {})
async function addTriple(brandId, subject, predicate, object, { validFrom, validTo, confidence, sourceType, sourceRef })
async function invalidateTriple(brandId, subject, predicate, object, endedAt = new Date())
async function queryEntity(brandId, entityName, { asOf, direction = 'both' })
async function queryRelationship(brandId, predicate, { asOf })
async function timeline(brandId, entityName)
async function graphStats(brandId)
```

**Temporal query pattern** (MemPalace-inspired):
```sql
-- queryEntity with as_of date filtering
SELECT t.*, 
       e_subj.name AS subject_name, 
       e_obj.name AS object_name
FROM kg_triples t
JOIN kg_entities e_subj ON t.subject = e_subj.id
JOIN kg_entities e_obj ON t.object = e_obj.id
WHERE t.brand_id = $1
  AND (t.subject = $2 OR t.object = $2)
  AND (t.valid_from IS NULL OR t.valid_from <= $3)
  AND (t.valid_to IS NULL OR t.valid_to > $3)
ORDER BY t.valid_from DESC;
```

### 1.3 Triple Extraction in Distillation Worker

**File:** `src/workers/distillation-worker.js` — extend the Haiku extraction prompt.

Current prompt extracts facts. Add a second pass or extend the prompt to also extract triples:

```javascript
const TRIPLE_EXTRACTION_PROMPT = `From these conversation turns, extract entity relationships as JSON triples.

Return format:
[{
  "subject": "entity name",
  "predicate": "relationship verb",  
  "object": "entity name",
  "valid_from": "ISO date or null",
  "confidence": 0.X
}]

Common predicates: works_at, manages, decided, prefers, uses, created, launched, reported, targets, competes_with

Only extract relationships between named entities (people, brands, products, campaigns, tools).
Do NOT extract generic facts — those go in semantic_knowledge.`;
```

**Integration point:** After fact extraction completes, run triple extraction on same batch. Auto-create entities via `addEntity()` if not exists. Insert triples via `addTriple()`.

### 1.4 KG Tools for Agent

**New file:** `src/tools/v2/knowledge-graph.tool.js`

Register 4 tools in the v2 registry:

| Tool | Input | Description |
|------|-------|-------------|
| `kg_query` | `{ entity: string, as_of?: string }` | Query all relationships for an entity, optionally at a point in time |
| `kg_add` | `{ subject, predicate, object, valid_from? }` | Manually add a relationship |
| `kg_invalidate` | `{ subject, predicate, object }` | Mark a relationship as no longer true |
| `kg_timeline` | `{ entity?: string }` | Show chronological history of facts |

**Tier:** `trustable` (no approval needed, same as `search_memory`)  
**Category:** `analyze`

### 1.5 KG-Augmented Search

**File:** `src/engine/memory-search.js` — add optional KG boost.

After computing `combinedScore = 0.7 * similarity + 0.3 * recency`, check if any search results mention entities that have KG triples. If a memory chunk mentions an entity connected to the query entity via a triple, boost its score:

```javascript
// Optional KG entity boost (adds up to +0.1)
const queryEntities = extractEntityMentions(query); // simple regex for capitalized words
if (queryEntities.length > 0) {
  const kgConnections = await queryEntityConnections(brandId, queryEntities);
  for (const result of results) {
    const mentionedEntities = extractEntityMentions(result.content);
    const overlap = mentionedEntities.filter(e => kgConnections.has(e));
    if (overlap.length > 0) {
      result.combinedScore += Math.min(0.1, overlap.length * 0.05);
    }
  }
}
```

---

## Phase 2: Layered Context Loading

**Why:** Lucy injects top-5 memories (max 2000 chars) once on session start. MemPalace's 4-layer approach (L0 identity → L1 essentials → L2 on-demand → L3 deep search) is smarter about token budgets and gives the agent a "warm start" with richer context.

### 2.1 Layer Definitions

Map MemPalace's layers to Lucy's architecture:

| Layer | MemPalace | Lucy Equivalent | Token Budget | When Loaded |
|-------|-----------|----------------|-------------|-------------|
| L0 | `identity.txt` | Brand persona from `brand_context` table | ~200 tokens | Always (already exists) |
| L1 | Top 15 drawers by importance | Top semantic facts (highest confidence, most referenced) | ~800 tokens | Session start |
| L2 | Wing/room filtered | Domain-filtered memories (by `fact_type` or new `domain` field) | ~500 tokens/call | On-demand via tool |
| L3 | Full semantic search | Existing `search_memory` tool | Unlimited | Tool-triggered |

### 2.2 Essential Knowledge Loader (L1)

**New file:** `src/engine/essential-knowledge.js`

```javascript
async function loadEssentialKnowledge(brandId, userId) {
  // Query top semantic facts: active, high confidence, frequently referenced
  const { rows } = await pool.query(`
    SELECT content, fact_type, confidence, times_referenced
    FROM semantic_knowledge
    WHERE brand_id = $1
      AND superseded_by IS NULL
      AND confidence >= 0.7
    ORDER BY 
      (confidence * 0.4 + LEAST(1, LN(times_referenced + 1) / LN(20)) * 0.3 + 
       (1 / (1 + EXTRACT(EPOCH FROM NOW() - updated_at) / 2592000)) * 0.3) DESC
    LIMIT 15
  `, [brandId]);

  // Also load top personal preferences for this user
  let userPrefs = [];
  if (userId) {
    const result = await pool.query(`
      SELECT content, confidence
      FROM distilled_memory
      WHERE brand_id = $1 AND user_id = $2
        AND superseded_by IS NULL
        AND memory_type = 'USER_PREFERENCE'
      ORDER BY confidence DESC
      LIMIT 5
    `, [brandId, userId]);
    userPrefs = result.rows;
  }

  // Format as L1 context block (~800 tokens max)
  const lines = ['## Known Facts'];
  for (const r of rows) {
    lines.push(`- [${r.fact_type}, conf:${r.confidence}] ${r.content.slice(0, 150)}`);
  }
  if (userPrefs.length > 0) {
    lines.push('\n## Your Preferences');
    for (const p of userPrefs) {
      lines.push(`- ${p.content.slice(0, 100)}`);
    }
  }

  let text = lines.join('\n');
  if (text.length > 3200) text = text.slice(0, 3197) + '...'; // ~800 tokens
  return text;
}
```

### 2.3 Modify Memory Augmenter

**File:** `src/engine/memory-augmenter.js` — replace `buildMemoryContext()`.

**Before (current):**
- Extract last user message → search memories → top-5 → 2000 chars

**After (layered):**
```javascript
async function buildMemoryContext(messages, context) {
  const { brandId, userId } = context || {};
  if (!brandId) return null;

  const parts = [];

  // L1: Essential knowledge (always loaded, ~800 tokens)
  const essentials = await loadEssentialKnowledge(brandId, userId);
  if (essentials) parts.push(essentials);

  // L2: Query-relevant memories (last user message → semantic search, ~500 tokens)
  const query = extractLastUserMessage(messages);
  if (query) {
    const relevant = await retrieveRelevantMemories(query, context);
    if (relevant) parts.push('\n## Relevant to Current Query\n' + relevant);
  }

  // L3: Available via search_memory tool (agent-triggered, unlimited)
  // No injection needed — the tool handles this

  let combined = parts.join('\n');
  if (combined.length > 5000) combined = combined.slice(0, 4997) + '...'; // ~1250 tokens total
  return combined;
}
```

**Token budget increase:** From 2000 chars (~500 tokens) → 5000 chars (~1250 tokens). Still well within reasonable system prompt size. The quality improvement from L1 essential facts justifies the token spend.

### 2.4 KG Context in L1 (Optional Enhancement)

Once Phase 1 is complete, add active KG triples to L1:

```javascript
// In loadEssentialKnowledge(), after semantic facts:
const { rows: triples } = await pool.query(`
  SELECT e_s.name AS subject, t.predicate, e_o.name AS object
  FROM kg_triples t
  JOIN kg_entities e_s ON t.subject = e_s.id
  JOIN kg_entities e_o ON t.object = e_o.id
  WHERE t.brand_id = $1 AND t.valid_to IS NULL AND t.confidence >= 0.8
  ORDER BY t.extracted_at DESC
  LIMIT 10
`, [brandId]);

if (triples.length > 0) {
  lines.push('\n## Active Relationships');
  for (const t of triples) {
    lines.push(`- ${t.subject} ${t.predicate} ${t.object}`);
  }
}
```

---

## Phase 3: Structured Memory Navigation (Domains)

**Why:** Lucy searches all memories with no structure. MemPalace's wing/room filtering gives +34% retrieval improvement. Adding a `domain` taxonomy to Lucy's semantic knowledge enables filtered search.

### 3.1 Add Domain Column

**File:** `src/db.js` — migration in `initializeTables()`:

```sql
-- Add domain to semantic_knowledge (auto-classified topic area)
ALTER TABLE semantic_knowledge ADD COLUMN IF NOT EXISTS domain VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_semantic_domain ON semantic_knowledge(brand_id, domain) WHERE superseded_by IS NULL;

-- Add domain to distilled_memory
ALTER TABLE distilled_memory ADD COLUMN IF NOT EXISTS domain VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_distilled_domain ON distilled_memory(brand_id, domain) WHERE superseded_by IS NULL;
```

### 3.2 Domain Taxonomy

Define domains per brand type. Default set (inspired by MemPalace's halls):

```javascript
const DEFAULT_DOMAINS = {
  marketing:   ['campaign', 'ad', 'audience', 'targeting', 'creative', 'copy', 'brand voice'],
  product:     ['feature', 'roadmap', 'launch', 'pricing', 'competitor'],
  content:     ['post', 'reel', 'blog', 'video', 'caption', 'hashtag', 'schedule'],
  analytics:   ['metrics', 'performance', 'engagement', 'roi', 'conversion', 'traffic'],
  operations:  ['workflow', 'process', 'tool', 'integration', 'automation'],
  strategy:    ['goal', 'plan', 'quarter', 'budget', 'decision', 'priority'],
  customer:    ['feedback', 'review', 'support', 'persona', 'segment'],
  technical:   ['api', 'code', 'bug', 'deploy', 'database', 'server'],
};
```

### 3.3 Auto-Classification in Distillation

**File:** `src/workers/distillation-worker.js` — extend Haiku extraction prompt:

```javascript
// Add to extraction prompt:
`Also classify each fact into one domain:
marketing, product, content, analytics, operations, strategy, customer, technical

Return format:
[{"fact": "...", "confidence": 0.X, "reasoning": "...", "domain": "marketing"}]`
```

**Backfill existing facts:** One-time migration script that classifies existing `semantic_knowledge` and `distilled_memory` rows by keyword matching against `DEFAULT_DOMAINS`.

### 3.4 Domain-Filtered Search

**File:** `src/engine/memory-search.js` — add `domain` parameter:

```javascript
async function searchMemory({ query, brandId, userId, topK, minSimilarity, tables, domain }) {
  // ... existing code ...
  
  // Add WHERE clause if domain specified
  if (domain) {
    whereClause += ` AND domain = $${params.length + 1}`;
    params.push(domain);
  }
  
  // ... rest of search ...
}
```

**File:** `src/tools/v2/recall.tool.js` — add `domain` to tool input schema:

```javascript
parameters: {
  query: { type: 'string', description: 'What to search for' },
  limit: { type: 'number', description: 'Max results', default: 5 },
  domain: { type: 'string', description: 'Filter by domain: marketing, product, content, analytics, operations, strategy, customer, technical', optional: true },
}
```

### 3.5 Domain-Aware L2 Loading

When the agent calls `search_memory` with a domain filter, L2 context is automatically scoped. This is the equivalent of MemPalace's `stack.recall(wing="my_app")`.

---

## Implementation Order

```
Phase 1: Knowledge Graph          (~3-4 hours)
  1.1 Schema migration            [30 min]
  1.2 knowledge-graph.js module   [90 min]
  1.3 Triple extraction worker    [45 min]
  1.4 KG tools (4 tools)          [30 min]
  1.5 KG-augmented search boost   [30 min]

Phase 2: Layered Context Loading  (~2 hours)
  2.1 (Design only, no code)      [0 min]
  2.2 essential-knowledge.js      [45 min]
  2.3 Modify memory-augmenter.js  [30 min]
  2.4 KG context in L1            [15 min] (after Phase 1)

Phase 3: Domain Taxonomy          (~2 hours)
  3.1 Schema migration            [15 min]
  3.2 Domain constants            [15 min]
  3.3 Distillation prompt update  [30 min]
  3.4 Domain-filtered search      [30 min]
  3.5 Backfill script             [30 min]
```

**Total: ~7-8 hours of implementation**

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/engine/knowledge-graph.js` | KG CRUD + temporal queries |
| `src/engine/essential-knowledge.js` | L1 essential knowledge loader |
| `src/tools/v2/knowledge-graph.tool.js` | 4 KG tools for agent |
| `src/workers/kg-extraction-worker.js` | Triple extraction from episodic memories (or extend distillation-worker) |
| `scripts/backfill-domains.js` | One-time domain classification for existing facts |

## Files to Modify

| File | Change |
|------|--------|
| `src/db.js` | Add `kg_entities`, `kg_triples` tables + `domain` columns |
| `src/engine/memory-augmenter.js` | Replace single-shot with layered L1+L2 loading |
| `src/engine/memory-search.js` | Add domain filter + KG entity boost |
| `src/workers/distillation-worker.js` | Extend prompt for triple extraction + domain classification |
| `src/tools/v2/recall.tool.js` | Add `domain` parameter to search_memory tool |
| `src/ruhi/persona.js` | Document new KG tools in system prompt |

---

## What We're NOT Adopting

| MemPalace Feature | Why Skip |
|-------------------|----------|
| Raw-only storage (no distillation) | Lucy's episodic+semantic is better for multi-tenant |
| ChromaDB | Lucy uses PostgreSQL — no reason to add another DB |
| Local-only / no API | Lucy is a cloud SaaS, API calls are fine |
| AAAK compression dialect | Experimental, regresses vs raw (84% vs 96%) |
| Entity registry with Wikipedia | Over-engineered for Lucy's brand-scoped use case |
| Palace spatial metaphor (wings/rooms/halls) | Replaced by simpler `domain` taxonomy |
| MCP server interface | Lucy uses REST + tool system, not MCP |

---

## Testing Checklist

- [ ] `kg_entities` and `kg_triples` tables created on deploy
- [ ] `addTriple()` + `queryEntity()` with temporal filtering works
- [ ] `invalidateTriple()` sets `valid_to` correctly
- [ ] Distillation worker extracts triples from conversation turns
- [ ] `kg_query` tool returns correct results in agent conversation
- [ ] `loadEssentialKnowledge()` returns top facts sorted by composite score
- [ ] Memory augmenter injects L1 + L2 (verify with logging)
- [ ] Token budget stays under 1500 tokens for L1+L2 combined
- [ ] `domain` column populated by distillation worker
- [ ] `search_memory` with `domain` filter returns scoped results
- [ ] Backfill script classifies existing facts correctly
- [ ] No regression on existing memory search quality (test with sample queries)

---

## Risk Mitigation

1. **Deploy to Lucy ONLY.** Never touch ruhi-os-brain without V's approval.
2. **Schema migrations are additive** — new tables and columns only, no destructive changes.
3. **KG extraction uses Haiku** — cost is ~$0.0002/batch, same as existing distillation.
4. **L1 loading adds ~800 tokens** — monitor total prompt size, ensure it stays under 10K.
5. **Domain backfill is idempotent** — can re-run safely.

---

## Handoff Notes for Claude Code

- Branch: `main` (this plan lives on `mempalace` branch for reference)
- Start with Phase 1.1 (schema) — it's the foundation everything else depends on
- Use `src/workers/distillation-worker.js` as the pattern for the KG extraction worker
- The `recall.js` scoring formula is the template for KG-boosted scoring
- All new tools must be registered in `src/tools/v2/` following existing patterns (see `recall.tool.js`)
- Run `node src/db.js` locally to test schema creation before deploying
- Test with brand_id = 'ikawn' (Lucy's default)
