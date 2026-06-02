const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';

// Brave free tier: 1 req/s
let lastBraveSearchTime = 0;
const MIN_BRAVE_INTERVAL_MS = 1100;

async function searchSerper(query, count) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(SERPER_SEARCH_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: count }),
    });

    if (!res.ok) {
      console.error(`Serper Search API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    return (data.organic ?? []).slice(0, count).map((r) => ({
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || '',
    }));
  } catch (err) {
    console.error('Serper Search failed:', err.message);
    return null;
  }
}

async function searchBrave(query, count) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const now = Date.now();
  const elapsed = now - lastBraveSearchTime;
  if (elapsed < MIN_BRAVE_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_BRAVE_INTERVAL_MS - elapsed));
  }
  lastBraveSearchTime = Date.now();

  try {
    const params = new URLSearchParams({ q: query, count: String(count) });
    const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[web_search] Brave rate limited (429), waiting 2s and retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        lastBraveSearchTime = Date.now();
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
    return (data.web?.results ?? []).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
    }));
  } catch (err) {
    console.error('Brave Search failed:', err.message);
    return [];
  }
}

/**
 * Search the web. Prefers Serper (more reliable, faster); falls through to Brave
 * when SERPER_API_KEY is unset or Serper errors.
 * @param {string} query - Search query
 * @param {number} count - Number of results (default 5)
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function searchWeb(query, count = 5) {
  const serperResults = await searchSerper(query, count);
  if (serperResults !== null) return serperResults;
  return searchBrave(query, count);
}

module.exports = { searchWeb };
