const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CONTENT_LENGTH = 8_000;

/**
 * Fetch a URL and extract readable text content using Readability.
 * @param {string} url - The URL to read
 * @returns {Promise<{title: string, content: string, excerpt: string} | null>}
 */
async function readLink(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenBrain/1.0)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    // Check content-length header before downloading body
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      return null;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return null;
    }

    const html = new TextDecoder().decode(buffer);
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return null;
    }

    // Extract plain text from the HTML content
    const textDom = new JSDOM(article.content);
    const plainText = textDom.window.document.body.textContent || '';
    const trimmed = plainText.trim().slice(0, MAX_CONTENT_LENGTH);

    return {
      title: article.title || '',
      content: trimmed,
      excerpt: article.excerpt || '',
    };
  } catch (err) {
    console.error('readLink failed:', err.message);
    return null;
  }
}

module.exports = { readLink };
