# iKawn OpenBrain

Personal AI memory system with vector search and MCP server.

## What is this?

A self-hosted memory layer that stores thoughts/notes with OpenAI embeddings in Postgres (pgvector), enabling semantic search over your personal knowledge base. Includes an MCP server for direct integration with Claude Desktop.

## Local Development

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY
npm install
npm run init-db
npm start
```

## API Usage

**Capture a thought:**
```bash
curl -X POST https://ikawn-openbrain.fly.dev/capture \
  -H "Content-Type: application/json" \
  -d '{"content": "The best way to learn is by building things"}'
```

**Search memories:**
```bash
curl "https://ikawn-openbrain.fly.dev/search?q=learning&limit=5"
```

**Recent entries:**
```bash
curl "https://ikawn-openbrain.fly.dev/recent?limit=10"
```

**Stats:**
```bash
curl "https://ikawn-openbrain.fly.dev/stats"
```

## Claude Desktop MCP Integration

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openbrain": {
      "command": "node",
      "args": ["/Users/vineet/ikawn-openbrain/src/mcp/server.js"],
      "env": {
        "DATABASE_URL": "your_database_url_here",
        "OPENAI_API_KEY": "your_openai_api_key_here"
      }
    }
  }
}
```

This gives Claude Desktop 4 tools:
- `capture_thought` - Save a thought/note to your memory
- `search_memory` - Semantic search over all stored memories
- `list_recent` - Fetch recent entries
- `get_stats` - Memory count and activity summary

## Deployment

Hosted on Fly.io at https://ikawn-openbrain.fly.dev
