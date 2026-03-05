const { initSchema, pool } = require('../src/db');

async function run() {
  try {
    await initSchema();
    console.log('Database initialization complete');
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
