# Lucy — Changelog

This is my version history. I can cite specific versions when asked about my capabilities or recent changes.

## v3.0.0 (2026-04-05) — Lucy v3 Engine

### New Capabilities
- **Reasoning Loop**: Multi-turn iterative thinking with tool use (up to 25 turns per task)
- **24 v2 Tools**: code_read, code_write, code_edit, bash_exec, test_runner, db_query_readonly, deploy_staging, deploy_production, deploy_openbrain, fly_status, plan_creator, manage_task, create_user_task, search_memory, brand_analysis, ga_report, system_status, notify, gmail_read, gmail_draft, calendar_read, content_draft, ikawn_generate, manage_automation
- **Agent Orchestration**: Can spawn sub-agents (researcher, builder, reviewer, deployer, analyst) — up to 3 concurrent
- **Trust System**: Progressive trust with domain-specific scoring. Promotion after consecutive successes, immediate demotion on failure
- **HOTL (Human ON the Loop)**: Approval workflows via Telegram. Sessions suspend on gated actions, resume after human response
- **Episodic Memory**: Every conversation turn captured, embedded async, searchable
- **Semantic Knowledge**: Facts extracted from episodes every 30min via Claude Haiku, deduplicated by similarity
- **Cross-Session Continuity**: Load context from last 3 sessions at startup
- **Working Memory**: Persistent session state (decisions, files modified, findings, plans, pending actions)
- **Cost Tracking**: Real-time cost monitoring per session with budget caps
- **Memory Lifecycle**: Configurable retention (default 90 days), automatic cleanup

### Architecture
- Reasoning loop: src/engine/reasoning-loop.js
- Task processor: src/engine/task-processor.js (polls every 5s, max 3 concurrent)
- Agent spawner: src/engine/agent-spawner.js
- Agent presets: src/engine/agent-presets.js (6 archetypes)
- Tool executor: src/engine/tool-executor.js (trust-aware, retry logic)
- Tool registry: src/engine/tool-registry-v2.js (24 tools loaded from src/tools/v2/)
- HOTL: src/engine/hotl.js + approval-telegram.js + approval-timeout.js
- Trust: src/engine/trust-ledger.js + trust-scorer.js
- Memory: src/engine/episodic-capture.js, memory-search.js, memory-augmenter.js, cross-session.js
- Workers: episodic-embedding-worker.js, semantic-extractor.js, memory-lifecycle.js

### Stats
- 665 tests across 60 test files
- 24 engine modules
- 24 v2 tools
- 3 new workers
- 10 C-Suite agent definitions

## v2.7.0 (2026-04-03) — LCC Power-Up

### Changes
- Ruhi coding tools (code_read, code_write, bash_exec)
- Context compression for long conversations
- Parallel execution support
- Migrated from OpenAI to Claude + Gemini (no OpenAI for LLM)
- Deployed to Lucy (ikawn-openbrain)

## v2.6.0 (2026-04-01) — User Isolation + SSE Resilience

### Changes
- Fixed Telegram notification leaks across users
- RAG memory queries now scoped by user_id
- Native Claude web_search tool (replaced Brave for Telegram)
- SSE heartbeat + forced synthesis for long tasks
- Brave Search as fallback only

## v2.5.0 (2026-03-20) — Tool Use + Brand API

### Changes
- Native Claude tool_use support (11 tools)
- Brand Analysis API (public endpoint)
- PDF parsing (pdf-parse v2 API)
- Share conversations feature
- Ghost draft cleanup

## v2.0.0 (2026-03-17) — Agent Platform + Mission Control

### Changes
- 10 C-Suite domain agents (Tech, Ops, Finance, Marketing, Sales, Growth, HR, R&D, Customer Success, Ruhi)
- Scheduled tasks with cron/interval/trigger support
- Mission Control UI (/mission page)
- @mentions with persona switching
- Multi-user isolation (user_id on memories, RAG scoping)
- Gallery picker with agent badges

## v1.0.0 (2026-03-07) — Initial OpenBrain

### Changes
- Web chat with Claude Sonnet
- Memory capture (captureMessage)
- Embedding worker (text-embedding-3-small, later gemini-embedding-001)
- GitHub + Calendar sync
- Cost monitoring dashboard
- UUID chat IDs
