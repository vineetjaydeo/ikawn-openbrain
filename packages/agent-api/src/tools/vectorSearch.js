'use strict';

const { z } = require('zod');
const { defineTool } = require('./defineTool.js');

const SQL_VECTOR = `
  SELECT id, content,
         1 - (embedding <=> $1::vector) AS similarity
  FROM memories
  WHERE embedding IS NOT NULL
    AND brand_id = $2
    AND (archived IS NULL OR archived = false)
    AND deleted_at IS NULL
    AND author != 'ruhi'
  ORDER BY embedding <=> $1::vector
  LIMIT $3
`;

const SQL_TEXT = `
  SELECT id, content, 0.5 AS similarity
  FROM memories
  WHERE brand_id = $1
    AND content ILIKE $2
    AND (archived IS NULL OR archived = false)
    AND deleted_at IS NULL
    AND author != 'ruhi'
  ORDER BY created_at DESC
  LIMIT $3
`;

const vectorSearch = defineTool({
  name: 'vector_search',
  description: "Search the user's memory for semantically related items.",
  parameters: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output: z.object({
    items: z.array(z.object({ id: z.string(), score: z.number(), text: z.string() })),
    truncated: z.boolean(),
  }),
  mode: 'sync',
  concurrency: 'safe',
  needsApproval: false,
  timeoutMs: 5000,
  retry: { maxAttempts: 0 },
  async execute(input, ctx) {
    const deps = ctx.deps && ctx.deps.vectorSearch;
    if (!deps) throw new Error('vector_search requires ctx.deps.vectorSearch = { getEmbedding, query }');
    const brand = ctx.brandContext.brand;
    const limit = input.limit !== undefined ? input.limit : 10;

    const embedding = await deps.getEmbedding(input.query);
    let rows;
    if (embedding && Array.isArray(embedding)) {
      const vec = `[${embedding.join(',')}]`;
      const res = await deps.query(SQL_VECTOR, [vec, brand, limit]);
      rows = res.rows;
    } else {
      const res = await deps.query(SQL_TEXT, [brand, `%${input.query}%`, limit]);
      rows = res.rows;
    }

    const items = rows.map((r) => ({
      id: String(r.id),
      score: Number(r.similarity),
      text: String(r.content),
    }));
    return { items, truncated: items.length >= limit };
  },
});

module.exports = { vectorSearch };
