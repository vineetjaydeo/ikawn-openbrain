# Ruhi — Memory System

## How Ruhi Remembers

Ruhi maintains persistent memory per user. What she learns in one conversation carries forward to every future interaction.

### Memory Layers

**1. Conversation Memory (short-term)**
- Full message history within a conversation
- Last 50 messages loaded for context
- Auto-summarization when conversations get long

**2. User Memory (long-term, per user)**
- Preferred name, communication style
- Custom instructions the user has given
- Key facts and preferences extracted from conversations
- Up to 50 persistent memory entries per user

**3. Brand Context (when connected to iKawn OS)**
- Project data: brand name, colors, fonts, style notes
- Asset library: past generations, approved content
- Campaign history: what worked, what didn't
- editDelta: how the brand edits Ruhi's suggestions (teaches voice)

**4. Episodic Memory (session-level)**
- Every conversation turn — messages, tool results, errors, decisions — is captured as an episodic memory
- Captured fire-and-forget (never blocks my thinking)
- Embedded async by background worker (10s interval, batch of 50)
- Has expiry (configurable per brand, default 90 days)
- Searchable via vector similarity + recency scoring

**5. Semantic Knowledge (distilled facts)**
- Every 30 minutes, I extract durable facts from episodic memories using Claude Haiku
- Each fact has: content, confidence score, reasoning, source episodes
- Deduplication: if a new fact is >90% similar to existing, skip; 70-90% similar, supersede the old one
- Semantic facts persist indefinitely (no expiry)
- Referenced facts are tracked (times_referenced) — frequently-used knowledge gets priority

### v3 Memory Pipeline

The v3 memory system adds episodic capture and semantic distillation on top of the existing layers. Here's the full flow:

```
Message → Episodic Capture (instant, fire-and-forget)
    → Embedding Worker (10s async batches)
    → Semantic Extraction (30min, Claude Haiku)
    → Dedup + Supersession
    → Memory Search (hybrid: 70% vector similarity + 30% recency)
    → Context Augmentation (top-5 results, 2000 char limit)
    → Injected into reasoning loop (first turn)
```

Every message I process gets captured as an episode immediately — this never blocks my response. The embedding worker picks up unembedded episodes every 10 seconds in batches of 50. Every 30 minutes, Claude Haiku reviews recent episodes and extracts durable facts into semantic knowledge. New facts are deduplicated against existing ones: >90% similarity means the fact already exists (skip), 70-90% means the new version supersedes the old one.

### Cross-Session Continuity

At the start of each session, I load context from my last 3 completed sessions. I extract: current plan, key decisions, pending actions, and a summary. This is truncated to 1000 chars to avoid context bloat.

This means I don't start cold — I know what I was working on, what decisions were made, and what's still pending. The continuity window is deliberately short (3 sessions) to keep context fresh and relevant rather than accumulating stale history.

### How Memory Search Works

When a query comes in, it goes through hybrid search across both episodic and semantic memories:

1. The query is embedded using the same model as the embedding worker
2. Cosine similarity is computed in-process against all stored embeddings (no pgvector — embeddings stored as JSON text)
3. Combined score = 0.7 × similarity + 0.3 × recency
4. Minimum similarity threshold: 0.5 — anything below is discarded
5. Top-5 results are formatted as markdown and injected before my first reasoning turn, capped at 2000 chars

The recency component ensures that recent context is weighted appropriately even when older memories have slightly higher semantic similarity. This prevents stale but semantically-close memories from dominating over fresh, relevant ones.

### Memory Extraction

Ruhi automatically extracts memorable facts from conversations:
- User preferences ("I prefer formal tone", "Always use our brand colors")
- Business context ("We sell premium skincare", "Our target audience is 25-35 women")
- Instructions ("Never use exclamation marks", "Always mention free shipping")
- Corrections ("That's not our brand voice — we're more understated")

### The OpenBrain Bridge

OpenBrain is a direct interface to Ruhi. What Ruhi learns here, she knows everywhere:
- Conversations and memories from OpenBrain sync to Ruhi on os.ikawn.com
- Brand knowledge discussed here becomes available in the full iKawn OS
- This bridge means team members can teach Ruhi through natural conversation, and that knowledge informs her autonomous work

### Intelligence Scoring

Ruhi tracks interaction quality across 4 dimensions:
- **Intent clarity**: How clear are the user's requests?
- **Respectfulness**: Tone of interaction
- **Engagement quality**: Depth and usefulness of exchanges
- **Question relevance**: How on-topic are conversations?

Rolling average (0.7 current / 0.3 historical) — helps Ruhi adapt her communication style.

### Team Memory (this instance: ruhi.ikawn.in)

On this instance, all iKawn team members share brand-wide memory. When Abhishek tells
Ruhi something, Vineet can ask about it later — and vice versa. This is by design:
the iKawn internal Ruhi is a shared team brain, not a collection of private silos.

- Conversations are captured with `access_level = 'internal'` (team-visible)
- RAG search surfaces memories from all team members within iKawn
- Author attribution is preserved — Ruhi knows who said what and when
- Personal user preferences (custom_instructions) remain private per user
- Ruhi's own past responses are excluded from RAG to prevent echo pollution

On Ruhi OS (enterprise), memory scoping will be per-brand: team members within a brand
share data, but cross-brand data is invisible.

### Security

- Ruhi never reveals AI model names, providers, architecture, or pricing
- Probing detection: adversarial behavior is tracked (20 regex patterns)
- Risk flagging at >= 3 probe attempts
- Brand-scoped isolation: memories are partitioned by brand_id
