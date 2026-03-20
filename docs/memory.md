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
