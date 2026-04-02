const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

// Rate limiting: track last search time to avoid 429s from Brave
let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 1100; // 1.1s between searches (Brave free tier: 1 req/s)

/**
 * Search the web using Brave Search API.
 * @param {string} query - Search query
 * @param {number} count - Number of results (default 5)
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function searchWeb(query, count = 5) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return [];
  }

  // Rate limit: wait if too soon since last search
  const now = Date.now();
  const elapsed = now - lastSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_SEARCH_INTERVAL_MS - elapsed));
  }
  lastSearchTime = Date.now();

  try {
    const params = new URLSearchParams({ q: query, count: String(count) });
    const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) {
      // On 429, wait and retry once
      if (res.status === 429) {
        console.warn(`[web_search] Rate limited (429), waiting 2s and retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        lastSearchTime = Date.now();
        const retryRes = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          return (retryData.web?.results ?? []).map(r => ({ title: r.title || '', url: r.url || '', snippet: r.description || '' }));
        }
      }
      console.error(`Brave Search API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const results = data.web?.results ?? [];

    return results.map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
    }));
  } catch (err) {
    console.error('Brave Search failed:', err.message);
    return [];
  }
}

module.exports = { searchWeb };
