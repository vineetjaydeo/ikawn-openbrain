// @ts-check
'use strict';

/**
 * Skill: crawl-pipeline
 *
 * Website crawling pipeline with multiple fallback strategies:
 * 1. Cloudflare Browser Rendering REST API
 * 2. Simple fetch + jsdom BFS crawler
 * 3. Firecrawl API
 * 4. Jina Reader (single page)
 */

const { JSDOM } = require('jsdom');
const { URL } = require('url');

const TAG = '[crawl-pipeline]';
const PAGE_TIMEOUT = 5000;
const OVERALL_TIMEOUT = 30000;
const DEFAULT_MAX_PAGES = 15;
const MIN_CONTENT_CHARS = 500;
const EMPTY_PAGE_THRESHOLD = 0.5;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * @typedef {{ url: string, title: string, markdown: string, html?: string }} CrawledPage
 * @typedef {{ pages: CrawledPage[], method: string, error?: string }} CrawlResult
 */

/**
 * Fetch a URL with timeout and browser-like headers.
 * @param {string} url
 * @param {number} [timeout]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeout = PAGE_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check if a response has X-Robots-Tag: noindex.
 * @param {Response} res
 * @returns {boolean}
 */
function hasNoIndex(res) {
  const robotsTag = res.headers.get('x-robots-tag');
  return !!robotsTag && robotsTag.toLowerCase().includes('noindex');
}

/**
 * Convert DOM body to simplified markdown.
 * Strips scripts, styles, nav, footer, aside. Extracts headings + paragraphs.
 * @param {import('jsdom').JSDOM} dom
 * @returns {string}
 */
function domToMarkdown(dom) {
  const doc = dom.window.document;

  // Remove unwanted elements
  const removeSelectors = ['script', 'style', 'nav', 'footer', 'aside', 'noscript', 'svg', 'iframe', 'form'];
  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  }

  const lines = [];

  /**
   * @param {Element} el
   */
  function walk(el) {
    const tag = el.tagName?.toLowerCase();

    if (tag === 'h1') {
      const text = el.textContent?.trim();
      if (text) lines.push(`# ${text}\n`);
    } else if (tag === 'h2') {
      const text = el.textContent?.trim();
      if (text) lines.push(`## ${text}\n`);
    } else if (tag === 'h3') {
      const text = el.textContent?.trim();
      if (text) lines.push(`### ${text}\n`);
    } else if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const text = el.textContent?.trim();
      if (text) lines.push(`#### ${text}\n`);
    } else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') {
      if (tag === 'p') {
        const text = el.textContent?.trim();
        if (text) lines.push(`${text}\n`);
      } else {
        // Recurse into container elements
        for (const child of el.children) {
          walk(child);
        }
      }
    } else if (tag === 'li') {
      const text = el.textContent?.trim();
      if (text) lines.push(`- ${text}`);
    } else if (tag === 'ul' || tag === 'ol') {
      for (const child of el.children) {
        walk(child);
      }
      lines.push('');
    } else if (tag === 'blockquote') {
      const text = el.textContent?.trim();
      if (text) lines.push(`> ${text}\n`);
    } else if (tag === 'pre' || tag === 'code') {
      const text = el.textContent?.trim();
      if (text) lines.push(`\`\`\`\n${text}\n\`\`\`\n`);
    } else if (tag === 'table') {
      const text = el.textContent?.trim();
      if (text) lines.push(`${text}\n`);
    } else if (tag === 'body' || tag === 'html') {
      for (const child of el.children) {
        walk(child);
      }
    }
  }

  const body = doc.body || doc.documentElement;
  if (body) walk(body);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract internal links from a DOM on the same domain.
 * @param {import('jsdom').JSDOM} dom
 * @param {string} baseUrl
 * @returns {string[]}
 */
function extractLinks(dom, baseUrl) {
  const doc = dom.window.document;
  const base = new URL(baseUrl);
  const links = new Set();

  doc.querySelectorAll('a[href]').forEach(a => {
    try {
      const href = a.getAttribute('href');
      if (!href) return;
      // Skip anchors, javascript:, mailto:, tel:
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const resolved = new URL(href, baseUrl);
      // Same domain only
      if (resolved.hostname !== base.hostname) return;
      // Skip non-http
      if (!resolved.protocol.startsWith('http')) return;
      // Strip hash
      resolved.hash = '';
      // Skip common non-page extensions
      const path = resolved.pathname.toLowerCase();
      if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip|gz|mp4|mp3|webp|ico|woff2?)$/.test(path)) return;

      links.add(resolved.href);
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(links);
}

// ─── Method 1: Cloudflare Browser Rendering ──────────────────────────────────

/**
 * Crawl using Cloudflare Browser Rendering REST API.
 * @param {string} url
 * @param {number} maxPages
 * @returns {Promise<CrawlResult | null>}
 */
async function crawlCloudflare(url, maxPages) {
  const accountId = process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`;

  try {
    // First attempt: render: false (faster)
    let res = await fetchWithTimeout(endpoint, OVERALL_TIMEOUT);
    // Actually use POST
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        renderOptions: { render: false },
        maxPages,
        formats: ['markdown', 'html'],
      }),
      signal: AbortSignal.timeout(OVERALL_TIMEOUT),
    });

    if (!res.ok) {
      console.error(TAG, `Cloudflare crawl failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    let pages = parseCloudflareCrawlResponse(data);

    // Check if content is sufficient
    const totalChars = pages.reduce((sum, p) => sum + (p.markdown?.length || 0), 0);
    const emptyPages = pages.filter(p => (p.markdown?.length || 0) < 50).length;
    const emptyRatio = pages.length > 0 ? emptyPages / pages.length : 1;

    if (totalChars < MIN_CONTENT_CHARS || emptyRatio > EMPTY_PAGE_THRESHOLD) {
      console.error(TAG, `Cloudflare render:false insufficient (${totalChars} chars, ${Math.round(emptyRatio * 100)}% empty). Retrying with render:true`);

      // Retry with render: true
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          renderOptions: {
            render: true,
            rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'],
            waitUntil: 'domcontentloaded',
          },
          maxPages,
          formats: ['markdown', 'html'],
        }),
        signal: AbortSignal.timeout(OVERALL_TIMEOUT),
      });

      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryPages = parseCloudflareCrawlResponse(retryData);
        if (retryPages.length > 0) {
          pages = retryPages;
        }
      }
    }

    if (pages.length > 0) {
      return { pages, method: 'cloudflare' };
    }
    return null;
  } catch (err) {
    console.error(TAG, 'Cloudflare crawl error:', err.message);
    return null;
  }
}

/**
 * Parse the Cloudflare crawl API response into pages.
 * @param {any} data
 * @returns {CrawledPage[]}
 */
function parseCloudflareCrawlResponse(data) {
  /** @type {CrawledPage[]} */
  const pages = [];

  // Cloudflare returns { success, result: [...] } or similar
  const results = data?.result || data?.pages || data?.data || [];
  const items = Array.isArray(results) ? results : [results];

  for (const item of items) {
    if (!item) continue;
    const pageUrl = item.url || item.link || '';
    const title = item.title || item.metadata?.title || '';
    const markdown = item.markdown || item.content || item.text || '';
    const html = item.html || '';

    if (pageUrl && markdown) {
      pages.push({ url: pageUrl, title, markdown, html: html || undefined });
    }
  }

  return pages;
}

// ─── Method 2: Fetch + jsdom BFS ─────────────────────────────────────────────

/**
 * Crawl using simple fetch + jsdom BFS.
 * @param {string} startUrl
 * @param {number} maxPages
 * @returns {Promise<CrawlResult | null>}
 */
async function crawlJsdom(startUrl, maxPages) {
  const visited = new Set();
  /** @type {string[]} */
  const queue = [startUrl];
  /** @type {CrawledPage[]} */
  const pages = [];
  const deadline = Date.now() + OVERALL_TIMEOUT;

  try {
    while (queue.length > 0 && pages.length < maxPages && Date.now() < deadline) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);

      try {
        const res = await fetchWithTimeout(url, PAGE_TIMEOUT);
        if (!res.ok) continue;

        // Check content type
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) continue;

        // Check noindex
        if (hasNoIndex(res)) continue;

        const html = await res.text();
        const dom = new JSDOM(html, { url });

        // Check meta robots noindex
        const metaRobots = dom.window.document.querySelector('meta[name="robots"]');
        if (metaRobots && metaRobots.getAttribute('content')?.toLowerCase().includes('noindex')) {
          continue;
        }

        const title = dom.window.document.title || '';
        const markdown = domToMarkdown(dom);

        if (markdown.length > 0) {
          pages.push({ url, title, markdown, html });
        }

        // Extract links for BFS
        const links = extractLinks(dom, url);
        for (const link of links) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      } catch (err) {
        console.error(TAG, `jsdom fetch error for ${url}:`, err.message);
        // Continue to next page
      }
    }

    if (pages.length > 0) {
      return { pages, method: 'jsdom' };
    }
    return null;
  } catch (err) {
    console.error(TAG, 'jsdom crawl error:', err.message);
    return null;
  }
}

// ─── Method 3: Firecrawl ─────────────────────────────────────────────────────

/**
 * Crawl using Firecrawl API.
 * @param {string} url
 * @param {number} maxPages
 * @returns {Promise<CrawlResult | null>}
 */
async function crawlFirecrawl(url, maxPages) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        limit: maxPages,
        scrapeOptions: { formats: ['markdown'] },
      }),
      signal: AbortSignal.timeout(OVERALL_TIMEOUT),
    });

    if (!res.ok) {
      console.error(TAG, `Firecrawl crawl failed: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Firecrawl returns { success, data: [...] } with each item having { markdown, metadata }
    const items = data?.data || [];
    /** @type {CrawledPage[]} */
    const pages = [];

    for (const item of items) {
      if (!item) continue;
      pages.push({
        url: item.metadata?.url || item.url || url,
        title: item.metadata?.title || item.title || '',
        markdown: item.markdown || item.content || '',
      });
    }

    if (pages.length > 0) {
      return { pages, method: 'firecrawl' };
    }
    return null;
  } catch (err) {
    console.error(TAG, 'Firecrawl crawl error:', err.message);
    return null;
  }
}

// ─── Method 4: Jina Reader ──────────────────────────────────────────────────

/**
 * Fetch single page via Jina Reader.
 * @param {string} url
 * @returns {Promise<CrawlResult | null>}
 */
async function crawlJina(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetchWithTimeout(jinaUrl, PAGE_TIMEOUT);

    if (!res.ok) {
      console.error(TAG, `Jina Reader failed: ${res.status}`);
      return null;
    }

    const markdown = await res.text();
    if (!markdown || markdown.length < 50) return null;

    // Extract title from first heading if present
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '';

    return {
      pages: [{ url, title, markdown }],
      method: 'jina',
    };
  } catch (err) {
    console.error(TAG, 'Jina Reader error:', err.message);
    return null;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Crawl a website using multiple fallback strategies.
 *
 * Order: Cloudflare Browser Rendering → fetch+jsdom BFS → Firecrawl → Jina Reader.
 * Returns pages from whichever method succeeds first.
 *
 * @param {string} url - Website URL to crawl
 * @param {object} [options]
 * @param {number} [options.maxPages] - Max pages to crawl (default 15)
 * @returns {Promise<CrawlResult>}
 */
async function crawlWebsite(url, options = {}) {
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // Try each method in order
  const methods = [
    () => crawlCloudflare(url, maxPages),
    () => crawlJsdom(url, maxPages),
    () => crawlFirecrawl(url, maxPages),
    () => crawlJina(url),
  ];

  for (const method of methods) {
    try {
      const result = await method();
      if (result && result.pages.length > 0) {
        console.error(TAG, `Success via ${result.method}: ${result.pages.length} pages from ${url}`);
        return result;
      }
    } catch (err) {
      console.error(TAG, 'Method error:', err.message);
      // Continue to next method
    }
  }

  console.error(TAG, `All crawl methods failed for ${url}`);
  return { pages: [], method: 'none', error: 'All crawl methods failed' };
}

module.exports = { crawlWebsite };
