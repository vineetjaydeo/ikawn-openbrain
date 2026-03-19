// @ts-check
'use strict';

/**
 * Skill: chunker
 *
 * Splits crawled page markdown into structured chunks by heading.
 * Each chunk is sized for embedding/classification (max ~2000 tokens / ~8000 chars).
 */

const MAX_CHUNK_CHARS = 8000;
const MIN_CHUNK_CHARS = 50;

/**
 * @typedef {{ page_url: string, page_title: string, section_heading: string, content: string, chunk_index: number }} Chunk
 */

/**
 * Split a single page's markdown into sections by H2/H3 headings.
 * @param {string} markdown
 * @returns {Array<{ heading: string, content: string }>}
 */
function splitByHeadings(markdown) {
  if (!markdown || !markdown.trim()) return [];

  // Split on ## or ### headings (must be at line start)
  const lines = markdown.split('\n');
  /** @type {Array<{ heading: string, content: string[] }>} */
  const sections = [];
  /** @type {{ heading: string, content: string[] }} */
  let current = { heading: 'Main', content: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (current.content.length > 0 || sections.length === 0) {
        sections.push(current);
      }
      current = { heading: headingMatch[2].trim(), content: [] };
    } else {
      current.content.push(line);
    }
  }
  // Push final section
  sections.push(current);

  return sections.map(s => ({
    heading: s.heading,
    content: s.content.join('\n').trim(),
  }));
}

/**
 * Split long text at paragraph boundaries (double newlines) to stay under maxChars.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function splitAtParagraphs(text, maxChars) {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  /** @type {string[]} */
  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 2 > maxChars && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = para;
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  // If any chunk is still too large (single giant paragraph), hard-split
  /** @type {string[]} */
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      result.push(chunk);
    } else {
      // Hard split at maxChars on word boundary
      let remaining = chunk;
      while (remaining.length > maxChars) {
        let splitIdx = remaining.lastIndexOf(' ', maxChars);
        if (splitIdx < maxChars * 0.5) splitIdx = maxChars; // No good word boundary
        result.push(remaining.slice(0, splitIdx).trim());
        remaining = remaining.slice(splitIdx).trim();
      }
      if (remaining) result.push(remaining);
    }
  }

  return result;
}

/**
 * Split crawled pages into structured chunks suitable for embedding/classification.
 *
 * Rules:
 * - Split by H2/H3 headings
 * - Pages with no headings become a single chunk
 * - Max chunk size: ~2000 tokens (~8000 chars), split at paragraph boundaries
 * - Skip chunks under 50 characters
 *
 * @param {Array<{ url: string, title: string, markdown: string }>} pages
 * @returns {Chunk[]}
 */
function chunkPages(pages) {
  /** @type {Chunk[]} */
  const allChunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    if (!page.markdown || !page.markdown.trim()) continue;

    const sections = splitByHeadings(page.markdown);

    for (const section of sections) {
      if (!section.content || section.content.length < MIN_CHUNK_CHARS) continue;

      // Split large sections at paragraph boundaries
      const subChunks = splitAtParagraphs(section.content, MAX_CHUNK_CHARS);

      for (const content of subChunks) {
        if (content.length < MIN_CHUNK_CHARS) continue;

        allChunks.push({
          page_url: page.url,
          page_title: page.title || '',
          section_heading: section.heading,
          content,
          chunk_index: chunkIndex++,
        });
      }
    }
  }

  return allChunks;
}

module.exports = { chunkPages };
