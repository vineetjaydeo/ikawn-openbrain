# P3 — Ruhi Memory Gaps + Task Creation — Handoff

## Context

P2 multi-tenant scale prep is DEPLOYED (v2.3.0, commit f2c1f10, 2026-03-20).
All 6 P2 items live. This handoff covers two gaps V identified from real usage.

## Problem 1: Cross-User Memory Retrieval

**Symptom**: Abhishek has a substantive conversation with Ruhi about Prism governance (rule systems, framing corrections). Later, when V asks "Anything Abhishek has mentioned?", Ruhi should surface that conversation — but the RAG search may not connect the dots.

**Root cause investigation needed**:
- `captureMessage()` fires on both inbound/outbound in `ruhi-chat.js` and `chat-api.js` — messages ARE being saved to memories
- But RAG search in `searchMemories()` (chat-api.js) and `searchMemory()` (ruhi-chat.js) has user isolation: `AND (user_id = X OR access_level NOT IN ('private') OR user_id IS NULL)`
- If Abhishek's messages are captured with `user_id = abhishek_id` and `access_level = 'private'`, V's search won't see them
- **Fix**: Conversations should be captured with `access_level = 'internal'` (not 'private') so team members with internal access can see each other's conversations
- Alternatively: admin users should bypass user_id filtering entirely in RAG

**Files to check**:
- `src/utils/capture.js` — what access_level does captureMessage default to?
- `src/routes/chat-api.js` lines 18-88 — searchMemories user isolation logic
- `src/routes/ruhi-chat.js` lines 11-39 — searchMemory user isolation logic

**Verification**: After fix, log in as V, ask "what has Abhishek been discussing?" — should surface Abhishek's Prism governance conversation.

## Problem 2: Ruhi Should Create Tasks from Conversations

**Symptom**: Abhishek tells Ruhi "Define this into Prism rule system and mention it to Vineet for making correction." Ruhi drafts the rule system in chat but has no way to create an actionable task assigned to V.

**What needs building**:
- A `create_task` tool (or extend existing `manage_task`) that Ruhi can call autonomously
- When a team member asks Ruhi to relay something, assign work, or flag something for another user, Ruhi should:
  1. Create a task in `scheduled_tasks` (or a new `user_tasks` table) assigned to the target user
  2. Optionally notify the target user via Telegram (notify tool already exists)
  3. Confirm to the requesting user that the task was created

**Design considerations**:
- Could use existing `scheduled_tasks` with `schedule_type = 'once'` and a new `assigned_to` column
- Or create a simpler `user_tasks` table (id, brand_id, title, description, assigned_to, created_by, status, priority, created_at)
- The tool should be in the registry so Ruhi can call it via function calling
- Task should appear in Mission Control for the assigned user

**Scope**: This is about human-to-human task relay through Ruhi, not automated scheduled tasks.

**Files to modify**:
- New tool: `src/tools/create-task.tool.js` (or modify `src/tools/manage-task.tool.js`)
- `src/routes/mission-control.js` — ensure tasks show up for assigned user
- Persona prompt may need a hint that Ruhi should proactively create tasks when users ask to relay/assign work

## Priority

Both are high priority — they're about Ruhi being genuinely useful as a team coordination layer, not just a chat interface. Problem 1 (memory) is the quicker fix. Problem 2 (tasks) is the bigger feature.

## Deploy

```bash
# OpenBrain deploys directly to production (no staging)
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only
# If Depot h2c errors, try --depot=false
```
