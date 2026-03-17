# Mission Control UI for Ruhi — Implementation Brief

**Date:** 2026-03-17
**Status:** Ready to build
**Repo:** ikawn-openbrain (ruhi.ikawn.in)
**Prerequisite:** Agent Platform Phase 1 deployed (commit 5a07be1)

---

## Context

The agent platform backend is live — scheduled_tasks, task_runs, domain_agents tables exist in DB (schema v8). This brief covers the frontend Mission Control UI on ruhi.ikawn.in.

---

## Features

### 1. Scheduled Tasks Dashboard
- List all scheduled_tasks with status, next_run_at, run_count, consecutive_failures
- Enable/disable toggle per task
- Delete task (with confirmation)
- "Run Now" button
- Expandable run history per task (from task_runs table)
- Create new task form: name, tool (dropdown from registry), schedule_type, interval/cron, tier, agent_slug
- Filter by agent_slug, enabled/disabled

### 2. Organization Structure Page
- **C-Suite Agents** section: read from `domain_agents` table — show slug, name, role, tools[], enabled status
- **Team Members** section: read from `ob_users` table — show name, email, role, access_levels
- Visual org chart or card grid layout
- Agent cards show: role badge, tool count, enabled/disabled toggle (admin only)
- Team member cards show: name, role badge, email

### 3. Agent Mentions in Chat (@mentions)
- In chat input, typing `@` shows autocomplete dropdown of:
  - Domain agents: @ruhi, @marketing, @tech (from domain_agents table)
  - Team members: @vineet, @avinash, @abhishek (name before @ in email, from ob_users)
- When an agent is @mentioned, the message is routed to that agent's persona (read from domain_agents.persona)
- The system prompt switches to the mentioned agent's persona for that message
- Multiple @mentions in one message = Ruhi orchestrates (default Co-CEO behavior)
- Visual: mentions rendered as gold pills in the message

### 4. Group Chats
- Create group conversation with multiple participants (agents + humans)
- Participant selector: checkboxes for agents and team members
- Group chat shows participant avatars in header
- Messages tagged with sender identity
- Agents respond based on their persona when directly addressed
- ob_conversations already has group_id support — extend with participants array

### 5. People Tagging
- @vineet → resolved from ob_users where email starts with "vineet@"
- @avinash → avinash@ikawn.com
- @abhishek → abhishek@ikawn.com
- Future employees auto-resolve from ob_users (name = part before @ in email)
- Tagged humans get notification (future: email/Telegram, for now: just visual highlight)

---

## Key Files

### Existing (modify)
```
src/routes/chat-page.js     — Frontend JS (server-rendered HTML + client JS)
src/routes/chat-api.js      — Chat CRUD + SSE streaming
src/routes/ruhi-chat.js     — Ruhi persona chat with RAG
src/ruhi/persona.js         — System prompt builder
src/db.js                   — Schema (v8, has all needed tables)
```

### New (create)
```
src/routes/mission-control.js  — API routes for tasks dashboard + org structure
```

### DB Tables (already exist)
```
scheduled_tasks   — task definitions + scheduling
task_runs         — execution history
domain_agents     — C-suite agent definitions (slug, persona, tools, role)
ob_users          — team members (name, email, role, access_levels)
ob_conversations  — conversations with group_id support
```

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Deep navy | `#0A0F2E` | Backgrounds, cards |
| Primary gold | `#FFC01C` | Accents, active states, mention pills |
| Gold gradient | `#FFC01C → #F59E0B` | Headers, CTAs |
| Body font | Google Sans | UI elements, user messages |
| Ruhi replies | Noto Serif | Agent responses |
| Headers | Parkinsans | Page titles |

### UI Patterns
- Mission Control as a sidebar tab or top nav item on ruhi.ikawn.in
- Tasks dashboard: table with expandable rows (run history)
- Org structure: card grid with role badges
- @mention autocomplete: floating dropdown below cursor, filtered as user types
- Group chat: participant chips in header, color-coded messages

---

## API Endpoints (new)

```
GET  /api/mission/tasks          — List scheduled_tasks (with latest run)
POST /api/mission/tasks          — Create task
PUT  /api/mission/tasks/:uuid    — Update task (enable/disable/config)
DELETE /api/mission/tasks/:uuid  — Delete task
POST /api/mission/tasks/:uuid/run — Trigger immediate run
GET  /api/mission/tasks/:uuid/runs — Get run history

GET  /api/mission/agents         — List domain_agents
GET  /api/mission/team           — List ob_users

GET  /api/mission/mentions       — Get all mentionable entities (agents + users)
```

---

## Non-Negotiable Rules

1. All API routes require auth (requireAuth middleware)
2. brand_id scoping on all queries
3. Never expose agent internals (persona text) to non-admin users
4. @mention resolution is case-insensitive
5. Group chats respect access_level from ob_users
6. Task creation validates tool exists in registry
7. No Redis — all state in Postgres
