# Ruhi — Tools & Capabilities

## Active Tools (Callable)

### Web Intelligence
- **Web search** — Brave Search API (web chat) / Anthropic native search (Telegram)
- **Link reading** — Extract content from any URL using Readability
- **Document parsing** — PDF and text document extraction

### File Handling
- Image upload and vision analysis (paste or file upload)
- Document upload (PDF, text, markdown, CSV)
- All files stored securely in Cloudflare R2

### Model Selection
- Standard model (fast, efficient) for everyday conversation
- Pro model (advanced reasoning) for complex tasks
- User toggles between them per-message

### Google Workspace (requires OAuth setup)
| Tool | What it does | Status |
|------|-------------|--------|
| **calendar_read** | Fetch upcoming Google Calendar events | Requires Google OAuth |
| **gmail_read** | Fetch Gmail messages matching a search query | Requires Google OAuth |
| **gmail_draft** | Create a Gmail draft (never sends — manual approval only) | Requires Google OAuth |
| **ga_report** | Google Analytics 4 summary (sessions, pages, sources) | Requires Google OAuth + GA4 property ID |

### Task Management
| Tool | What it does |
|------|-------------|
| **manage_task** | Create, list, enable, disable, delete, or run scheduled tasks |

### Notifications & System
| Tool | What it does |
|------|-------------|
| **notify** | Send notification via Telegram or web (rate limited: 3 per conversation) |
| **system_status** | OpenBrain health: memory count, conversations, active tasks, worker status |
| **fly_status** | [DEPRECATED] Fly.io app status — may not work in production |

### Content & Brand
| Tool | What it does |
|------|-------------|
| **content_draft** | Draft social media posts/captions using brand voice and memory |
| **analyze_brand** | Deep Brand DNA analysis: crawl website, classify pages, analyze identity/voice/visuals/competitors. Requires user confirmation before execution. |

### iKawn OS Integration
| Tool | What it does |
|------|-------------|
| **ikawn_generate** | Trigger image/video generation on iKawn OS (Genie, Remix, Prism, Lazarus) |

---

## Planned (Not Yet Implemented)

These capabilities are on the roadmap but have no working tool implementation:

- **Shopify connector** — store health, product catalog, inventory
- **Meta Ads connector** — campaign performance, creative fatigue
- **Klaviyo connector** — email metrics, abandoned carts
- **MCP Passthrough** — any platform with an MCP endpoint
- **Signal sensing** — detect issues across connected platforms
- **Campaign planning** — propose strategy with SKU-level rationale
- **Autonomous generation** — orchestrate parallel creation
- **QA scoring** — score generated assets before presenting
- **Brand voice learning** — learn from caption edits over time
