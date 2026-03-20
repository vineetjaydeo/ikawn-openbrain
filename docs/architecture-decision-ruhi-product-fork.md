# Architecture Decision: Ruhi Product Fork

**Date:** 2026-03-20
**Decision by:** Vineet
**Status:** Approved

---

## Context

Ruhi has grown from an internal memory/chat tool into something with three distinct use cases.
Attempting to serve all three from one codebase and one instance creates architectural conflicts:
name disambiguation across brands, memory isolation vs team sharing, and infrastructure constraints.

## Decision: Three Ruhis

### 1. ruhi.ikawn.in — iKawn's Internal Brain (R&D Lab)

**What it is:** The current OpenBrain instance. iKawn's own intelligence layer.

**Scope:**
- Single brand: `brand_id = 'ikawn'` (hardcoded, no multi-tenant routing needed)
- All team members (Vineet, Abhishek, Avinash, etc.) share brand-wide memory
- Full access: Mission Control, agent platform, GitHub/Calendar sync, cost dashboard
- "Abhishek" resolves unambiguously — small, known team

**Architecture:**
- Standalone Fly.io app (current)
- Brand-wide memory sharing within iKawn (no per-user isolation for conversations)
- Admin gets full visibility; regular users see all brand-scoped data
- This is the dog-fooding ground — every feature is built and tested here first

**Key rule:** Do NOT add multi-brand routing to this instance. Its value is being unconstrained.

### 2. Ruhi OS — Enterprise SaaS (os.ikawn.com/ruhi -> ruhios.com)

**What it is:** The brand-facing Ruhi, embedded in iKawn OS. Each brand gets their own
Ruhi with brand-scoped memory, tools, and team collaboration.

**Scope:**
- Multi-brand: `brand_id` scopes everything — memory, conversations, tasks, agents
- Team members within a brand share brand-wide data
- "Abhishek" at MaxFashion and "Abhishek" at Shubhkart are completely isolated
- Brand-specific knowledge, voice learning, campaign history
- Progressive trust model (soul.md Gate 1 / Gate 2)

**Architecture:**
- Part of ikawn-v3 monorepo (packages/app)
- Already has brand_id scoping, user auth, credit billing
- Proven patterns from ruhi.ikawn.in get extracted and productized here
- Future: ruhios.com domain, or white-label/VPS-hosted per enterprise client

**Monetization:** Enterprise licensing, per-seat, or bundled with iKawn OS credits

### 3. ruhi.live — B2C Personal Assistant

**What it is:** Ruhi for individuals. Personal AI assistant — not commerce-specific.

**Scope:**
- Single user per account — no team, no brand
- Personal memory, preferences, life context
- Lightweight, high-volume, consumer-grade UX
- Different tool set (personal productivity, not enterprise commerce)

**Architecture:**
- Completely separate product and codebase
- Different scale assumptions (millions of users vs hundreds of brands)
- Different data model (user-centric, not brand-centric)

**Timeline:** PARKED. Only after 3 paying enterprise clients on Ruhi OS.

---

## The Flow of Innovation

```
ruhi.ikawn.in (R&D Lab)
    |
    | Features proven internally
    v
Ruhi OS (Enterprise Product)
    |
    | Patterns generalized for consumers
    v
ruhi.live (B2C — future)
```

Every feature follows this path:
1. Built and tested on ruhi.ikawn.in (fast iteration, no client risk)
2. Extracted and productized in Ruhi OS (brand-scoped, enterprise-grade)
3. Eventually generalized for ruhi.live (if applicable)

---

## Memory Scoping Rules

| Instance | Memory visibility |
|----------|------------------|
| ruhi.ikawn.in | All iKawn team members see all brand-wide data. No per-user isolation for conversations. External data (GitHub, Calendar) visible to all. |
| Ruhi OS | Team members within a brand see brand-wide data. Cross-brand data is invisible. User personal preferences (custom_instructions) remain private. |
| ruhi.live | Strictly per-user. No sharing. |

---

## What This Means for Current Work

1. **ruhi.ikawn.in stays single-brand.** The P3 fix (team-wide memory, RAG author filtering,
   task relay) is correct for this instance. No further multi-tenant work needed here.

2. **Ruhi OS (/ruhi on os.ikawn.com) is the enterprise path.** When we build brand-scoped
   Ruhi chat there, it inherits the brand_id isolation that ikawn-v3 already has.

3. **Name disambiguation is a non-problem** if we maintain the fork. Each instance has a
   small, known user base within a single brand. "Abhishek" is unambiguous within MaxFashion.

4. **ruhi.live is parked.** No architecture, no planning, no resources until enterprise
   revenue proves the model.

---

## Hard Rules

- Never collapse ruhi.ikawn.in into the SaaS product — it's the R&D lab
- Never add multi-brand routing to ruhi.ikawn.in
- Never expose "OpenBrain" in any client-facing Ruhi product
- ruhi.live development blocked until 3 paying enterprise clients
- All architecture decisions are V's alone
