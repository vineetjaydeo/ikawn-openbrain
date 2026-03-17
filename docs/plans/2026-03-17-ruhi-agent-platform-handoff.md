# Ruhi Agent Platform — Implementation Handoff

**Date:** 2026-03-17
**Context:** Brainstorming + spec complete. Ready for implementation planning + execution.
**Repo:** `/Users/vineet/ikawn-openbrain/` (main branch, pushed)

---

## Prompt for Next Session

```
cd /Users/vineet/ikawn-openbrain

Read the Ruhi Agent Platform design spec at:
docs/superpowers/specs/2026-03-17-ruhi-agent-platform-design.md

This spec was brainstormed, reviewed (3 critical + 4 major issues fixed), and hardened
with production failure mode analysis (10k event simulation, 6 scale defenses).

Your job: Create an implementation plan for Phase 1 and execute it.

Phase 1 scope (from spec Section 12):
- DB schema: scheduled_tasks, task_runs, domain_agents, brand_oauth_tokens
  (add to initSchema() in src/db.js — NO migration files, follows existing pattern)
- Tool registry: src/tools/registry.js + auto-loader for *.tool.js files
- Phase 1 tools: calendar_read, gmail_read, ga_report, notify, system_status,
  fly_status, manage_task (Tier 1) + calendar_create, gmail_draft, gmail_send,
  ga_analyze, ikawn_generate, content_draft (Tier 2)
- web_search is Claude's server-side tool — NOT a tool file
- Agent executor: src/agent/executor.js (Tier 2 — Claude + tools + approval gates)
- LLM client: src/agent/llm-client.js (Anthropic primary, OpenAI GPT-5.2 fallback)
- Task scheduler: 30s polling loop in src/scheduler.js with pg_try_advisory_xact_lock
- Event bus: src/utils/event-bus.js (in-process EventEmitter for trigger-based tasks)
- Google OAuth: src/utils/google-auth.js + brand_oauth_tokens table
- Agent seed scripts: src/agents/*.seed.js → INSERT into domain_agents table
  (DB is single source of truth for personas, seed scripts run once)
- Telegram: manage_task tool_use in webhooks.js intelligence-telegram handler
  + inline keyboard approval buttons + callback query handler
- Web chat: manage_task tool_use in ruhi-chat.js
- Persona: enhance existing src/ruhi/persona.js with task management awareness

Phase 1 agents (seed into domain_agents table):
- Ruhi (Co-CEO) — orchestration, routing, direct commands
- Marketing (CMO) — GA analysis, content strategy, social media, campaigns
- Tech (CTO) — system health, deployment monitoring, costs, release docs

Intelligence hardening (apply to EXISTING workers during Phase 1):
- Remove "mention rules" directive from generateWithMemory (1 line, do FIRST)
- Memory decay: effective_confidence = confidence * time_decay(last_updated)
- Session diversity: require ≥2 sessions before distilling
- Recall weighted scoring: similarity 60%, confidence 25%, recency 10%, usage 5%
- Cluster dedup: check top 3 similar before inserting new distilled memory
- Per-type memory caps: 30 voice rules, 50 total per brand
- Contradiction pressure: reduce both confidences by 0.1 on detection
- Supersession escalation: use Sonnet (not Haiku) when either memory confidence > 0.8
- Per-brand worker guards: scope cost limits by workerName:brandId
- Memory events source column: ALTER TABLE + update capture calls

Non-negotiable rules:
- No Redis. Postgres is the queue.
- No separate worker process. Same Express app.
- captureMessage() is the ONLY door for memory writes.
- Anthropic primary, OpenAI fallback. Never cheap out on reasoning.
- 3-failure auto-disable on tasks. No runaway loops.
- brand_id scoping everywhere. V is tenant zero.
- Never expose agent internals in UI. Users see "Ruhi."

Key existing files to understand before coding:
- src/db.js — schema init pattern (CREATE TABLE IF NOT EXISTS)
- src/scheduler.js — existing cron jobs (GitHub 30min, Calendar 2hr)
- src/routes/webhooks.js — intelligence-telegram handler (line ~172)
- src/routes/ruhi-chat.js — web chat handler
- src/ruhi/persona.js — existing system prompt builder
- src/utils/capture.js — captureMessage() (the ONLY door)
- src/utils/recall.js — current recall scoring (needs recency/usage fix)
- src/workers/distillation-worker.js — needs temporal spread + decay fixes
- src/utils/generate-with-memory.js — remove "mention rules" directive

Deploy: ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --depot=false

The vision: Ruhi is an autonomous Co-CEO — an agentic C-suite that replaces
$50k+/month in executive overhead. Each business function is a domain agent.
Ruhi orchestrates them, makes cross-functional decisions, and earns more
autonomy over time as her approval rate climbs.
```

---

## What's Done
- [x] Design spec complete (800+ lines)
- [x] Spec reviewed — 3 critical, 4 major, 5 minor issues all fixed
- [x] Intelligence hardening — 8 fixes integrated
- [x] Production failure modes — 10k event simulation, 6 scale defenses
- [x] Pushed to main (commit 06f1257)
- [x] Bug fix deployed — imageUrl crash in webhooks.js

## What's Next
- [ ] Create implementation plan (use writing-plans skill)
- [ ] Execute Phase 1
- [ ] Deploy + verify
- [ ] Phase 1.5: Growth (CGO) + Customer Success (CCO) agents
