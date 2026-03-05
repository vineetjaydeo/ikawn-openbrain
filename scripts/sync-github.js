const { syncAll } = require('../src/connectors/github');
const { pool } = require('../src/db');

async function run() {
  try {
    console.log('Running full GitHub sync...');
    const results = await syncAll();
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('GitHub sync failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
