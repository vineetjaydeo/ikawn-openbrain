# iKawn — Claude Code Reference

Read this file at the start of every session. Authoritative reference for terminology,
architecture, and conventions. Do not guess — look it up here first.

---

## Terminology (Use Exactly These Terms)

| Term | Means | Do NOT say |
|------|-------|------------|
| **Ruhi OS** (or just **OS**) | os.ikawn.com/ruhi — the conversational interface | "Ruhi chat", "Ruhi web", "/ruhi route" |
| **Visual OS** | os.ikawn.com — all agents except Ruhi (Genie, Remix, Prism, Lazarus, Muse, Shopkeeper) | "ikawn OS", "the platform" |
| **OpenClaw** | Hostinger VPS agent — orchestration, Telegram, background tasks | "the agent", "the bot" |
| **OpenBrain** | This codebase — memory, RAG, chat, intelligence. ONE repo, TWO Fly deployments | "the memory system" |
| **Lucy** | OpenBrain deployed as `ikawn-openbrain` — internal/R&D channel at ruhi.ikawn.in | "OpenBrain internal" |
| **Ruhi Brain** | OpenBrain deployed as `ruhi-os-brain` — SaaS channel powering os.ikawn.com/ruhi | "Ruhi backend" |
| **Ruhi** (conceptually) | OpenBrain + OpenClaw + Visual OS combined | Use only for the brand character, not any one system |
| **ikawn-v3** | Monorepo on Fly.io powering Ruhi OS + Visual OS | "the app", "the frontend" |

**CRITICAL — Dual Deployment:**
This codebase deploys to TWO separate Fly apps with TWO separate databases:
- `flyctl deploy --app ikawn-openbrain` → **Lucy** (ruhi.ikawn.in) — internal R&D, Telegram
- `flyctl deploy --app ruhi-os-brain` → **Ruhi** (os.ikawn.com/ruhi) — SaaS product
When changing shared code (routes, db.js, etc.), **deploy to BOTH apps**.
Each app has its own DB (`ikawn-openbrain-db` and `ruhi-os-brain-db`), own secrets, own users.

**Key rule:** Ruhi OS is what clients and investors see. OpenClaw and OpenBrain are internal
infrastructure — never expose these names in UI copy or Ruhi's responses.

---

## Systems & URLs

| System | URL | Platform | Local Repo |
|--------|-----|----------|------------|
| Ruhi OS + Visual OS | https://os.ikawn.com | Fly.io SIN | `/Users/vineet/ikawn-v3` |
| Ruhi OS specifically | https://os.ikawn.com/ruhi | — | — |
| OpenBrain (internal) | https://ruhi.ikawn.in | Fly.io SIN | `/Users/vineet/ikawn-openbrain` |
| OpenBrain (fly url) | https://ikawn-openbrain.fly.dev | — | — |
| OpenClaw | http://72.60.203.110:46533 | Hostinger VPS | `/Users/vineet/ikawn-openclaw` |
| ikawn.com (marketing) | https://ikawn.com | Hostinger LAMP | Grav CMS |

**OpenClaw VPS details:**
- Container: `openclaw-hn3b-openclaw-1`
- SOUL.md inside container: `/data/.openclaw/workspace/SOUL.md`

---

## Credentials

### VPS SSH
```
Host: 72.60.203.110
User: root
Password: FILL_IN
```

### API Keys
| Key | Value | Used by |
|-----|-------|---------|
| OpenBrain API Key | `FILL_IN` | ikawn-v3, OpenClaw |
| OpenClaw Gateway Token | `FILL_IN` | ikawn-v3 → OpenClaw HTTP calls |
| ikawn OS API Key | `FILL_IN` | OpenBrain → ikawn-v3 callbacks |
| OpenAI API Key | `FILL_IN` | OpenBrain (embeddings, moderation) |

### Fly.io
- CLI path: `~/.fly/bin/flyctl`
- Apps: `ikawn-v3`, `ikawn-openbrain`, `ikawn-openbrain-db`

---

## Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary gold | `#FFC01C` | Ruhi accents, CTA buttons, active states |
| Gold gradient | `#FFC01C → #F59E0B` | Ruhi headers, send button |
| Deep navy | `#0A0F2E` | Backgrounds, dashboard, utility pages |

### Typography
| Usage | Font |
|-------|------|
| Display / page headers | Parkinsans |
| Body / UI elements | Google Sans |
| Ruhi's chat replies | Noto Serif |
| User sent messages | Google Sans |

### Design references
- **Palantir.com** — first-scroll impact benchmark, dark, serious
- **Claude.ai / ChatGPT** — Ruhi OS chat layout and empty state feel

### Component conventions
- Ruhi OS chat: user messages = right-aligned rounded pill (Google Sans). Ruhi replies = no
  wrapper, full width, Noto Serif.
- Generation thumbnails: medium size, rounded corners, click → Generation Preview modal
  (consistent across the entire app — do not create separate viewers)
- Gold sparkle icon (✦) = Ruhi's avatar/identifier in chat
- `source` column on generations table is mandatory. Valid values: `ruhi-web`, `telegram`,
  `shopify`, `api`, `chatgpt`, `claude`, `unknown`. Never insert a generation without it.

---

## Testing

```bash
npm test              # Run all tests (41 tests across unit/integration/regression)
npm run test:watch    # Watch mode
npm run lint          # ESLint only
npm run pre-deploy    # Full gate: lint + tests (run before EVERY deploy)
```

### Test Structure
```
tests/
  helpers/     — Mock DB, session, Express app factory
  unit/        — Pure function tests (tier detection, embedding format, auth)
  integration/ — HTTP endpoint tests via supertest (upload validation)
  regression/  — Tests for previously fixed bugs (NEVER delete these)
```

### Rules
- **NEVER deploy without running `npm run pre-deploy` first**
- **NEVER delete a regression test** — they exist because the bug happened before
- When fixing a bug, write the regression test FIRST (TDD)
- When adding a feature, add at least one happy-path test

---

## Deploy Commands

### ikawn-v3 (Ruhi OS + Visual OS)
```bash
# Deploy
flyctl deploy --app ikawn-v3 --remote-only

# Logs
flyctl logs --app ikawn-v3

# Secrets
flyctl secrets set KEY=value --app ikawn-v3
```

### ikawn-openbrain (OpenBrain)
```bash
# ALWAYS run pre-deploy first
npm run pre-deploy

# Deploy (use Depot builder — remote builders are unreliable)
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only

# Logs
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail

# DB connect
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain
```

### OpenClaw (VPS)
```bash
# SSH in (password in 1Password)
ssh root@72.60.203.110

# Exec into container
docker exec -it openclaw-hn3b-openclaw-1 bash

# Restart container after changes
docker restart openclaw-hn3b-openclaw-1
```

---

## Branch & Deploy Rules

| Repo | Rule |
|------|------|
| ikawn-v3 | All work → `staging` branch first. Never push to `main` without V's explicit approval. |
| ikawn-openbrain | Deploy directly to Fly production. No staging. |
| OpenClaw | Edit files directly on VPS, restart container. No git workflow. |

---

## Current Sprint — Ruhi 3.0

Active build. Brief lives at `/Users/vineet/ikawn-v3/ruhi_3.0.md` — read it before touching
anything in `packages/app/server/ruhi/` or the Ruhi OS UI.

**Summary of what's being built:**
- Ruhi OS gets file-based intelligence: SOUL.md, TOOLS.md, AGENTS.md
- OpenClaw gets an HTTP API (`POST /tasks`) for remote task delegation from Ruhi OS
- SSE-based result streaming back to Ruhi OS (in-process, no Redis)
- `/ruhi` UI full redesign — centered input, clean empty state, no Generations tab
- `source` column added to generations table

**Active clients:** MaxFashion (live), Shubhkart (pilot)

---

## MCP Servers (Claude Code)

### context7 — Live Library Docs
Fetches up-to-date, version-specific documentation for any library and injects it into context.
Eliminates hallucinated APIs and outdated patterns.

**Installed globally** (`--scope user`) — active in all CC sessions.

**Usage:** append `use context7` to any prompt involving a library or framework.
```
How do I set up middleware in Nuxt 3? use context7
How does Drizzle ORM handle migrations? use context7
```

CC will auto-resolve the library, fetch current docs, and use them in its response.
No need to specify a version — context7 matches the version in your project.

**Key libraries for iKawn:** Nuxt 3, Vue 3, Drizzle ORM, Radix Vue, shadcn-vue, Tailwind CSS,
Node.js/Express (OpenBrain), Fly.io CLI.

To add a rule so CC invokes context7 automatically without you typing it every time,
add this to `~/.claude/CLAUDE.md`:
```
Always use context7 when working with any library, framework, or API.
```

---

## OpenBrain — `OPENBRAIN_BRAIN` flag (v1 / v2)

The OpenBrain chat path is dual-implementation behind one env var.

| Value | Path | Status |
|-------|------|--------|
| unset / `v1` | `src/routes/chat-api.js` (legacy reasoning loop) | Production today |
| `v2` | `packages/agent-api/` `legacyHttp` (TurnEngine + 3 pioneer tools) | Plan 02 cutover; Lucy soak |

### Activate / rollback

```bash
# Activate on Lucy
~/.fly/bin/flyctl secrets set OPENBRAIN_BRAIN=v2 --app ikawn-openbrain

# Rollback (instant)
~/.fly/bin/flyctl secrets unset OPENBRAIN_BRAIN --app ikawn-openbrain
```

### Hard rules

- Lucy first. NEVER set `OPENBRAIN_BRAIN=v2` on `ruhi-os-brain` without V's explicit approval (`feedback_lucy_first_ruhi_safe.md`).
- Soak window: minimum one week on Lucy before any Ruhi Brain consideration.
- Under v2, attachments / mentions / generations / skills / titles / drafts are **not yet supported** -- Plans 03-05 close the gap.
- `npm run pre-deploy` MUST pass before any deploy. The gate now covers both root and `packages/agent-api/` test suites.

---

## OpenBrain — Non-Negotiable Rules

1. **`captureMessage()` is the ONLY door** — no direct INSERTs into memories anywhere, ever
2. **Always deploy with `--no-cache`** — Depot builder caches stale src layers
3. **Route order matters** in `index.js` — Memory API routes MUST be mounted BEFORE chatApi
4. **ON CONFLICT with partial indexes** needs matching WHERE clause (`WHERE source_ref IS NOT NULL`)
5. **Fly.io kills async work after `res.json()`** — do all critical work (especially forwarding) BEFORE responding
6. **brand_id = 'ikawn'** is the default until multi-tenant routing is live

---

## OpenBrain — Key File Paths

```
src/
  index.js              — Express app, middleware, route mounting (ORDER MATTERS)
  db.js                 — Postgres pool, schema init, all CREATE TABLE/ALTER TABLE
  auth.js               — requireAuth, requireAdmin, requireBrand, requireAuthOrApiKey
  embeddings.js         — getEmbedding() for search queries
  scheduler.js          — Cron: GitHub (30min), Calendar (2hr), retention (nightly)

  routes/
    webhooks.js         — GitHub + Telegram webhooks, OpenClaw ingest
    chat-api.js         — Web chat CRUD + SSE streaming
    ruhi-chat.js        — Ruhi persona chat with RAG
    capture.js          — POST /capture
    search.js           — GET /search (vector + recency hybrid)
    actions.js          — ikawn OS proxy (trigger, status, complete)
    brain-health.js     — Cost monitor + Brain Health dashboard
    admin-api.js        — Admin user management

  workers/
    embedding-worker.js — Async batch embedding (5s, 50/batch, text-embedding-3-small)
    moderation-worker.js— Content moderation (30s)

  utils/
    capture.js          — captureMessage() + captureEditDelta() — THE ONLY DOOR
    llm.js              — OpenAI chat completions (streaming + non-streaming)
    hashtags.js         — Keyword-based hashtag suggestion (NO LLM calls — 24-tag taxonomy)

  connectors/
    github.js           — Commit/issue/PR sync
    gcal.js             — Calendar event sync
    telegram.js         — Telegram message processing + OpenClaw self-report

  ruhi/
    persona.js          — Ruhi system prompt builder

  docs/
    soul.md             — Ruhi's personality + knowledge
    memory.md           — Memory system docs
    tools.md            — Available tools
    user.md             — User context

  mcp/
    server.js           — MCP stdio server (8 tools for Claude Desktop)
```

---

## OpenBrain — P0 Items (All Resolved)

1. ~~**Mothership nightly worker**~~ — DONE. Runs at 2am UTC, promotes clean edit_deltas to mothership_log. Started at index.js:137.
2. ~~**Moderation alerting**~~ — DONE (commit aa075d8). Score > 0.9 now sends Telegram alert to V via Bot API.
3. ~~**OpenClaw SOUL.md**~~ — VERIFIED. VPS SOUL.md has correct search-before-respond + dual capture format, rate limits, model selection, gallery browsing.

---

## OpenBrain — System Topology

```
Telegram → OpenBrain (forward FIRST, then capture async) → VPS relay (port 46535) → OpenClaw (port 3333)
                                                                    ↓
                                                           ikawn OS (os.ikawn.com)
                                                           → callbacks to OpenBrain /api/actions/complete
```

Also feeding OpenBrain: GitHub webhooks, Google Calendar (2hr), ruhi.ikawn.in web chat, MCP server, OpenClaw self-reports.

---

## ActivePieces Integration (Orchestration Layer)

**Status:** In progress. Genie endpoint feature-flagged, awaiting AP deployment on Fly.

ActivePieces (AP) is a self-hosted open-source automation platform deployed on Fly as `ikawn-activepieces`.
It serves as a **deterministic execution engine** for process-driven automations. Lucy/Ruhi remain the
intelligence layer — AP never touches auth, memory, credits, or LLM reasoning.

### Architecture
```
Lucy/Ruhi (intelligence) → ActivePieces (orchestration) → External APIs (execution)
ikawn-v3 (surface)       → ActivePieces (orchestration) → External APIs (execution)
                                    ↓
                          Callbacks to ikawn-v3 /api/internal/generation/*
```

### OpenBrain's Role
- **`automation.tool.js`** — Tool in the registry that lets Lucy/Ruhi manage AP flows (CRUD, monitor, rollback)
- **`automation-monitor.js`** — Worker (15min interval) that polls AP flow run data, alerts on drift
- **`flow_versions`** — DB table for version tracking, rollback, and A/B performance comparison

### Key Files
```
src/tools/automation.tool.js      — manage_automation tool (list, get, update, toggle, rollback flows)
src/workers/automation-monitor.js — Periodic flow health monitoring + memory capture on alerts
src/db.js                         — flow_versions table schema (auto-created on startup)
```

### Environment Variables (Fly Secrets)
| Key | Used By | Description |
|-----|---------|-------------|
| `ACTIVEPIECES_URL` | automation.tool, monitor | AP instance URL (e.g., https://ikawn-activepieces.fly.dev) |
| `ACTIVEPIECES_API_KEY` | automation.tool, monitor | AP API key for programmatic access |

### Hard Rules
- AP never holds iKawn database credentials — communicates via HTTP callbacks only
- AP never does LLM reasoning — it's a dumb-but-reliable pipeline runner
- Flow definitions are versioned in `flow_versions` before every update/rollback
- The `manage_automation` tool is agent-tier — only callable by domain agents, not direct user requests

---



- Never expose "OpenClaw", "OpenBrain", or "delegation" in UI copy or Ruhi's responses
- Never push ikawn-v3 to `main` without V's approval
- Never add Redis — evaluated and removed as premature optimization
- Never use pgvector until Fly supports it or DB moves to Supabase/Neon
- Never build iKawn Performance OS yet — only after 3 paying clients
- All architecture and implementation decisions are V's alone
