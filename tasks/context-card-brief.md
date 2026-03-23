# Context Card — Feature Brief

**Date:** 2026-03-22
**System:** OpenBrain (Lucy + Ruhi Brain)
**Priority:** High — replaces brittle keyword-based tier detection

---

## Problem

1. **Tier detection is keyword-based** — scans for "architecture", "security", etc. Can't tell if
   a discussion is actually complex or someone just mentioned a word casually.
2. **Context-switchers lose track** — V jumps between conversations constantly. No way to quickly
   re-orient on what a thread was about.
3. **AI lacks compressed context** — full message history is expensive and noisy. A distilled
   summary would give better responses with fewer tokens.

## Solution: Context Card

A living, auto-updating summary that sits alongside each conversation. Serves three purposes:

### 1. Smart Tier Selection
Instead of keyword matching, analyze the Context Card's topic/complexity:
- Casual chat, quick confirmations → regular (Haiku)
- General questions, architecture discussion, product vision → pro (Sonnet)
- Deep debugging, security review, multi-step technical analysis → expert (Opus)

### 2. Human Context Recovery
Collapsible card at top of conversation (or sidebar) showing:
- Timestamped bullet points of key discussion topics
- Current thread summary (1-2 lines)
- Key decisions made
- Open questions

### 3. AI Context Injection
Feed the card into the system prompt instead of (or alongside) raw history. More signal, fewer tokens.

---

## Implementation Plan

### Phase 1: Background Summary Worker
- After every 3-5 user messages, async call to Haiku to summarize the conversation
- Store as `context_summary` JSONB column on `conversations` table
- Schema: `{ bullets: [{ ts, text }], topic: string, complexity: 'casual'|'standard'|'complex', decisions: [string], open_questions: [string] }`
- Migration: `ALTER TABLE conversations ADD COLUMN context_summary JSONB DEFAULT NULL`

### Phase 2: Tier Detection v2
- Replace `detectTier()` to use `context_summary.complexity` when available
- Manual toggle still overrides (already built)
- Fallback to current keyword detection if no summary exists yet

### Phase 3: Frontend Card
- Render Context Card as collapsible section above messages
- Auto-refresh when summary updates (SSE event `context_update`)
- Timestamp-linked bullets — click to scroll to that point in conversation
- Subtle, non-intrusive — collapsed by default, expandable

### Phase 4: System Prompt Integration
- Inject `context_summary` into system prompt as structured context
- Reduce raw history window from 50 messages to 20 + summary
- Measure response quality and token savings

---

## Design Notes

- Card should feel like a "conversation header" — always visible when scrolled to top
- Use muted colors, small text — it's reference material, not the main content
- Timestamps should be relative ("2h ago", "just now")
- Complexity badge next to conversation title in sidebar (color-coded dot)

## Cost

- Haiku summary call: ~$0.001 per update (every 3-5 messages)
- Negligible vs current cost of routing every message to Opus unnecessarily

## Manual Toggle Interaction
- Manual toggle (AUTO/FAST/PRO/MAX) already deployed
- When AUTO is selected, Context Card complexity drives tier
- When manually set, the card still updates but doesn't influence tier
- Card should show current tier as a small badge

---

## Key Files
- `src/routes/chat-api.js` — detectTier(), chat send handler
- `src/routes/chat-page.js` — frontend UI
- `src/db.js` — conversations table schema
- `src/workers/` — where the summary worker would live
