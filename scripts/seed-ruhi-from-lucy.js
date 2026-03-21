#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * One-time script: Seed Ruhi Brain with Lucy's distilled knowledge.
 *
 * Usage (run on Fly via ssh console, or locally with both DB URLs):
 *   LUCY_DATABASE_URL=... RUHI_DATABASE_URL=... node scripts/seed-ruhi-from-lucy.js
 *
 * Or via fly ssh:
 *   fly ssh console --app ikawn-openbrain
 *   DATABASE_URL=<lucy> RUHI_DATABASE_URL=<ruhi> node scripts/seed-ruhi-from-lucy.js
 */

const { Pool } = require('pg');

const LUCY_URL = process.env.LUCY_DATABASE_URL || process.env.DATABASE_URL;
const RUHI_URL = process.env.RUHI_DATABASE_URL;

if (!LUCY_URL || !RUHI_URL) {
  console.error('Both LUCY_DATABASE_URL (or DATABASE_URL) and RUHI_DATABASE_URL are required.');
  process.exit(1);
}

// Types worth seeding (shared brand knowledge, not personal)
const SEEDABLE_TYPES = [
  'BRAND_VOICE_RULE',
  'BUSINESS_INSIGHT',
  'CONTENT_STRATEGY',
  'AUDIENCE_INSIGHT',
  'PERFORMANCE_INSIGHT',
  'CREATIVE_PATTERN',
  'STRATEGIC_RECOMMENDATION',
  'EXTERNAL_INSIGHT',
  'CROSS_BRAND_INSIGHT',
  'COST_EFFICIENCY',
  // New research types (seed if Lucy already has any)
  'MARKET_INTELLIGENCE',
  'SEO_UPDATE',
  'AD_STRATEGY',
  'PLATFORM_UPDATE',
];

const CONFIDENCE_FACTOR = 0.7; // Reduce confidence for seeded knowledge
const SOURCE_REF = 'lucy-seed-2026-03-21';

async function main() {
  const lucyPool = new Pool({
    connectionString: LUCY_URL,
    ssl: !LUCY_URL.includes('sslmode=disable') ? { rejectUnauthorized: false } : false,
  });
  const ruhiPool = new Pool({
    connectionString: RUHI_URL,
    ssl: !RUHI_URL.includes('sslmode=disable') ? { rejectUnauthorized: false } : false,
  });

  try {
    // Export from Lucy: active distilled memories, shared types only (no user_id)
    const { rows: lucyMemories } = await lucyPool.query(`
      SELECT brand_id, memory_type, content, confidence, reasoning, embedding, embedding_status
      FROM distilled_memory
      WHERE superseded_by IS NULL
        AND user_id IS NULL
        AND memory_type = ANY($1)
      ORDER BY confidence DESC
    `, [SEEDABLE_TYPES]);

    console.log(`[Seed] Found ${lucyMemories.length} distilled memories in Lucy`);

    if (lucyMemories.length === 0) {
      console.log('[Seed] Nothing to seed. Exiting.');
      return;
    }

    // Check what Ruhi already has (avoid duplicates)
    const { rows: [{ count: existingCount }] } = await ruhiPool.query(
      `SELECT COUNT(*)::int AS count FROM distilled_memory WHERE source_event_ids[1]::text = $1`,
      [SOURCE_REF]
    );

    if (existingCount > 0) {
      console.log(`[Seed] Ruhi already has ${existingCount} seeded memories from this run. Skipping.`);
      console.log('[Seed] To re-seed, first delete: DELETE FROM distilled_memory WHERE source_event_ids[1]::text = \'' + SOURCE_REF + '\'');
      return;
    }

    let inserted = 0;
    let skipped = 0;

    for (const mem of lucyMemories) {
      const adjustedConfidence = Math.round(mem.confidence * CONFIDENCE_FACTOR * 100) / 100;
      const seedReasoning = `[Seeded from Lucy ${new Date().toISOString().slice(0, 10)}] ${mem.reasoning || ''}`.trim();

      try {
        if (mem.embedding) {
          // Has embedding — insert with it
          const embeddingStr = typeof mem.embedding === 'string' ? mem.embedding : `{${mem.embedding.join(',')}}`;
          await ruhiPool.query(`
            INSERT INTO distilled_memory (
              brand_id, user_id, memory_type, content, confidence,
              source_event_ids, reasoning, embedding, embedding_status
            ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7::float8[], 'done')
          `, [
            mem.brand_id, mem.memory_type, mem.content, adjustedConfidence,
            [SOURCE_REF], seedReasoning, embeddingStr,
          ]);
        } else {
          // No embedding — let embedding worker pick it up
          await ruhiPool.query(`
            INSERT INTO distilled_memory (
              brand_id, user_id, memory_type, content, confidence,
              source_event_ids, reasoning, embedding_status
            ) VALUES ($1, NULL, $2, $3, $4, $5, $6, 'pending')
          `, [
            mem.brand_id, mem.memory_type, mem.content, adjustedConfidence,
            [SOURCE_REF], seedReasoning,
          ]);
        }
        inserted++;
      } catch (err) {
        console.error(`[Seed] Failed to insert: ${err.message}`);
        skipped++;
      }
    }

    console.log(`[Seed] Complete: ${inserted} inserted, ${skipped} skipped`);

    // Verify
    const { rows: [{ count: finalCount }] } = await ruhiPool.query(
      `SELECT COUNT(*)::int AS count FROM distilled_memory`
    );
    console.log(`[Seed] Ruhi Brain now has ${finalCount} total distilled memories`);
  } finally {
    await lucyPool.end();
    await ruhiPool.end();
  }
}

main().catch(err => {
  console.error('[Seed] Fatal:', err);
  process.exit(1);
});
