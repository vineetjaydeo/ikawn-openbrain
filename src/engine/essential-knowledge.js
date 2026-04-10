'use strict';

const { pool } = require('../db');

const MAX_ESSENTIAL_CHARS = 3200; // ~800 tokens

/**
 * Load L1 essential knowledge — top semantic facts + user preferences.
 * Injected at session start, always present in context.
 */
async function loadEssentialKnowledge(brandId, userId) {
  const sections = [];

  // Top semantic facts by composite score: confidence + reference frequency + recency
  try {
    const facts = await pool.query(`
      SELECT content, fact_type, confidence, times_referenced
      FROM semantic_knowledge
      WHERE brand_id = $1
        AND superseded_by IS NULL
        AND confidence >= 0.7
      ORDER BY
        (confidence * 0.4
         + LEAST(1.0, LN(GREATEST(times_referenced, 0) + 1) / LN(20)) * 0.3
         + (1.0 / (1.0 + EXTRACT(EPOCH FROM NOW() - COALESCE(updated_at, created_at)) / 2592000.0)) * 0.3
        ) DESC
      LIMIT 15
    `, [brandId]);

    if (facts.rows.length > 0) {
      const lines = facts.rows.map(r => `- ${r.content}`);
      sections.push(`## Known Facts\n${lines.join('\n')}`);
    }
  } catch (err) {
    console.warn('[essential-knowledge] Failed to load semantic facts:', err.message);
  }

  // User preferences (personal memories)
  if (userId) {
    try {
      const prefs = await pool.query(`
        SELECT content, confidence
        FROM distilled_memory
        WHERE brand_id = $1 AND user_id = $2
          AND superseded_by IS NULL
          AND memory_type = 'USER_PREFERENCE'
        ORDER BY confidence DESC
        LIMIT 5
      `, [brandId, userId]);

      if (prefs.rows.length > 0) {
        const lines = prefs.rows.map(r => `- ${r.content}`);
        sections.push(`## Your Preferences\n${lines.join('\n')}`);
      }
    } catch (err) {
      console.warn('[essential-knowledge] Failed to load user preferences:', err.message);
    }
  }

  // Active KG relationships (Phase 1 integration)
  try {
    const triples = await pool.query(`
      SELECT e_s.name AS subject, t.predicate, e_o.name AS object
      FROM kg_triples t
      JOIN kg_entities e_s ON t.subject = e_s.id
      JOIN kg_entities e_o ON t.object = e_o.id
      WHERE t.brand_id = $1 AND t.valid_to IS NULL AND t.confidence >= 0.8
      ORDER BY t.extracted_at DESC
      LIMIT 10
    `, [brandId]);

    if (triples.rows.length > 0) {
      const lines = triples.rows.map(r => `- ${r.subject} ${r.predicate.replace(/_/g, ' ')} ${r.object}`);
      sections.push(`## Active Relationships\n${lines.join('\n')}`);
    }
  } catch (err) {
    // KG tables may not exist yet — silently skip
  }

  if (sections.length === 0) return null;

  let output = sections.join('\n\n');
  if (output.length > MAX_ESSENTIAL_CHARS) {
    output = output.slice(0, MAX_ESSENTIAL_CHARS - 3) + '...';
  }
  return output;
}

module.exports = { loadEssentialKnowledge };
