# iKawn OpenBrain

iKawn's own ChatGPT — personal AI memory system with vector search, MCP server, and user management.

## Project Structure

```
ikawn-openbrain/
  src/
    index.js          # Express app entry (port 3000), session + auth wiring
    db.js             # Postgres pool + schema init (memories + users tables)
    auth.js           # requireAuth + requireAdmin middleware
    embeddings.js     # OpenAI text-embedding-3-small (1536-dim)
    routes/
      auth-routes.js  # POST /auth/login, /auth/logout, GET /auth/me
      admin-api.js    # GET/POST/PUT /admin/api/users (admin only)
      pages.js        # GET /login (HTML), GET /admin (HTML)
      capture.js      # POST /capture - store thought with embedding
      search.js       # GET /search?q=&limit= - semantic search
      recent.js       # GET /recent?limit= - chronological
      stats.js        # GET /stats - counts, sources, activity
    mcp/
      server.js       # MCP stdio server (4 tools, no auth needed)
  scripts/
    init-db.js        # Standalone schema initializer
```

## Tech Stack

- Node.js 20, Express, cookie-session, pg (node-postgres)
- OpenAI text-embedding-3-small for embeddings
- MCP SDK (@modelcontextprotocol/sdk) for Claude Desktop integration
- Fly.io deployment (single machine + managed Postgres)

## Auth System

- **Login**: email + @ikawn.com pattern check (no password yet — TODO)
- **Admin**: v@ikawn.com seeded as admin on schema init
- **Sessions**: cookie-session, 30-day expiry, SESSION_SECRET env var
- **Protected routes**: all API routes require auth except /health and /login
- **Admin panel**: /admin — list, add, edit, suspend users (admin only)
- **Auto-create**: new @ikawn.com users created on first login

## Key Architecture Decisions

- **No pgvector**: Fly's managed Postgres doesn't include pgvector. Embeddings stored as `float8[]` with a custom `cosine_similarity()` PL/pgSQL function. Fine for <10K entries.
- **Schema auto-init**: `db.js` runs CREATE TABLE + CREATE FUNCTION on startup. No separate migration step needed.
- **SSL handling**: `db.js` auto-detects `sslmode=disable` in DATABASE_URL to skip SSL.
- **Single Fly machine**: destroyed the flaky second machine. min_machines_running=0 with auto-stop/start.
- **MCP server**: Runs as separate process (`node src/mcp/server.js`), shares same `db.js` module, no auth.

## Fly.io Resources

- **App**: `ikawn-openbrain` (sin region, shared-cpu-1x, 512MB, auto-stop, 1 machine)
- **Postgres**: `ikawn-openbrain-db` (sin region, shared-cpu-1x, 3GB volume)
- **URL**: https://ikawn-openbrain.fly.dev
- **Deploy**: `~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only`
- **Logs**: `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail`
- **DB connect**: `~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain`

## Secrets (on Fly)

- `DATABASE_URL` - set via `fly postgres attach`
- `OPENAI_API_KEY` - service account key (sk-svcacct-...)
- `SESSION_SECRET` - random 32-byte hex
- `NODE_ENV=production`

## Database Schema

```sql
CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding float8[],
  source TEXT DEFAULT 'manual',
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[]) RETURNS float8 ...
```

## Git

- **Repo**: https://github.com/vineonardo/ikawn-openbrain.git
- **Branch**: main

## TODO (next session)

- Add password_hash column to users, install bcrypt
- Login with email + password
- v@ikawn.com default password (user to choose)
- Admin can set/reset user passwords
- Users can change own password from /settings
- Vision: iKawn's own ChatGPT — will need chat interface eventually

## Important Notes

- STANDALONE project. Do NOT touch ikawn-v3, os.ikawn.com, or any other Fly apps.
- All Fly resources prefixed with `ikawn-openbrain`.
- Fly CLI at `~/.fly/bin/flyctl` (not in PATH).
- `postgres/` directory is unused — can be cleaned up.
