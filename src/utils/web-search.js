const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

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

  try {
    const params = new URLSearchParams({ q: query, count: String(count) });
    const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) {
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
