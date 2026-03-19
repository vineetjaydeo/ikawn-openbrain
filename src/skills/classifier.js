// @ts-check
'use strict';

/**
 * Skill: classifier
 *
 * Classifies crawled pages by type using Claude Haiku.
 * Batch-classifies all unique pages in a single prompt.
 */

const Anthropic = require('@anthropic-ai/sdk');

const TAG = '[classifier]';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_CONTENT_PREVIEW = 1000;

const VALID_PAGE_TYPES = [
  'home', 'about', 'pricing', 'products', 'services',
  'blog', 'contact', 'faq', 'careers', 'legal', 'other',
];

/**
 * @typedef {{ page_url: string, page_type: string }} PageClassification
 */

/**
 * Classify pages by type using Claude Haiku.
 *
 * Groups chunks by page_url, takes the first chunk's content (up to 1000 chars)
 * for each page, and batch-classifies them all in a single prompt.
 *
 * @param {Array<{ page_url: string, page_title: string, content: string }>} chunks
 * @returns {Promise<PageClassification[]>}
 */
async function classifyPages(chunks) {
  if (!chunks || chunks.length === 0) return [];

  // Deduplicate by page_url — take first chunk per page
  /** @type {Map<string, { page_url: string, page_title: string, content: string }>} */
  const uniquePages = new Map();
  for (const chunk of chunks) {
    if (!uniquePages.has(chunk.page_url)) {
      uniquePages.set(chunk.page_url, {
        page_url: chunk.page_url,
        page_title: chunk.page_title,
        content: chunk.content.slice(0, MAX_CONTENT_PREVIEW),
      });
    }
  }

  const pages = Array.from(uniquePages.values());

  // Default all to "other" in case of error
  /** @type {PageClassification[]} */
  const defaults = pages.map(p => ({ page_url: p.page_url, page_type: 'other' }));

  try {
    const client = new Anthropic();

    const pagesDescription = pages.map((p, i) =>
      `[${i}] URL: ${p.page_url}\nTitle: ${p.page_title}\nContent preview: ${p.content}`
    ).join('\n\n---\n\n');

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Classify each of the following web pages into exactly one category.

Valid categories: ${VALID_PAGE_TYPES.join(', ')}

Return ONLY a valid JSON array. Each element must have "index" (the page number) and "page_type" (the category). No explanation, no markdown fences, just the JSON array.

Example response:
[{"index":0,"page_type":"home"},{"index":1,"page_type":"about"}]

Pages to classify:

${pagesDescription}`,
        },
      ],
    });

    // Extract text from response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON — handle potential markdown fences
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      console.error(TAG, 'Unexpected response format, expected array');
      return defaults;
    }

    // Map results back to page URLs
    /** @type {PageClassification[]} */
    const results = [];
    for (const item of parsed) {
      const idx = item.index;
      const pageType = item.page_type?.toLowerCase();
      if (idx >= 0 && idx < pages.length && VALID_PAGE_TYPES.includes(pageType)) {
        results.push({
          page_url: pages[idx].page_url,
          page_type: pageType,
        });
      }
    }

    // Fill in any pages the model missed
    for (const page of pages) {
      if (!results.find(r => r.page_url === page.page_url)) {
        results.push({ page_url: page.page_url, page_type: 'other' });
      }
    }

    return results;
  } catch (err) {
    console.error(TAG, 'Classification error:', err.message);
    return defaults;
  }
}

module.exports = { classifyPages };
