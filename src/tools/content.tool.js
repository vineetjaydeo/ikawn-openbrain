// src/tools/content.tool.js
'use strict';

const { generateWithMemory } = require('../utils/generate-with-memory');

module.exports = {
  name: 'content_draft',
  description: 'Draft social media posts, captions, or marketing copy using brand voice',
  tier: 'agent',
  parameters: {
    topic: { type: 'string', required: true, description: 'What to write about' },
    platform: { type: 'string', required: false, description: 'Target platform', enum: ['instagram', 'twitter', 'linkedin', 'general'] },
    tone: { type: 'string', required: false, description: 'Tone override' },
    count: { type: 'number', required: false, description: 'Number of variations (default: 3)' },
  },
  async execute(config, context) {
    const platform = config.platform || 'general';
    const count = config.count || 3;
    const task = `Write ${count} ${platform} post variations about: ${config.topic}.${config.tone ? ` Tone: ${config.tone}.` : ''} Return as a JSON array of strings.`;

    try {
      const result = await generateWithMemory({
        brandId: context.brandId || 'ikawn',
        userId: context.userId,
        task,
        memoryTypes: ['BRAND_VOICE_RULE', 'CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT'],
        memoryLimit: 10,
      });
      return {
        success: true,
        data: { drafts: result.content, memoriesUsed: result.memoriesUsed },
        summary: `Drafted ${count} ${platform} post variations about "${config.topic}".`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Content drafting failed: ${err.message}` };
    }
  },
};
