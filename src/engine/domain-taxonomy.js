'use strict';

const DEFAULT_DOMAINS = {
  marketing: ['campaign', 'ad', 'audience', 'targeting', 'creative', 'copy', 'brand voice', 'branding', 'promotion'],
  product: ['feature', 'roadmap', 'launch', 'pricing', 'competitor', 'product', 'release'],
  content: ['post', 'reel', 'blog', 'video', 'caption', 'hashtag', 'schedule', 'content', 'social media'],
  analytics: ['metrics', 'performance', 'engagement', 'roi', 'conversion', 'traffic', 'analytics', 'data'],
  operations: ['workflow', 'process', 'tool', 'integration', 'automation', 'ops'],
  strategy: ['goal', 'plan', 'quarter', 'budget', 'decision', 'priority', 'strategy', 'objective'],
  customer: ['feedback', 'review', 'support', 'persona', 'segment', 'customer', 'user'],
  technical: ['api', 'code', 'bug', 'deploy', 'database', 'server', 'technical', 'infrastructure']
};

const VALID_DOMAINS = Object.keys(DEFAULT_DOMAINS);

/**
 * Classify text into a domain by keyword matching.
 * Returns the domain with the most keyword hits, or null if no match.
 */
function classifyByKeywords(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let bestDomain = null;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DEFAULT_DOMAINS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestScore > 0 ? bestDomain : null;
}

module.exports = { DEFAULT_DOMAINS, VALID_DOMAINS, classifyByKeywords };
