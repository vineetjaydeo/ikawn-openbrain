You are building a standalone project called "iKawn OpenBrain" — a personal AI memory system with a vector database and MCP server. 

CRITICAL RULES — READ FIRST:
- Create everything in /Users/vineet/ikawn-openbrain/ — a completely NEW directory
- Do NOT touch, read, modify, or reference the codebase at any other path
- Do NOT touch any existing Fly.io apps, especially anything related to os.ikawn.com
- You MAY read /Users/vineet/ikawn-v3/.env to extract API keys (OPENAI_API_KEY or equivalent) — read only, do not modify
- You MAY use the Fly CLI (fly) already authenticated on this machine to create NEW resources only
- All Fly resources must be named with prefix "ikawn-openbrain" to avoid any collision

---

WHAT YOU ARE BUILDING:

A self-hosted OpenBrain system with:
1. Fly Postgres database with pgvector extension
2. A Node.js backend (Express) that handles:
   - POST /capture — accepts a thought/note, generates an embedding, stores in Postgres
   - GET /search?q= — semantic search over stored memories
   - GET /recent?limit= — fetch recent entries
   - GET /stats — count, topics, activity summary
3. An MCP server (stdio transport) that exposes 4 tools:
   - capture_thought(content: string) 
   - search_memory(query: string, limit?: number)
   - list_recent(limit?: number)
   - get_stats()
4. A lightweight health endpoint GET /health

---

TECH STACK:

- Runtime: Node.js 20
- Framework: Express
- Database: Fly Postgres (provisioned fresh via fly postgres create)
- Vector extension: pgvector (enable via SQL: CREATE EXTENSION IF NOT EXISTS vector)
- Embeddings: OpenAI text-embedding-3-small (read OPENAI_API_KEY from ikawn-v3/.env)
- MCP SDK: @modelcontextprotocol/sdk
- DB client: pg (node-postgres)
- Deployment: Fly.io, single shared-cpu-1x machine, 512MB RAM

---

PROJECT STRUCTURE:

/Users/vineet/ikawn-openbrain/
├── src/
│   ├── index.js          # Express app entry point
│   ├── db.js             # Postgres connection + schema init
│   ├── embeddings.js     # OpenAI embedding helper
│   ├── routes/
│   │   ├── capture.js
│   │   ├── search.js
│   │   ├── recent.js
│   │   └── stats.js
│   └── mcp/
│       └── server.js     # MCP stdio server
├── scripts/
│   └── init-db.js        # Run once to create tables and enable pgvector
├── fly.toml              # Fly config for ikawn-openbrain app
├── Dockerfile
├── package.json
├── .env.example
└── README.md

---

DATABASE SCHEMA:

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  source TEXT DEFAULT 'manual',
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memories_embedding_idx 
ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

---

KEY IMPLEMENTATION NOTES:

1. db.js should auto-run schema init on startup (CREATE EXTENSION + CREATE TABLE IF NOT EXISTS)
2. Embedding function: use OpenAI text-embedding-3-small, returns 1536-dim vector
3. Search uses cosine similarity: ORDER BY embedding <=> $1 LIMIT $2
4. MCP server runs as a separate process via `node src/mcp/server.js` — it connects to the same Postgres via DATABASE_URL env var
5. The Express server and MCP server share the same db.js module
6. Add a npm script: "start:mcp" for the MCP server process

---

FLY DEPLOYMENT STEPS (execute in order):

Step 1: Create the Fly app
fly apps create ikawn-openbrain

Step 2: Create a Fly Postgres cluster (separate, new cluster — do NOT attach to any existing cluster)
fly postgres create --name ikawn-openbrain-db --region sin --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3

Step 3: Attach Postgres to the app (this sets DATABASE_URL secret automatically)
fly postgres attach ikawn-openbrain-db --app ikawn-openbrain

Step 4: Set secrets (read OPENAI_API_KEY from /Users/vineet/ikawn-v3/.env)
fly secrets set OPENAI_API_KEY=<value> --app ikawn-openbrain
fly secrets set NODE_ENV=production --app ikawn-openbrain

Step 5: Deploy
fly deploy --app ikawn-openbrain

Step 6: After deploy, run DB init
fly ssh console --app ikawn-openbrain -C "node scripts/init-db.js"

---

DOCKERFILE:

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY scripts/ ./scripts/
EXPOSE 3000
CMD ["node", "src/index.js"]

---

FLY.TOML:

app = "ikawn-openbrain"
primary_region = "sin"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

---

.env.example (for local dev):

DATABASE_URL=postgresql://localhost:5432/openbrain
OPENAI_API_KEY=your_key_here
PORT=3000

---

README.md should include:
- What this is
- How to add to Claude Desktop as MCP server (with exact config JSON)
- How to POST a capture via curl
- How to run locally

---

AFTER DEPLOY, output:
1. The Fly app URL (https://ikawn-openbrain.fly.dev)
2. The exact JSON config block to add to Claude Desktop's MCP settings
3. A test curl command to verify capture works
4. Confirmation that os.ikawn.com and ikawn-v3 were not touched

Begin now. Work methodically through each file, then deploy.