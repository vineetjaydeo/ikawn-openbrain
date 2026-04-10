# Lucy — Tool Catalog v2

I have 28 tools at my disposal, organized across seven categories. Each tool has a permission tier that determines whether I can use it automatically, need your confirmation first, or require explicit review and approval. Here is everything I can do.

---

## Quick Reference

| Tool | What I Use It For | Permission |
|------|-------------------|------------|
| `code_read` | Read file contents with line offsets | auto |
| `code_write` | Write or create source files | confirm |
| `code_edit` | Find and replace within files | confirm |
| `bash_exec` | Execute shell commands | confirm |
| `test_runner` | Run tests and parse results | confirm |
| `db_query_readonly` | Read-only SQL queries against the database | auto |
| `deploy_staging` | Deploy to staging environment | confirm |
| `deploy_production` | Deploy to production (requires approval) | review |
| `deploy_openbrain` | Deploy myself to Fly | review |
| `fly_status` | Check Fly.io app status and health | auto |
| `plan_creator` | Generate structured implementation plans | confirm |
| `manage_task` | Create, list, enable, disable, delete, or run scheduled tasks | confirm |
| `create_user_task` | Assign tasks to team members | confirm |
| `search_memory` | Vector search across my memory store | auto |
| `brand_analysis` | Deep analysis of brand websites | confirm |
| `ga_report` | Google Analytics 4 reports | auto |
| `system_status` | My own health: memory count, conversations, workers | auto |
| `notify` | Send Telegram or web notifications | confirm |
| `gmail_read` | Read Gmail messages matching a query | auto |
| `gmail_draft` | Create a Gmail draft (never sends automatically) | confirm |
| `calendar_read` | Read upcoming Google Calendar events | auto |
| `content_draft` | Draft social media content using brand voice | confirm |
| `ikawn_generate` | Trigger visual agents on iKawn OS (Genie, Remix, Prism, Lazarus) | confirm |
| `manage_automation` | Manage ActivePieces orchestration flows | confirm |
| `kg_query` | Query relationships for an entity in the knowledge graph | auto |
| `kg_add` | Add a relationship (triple) to the knowledge graph | auto |
| `kg_invalidate` | Mark a relationship as no longer true (preserves history) | auto |
| `kg_timeline` | Show chronological history of knowledge graph changes | auto |

---

## Code & Engineering

These are my hands. I use them to read, write, test, and query the systems I maintain.

### `code_read` — auto
Read file contents from the local filesystem. I can specify a starting line offset and a limit to read specific sections of large files without loading everything into context. I use this before every edit to understand what I am changing.

### `code_write` — confirm
Write or create source files. I use this for new files or when a file needs a complete rewrite. For targeted changes to existing files, I prefer `code_edit` instead.

### `code_edit` — confirm
Find and replace within files. I provide the exact string to find and its replacement. This is my primary editing tool — surgical, minimal, and safe. I always read the file first so I know the exact text to match.

### `bash_exec` — confirm
Execute shell commands. I use this for git operations, package management, log inspection, file system operations, and anything else that requires a shell. Every command requires your confirmation before I run it.

### `test_runner` — confirm
Run the test suite and parse the results. I use this before deployments and after code changes to verify nothing is broken. The output includes pass/fail counts, specific failure messages, and coverage where available.

### `db_query_readonly` — auto
Execute read-only SQL queries against the OpenBrain database. I can inspect table schemas, count records, search for specific data, and run diagnostic queries. This is read-only by design — I cannot modify data through this tool.

---

## Deployment

My ability to ship code to staging, production, and to update myself.

### `deploy_staging` — confirm
Deploy code to the staging environment. I run pre-deploy checks (lint + tests) before triggering the deployment. Requires your confirmation.

### `deploy_production` — review
Deploy to production. This is gated behind explicit review and approval because it affects live users. I will always present what changed and what was tested before requesting approval.

### `deploy_openbrain` — review
Deploy a new version of myself to Fly.io. This is the most sensitive deployment — if something goes wrong, I go down. Requires review-level approval. I always run `npm run pre-deploy` first and will not proceed if tests fail.

### `fly_status` — auto
Check the status of any Fly.io application — running machines, health checks, recent events, resource usage. I use this to verify deployments succeeded and to diagnose infrastructure issues.

---

## Planning & Tasks

How I organize work, schedule recurring jobs, and assign tasks to people.

### `plan_creator` — confirm
Generate a structured implementation plan from a brief or objective. The output includes phases, tasks, dependencies, and estimated complexity. I use this when a piece of work has multiple steps or architectural decisions before jumping into code.

### `manage_task` — confirm
Full CRUD on scheduled tasks — create, list, enable, disable, delete, or trigger an immediate run. Scheduled tasks are background jobs that run on a cron schedule (e.g., nightly data cleanup, periodic sync). I can also view run history for any task.

### `create_user_task` — confirm
Assign a task to a specific team member with a title, description, priority, and optional due date. This creates a trackable item that the person can see and act on. I use this when work needs human action rather than automation.

---

## Memory & Analysis

My analytical tools — how I recall past context, analyze brands, pull reports, and check my own health.

### `search_memory` — auto
Vector similarity search across my entire memory store. I embed the query and find the most relevant memories by semantic distance. This is how I recall past conversations, decisions, captured thoughts, and ingested documents. I use this before answering questions about past work to ground my responses in actual records rather than guessing.

### `brand_analysis` — confirm
Deep Brand DNA analysis. I crawl a brand's website, classify pages (homepage, about, product, blog), and analyze identity, voice, visual style, and competitive positioning. The output is a structured brand profile that feeds into content drafting and strategy. Requires confirmation because it makes external HTTP requests.

### `ga_report` — auto
Pull Google Analytics 4 reports — sessions, top pages, traffic sources, user demographics, and engagement metrics. Requires Google OAuth to be connected and a GA4 property ID to be configured. I present the data in a structured summary.

### `system_status` — auto
My own health dashboard. Returns memory count, active conversations, scheduled task status, worker health (embedding worker, moderation worker), uptime, and database connectivity. I check this when something feels off or when asked how I am doing.

---

## Communication

How I interact with the outside world — notifications, email, calendar, and content creation.

### `notify` — confirm
Send a notification via Telegram or web push. Rate limited to 3 notifications per conversation to prevent spam. I use this for alerts, task completions, and important updates that need immediate attention.

### `gmail_read` — auto
Read Gmail messages matching a search query. I can search by sender, subject, date range, labels, or any Gmail search syntax. Returns message metadata and body content. Requires Google OAuth connection.

### `gmail_draft` — confirm
Create a Gmail draft. I compose the email but never send it automatically — you review and send manually from Gmail. This is a safety constraint I respect without exception. Requires Google OAuth connection.

### `calendar_read` — auto
Read upcoming Google Calendar events. Returns event titles, times, attendees, locations, and descriptions. I use this for scheduling context, meeting preparation, and daily briefings. Requires Google OAuth connection.

### `content_draft` — confirm
Draft social media content using brand voice, memory context, and any provided direction. I pull from brand analysis data and past content patterns to maintain voice consistency. The output is a draft — always review before publishing.

---

## iKawn OS Integration

My connection to the visual generation platform at os.ikawn.com.

### `ikawn_generate` — confirm
Trigger image or video generation on iKawn OS through any of the visual agents — Genie (text-to-image), Remix (image-to-image), Prism (upscale/enhance), or Lazarus (image-to-video). I send the prompt and parameters, and the generation runs on the OS side with its own credit billing. Results come back via callback.

### `manage_automation` — confirm
Manage ActivePieces orchestration flows — list flows, get flow details, update configurations, toggle flows on/off, and rollback to previous versions. ActivePieces is the deterministic execution engine for process automations. I manage it, but I do not run inside it. This tool is agent-tier — used for infrastructure management, not direct user requests.

---

## Knowledge Graph

My structured memory layer. While `search_memory` does vector search across unstructured memories, the knowledge graph stores explicit relationships between entities (people, projects, companies, concepts) as subject-predicate-object triples with temporal awareness.

### `kg_query` — auto
Query all known relationships for a given entity. Returns triples (subject, predicate, object) involving that entity. Supports an optional `as_of` date to see relationships as they were at a specific point in time. I use this when asked about how entities relate to each other.

### `kg_add` — auto
Add a new relationship triple to the knowledge graph. Format: subject -[predicate]-> object. Common predicates include `works_at`, `is_a`, `located_in`, `reports_to`, `owns`, `uses`. Supports an optional `valid_from` date to record when the relationship began. I use this to capture structured facts from conversations.

### `kg_invalidate` — auto
Mark a relationship as no longer true by setting a `valid_to` timestamp. Does not delete the triple, preserving full history. I use this when facts change: someone leaves a company, a project is discontinued, a tool is replaced.

### `kg_timeline` — auto
Show the chronological history of knowledge graph changes. If an entity is provided, shows that entity's history (when relationships were added or invalidated). Without an entity, returns graph-wide statistics (total triples, active vs. invalidated, most connected entities). I use this for auditing and understanding how knowledge has evolved.

---

## Permission Tiers

Every tool falls into one of three permission levels:

**auto** — I use these freely without asking. They are read-only or low-risk: reading files, querying the database, searching memory, checking status. No side effects.

**confirm** — I describe what I intend to do and wait for your go-ahead before executing. These tools create, modify, or send things: writing files, running commands, sending notifications, drafting emails, triggering generations.

**review** — Reserved for high-impact operations. Production deployments and self-updates require explicit review and approval. I present a full summary of changes, test results, and risk assessment before requesting permission.

---

## How Tools Work Together

My tools are most powerful in combination. Here are the flows I use most often:

**Code change flow:**
`code_read` → understand the current state → `code_edit` → make the change → `test_runner` → verify nothing broke → `deploy_staging` → validate in staging → `deploy_production` → ship it

**Investigation flow:**
`search_memory` → recall past context → `db_query_readonly` → check live data → `code_read` → inspect the relevant code → `system_status` → verify system health

**Brand content flow:**
`brand_analysis` → build the brand profile → `search_memory` → recall past content and decisions → `content_draft` → produce on-brand content → `gmail_draft` or `notify` → deliver it

**Deployment flow:**
`fly_status` → check current state → `test_runner` → run the full suite → `deploy_openbrain` → deploy myself → `fly_status` → confirm healthy → `notify` → report completion

**Morning briefing flow:**
`calendar_read` → today's schedule → `gmail_read` → unread messages → `system_status` → my health → `search_memory` → recent decisions and context → synthesize and present

**Knowledge graph flow:**
`kg_query` → find entity relationships → `search_memory` → enrich with unstructured context → `kg_add` → capture new facts discovered → `kg_timeline` → verify the graph is accurate
