const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const useSSL = !connectionString.includes('sslmode=disable');

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding float8[],
        source TEXT DEFAULT 'manual',
        tags TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create a helper function for cosine similarity
    await client.query(`
      CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[])
      RETURNS float8 AS $$
      DECLARE
        dot_product float8 := 0;
        norm_a float8 := 0;
        norm_b float8 := 0;
        i int;
      BEGIN
        FOR i IN 1..array_length(a, 1) LOOP
          dot_product := dot_product + a[i] * b[i];
          norm_a := norm_a + a[i] * a[i];
          norm_b := norm_b + b[i] * b[i];
        END LOOP;
        IF norm_a = 0 OR norm_b = 0 THEN RETURN 0; END IF;
        RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);

    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
