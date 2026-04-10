#!/usr/bin/env node
'use strict';

// Set DATABASE_URL env var before running this script
const { pool } = require('../src/db');
const { classifyByKeywords } = require('../src/engine/domain-taxonomy');

async function backfillDomains() {
  console.log('Starting domain backfill...');

  // Backfill semantic_knowledge
  const semantic = await pool.query(`
    SELECT id, content FROM semantic_knowledge
    WHERE domain IS NULL AND superseded_by IS NULL
  `);
  console.log(`Found ${semantic.rows.length} semantic_knowledge rows to classify`);

  let semanticUpdated = 0;
  for (const row of semantic.rows) {
    const domain = classifyByKeywords(row.content);
    if (domain) {
      await pool.query('UPDATE semantic_knowledge SET domain = $1 WHERE id = $2', [domain, row.id]);
      semanticUpdated++;
    }
  }
  console.log(`Updated ${semanticUpdated} semantic_knowledge rows`);

  // Backfill distilled_memory
  const distilled = await pool.query(`
    SELECT id, content FROM distilled_memory
    WHERE domain IS NULL AND superseded_by IS NULL
  `);
  console.log(`Found ${distilled.rows.length} distilled_memory rows to classify`);

  let distilledUpdated = 0;
  for (const row of distilled.rows) {
    const domain = classifyByKeywords(row.content);
    if (domain) {
      await pool.query('UPDATE distilled_memory SET domain = $1 WHERE id = $2', [domain, row.id]);
      distilledUpdated++;
    }
  }
  console.log(`Updated ${distilledUpdated} distilled_memory rows`);

  console.log('Domain backfill complete.');
  await pool.end();
  process.exit(0);
}

backfillDomains().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
