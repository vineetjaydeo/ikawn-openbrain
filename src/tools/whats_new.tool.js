const pool = require('../db');

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = {
  name: 'whats_new',
  description:
    'Retrieve recent activity and memories from the last N hours. Use when users ask what happened recently, today, this week, or want a catch-up/recap.',
  tier: 'direct',
  costTier: 'low',
  parameters: {
    hours: {
      type: 'number',
      required: false,
      description: 'How many hours back to look. Defaults to 24.',
    },
    source: {
      type: 'string',
      required: false,
      description:
        'Filter by source (e.g. github, telegram, gmail, calendar). Leave empty for all sources.',
    },
    limit: {
      type: 'number',
      required: false,
      description: 'Max results to return. Defaults to 25.',
    },
  },

  async execute(config, context) {
    const hours = config.hours || 24;
    const limit = Math.min(config.limit || 25, 100);
    const sourceFilter = config.source || null;
    const brandId = context.brandId;

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const params = [brandId, cutoff];
    let whereClause = `
      WHERE brand_id = $1
        AND created_at > $2
        AND (archived IS NULL OR archived = false)
        AND deleted_at IS NULL
        AND author != 'ruhi'
    `;

    if (sourceFilter) {
      params.push(sourceFilter);
      whereClause += `  AND source ILIKE '%' || $${params.length} || '%'\n`;
    }

    params.push(limit);
    const query = `
      SELECT content, memory_type, source, author, created_at
      FROM memories
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return {
        success: true,
        data: [],
        summary: `No activity found in the last ${hours} hours.`,
      };
    }

    const formatted = rows
      .map((row) => {
        const ts = timeAgo(row.created_at);
        const meta = [row.memory_type, row.source, row.author ? `by ${row.author}` : null]
          .filter(Boolean)
          .join(', ');
        const snippet = row.content && row.content.length > 500
          ? row.content.slice(0, 500) + '...'
          : row.content || '';
        return `[${ts}] (${meta}) ${snippet}`;
      })
      .join('\n\n');

    return {
      success: true,
      data: rows,
      summary: `Found ${rows.length} item(s) from the last ${hours} hours:\n\n${formatted}`,
    };
  },
};
