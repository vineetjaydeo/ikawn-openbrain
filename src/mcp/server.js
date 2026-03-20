const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { pool, initSchema } = require('../db');
const { getEmbedding } = require('../embeddings');
const { suggestHashtags } = require('../utils/hashtags');

// MCP brand context — configurable via env, defaults to 'ikawn'
const MCP_BRAND_ID = process.env.MCP_BRAND_ID || 'ikawn';

const server = new McpServer({
  name: 'ikawn-openbrain',
  version: '2.0.0',
});

// 1. capture_thought
server.tool(
  'capture_thought',
  {
    content: z.string(),
    type: z.string().optional(),
    project: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    access_level: z.string().optional(),
  },
  async ({ content, type, project, hashtags, access_level }) => {
    // Extract hashtags from content
    const extracted = (content.match(/#[a-zA-Z0-9_]+/g) || []).map(t => t.toLowerCase());
    let allHashtags = [...new Set([...(hashtags || []), ...extracted])];
    if (allHashtags.length === 0) {
      const suggested = await suggestHashtags(content);
      allHashtags = suggested;
    }

    const result = await pool.query(
      `INSERT INTO memories (content, source, memory_type, project, hashtags, access_level, author, brand_id, embedding_status)
       VALUES ($1, 'mcp', $2, $3, $4, $5, 'vineet', $6, 'pending') RETURNING id, content, memory_type, project, hashtags, created_at`,
      [content, type || 'note', project || null, allHashtags.length > 0 ? allHashtags : null, access_level || 'private', MCP_BRAND_ID]
    );

    return { content: [{ type: 'text', text: JSON.stringify(result.rows[0]) }] };
  }
);

// 2. search_memory
server.tool(
  'search_memory',
  {
    query: z.string(),
    type: z.string().optional(),
    project: z.string().optional(),
    hashtag: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ query, type, project, hashtag, from, to, limit }) => {
    const embedding = await getEmbedding(query);
    const searchLimit = Math.min(limit || 10, 50);

    let sql = `SELECT id, content, source, memory_type, project, hashtags, author, access_level, created_at, cosine_similarity(embedding, $1) AS similarity
       FROM memories WHERE embedding IS NOT NULL AND (archived IS NULL OR archived = false) AND brand_id = $2`;
    const params = [embedding, MCP_BRAND_ID];
    let idx = 3;

    if (type) { sql += ` AND memory_type = $${idx++}`; params.push(type); }
    if (project) { sql += ` AND project = $${idx++}`; params.push(project); }
    if (hashtag) { sql += ` AND $${idx++} = ANY(hashtags)`; params.push(hashtag); }
    if (from) { sql += ` AND created_at >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND created_at <= $${idx++}`; params.push(to); }

    sql += ` ORDER BY cosine_similarity(embedding, $1) DESC LIMIT $${idx++}`;
    params.push(searchLimit);

    const result = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows) }] };
  }
);

// 3. list_recent
server.tool(
  'list_recent',
  {
    limit: z.number().optional(),
    type: z.string().optional(),
    project: z.string().optional(),
  },
  async ({ limit, type, project }) => {
    const recentLimit = Math.min(limit || 20, 100);
    let sql = 'SELECT id, content, source, memory_type, project, hashtags, author, created_at FROM memories WHERE (archived IS NULL OR archived = false) AND brand_id = $1';
    const params = [MCP_BRAND_ID];
    let idx = 2;

    if (type) { sql += ` AND memory_type = $${idx++}`; params.push(type); }
    if (project) { sql += ` AND project = $${idx++}`; params.push(project); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++}`;
    params.push(recentLimit);

    const result = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows) }] };
  }
);

// 4. get_decisions
server.tool(
  'get_decisions',
  {
    project: z.string().optional(),
    signed_off_by: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  },
  async ({ project, signed_off_by, from, to }) => {
    let sql = 'SELECT * FROM ob_decisions WHERE brand_id = $1';
    const params = [MCP_BRAND_ID];
    let idx = 2;

    if (project) { sql += ` AND project = $${idx++}`; params.push(project); }
    if (signed_off_by) { sql += ` AND signed_off_by = $${idx++}`; params.push(signed_off_by); }
    if (from) { sql += ` AND decided_at >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND decided_at <= $${idx++}`; params.push(to); }

    sql += ' ORDER BY decided_at DESC LIMIT 50';

    const result = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(result.rows) }] };
  }
);

// 5. log_decision
server.tool(
  'log_decision',
  {
    decision: z.string(),
    context: z.string().optional(),
    project: z.string().optional(),
    signed_off_by: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
  },
  async ({ decision, context, project, signed_off_by, hashtags }) => {
    const memoryResult = await pool.query(
      `INSERT INTO memories (content, source, memory_type, project, author, signed_off_by, access_level, hashtags, brand_id, embedding_status)
       VALUES ($1, 'decision', 'decision', $2, $3, $4, 'management', $5, $6, 'pending') RETURNING id`,
      [context ? `${decision}\n\nContext: ${context}` : decision, project || null, signed_off_by || 'vineet', signed_off_by || null, hashtags || null, MCP_BRAND_ID]
    );

    const result = await pool.query(
      `INSERT INTO ob_decisions (decision, context, decided_by, signed_off_by, project, hashtags, memory_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [decision, context || null, signed_off_by || 'vineet', signed_off_by || null, project || null, hashtags || null, memoryResult.rows[0].id]
    );

    return { content: [{ type: 'text', text: JSON.stringify(result.rows[0]) }] };
  }
);

// 6. get_stats
server.tool('get_stats', {}, async () => {
  const brandFilter = [MCP_BRAND_ID];
  const [countResult, sourcesResult, typesResult, projectsResult, hashtagResult, ingestionResult, weekResult] = await Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM memories WHERE (archived IS NULL OR archived = false) AND brand_id = $1', brandFilter),
    pool.query('SELECT source, COUNT(*) AS count FROM memories WHERE (archived IS NULL OR archived = false) AND brand_id = $1 GROUP BY source ORDER BY count DESC', brandFilter),
    pool.query('SELECT memory_type, COUNT(*) AS count FROM memories WHERE (archived IS NULL OR archived = false) AND brand_id = $1 GROUP BY memory_type ORDER BY count DESC', brandFilter),
    pool.query('SELECT project, COUNT(*) AS count FROM memories WHERE project IS NOT NULL AND (archived IS NULL OR archived = false) AND brand_id = $1 GROUP BY project ORDER BY count DESC', brandFilter),
    pool.query('SELECT unnest(hashtags) AS tag, COUNT(*) AS count FROM memories WHERE hashtags IS NOT NULL AND (archived IS NULL OR archived = false) AND brand_id = $1 GROUP BY tag ORDER BY count DESC LIMIT 30', brandFilter),
    pool.query('SELECT source, MAX(ran_at) AS last_run FROM ob_ingestion_log GROUP BY source'),
    pool.query(`SELECT COUNT(*) AS count FROM memories WHERE created_at > NOW() - INTERVAL '7 days' AND (archived IS NULL OR archived = false) AND brand_id = $1`, brandFilter),
  ]);

  const stats = {
    total: parseInt(countResult.rows[0].total),
    by_source: sourcesResult.rows,
    by_type: typesResult.rows,
    by_project: projectsResult.rows,
    active_hashtags: hashtagResult.rows,
    last_ingestion: ingestionResult.rows,
    added_this_week: parseInt(weekResult.rows[0].count),
  };

  return { content: [{ type: 'text', text: JSON.stringify(stats) }] };
});

// 7. trigger_sync
server.tool(
  'trigger_sync',
  { source: z.enum(['github', 'calendar', 'all']) },
  async ({ source }) => {
    const { triggerSync } = require('../scheduler');
    const result = await triggerSync(source);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// 8. ask_ruhi
server.tool(
  'ask_ruhi',
  { message: z.string() },
  async ({ message }) => {
    const { chatCompletion } = require('../utils/llm');
    const { buildSystemPrompt } = require('../ruhi/persona');

    const embedding = await getEmbedding(message);
    const memoryResults = await pool.query(
      `SELECT content, memory_type, created_at, cosine_similarity(embedding, $1) AS similarity
       FROM memories WHERE embedding IS NOT NULL AND (archived IS NULL OR archived = false) AND brand_id = $2
       ORDER BY cosine_similarity(embedding, $1) DESC LIMIT 10`,
      [embedding, MCP_BRAND_ID]
    );

    let memoryContext = '';
    if (memoryResults.rows.length > 0) {
      memoryContext = memoryResults.rows.map((m, i) => {
        const date = new Date(m.created_at).toLocaleDateString();
        return `[${i + 1}] (${m.memory_type}, ${date}) ${m.content.slice(0, 500)}`;
      }).join('\n\n');
    }

    const systemPrompt = await buildSystemPrompt('Vineet', 'owner', memoryContext, null, MCP_BRAND_ID);

    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      { model: 'gpt-4o' }
    );

    const ruhiResponse = response.content || '';
    return { content: [{ type: 'text', text: ruhiResponse }] };
  }
);

async function main() {
  await initSchema();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenBrain MCP server v2 running on stdio');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
