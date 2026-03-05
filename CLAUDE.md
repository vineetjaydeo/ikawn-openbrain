# iKawn OpenBrain

Personal AI memory system with vector search and MCP server.

## Project Structure

```
ikawn-openbrain/
  src/
    index.js          # Express app entry (port 3000)
    db.js             # Postgres pool + schema init (float8[] + cosine_similarity function)
    embeddings.js     # OpenAI text-embedding-3-small (1536-dim)
    routes/
      capture.js      # POST /capture - store thought with embedding
      search.js       # GET /search?q=&limit= - semantic search
      recent.js       # GET /recent?limit= - chronological
      stats.js        # GET /stats - counts, sources, activity
    mcp/
      server.js       # MCP stdio server (4 tools: capture_thought, search_memory, list_recent, get_stats)
  scripts/
    init-db.js        # Standalone schema initializer
  postgres/           # (unused) Custom Postgres Dockerfile attempt
```

## Tech Stack

- Node.js 20, Express, pg (node-postgres)
- OpenAI text-embedding-3-small for embeddings
- MCP SDK (@modelcontextprotocol/sdk) for Claude Desktop integration
- Fly.io deployment (app + managed Postgres)

## Key Architecture Decisions

- **No pgvector**: Fly's managed Postgres doesn't include pgvector. Embeddings stored as `float8[]` with a custom `cosine_similarity()` PL/pgSQL function. Fine for <10K entries.
- **Schema auto-init**: `db.js` runs CREATE TABLE + CREATE FUNCTION on startup. No separate migration step needed.
- **SSL handling**: `db.js` auto-detects `sslmode=disable` in DATABASE_URL to skip SSL (Fly internal network doesn't need it).
- **MCP server**: Runs as separate process (`node src/mcp/server.js`), shares same `db.js` module.

## Fly.io Resources

- **App**: `ikawn-openbrain` (sin region, shared-cpu-1x, 512MB, auto-stop)
- **Postgres**: `ikawn-openbrain-db` (sin region, shared-cpu-1x, 3GB volume)
- **URL**: https://ikawn-openbrain.fly.dev
- **Deploy**: `~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only`
- **Logs**: `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail`
- **DB connect**: `~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain`

## Secrets (on Fly)

- `DATABASE_URL` - set automatically via `fly postgres attach`
- `OPENAI_API_KEY` - from OpenAI platform (NOTE: key from ikawn-v3/.env was invalid as of 2026-03-05)
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

-- Custom cosine similarity function (replaces pgvector's <=> operator)
CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[]) RETURNS float8 ...
```

## Git

- **Repo**: https://github.com/vineonardo/ikawn-openbrain.git
- **Branch**: main

## Important Notes

- This is a STANDALONE project. Do NOT touch ikawn-v3, os.ikawn.com, or any other Fly apps.
- All Fly resources prefixed with `ikawn-openbrain` to avoid collision.
- Fly CLI is at `~/.fly/bin/flyctl` (not in PATH).
- The `postgres/` directory contains an unused custom Postgres Dockerfile — can be cleaned up.
