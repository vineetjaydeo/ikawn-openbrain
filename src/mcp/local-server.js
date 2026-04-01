/**
 * Local MCP server that proxies to the OpenBrain HTTP API.
 * No direct DB connection needed — works from anywhere.
 *
 * Usage in Claude Code config:
 *   "command": "node",
 *   "args": ["/Users/vineet/ikawn-openbrain/src/mcp/local-server.js"]
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const BASE_URL = 'https://ikawn-openbrain.fly.dev';
const API_KEY = process.env.OPENBRAIN_API_KEY;
if (!API_KEY) {
  console.error('[MCP] OPENBRAIN_API_KEY environment variable is required');
  process.exit(1);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Api-Key': API_KEY,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({
  name: 'ikawn-openbrain-local',
  version: '2.0.0',
});

// 1. capture_thought
server.tool(
  'capture_thought',
  {
    content: z.string().describe('The thought, decision, or note to capture'),
    type: z.string().optional().describe('Memory type: note, decision, task, insight, discussion'),
    project: z.string().optional().describe('Project name: openbrain, ikawn-v3, ruhi, etc.'),
    hashtags: z.array(z.string()).optional().describe('Hashtags like #product, #engineering'),
    access_level: z.string().optional().describe('private, management, internal, public'),
  },
  async ({ content, type, project, hashtags, access_level }) => {
    const result = await apiFetch('/capture', {
      method: 'POST',
      body: JSON.stringify({
        content,
        memory_type: type || 'note',
        project: project || null,
        hashtags: hashtags || [],
        access_level: access_level || 'private',
        author: 'vineet',
        source: 'claude-code',
      }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// 2. search_memory
server.tool(
  'search_memory',
  {
    query: z.string().describe('Semantic search query'),
    type: z.string().optional(),
    project: z.string().optional(),
    hashtag: z.string().optional(),
    from: z.string().optional().describe('ISO date string'),
    to: z.string().optional().describe('ISO date string'),
    limit: z.number().optional(),
  },
  async ({ query, type, project, hashtag, from, to, limit }) => {
    const params = new URLSearchParams({ q: query });
    if (type) params.set('type', type);
    if (project) params.set('project', project);
    if (hashtag) params.set('hashtag', hashtag);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (limit) params.set('limit', String(limit));

    const result = await apiFetch(`/search?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (type) params.set('type', type);
    if (project) params.set('project', project);

    const result = await apiFetch(`/recent?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (signed_off_by) params.set('signed_off_by', signed_off_by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const result = await apiFetch(`/decisions?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// 5. log_decision
server.tool(
  'log_decision',
  {
    decision: z.string().describe('The decision made'),
    context: z.string().optional().describe('Why this decision was made'),
    project: z.string().optional(),
    signed_off_by: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
  },
  async ({ decision, context, project, signed_off_by, hashtags }) => {
    const result = await apiFetch('/decisions', {
      method: 'POST',
      body: JSON.stringify({ decision, context, project, signed_off_by: signed_off_by || 'vineet', hashtags }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// 6. get_stats
server.tool('get_stats', {}, async () => {
  const result = await apiFetch('/stats');
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// 7. trigger_sync
server.tool(
  'trigger_sync',
  { source: z.enum(['github', 'calendar', 'all']).describe('Which source to sync') },
  async ({ source }) => {
    const result = await apiFetch(`/admin/sync/${source}`, { method: 'POST' });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// 8. ask_ruhi
server.tool(
  'ask_ruhi',
  { message: z.string().describe('Question or message for Ruhi') },
  async ({ message }) => {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Api-Key': API_KEY },
      body: JSON.stringify({ message, user: 'vineet@ikawn.com' }),
    });

    const text = await res.text();
    // Parse SSE chunks
    const chunks = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => { try { return JSON.parse(l.slice(6)); } catch { return null; } })
      .filter(Boolean);

    const response = chunks.filter(c => c.type === 'chunk').map(c => c.text).join('');
    return { content: [{ type: 'text', text: response || 'No response from Ruhi' }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenBrain local MCP server running (HTTP proxy mode)');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
