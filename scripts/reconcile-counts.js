/**
 * Reconcile row counts between Fly PG and Supabase
 *
 * Compares row counts for all tables across both databases.
 * Used after backfill to verify data integrity.
 *
 * Usage:
 *   DATABASE_URL=... SUPABASE_DIRECT_URL=... node scripts/reconcile-counts.js
 *
 * On Fly machine:
 *   flyctl ssh console --app ikawn-openbrain -C "node scripts/reconcile-counts.js"
 */

const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function createPool(url, label) {
  if (!url) {
    console.error(`ERROR: ${label} environment variable is not set`);
    process.exit(1);
  }
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 15000,
  });
}

// All tables to check (superset of backfill + lucy v3)
const ALL_TABLES = [
  'users', 'brands', 'brand_users', 'api_keys', 'api_key_usage',
  'conversations', 'messages',
  'memories',
  'distilled_memory', 'edit_deltas', 'mothership_log',
  'scheduled_tasks', 'task_runs', 'agent_definitions',
  'brand_oauth_tokens', 'brand_budgets', 'brand_context', 'brand_knowledge', 'brand_ratings',
  'ob_users', 'ob_groups', 'ob_conversations', 'ob_decisions', 'ob_ingestion_log',
  'flow_versions', 'flow_configs',
  'settings',
  'action_queue', 'action_log', 'cost_catalog',
  'generations', 'memory_events', 'session_summaries', 'learning_velocity', 'intelligence_snapshots',
  'growth_experiments', 'weekly_scorecards', 'skill_sessions', 'user_tasks',
  // Lucy v3 tables
  'sessions', 'episodic_memories', 'semantic_knowledge',
  'task_queue', 'task_executions', 'approval_requests',
  'trust_ledger', 'trust_scores', 'tool_results', 'cost_events',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tableExists(pool, tableName) {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return res.rows.length > 0;
}

async function getCount(pool, tableName) {
  const res = await pool.query(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
  return parseInt(res.rows[0].cnt, 10);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== OpenBrain Reconciliation: Fly PG vs Supabase ===\n');

  const flyPool = createPool(process.env.DATABASE_URL, 'DATABASE_URL');
  const supaPool = createPool(process.env.SUPABASE_DIRECT_URL, 'SUPABASE_DIRECT_URL');

  const results = [];

  for (const table of ALL_TABLES) {
    const flyExists = await tableExists(flyPool, table);
    const supaExists = await tableExists(supaPool, table);

    if (!flyExists && !supaExists) {
      results.push({ table, fly: '-', supa: '-', status: 'SKIP (neither)' });
      continue;
    }
    if (!flyExists) {
      const supaCount = await getCount(supaPool, table);
      results.push({ table, fly: '-', supa: supaCount, status: 'SKIP (no source)' });
      continue;
    }
    if (!supaExists) {
      const flyCount = await getCount(flyPool, table);
      results.push({ table, fly: flyCount, supa: '-', status: 'SKIP (no dest)' });
      continue;
    }

    const flyCount = await getCount(flyPool, table);
    const supaCount = await getCount(supaPool, table);
    const match = flyCount === supaCount;

    results.push({
      table,
      fly: flyCount,
      supa: supaCount,
      status: match ? 'PASS' : `FAIL (diff: ${supaCount - flyCount})`,
    });
  }

  // Output
  console.log(`${'Table'.padEnd(30)} ${'Fly PG'.padStart(10)} ${'Supabase'.padStart(10)}  Status`);
  console.log('-'.repeat(75));

  for (const r of results) {
    const statusColor = r.status === 'PASS' ? '\x1b[32m' : r.status.startsWith('FAIL') ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(
      `${r.table.padEnd(30)} ${String(r.fly).padStart(10)} ${String(r.supa).padStart(10)}  ${statusColor}${r.status}${reset}`
    );
  }

  console.log('-'.repeat(75));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status.startsWith('FAIL')).length;
  const skipped = results.filter((r) => r.status.startsWith('SKIP')).length;
  const empty = results.filter((r) => r.fly === 0 && r.supa === 0).length;

  console.log(`\n${passed} tables match, ${failed} discrepancies, ${skipped} skipped`);
  if (empty > 0) console.log(`(${empty} of the matching tables are empty)`);

  await flyPool.end();
  await supaPool.end();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
