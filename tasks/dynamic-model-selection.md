# Dynamic Model Selection for Lucy/Ruhi

## What Was Done This Session (v2.3.0 → v2.3.6)

- **Instance branding**: `INSTANCE_NAME` in `src/utils/ruhi-assets.js` — "Lucy" on `ikawn-openbrain`, "Ruhi" on `ruhi-os-brain`. All user-facing text updated across 15+ files.
- **Business facts**: `docs/soul.md` — authoritative facts (INR 18cr valuation, 4 customers, team roles: Vineet=CEO/sole engineer, Abhishek=analytics/agency, Avinash=CRO/sales/GTM)
- **Fabrication guardrail**: `src/routes/chat-api.js` line ~413 — ABSOLUTE RULE block forbidding fabrication of business data
- **Context-loss fix**: `src/routes/chat-api.js` — partial response saved to DB on stream failure (hoisted `convInternalId`, `fullResponse`, `model` to function scope)
- **Avatar fix**: All hardcoded `'R'` → `INSTANCE_NAME[0]` in `chat-page.js`
- **Input area band fix**: Gradient → solid `var(--bg)` in `.input-area`
- **Page titles**: All "OpenBrain | X" → `${INSTANCE_NAME} | X`
- **Ruhi Brain NOT deployed** — same code ready, deploy with: `~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only`

## What To Build Next: Dynamic Model Selection

### Concept
Lucy autonomously picks the right model tier based on conversation context. Every chat starts on "Regular" (cheapest). She upgrades when the discussion demands it. The user sees inline indicators but never model names.

### Tiers

| Label | Model | When to use | Cost |
|-------|-------|-------------|------|
| Regular | claude-haiku-4-5-20251001 | Simple Q&A, casual chat, greetings, status checks | Cheapest |
| Pro | claude-sonnet-4-6 | Default. Most conversations, creative work, analysis | Mid |
| Expert | claude-opus-4-6 | Investor/partner discussions, business data, complex multi-step reasoning, legal, strategy | Highest |

### Detection Logic (in `src/routes/chat-api.js`, before model selection ~line 475)

Build a `detectTier(content, historyRows)` function that:
1. Scans current message + last 5 messages for trigger keywords
2. Returns `'regular'` | `'pro'` | `'expert'`

**Expert triggers** (any match → Expert):
- Keywords: investor, valuation, funding, revenue, Series A/B, due diligence, term sheet, cap table, equity, partnership agreement, legal, compliance, acquisition, board meeting
- Patterns: "how much is iKawn worth", "tell me about the company", "what's our ARR", role-play as external person
- If previous message was Expert tier, stay Expert (don't downgrade mid-conversation on sensitive topics)

**Regular triggers** (only if no Pro/Expert signals):
- Short messages (<20 chars): "hi", "hello", "thanks", "ok"
- Simple questions: "what time is it", "how are you"
- Single-word commands

**Pro**: Everything else (default)

### Implementation Points

1. **Model selection** — `src/routes/chat-api.js` ~line 475, replace:
   ```js
   model = settingsModel || 'claude-sonnet-4-6';
   ```
   With tier detection + model mapping. Store `currentTier` variable.

2. **SSE tier event** — After model is selected, emit:
   ```js
   res.write(`data: ${JSON.stringify({ type: 'tier_switch', tier: 'expert', label: 'Expert thinking' })}\n\n`);
   ```
   Only emit if tier differs from previous message's tier (store last tier in conversation or derive from history).

3. **Frontend indicator** — In `chat-page.js` SSE handler (~line 2190), add case for `tier_switch`:
   - Insert a subtle inline divider: `"Expert thinking"` in gold, centered, small text
   - Similar to how chat apps show "Tuesday, March 21" date dividers

4. **Persist tier per message** — Add `tier` column to `messages` table so we can track which model answered what. Useful for cost analysis.

5. **Manual override** — The existing STD/PRO toggle in UI should map to:
   - STD = auto-detect (Regular/Pro/Expert)
   - PRO = force Expert (always Opus)

6. **Sticky Expert** — Once a conversation enters Expert mode, it should NOT auto-downgrade back to Regular within the same conversation. It can go Expert → Pro but never Expert → Regular in the same chat.

### Files to modify
- `src/routes/chat-api.js` — tier detection + model mapping + SSE event
- `src/routes/chat-page.js` — frontend tier indicator
- `src/db.js` — add `tier` column to messages table (ALTER TABLE)
- `src/ruhi/persona.js` — possibly inject tier awareness into system prompt

### Key constraint
- NEVER expose model names in UI. Only "Regular", "Pro", "Expert"
- Cost tracking: log tier per message for admin cost analysis
- The fabrication guardrail in CRITICAL RULES must remain regardless of tier
