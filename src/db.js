const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT,
        role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      )
    `);

    // Add password_hash column if missing (existing DBs)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);

    // ── OpenBrain v2: Evolve memories table ──
    await client.query(`
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'private';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'note';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS author TEXT DEFAULT 'vineet';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS signed_off_by TEXT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS project TEXT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS conversation_id UUID;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS group_id TEXT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS hashtags TEXT[];
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_url TEXT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_ref TEXT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    `);

    // ── OpenBrain v2: New tables ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS ob_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        role TEXT NOT NULL,
        access_levels TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ob_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        members TEXT[],
        default_access_level TEXT DEFAULT 'private',
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ob_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        group_id TEXT,
        access_level TEXT DEFAULT 'private',
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_activity TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ob_decisions (
        id SERIAL PRIMARY KEY,
        decision TEXT NOT NULL,
        context TEXT,
        decided_by TEXT,
        signed_off_by TEXT,
        project TEXT,
        access_level TEXT DEFAULT 'management',
        hashtags TEXT[],
        decided_at TIMESTAMPTZ DEFAULT NOW(),
        memory_id INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ob_ingestion_log (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT,
        records_added INTEGER DEFAULT 0,
        error_message TEXT,
        ran_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed admin user with default password
    const adminHash = await bcrypt.hash('openbrain2024', 10);
    await client.query(`
      INSERT INTO users (email, name, role, status, password_hash)
      VALUES ('v@ikawn.com', 'Vineet', 'admin', 'active', $1)
      ON CONFLICT (email) DO UPDATE SET password_hash = COALESCE(users.password_hash, $1)
    `, [adminHash]);

    // Chat tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT DEFAULT 'New Chat',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT,
        attachments JSONB DEFAULT '[]',
        model TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── OpenBrain v2: Seed ob_users ──
    await client.query(`
      INSERT INTO ob_users (name, email, role, access_levels) VALUES
        ('Vineet', 'vineet@ikawn.com', 'owner', ARRAY['private','management','internal','advisors','investors','public']),
        ('Avinash', 'avinash@ikawn.com', 'c_suite', ARRAY['management','internal','public']),
        ('Abhishek', 'abhishek@ikawn.com', 'management', ARRAY['internal','public'])
      ON CONFLICT (email) DO NOTHING
    `);

    // ── OpenBrain v2: Seed ob_groups ──
    await client.query(`
      INSERT INTO ob_groups (id, name, description, members, default_access_level, created_by) VALUES
        ('vineet_ruhi', 'Vineet & Ruhi', 'Private channel between Vineet and Ruhi', ARRAY['vineet@ikawn.com'], 'private', 'vineet'),
        ('management', 'Management', 'C-suite and management discussions', ARRAY['vineet@ikawn.com','avinash@ikawn.com','abhishek@ikawn.com'], 'management', 'vineet'),
        ('advisors', 'Advisors', 'Advisory board channel', ARRAY['vineet@ikawn.com'], 'advisors', 'vineet'),
        ('investors', 'Investors', 'Investor updates channel', ARRAY['vineet@ikawn.com'], 'investors', 'vineet')
      ON CONFLICT (id) DO NOTHING
    `);

    // Seed default model settings
    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('primary_model', '"gpt-4o-mini"'),
        ('secondary_model', '"gpt-4o"')
      ON CONFLICT (key) DO NOTHING
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
