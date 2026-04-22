// src/tools/ikawn-os.tool.js
'use strict';

module.exports = {
  name: 'ikawn_generate',
  description: 'Trigger image/video generation on ikawn OS (os.ikawn.com) via external API',
  tier: 'direct',
  parameters: {
    agent: { type: 'string', required: true, description: 'Agent', enum: ['genie', 'remix', 'prism', 'lazarus'] },
    prompt: { type: 'string', required: true, description: 'Generation prompt' },
    image_url: { type: 'string', required: false, description: 'Input image URL (for remix/prism/lazarus)' },
  },
  async execute(config, context) {
    const apiUrl = process.env.IKAWN_OS_API_URL || 'https://os.ikawn.com';
    const apiKey = process.env.IKAWN_API_KEY;
    if (!apiKey) return { success: false, data: null, summary: 'iKawn OS generation is not connected yet. Ask your admin to set up the integration.' };

    try {
      const body = { agent: config.agent, prompt: config.prompt };
      if (config.image_url) body.image_url = config.image_url;

      const res = await fetch(`${apiUrl}/api/external/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, data: null, summary: `Generation failed: ${res.status} ${err}` };
      }

      const data = await res.json();
      return { success: true, data: { generationId: data.id, status: data.status }, summary: `Generation started on ${config.agent}. ID: ${data.id}` };
    } catch (err) {
      return { success: false, data: null, summary: `ikawn OS generation failed: ${err.message}` };
    }
  },
};
