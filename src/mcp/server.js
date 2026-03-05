const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { pool, initSchema } = require('../db');
const { getEmbedding } = require('../embeddings');

const server = new McpServer({
  name: 'ikawn-openbrain',
  version: '1.0.0',
});

server.tool('capture_thought', { content: z.string() }, async ({ content }) => {
  const embedding = await getEmbedding(content);

  const result = await pool.query(
    `INSERT INTO memories (content, embedding, source, tags) VALUES ($1, $2, 'mcp', NULL) RETURNING id, content, created_at`,
    [content, embedding]
  );

  return { content: [{ type: 'text', text: JSON.stringify(result.rows[0]) }] };
});

server.tool(
  'search_memory',
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    const embedding = await getEmbedding(query);
    const searchLimit = Math.min(limit || 10, 50);

    const result = await pool.query(
      `SELECT id, content, source, tags, created_at, cosine_similarity(embedding, $1) AS similarity
       FROM memories
       WHERE embedding IS NOT NULL
       ORDER BY cosine_similarity(embedding, $1) DESC
       LIMIT $2`,
      [embedding, searchLimit]
    );

    return { content: [{ type: 'text', text: JSON.stringify(result.rows) }] };
  }
);

server.tool('list_recent', { limit: z.number().optional() }, async ({ limit }) => {
  const recentLimit = Math.min(limit || 20, 100);

  const result = await pool.query(
    `SELECT id, content, source, tags, created_at FROM memories ORDER BY created_at DESC LIMIT $1`,
    [recentLimit]
  );

  return { content: [{ type: 'text', text: JSON.stringify(result.rows) }] };
});

server.tool('get_stats', {}, async () => {
  const countResult = await pool.query('SELECT COUNT(*) AS total FROM memories');
  const sourcesResult = await pool.query(
    'SELECT source, COUNT(*) AS count FROM memories GROUP BY source ORDER BY count DESC'
  );

  const stats = {
    total: parseInt(countResult.rows[0].total),
    by_source: sourcesResult.rows,
  };

  return { content: [{ type: 'text', text: JSON.stringify(stats) }] };
});

async function main() {
  await initSchema();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenBrain MCP server running on stdio');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
