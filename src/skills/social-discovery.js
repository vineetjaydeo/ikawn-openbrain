// @ts-check
'use strict';

/**
 * Social profile discovery for brand onboarding.
 *
 * Uses two strategies:
 * 1. Extract social links from crawled page content (HTML link patterns)
 * 2. Claude-based inference from brand name + URL for missing platforms
 */

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

/**
 * Known social platform patterns.
 * @type {Array<{platform: string, patterns: RegExp[]}>}
 */
const PLATFORM_PATTERNS = [
  { platform: 'instagram', patterns: [/instagram\.com\/([^/?#\s]+)/i, /instagr\.am\/([^/?#\s]+)/i] },
  { platform: 'twitter', patterns: [/(?:twitter|x)\.com\/([^/?#\s]+)/i] },
  { platform: 'facebook', patterns: [/facebook\.com\/([^/?#\s]+)/i, /fb\.com\/([^/?#\s]+)/i] },
  { platform: 'linkedin', patterns: [/linkedin\.com\/(?:company|in)\/([^/?#\s]+)/i] },
  { platform: 'youtube', patterns: [/youtube\.com\/(?:c\/|channel\/|@)([^/?#\s]+)/i] },
  { platform: 'tiktok', patterns: [/tiktok\.com\/@([^/?#\s]+)/i] },
  { platform: 'pinterest', patterns: [/pinterest\.com\/([^/?#\s]+)/i] },
  { platform: 'threads', patterns: [/threads\.net\/@([^/?#\s]+)/i] },
];

/**
 * Extract social profiles from crawled page content.
 * @param {Array<{url: string, markdown: string, html?: string}>} pages
 * @returns {Array<{platform: string, url: string, handle: string, source: string}>}
 */
function extractFromPages(pages) {
  /** @type {Map<string, {platform: string, url: string, handle: string, source: string}>} */
  const found = new Map();

  for (const page of pages) {
    const content = (page.html || '') + ' ' + (page.markdown || '');

    for (const { platform, patterns } of PLATFORM_PATTERNS) {
      if (found.has(platform)) continue;

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[0]) {
          const fullUrl = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
          const handle = match[1] || '';

          // Skip generic/invalid handles
          if (!handle || handle === 'share' || handle === 'sharer' || handle === 'intent' || handle.length < 2) {
            continue;
          }

          found.set(platform, {
            platform,
            url: fullUrl,
            handle: handle.replace(/\/$/, ''),
            source: 'crawl',
          });
          break;
        }
      }
    }
  }

  return Array.from(found.values());
}

/**
 * Use Claude to discover additional social profiles not found in crawl.
 * @param {string} brandName
 * @param {string} brandUrl
 * @param {string[]} alreadyFound - Platforms already discovered
 * @returns {Promise<Array<{platform: string, url: string, handle: string, source: string}>>}
 */
async function discoverViaClaude(brandName, brandUrl, alreadyFound) {
  const missingPlatforms = PLATFORM_PATTERNS
    .map(p => p.platform)
    .filter(p => !alreadyFound.includes(p));

  if (missingPlatforms.length === 0) {
    return [];
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `For the brand "${brandName}" (${brandUrl}), find their social media profiles on these platforms: ${missingPlatforms.join(', ')}.

Return ONLY a JSON array. Each item: {"platform": "...", "url": "https://...", "handle": "..."}
Only include profiles you are reasonably confident exist. If unsure about a platform, omit it.
Return [] if you cannot find any profiles.
No explanation, just the JSON array.`,
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const profiles = JSON.parse(jsonMatch[0]);

    return profiles
      .filter((/** @type {any} */ p) =>
        p && typeof p.platform === 'string' && typeof p.url === 'string' && p.url.startsWith('http')
      )
      .map((/** @type {any} */ p) => ({
        platform: p.platform.toLowerCase(),
        url: p.url,
        handle: p.handle || '',
        source: 'ai',
      }));
  } catch (err) {
    console.error('[social-discovery] Claude discovery failed:', err.message);
    return [];
  }
}

/**
 * Discover social profiles for a brand.
 * @param {object} params
 * @param {string} params.brandName
 * @param {string} params.brandUrl
 * @param {Array<{url: string, markdown: string, html?: string}>} params.pages - Crawled pages
 * @returns {Promise<Record<string, {url: string, handle: string, followers: number|null, verified: boolean, source: string}>>}
 */
async function discoverSocialProfiles(params) {
  const { brandName, brandUrl, pages } = params;

  // Step 1: Extract from crawled content
  const crawlProfiles = extractFromPages(pages);

  // Step 2: Discover missing via Claude
  const alreadyFound = crawlProfiles.map(p => p.platform);
  const aiProfiles = await discoverViaClaude(brandName, brandUrl, alreadyFound);

  // Merge: crawl profiles take priority
  /** @type {Record<string, {url: string, handle: string, followers: number|null, verified: boolean, source: string}>} */
  const result = {};

  for (const profile of [...crawlProfiles, ...aiProfiles]) {
    if (!result[profile.platform]) {
      result[profile.platform] = {
        url: profile.url,
        handle: profile.handle,
        followers: null,
        verified: false,
        source: profile.source,
      };
    }
  }

  return result;
}

module.exports = {
  discoverSocialProfiles,
  extractFromPages,
};
