/**
 * Backfill Supabase from Fly PG (Lucy only)
 *
 * Copies all existing data from Fly Postgres → Supabase.
 * Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING.
 * Memories: copies all columns EXCEPT embedding (set to NULL for re-embedding in Task 0.9).
 *
 * Usage:
 *   DATABASE_URL=... SUPABASE_DIRECT_URL=... node scripts/backfill-supabase.js
 *
 * On Fly machine:
 *   flyctl ssh console --app ikawn-openbrain -C "node scripts/backfill-supabase.js"
 */

const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BATCH_SIZE = 100;

// Tables in FK-dependency order.
// Each entry: { table, pk, serial?, skipCols?, conflictTarget? }
//   - pk: primary key column(s) for ON CONFLICT
//   - serial: if true, reset the sequence after import
//   - skipCols: columns to exclude from copy (set to NULL in destination)
//   - conflictTarget: override ON CONFLICT target (default: pk)
const TABLES = [
  // Core
  { table: 'users', pk: 'id', serial: true },
  { table: 'brands', pk: 'id' },
  { table: 'brand_users', pk: 'id' },
  { table: 'api_keys', pk: 'id', serial: true },
  { table: 'api_key_usage', pk: 'id', serial: true },

  // Conversations & messages
  { table: 'conversations', pk: 'id', serial: true },
  { table: 'messages', pk: 'id', serial: true },

  // Memories — skip embedding column (will re-embed with 768-dim in Task 0.9)
  { table: 'memories', pk: 'id', serial: true, skipCols: ['embedding'] },

  // Intelligence
  { table: 'distilled_memory', pk: 'id', skipCols: ['embedding'] },
  { table: 'edit_deltas', pk: 'id', serial: true },
  { table: 'mothership_log', pk: 'id', serial: true },

  // Agent platform
  { table: 'scheduled_tasks', pk: 'id', serial: true },
  { table: 'task_runs', pk: 'id', serial: true },
  { table: 'agent_definitions', pk: 'id', serial: true },

  // Brand extras
  { table: 'brand_oauth_tokens', pk: 'id', serial: true },
  { table: 'brand_budgets', pk: 'id' },
  { table: 'brand_context', pk: 'id' },
  { table: 'brand_knowledge', pk: 'id', serial: true },
  { table: 'brand_ratings', pk: 'id', serial: true },

  // OB v2
  { table: 'ob_users', pk: 'id', serial: true },
  { table: 'ob_groups', pk: 'id' },
  { table: 'ob_conversations', pk: 'id' },
  { table: 'ob_decisions', pk: 'id', serial: true },
  { table: 'ob_ingestion_log', pk: 'id', serial: true },

  // ActivePieces
  { table: 'flow_versions', pk: 'id', serial: true },
  { table: 'flow_configs', pk: 'id', serial: true },

  // Settings
  { table: 'settings', pk: 'key' },

  // Governance
  { table: 'action_queue', pk: 'id' },
  { table: 'action_log', pk: 'id' },
  { table: 'cost_catalog', pk: 'id' },

  // Content & intelligence
  { table: 'generations', pk: 'id' },
  { table: 'memory_events', pk: 'id' },
  { table: 'session_summaries', pk: 'id', skipCols: ['embedding'] },
  { table: 'learning_velocity', pk: 'id' },
  { table: 'intelligence_snapshots', pk: 'id', serial: true },

  // Growth & agents
  { table: 'growth_experiments', pk: 'id', serial: true },
  { table: 'weekly_scorecards', pk: 'id', serial: true },
  { table: 'skill_sessions', pk: 'id' },
  { table: 'user_tasks', pk: 'id', serial: true },

  // Lucy v3 tables (from migration 002)
  { table: 'sessions', pk: 'id' },
  { table: 'episodic_memories', pk: 'id', skipCols: ['embedding'] },
  { table: 'semantic_knowledge', pk: 'id', skipCols: ['embedding'] },
  { table: 'task_queue', pk: 'id' },
  { table: 'task_executions', pk: 'id' },
  { table: 'approval_requests', pk: 'id' },
  { table: 'trust_ledger', pk: 'id', serial: true },
  { table: 'trust_scores', pk: '(brand_id, domain)' },
  { table: 'tool_results', pk: 'id' },
  { table: 'cost_events', pk: 'id' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPool(url, label) {
  if (!url) {
    console.error(`ERROR: ${label} environment variable is not set`);
    process.exit(1);
  }
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 15000,
  });
}

/**
 * Get all column names for a table from the source DB.
 */
async function getColumns(pool, tableName) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map((r) => r.column_name);
}

/**
 * Check if a table exists in the database.
 */
async function tableExists(pool, tableName) {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

/**
 * Build a batched INSERT ... ON CONFLICT DO NOTHING statement.
 * Returns { sql, values } for a batch of rows.
 */
function buildBatchInsert(tableName, columns, rows, pkTarget) {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const valueSets = [];
  const values = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders = columns.map(() => `$${paramIdx++}`);
    valueSets.push(`(${placeholders.join(', ')})`);
    for (const col of columns) {
      values.push(row[col] !== undefined ? row[col] : null);
    }
  }

  // Handle composite PK like (brand_id, domain)
  const conflict = pkTarget.startsWith('(') ? pkTarget : `("${pkTarget}")`;
  const sql = `INSERT INTO "${tableName}" (${colList}) VALUES ${valueSets.join(', ')} ON CONFLICT ${conflict} DO NOTHING`;

  return { sql, values };
}

/**
 * Reset a SERIAL sequence to max(id) + 1.
 */
async function resetSequence(pool, tableName, pkCol = 'id') {
  try {
    // Find the sequence name
    const seqRes = await pool.query(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [tableName, pkCol]
    );
    const seqName = seqRes.rows[0]?.seq;
    if (!seqName) return; // No sequence (UUID PK etc.)

    await pool.query(
      `SELECT setval($1, COALESCE((SELECT MAX("${pkCol}") FROM "${tableName}"), 0) + 1, false)`,
      [seqName]
    );
  } catch (err) {
    console.warn(`  Warning: could not reset sequence for ${tableName}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== OpenBrain Backfill: Fly PG → Supabase ===\n');

  const sourcePool = createPool(process.env.DATABASE_URL, 'DATABASE_URL');
  const destPool = createPool(process.env.SUPABASE_DIRECT_URL, 'SUPABASE_DIRECT_URL');

  const results = [];

  for (const spec of TABLES) {
    const { table, pk, serial, skipCols = [] } = spec;

    // Check if table exists in source
    if (!(await tableExists(sourcePool, table))) {
      console.log(`[SKIP] ${table}: does not exist in source DB`);
      results.push({ table, exported: 0, imported: 0, status: 'skipped (no source table)' });
      continue;
    }

    // Check if table exists in destination
    if (!(await tableExists(destPool, table))) {
      console.log(`[SKIP] ${table}: does not exist in destination DB`);
      results.push({ table, exported: 0, imported: 0, status: 'skipped (no dest table)' });
      continue;
    }

    try {
      // Get columns from source
      const allColumns = await getColumns(sourcePool, table);
      // Get columns from destination to find intersection
      const destColumns = await getColumns(destPool, table);
      const destColSet = new Set(destColumns);

      // Filter: skip specified columns, and only include columns that exist in both
      const columns = allColumns.filter(
        (c) => !skipCols.includes(c) && destColSet.has(c)
      );

      if (columns.length === 0) {
        console.log(`[SKIP] ${table}: no overlapping columns`);
        results.push({ table, exported: 0, imported: 0, status: 'skipped (no columns)' });
        continue;
      }

      // Count source rows
      const countRes = await sourcePool.query(`SELECT COUNT(*) AS cnt FROM "${table}"`);
      const totalRows = parseInt(countRes.rows[0].cnt, 10);

      if (totalRows === 0) {
        console.log(`[SKIP] ${table}: empty (0 rows)`);
        results.push({ table, exported: 0, imported: 0, status: 'empty' });
        continue;
      }

      // Fetch all rows from source (columns that we want)
      const colSelect = columns.map((c) => `"${c}"`).join(', ');
      const fetchRes = await sourcePool.query(`SELECT ${colSelect} FROM "${table}" ORDER BY "${columns[0]}"`);
      const rows = fetchRes.rows;

      let importedCount = 0;
      // Determine conflict target
      const pkTarget = spec.conflictTarget || pk;

      // Batch insert
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { sql, values } = buildBatchInsert(table, columns, batch, pkTarget);

        try {
          const insertRes = await destPool.query(sql, values);
          importedCount += insertRes.rowCount || 0;
        } catch (err) {
          console.error(`  [ERROR] ${table} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
          // Log the first row's values for debugging
          if (batch.length > 0) {
            console.error(`  First row keys: ${Object.keys(batch[0]).join(', ')}`);
          }
        }
      }

      // Reset sequence for serial PKs
      if (serial) {
        await resetSequence(destPool, table);
      }

      const skippedNote = skipCols.length > 0 ? ` (skipped: ${skipCols.join(', ')})` : '';
      console.log(`[OK] ${table}: ${totalRows} exported, ${importedCount} imported${skippedNote}`);
      results.push({ table, exported: totalRows, imported: importedCount, status: 'ok' });
    } catch (err) {
      console.error(`[FAIL] ${table}: ${err.message}`);
      results.push({ table, exported: 0, imported: 0, status: `failed: ${err.message}` });
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log('-'.repeat(70));
  console.log(`${'Table'.padEnd(30)} ${'Exported'.padStart(10)} ${'Imported'.padStart(10)} Status`);
  console.log('-'.repeat(70));
  for (const r of results) {
    console.log(
      `${r.table.padEnd(30)} ${String(r.exported).padStart(10)} ${String(r.imported).padStart(10)} ${r.status}`
    );
  }
  console.log('-'.repeat(70));

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.filter((r) => r.status.startsWith('failed')).length;
  const skipCount = results.filter((r) => r.status.startsWith('skipped') || r.status === 'empty').length;
  console.log(`\nTotal: ${okCount} ok, ${failCount} failed, ${skipCount} skipped`);

  await sourcePool.end();
  await destPool.end();

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
