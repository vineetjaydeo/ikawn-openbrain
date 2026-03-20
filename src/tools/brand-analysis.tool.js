// src/tools/brand-analysis.tool.js
'use strict';

const { crawlWebsite } = require('../skills/crawl-pipeline');
const { chunkPages } = require('../skills/chunker');
const { classifyPages } = require('../skills/classifier');
const { analyzeBrand } = require('../skills/brand-analysis');

module.exports = {
  name: 'analyze_brand',
  description: 'Crawl a website and produce a full Brand DNA analysis — identity, voice, visuals, market context, competitors, and social profiles',
  tier: 'direct',
  parameters: {
    url: { type: 'string', required: true, description: 'The brand website URL to analyze' },
    brand_type: { type: 'string', required: false, description: 'Brand type hint: product, service, saas, agency, personal, hybrid (default: hybrid)', enum: ['product', 'service', 'saas', 'agency', 'personal', 'hybrid'] },
  },

  async execute(config) {
    const url = config.url;
    if (!url) return { success: false, data: null, summary: 'URL is required.' };

    const brandType = config.brand_type || 'hybrid';

    // 1. Crawl
    const crawlResult = await crawlWebsite(url);
    if (!crawlResult.pages || crawlResult.pages.length === 0) {
      return { success: false, data: null, summary: `Crawl failed for ${url}: ${crawlResult.error || 'no pages returned'}` };
    }

    // 2. Chunk
    const chunks = chunkPages(crawlResult.pages);

    // 3. Classify
    const classified = await classifyPages(chunks);

    // 4. Analyze
    const result = await analyzeBrand({ brandType, url, chunks: classified });

    // 5. Format summary for chat
    const dna = result.brand_dna;
    const ci = dna.core_identity || {};
    const mv = dna.market_context || {};
    const ins = dna.insights || {};

    const summary = [
      `**Brand Analysis: ${ci.brand_name?.value || url}**`,
      ci.description?.value ? `\n${ci.description.value}` : '',
      ci.tagline?.value ? `\n> ${ci.tagline.value}` : '',
      `\n**Industry:** ${mv.industry?.value || 'Unknown'}`,
      `**Positioning:** ${ins.positioning_label || 'Unknown'}`,
      `**Confidence:** ${Math.round(result.brand_dna_confidence * 100)}%`,
      dna.competitors?.length ? `\n**Competitors:** ${dna.competitors.map(c => c.name).join(', ')}` : '',
      dna.social_profiles?.length ? `**Social:** ${dna.social_profiles.map(s => `${s.platform}: ${s.handle || s.url}`).join(', ')}` : '',
      ins.opinion ? `\n**Opinion:** ${ins.opinion}` : '',
      `\n_Crawled ${crawlResult.pages.length} pages via ${crawlResult.method}_`,
    ].filter(Boolean).join('\n');

    return { success: true, data: result, summary };
  },
};
