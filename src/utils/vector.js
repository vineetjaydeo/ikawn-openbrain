'use strict';

/**
 * Format a JavaScript number array as a pgvector literal string.
 * pgvector expects '[1,2,3,...]' format for vector type casting.
 *
 * @param {number[]} arr - Embedding array (e.g., 768-dim from Gemini)
 * @returns {string} pgvector-compatible string like '[0.1,0.2,...]'
 */
function toVector(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  return `[${arr.join(',')}]`;
}

module.exports = { toVector };
