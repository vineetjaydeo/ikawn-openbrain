// @ts-check
'use strict';

/**
 * Competitor identification for brand onboarding.
 *
 * Uses Claude to identify competitors with specific, defensible rationale.
 * Generic rationale ("similar company in your space") = not shown.
 */

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

/**
 * @typedef {object} Competitor
 * @property {string} name
 * @property {string} url
 * @property {string} rationale
 * @property {string} source - "ai" | "user"
 */

/**
 * Discover competitors for a brand using Claude.
 * @param {object} params
 * @param {string} params.brandName
 * @param {string} params.brandType - product | service | saas | agency | personal | hybrid
 * @param {string} params.industry
 * @param {string} [params.positioning] - Brand positioning statement
 * @param {Array<{name: string, description?: string}>} [params.offerings] - Brand offerings
 * @param {string} [params.brandUrl]
 * @returns {Promise<Competitor[]>}
 */
async function discoverCompetitors(params) {
  const { brandName, brandType, industry, positioning, offerings, brandUrl } = params;

  const offeringsStr = offerings?.length
    ? offerings.map(o => typeof o === 'string' ? o : o.name).join(', ')
    : 'not specified';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Identify 3-5 competitors for this brand:

Brand: ${brandName}
Website: ${brandUrl || 'not provided'}
Type: ${brandType}
Industry: ${industry}
Positioning: ${positioning || 'not specified'}
Offerings: ${offeringsStr}

For each competitor, provide a SPECIFIC rationale that references at least one of:
- Audience overlap (who they target)
- Offering similarity (what they sell/provide)
- Market positioning (how they position themselves)
- Geographic overlap (if relevant)
- Pricing tier (if detectable)

BAD rationale (do NOT use): "Similar company in your space", "A competitor", "They do similar things"
GOOD rationale: "Targets the same audience (small business owners) with a similar pricing tier", "Competes on premium positioning in the organic skincare space"

If you cannot generate a specific rationale for a competitor, DO NOT include them.

Return ONLY a JSON array:
[{"name": "...", "url": "https://...", "rationale": "..."}]

No explanation. Just the JSON array. Maximum 5 competitors.`,
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const competitors = JSON.parse(jsonMatch[0]);

    return competitors
      .filter((/** @type {any} */ c) => {
        if (!c || typeof c.name !== 'string' || typeof c.rationale !== 'string') return false;
        // Reject generic rationale
        if (c.rationale.length < 20) return false;
        const genericPhrases = ['similar company', 'a competitor', 'they do similar', 'in your space', 'similar business'];
        const lower = c.rationale.toLowerCase();
        if (genericPhrases.some(p => lower.includes(p) && lower.length < 60)) return false;
        return true;
      })
      .slice(0, 5)
      .map((/** @type {any} */ c) => ({
        name: c.name,
        url: typeof c.url === 'string' && c.url.startsWith('http') ? c.url : '',
        rationale: c.rationale,
        source: /** @type {const} */ ('ai'),
      }));
  } catch (err) {
    console.error('[competitor-discovery] Claude discovery failed:', err.message);
    return [];
  }
}

module.exports = {
  discoverCompetitors,
};
