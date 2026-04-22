# OpenBrain -- PPT Brief for Claude

Use this document to create a 12-15 slide executive presentation. Style: Palantir-grade, dark theme, minimal text per slide, data-forward. No emojis. No fluff.

---

## SLIDE 1: Title
**OpenBrain: Enterprise Intelligence Infrastructure**
Tagline: "Your organization's second brain -- private, learning, always on."
By iKawn

## SLIDE 2: The Problem
- Enterprises leak institutional knowledge every day -- in emails, chats, meetings, documents
- Current AI assistants are stateless -- they forget everything after each session
- Sensitive data (financial, customer, compliance) cannot touch public AI services
- No single system connects email, calendar, analytics, CRM, and documents into a unified intelligence layer

## SLIDE 3: What OpenBrain Is
A self-hosted enterprise intelligence platform that:
- Remembers everything your organization tells it (persistent memory with vector search)
- Connects to your existing tools (Gmail, Calendar, Analytics, GitHub, Meta Ads, Microsoft 365)
- Learns from every interaction (episodic memory -> semantic knowledge extraction -> knowledge graph)
- Runs autonomous agents that work 24/7 on scheduled tasks
- Generates documents, reports, presentations, and spreadsheets
- All on YOUR infrastructure -- zero data leaves your network

## SLIDE 4: Architecture Overview
```
[User] --> [Chat Interface (SSE streaming)]
                |
        [Reasoning Engine]
        (multi-turn, tool-use, parallel execution)
                |
    +-----------+-----------+
    |           |           |
[Memory]    [Tools]     [Connectors]
(vector DB,  (28 tools,  (Gmail, Calendar,
 knowledge   code, docs,  Analytics, GitHub,
 graph,      search,     Meta, Telegram,
 episodic)   deploy)     Microsoft 365)
                |
        [Agent Platform]
        (10 role-based agents,
         scheduled tasks, cron jobs,
         trust-gated execution)
```

## SLIDE 5: Memory System -- The Core Differentiator
**Four-layer memory architecture:**

| Layer | What | Retention |
|-------|------|-----------|
| Episodic | Every conversation turn | TTL-based (days-weeks) |
| Semantic | Extracted durable facts | Permanent |
| Knowledge Graph | Entities + relationships | Permanent |
| Distilled | Learned patterns from user feedback | Permanent |

- Hybrid search: vector similarity + recency scoring
- Auto-extraction: Haiku processes every conversation, pulls out facts, decisions, preferences
- Cross-session continuity: picks up where you left off, even days later
- Per-user, per-brand isolation -- multi-tenant from the ground up

## SLIDE 6: Connector Ecosystem
**Live integrations (functional today):**
- Google Workspace: Gmail (read/search/draft), Calendar (read/create), Analytics (GA4 reports)
- Microsoft 365: Outlook (read/search/draft), Calendar (read/create)
- Meta: Campaign performance reports (Marketing API v19.0)
- GitHub: Commits, PRs, issues auto-synced every 30 minutes
- Telegram: Conversational interface + approval flows + alerts
- Brave Search: Real-time web research

All connectors use OAuth2 with encrypted credential storage. Per-brand credential isolation.

## SLIDE 7: Agent Platform
**10 role-based autonomous agents, each with:**
- Locked tool scope (CTO can deploy, CMO can post content, CFO can only observe)
- Individual dollar-cap budgets ($0.50-$2.00 per task)
- Scheduled/cron/event-triggered execution
- Trust-gated permissions (auto -> confirm -> review) based on track record

**Example workflows running today:**
- Auto-sync GitHub activity every 30 minutes
- Weekly research on ecommerce trends
- Cohort intelligence analysis every 6 hours
- Content calendar generation on demand
- Brand competitor analysis (full crawl + LLM analysis pipeline)

## SLIDE 8: Document Generation
OpenBrain generates production-ready artifacts:
- **PPTX** presentations (PptxGenJS)
- **PDF** reports (PDFKit)
- **DOCX** documents (docx library)
- **XLSX** spreadsheets (ExcelJS)
- **Charts** (QuickChart.io API)

All uploaded to private cloud storage (Cloudflare R2). Accessible via vault.

## SLIDE 9: Trust & Governance
**Built for regulated industries:**
- Trust ledger: every tool execution logged with outcome (success/failure/regression)
- Progressive autonomy: agents earn trust through consistent performance
- Human-on-the-loop (HOTL): critical actions require human approval via Telegram
- Client-facing actions NEVER auto-execute -- always human review
- Immutable audit trail (`action_log` table)
- GDPR-compliant: data export and deletion endpoints per brand
- Per-brand budget enforcement with auto-pause

## SLIDE 10: The NBFC/Banking Opportunity
**Why this matters for financial services:**

| Concern | OpenBrain's Answer |
|---------|-------------------|
| Data residency | Self-hosted on your VPS/private cloud. Zero external API calls for data storage. |
| Compliance audit | Immutable action_log, trust_ledger, cost_events. Every AI decision is traceable. |
| Cost control | Per-agent dollar caps, budget enforcement, auto-pause. No runaway AI spend. |
| Customer data | Per-user, per-brand isolation. GDPR export/delete built in. |
| Model flexibility | Swap Claude/Gemini/local models via model router. No vendor lock-in on the LLM layer. |
| Regulatory reporting | Auto-generated reports (PDF/XLSX) from connected data sources on schedule. |

## SLIDE 11: VPS Deployment -- Cost Comparison
**Cloud AI services vs. Self-hosted OpenBrain:**

| | Cloud AI (per seat/month) | OpenBrain VPS |
|---|---|---|
| Infrastructure | $20-50/seat (ChatGPT/Claude Teams) | $30-80/month flat (VPS) |
| 50 users | $1,000-2,500/month | $80/month + LLM API costs |
| 200 users | $4,000-10,000/month | $150/month + LLM API costs |
| Data leaves network | Yes | No |
| Custom memory | No | Yes |
| Custom integrations | Limited | Unlimited |
| Compliance audit trail | No | Full |

**LLM API costs with OpenBrain's optimizations:**
- Prompt caching (90% input cost reduction on repeat calls)
- Dynamic model routing (Haiku for simple, Sonnet for complex)
- Context compression (keeps long conversations affordable)
- Estimated: $0.10-0.25 per conversation vs $0.50-1.00 without optimization

## SLIDE 12: What's Running Today
**Production deployments:**
- **Lucy** (ruhi.ikawn.in) -- Internal R&D instance, full feature set
- **Ruhi Brain** (os.ikawn.com/ruhi) -- SaaS product powering iKawn OS

**By the numbers:**
- 30+ database tables
- 28 tools in the registry
- 10 autonomous agents
- 9 external connectors
- 12 background workers
- 8 MCP tools for Claude Desktop integration
- Multi-tenant architecture with brand isolation
- React frontend (feature-flagged, in development)

## SLIDE 13: Deployment Options
| Option | Best for | Setup time |
|--------|----------|-----------|
| **Managed SaaS** (os.ikawn.com) | Quick start, small teams | Minutes |
| **Dedicated VPS** | Mid-market, data-sensitive | Hours |
| **Private cloud** (AWS/Azure/GCP) | Enterprise, regulatory | Days |
| **Air-gapped** | Defense, critical infrastructure | Weeks |

All options use the same codebase. No feature degradation in self-hosted.

## SLIDE 14: Roadmap
- Local model support (Llama, Mistral) for fully offline operation
- Advanced RAG with document chunking and multi-document synthesis
- Real-time collaboration (multiple users in same conversation)
- Shopify/WooCommerce connectors for ecommerce clients
- Mobile app (Expo React Native -- in development)

## SLIDE 15: Call to Action
**OpenBrain is ready for pilot deployment.**
- 2-week proof of concept on your infrastructure
- Connect your Gmail, Calendar, and one data source
- See institutional knowledge accumulate in real-time
- Full audit trail from day one

Contact: vineet@ikawn.com | ikawn.com

---

## DESIGN NOTES FOR CLAUDE
- Dark theme (background #0A0F2E, accent gold #FFC01C)
- Fonts: Parkinsans for headers, Inter/Google Sans for body
- Minimal text per slide -- use diagrams, tables, and numbers
- Reference style: Palantir.com investor decks
- No emojis anywhere
- Highlight the self-hosted/data privacy angle heavily -- this is the key differentiator for NBFC/banking
