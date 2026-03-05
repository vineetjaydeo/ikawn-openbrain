# iKawn OpenBrain

iKawn's own ChatGPT — AI chat interface with memory system, vector search, MCP server, and user management.

## Project Structure

```
ikawn-openbrain/
  src/
    index.js          # Express app entry (port 3000), session + auth + route wiring
    db.js             # Postgres pool + schema init (memories, users, conversations, messages, settings)
    auth.js           # requireAuth + requireAdmin middleware
    embeddings.js     # OpenAI text-embedding-3-small (1536-dim)
    utils/
      llm.js          # OpenAI chat completions (streaming + non-streaming), model defaults
      storage.js      # R2 upload, presigned URLs, download (all keys prefixed openbrain/)
      web-search.js   # Brave Search API integration
      link-reader.js  # URL content extraction via Readability
      doc-parser.js   # PDF/text document text extraction
    routes/
      auth-routes.js  # POST /auth/login, /auth/logout, /auth/change-password, GET /auth/me
      admin-api.js    # GET/POST/PUT /admin/api/users, PUT /admin/api/users/:id/password
      pages.js        # GET /login, /admin, /settings (HTML pages)
      chat-page.js    # GET / — main chat UI (HTML SPA)
      chat-api.js     # Chat API: conversations CRUD, POST /api/chat/send (SSE streaming), settings
      upload.js       # POST /api/upload/presign, /api/upload/direct
      capture.js      # POST /capture — store thought with embedding
      search.js       # GET /search?q=&limit= — semantic search
      recent.js       # GET /recent?limit= — chronological
      stats.js        # GET /stats — counts, sources, activity
    mcp/
      server.js       # MCP stdio server (4 memory tools, no auth needed)
  scripts/
    init-db.js        # Standalone schema initializer
  docs/plans/         # Design documents
```

## Tech Stack

- Node.js 20, Express, cookie-session, pg (node-postgres)
- OpenAI SDK — GPT-4o/GPT-4o-mini for chat, text-embedding-3-small for embeddings
- Cloudflare R2 (shared bucket with ikawn-v3, `openbrain/` prefix)
- Brave Search API for web search
- @mozilla/readability + jsdom for link content extraction
- pdf-parse for document text extraction
- MCP SDK (@modelcontextprotocol/sdk) for Claude Desktop integration
- Resend for email notifications
- Fly.io deployment (single machine + managed Postgres)

## Auth System

- **Login**: email@ikawn.com + password (bcryptjs)
- **Admin**: v@ikawn.com seeded as admin, default password `openbrain2024`
- **Sessions**: cookie-session, 30-day expiry, SESSION_SECRET env var
- **Protected routes**: all API routes require auth except /health and /login
- **Admin panel**: /admin — list, add, edit, suspend users, reset passwords
- **Settings**: /settings — users change own password

## Chat System

- **UI**: ChatGPT-like SPA at `/` — dark theme, conversation sidebar, streaming messages
- **Streaming**: SSE via POST /api/chat/send — chunks, done, title, error events
- **Models**: Admin configures primary (fast/cheap) + secondary (powerful) model in settings table
- **Attachments**: Images (paste/upload, GPT-4o vision), documents (PDF text extraction), links (readability)
- **Web search**: Brave Search via OpenAI function calling — model decides when to search
- **Auto-titles**: First message auto-generates conversation title via LLM
- **R2 storage**: All uploads go to `openbrain/uploads/{userId}/{timestamp}_{filename}`

## Database Schema

```sql
-- Existing
CREATE TABLE memories (id SERIAL PK, content TEXT, embedding float8[], source TEXT, tags TEXT[], created_at);
CREATE TABLE users (id SERIAL PK, email TEXT UNIQUE, name TEXT, password_hash TEXT, role TEXT, status TEXT, created_at, last_login);

-- Chat
CREATE TABLE conversations (id SERIAL PK, user_id INT REFERENCES users, title TEXT, created_at, updated_at);
CREATE TABLE messages (id SERIAL PK, conversation_id INT REFERENCES conversations ON DELETE CASCADE, role TEXT, content TEXT, attachments JSONB, model TEXT, created_at);
CREATE TABLE settings (key TEXT PK, value JSONB, updated_at);

CREATE FUNCTION cosine_similarity(a float8[], b float8[]) RETURNS float8 ...
```

## Key Architecture Decisions

- **No pgvector**: Fly Postgres doesn't include pgvector. Custom cosine_similarity PL/pgSQL function. Fine for <10K entries.
- **Schema auto-init**: db.js runs all CREATE TABLE + functions on startup. No separate migration step.
- **Shared R2 bucket**: Same bucket as ikawn-v3 (ikawn-v1), all keys prefixed `openbrain/` for isolation.
- **Model config in DB**: settings table stores primary_model and secondary_model. Admin can change via /api/settings.
- **SSE streaming**: Chat uses POST + SSE (not WebSockets) — simpler, works through proxies.

## Fly.io Resources

- **App**: `ikawn-openbrain` (sin region, shared-cpu-1x, 512MB, auto-stop, 1 machine)
- **Postgres**: `ikawn-openbrain-db` (sin region, shared-cpu-1x, 3GB volume)
- **URL**: https://ikawn-openbrain.fly.dev
- **Deploy**: `~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only`
- **Logs**: `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail`
- **DB connect**: `~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain`

## Secrets (on Fly)

- `DATABASE_URL` — Fly postgres attach
- `OPENAI_API_KEY` — service account key
- `SESSION_SECRET` — random 32-byte hex
- `NODE_ENV=production`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — Cloudflare R2
- `RESEND_API_KEY` — email notifications
- `BRAVE_SEARCH_API_KEY` — web search (optional, degrades gracefully)
- `ANTHROPIC_API_KEY` — for Claude as secondary model (TODO)

## Session Cookie Fix
- Fly terminates TLS at proxy → Express sees HTTP → `secure: true` prevented cookie from being set
- Fix: `app.set('trust proxy', 1)` + `secureProxy: true` (instead of `secure: true`)

## MCP Server

- Runs as separate process: `node src/mcp/server.js`
- 4 tools: capture_thought, search_memory, list_recent, get_stats
- TODO: Add chat tools (send message, list/get conversations)

## Git

- **Repo**: https://github.com/vineonardo/ikawn-openbrain.git
- **Branch**: main

## Done

- [x] Password auth (bcryptjs) — login, change password, admin reset
- [x] Chat interface — streaming, conversations, markdown rendering
- [x] R2 file uploads (images + documents) with `openbrain/` prefix
- [x] Web search via Brave Search API + function calling
- [x] Link content extraction (Readability)
- [x] PDF/document text extraction
- [x] Admin model configuration (primary + secondary)
- [x] Auto-generated conversation titles

## TODO

- Add ANTHROPIC_API_KEY and Claude model support as secondary option
- Set R2 + Brave Search + Resend secrets on Fly
- Extend MCP server with chat tools
- Chat interface polish: edit/regenerate messages, export conversations
- Mobile responsiveness testing
- Rate limiting on chat endpoint

## Important Notes

- STANDALONE project. Do NOT touch ikawn-v3, os.ikawn.com, or any other Fly apps.
- All Fly resources prefixed with `ikawn-openbrain`.
- R2 bucket is SHARED with ikawn-v3 — all keys must use `openbrain/` prefix.
- Fly CLI at `~/.fly/bin/flyctl` (not in PATH).
- `postgres/` directory is unused — can be cleaned up.
