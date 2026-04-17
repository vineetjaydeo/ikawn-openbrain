module.exports = {
  name: 'browse_vault',
  description: 'Search and browse files in the user\'s vault. Use when the user asks about their files, wants to find a document they uploaded, or references a previously generated artifact.',
  tier: 'direct',
  costTier: 'low',
  parameters: {
    query: { type: 'string', required: false, description: 'Search term for filename' },
    file_type: { type: 'string', required: false, description: 'Filter by type: pdf, pptx, docx, xlsx, csv, image, chart, text' },
    folder: { type: 'string', required: false, description: 'Filter by folder name' },
    limit: { type: 'number', required: false, description: 'Max results, default 10' },
  },
  async execute(config, context) {
    const { pool, brandId, userId } = context;

    try {
      const conditions = ['deleted_at IS NULL'];
      const params = [];
      let paramIndex = 1;

      if (!brandId || !userId) {
        return { success: false, data: null, summary: 'Cannot browse vault: user context required.' };
      }
      conditions.push(`brand_id = $${paramIndex++}`);
      params.push(brandId);
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);

      if (config.query) {
        conditions.push(`filename ILIKE $${paramIndex++}`);
        params.push(`%${config.query}%`);
      }

      if (config.file_type) {
        conditions.push(`file_type = $${paramIndex++}`);
        params.push(config.file_type);
      }

      if (config.folder) {
        conditions.push(`folder = $${paramIndex++}`);
        params.push(config.folder);
      }

      const limit = config.limit || 10;
      params.push(limit);

      const sql = `
        SELECT file_url, filename, file_type, folder, created_at, file_size
        FROM vault_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
      `;

      const result = await pool.query(sql, params);
      const files = result.rows.map(row => ({
        url: row.file_url,
        filename: row.filename,
        file_type: row.file_type,
        folder: row.folder || null,
        created_at: row.created_at,
        file_size: row.file_size || null,
      }));

      if (files.length === 0) {
        return {
          success: true,
          data: { files: [] },
          summary: 'No files found matching the given criteria.',
        };
      }

      const fileList = files.map(f => `- ${f.filename} (${f.file_type}${f.folder ? ', folder: ' + f.folder : ''})`).join('\n');
      return {
        success: true,
        data: { files },
        summary: `Found ${files.length} file${files.length === 1 ? '' : 's'}:\n${fileList}`,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Failed to browse vault: ${err.message}`,
      };
    }
  },
};
