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

    // ── OpenBrain v3: Tenancy ──

    // brands table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        tier VARCHAR(50) DEFAULT 'starter',
        status VARCHAR(50) DEFAULT 'active',
        gdpr_region VARCHAR(10) DEFAULT 'global',
        data_retention_days INT DEFAULT 730,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO brands (brand_id, name, tier) VALUES ('ikawn', 'iKawn Technologies', 'enterprise')
      ON CONFLICT (brand_id) DO NOTHING
    `);

    // brand_users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
        user_id INTEGER REFERENCES users(id),
        role VARCHAR(50) DEFAULT 'member',
        channels TEXT[] DEFAULT '{}',
        gdpr_consent BOOLEAN DEFAULT FALSE,
        gdpr_consent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── OpenBrain v3: Add brand_id + v3 columns to memories ──
    await client.query(`
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_score FLOAT;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS moderation_flags TEXT[] DEFAULT '{}';
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // Backfill existing memories
    await client.query(`
      UPDATE memories SET embedding_status = 'done', brand_id = 'ikawn' WHERE embedding IS NOT NULL AND brand_id IS NULL;
      UPDATE memories SET embedding_status = 'pending' WHERE embedding IS NULL AND embedding_status IS NULL;
      UPDATE memories SET brand_id = 'ikawn' WHERE brand_id IS NULL;
    `);

    // Add brand_id to conversations, messages, ob_decisions
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
      ALTER TABLE ob_decisions ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn';
    `);

    // Add UUID column to conversations (P3: don't expose sequential IDs in URLs)
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();
      UPDATE conversations SET uuid = gen_random_uuid() WHERE uuid IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_uuid ON conversations(uuid);
    `);

    // Shareable conversations
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS share_token UUID;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_share_token ON conversations(share_token) WHERE share_token IS NOT NULL;
    `);

    // ── OpenBrain v3: edit_deltas — highest priority training data ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS edit_deltas (
        id BIGSERIAL PRIMARY KEY,
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        agent_name VARCHAR(100) NOT NULL,
        generation_id UUID,
        session_id UUID,
        delta_type VARCHAR(50) NOT NULL,
        original_prompt TEXT,
        revised_prompt TEXT,
        original_output TEXT,
        edited_output TEXT,
        selected_urls TEXT[] DEFAULT '{}',
        rejected_urls TEXT[] DEFAULT '{}',
        model_used VARCHAR(100),
        user_signal VARCHAR(50) DEFAULT 'implicit',
        promoted_to_mothership BOOLEAN DEFAULT FALSE,
        anonymised BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── OpenBrain v3: generations ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS generations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        agent_name VARCHAR(100) NOT NULL,
        prompt TEXT NOT NULL,
        output_type VARCHAR(50) NOT NULL,
        output_urls TEXT[] DEFAULT '{}',
        output_metadata JSONB DEFAULT '{}',
        model_used VARCHAR(100),
        credits_consumed FLOAT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        session_id UUID,
        memory_id INTEGER,
        ikawn_generation_id TEXT,
        callback_received BOOLEAN DEFAULT FALSE,
        batch_size INT DEFAULT 4,
        output_count INT DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add batch_size + output_count if missing (existing DBs)
    await client.query(`
      ALTER TABLE generations ADD COLUMN IF NOT EXISTS batch_size INT DEFAULT 4;
      ALTER TABLE generations ADD COLUMN IF NOT EXISTS output_count INT DEFAULT 0;
    `);

    // ── OpenBrain v3: brand_context ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_context (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) UNIQUE NOT NULL,
        industry VARCHAR(100),
        tone_of_voice TEXT,
        target_audience TEXT,
        brand_guidelines JSONB DEFAULT '{}',
        connected_platforms TEXT[] DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO brand_context (brand_id, industry) VALUES ('ikawn', 'AI SaaS / Commerce Tech')
      ON CONFLICT (brand_id) DO NOTHING
    `);

    // ── OpenBrain v3: brand_ratings ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_ratings (
        id BIGSERIAL PRIMARY KEY,
        brand_id VARCHAR(100) NOT NULL,
        rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
        abuse_flags INT DEFAULT 0,
        inappropriate_content_count INT DEFAULT 0,
        notes TEXT,
        rated_by VARCHAR(255),
        rated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── OpenBrain v3: mothership_log ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS mothership_log (
        id BIGSERIAL PRIMARY KEY,
        source_brand_id VARCHAR(100),
        data_type VARCHAR(100) NOT NULL,
        anonymised_payload JSONB NOT NULL,
        demographic_tags JSONB DEFAULT '{}',
        signal_strength FLOAT,
        promoted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── OpenBrain v4: API Keys Management ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix VARCHAR(16) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER REFERENCES users(id),
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_key_usage (
        id BIGSERIAL PRIMARY KEY,
        api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
        endpoint TEXT NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Index for fast hash lookups during auth
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL
    `);

    // Index for usage log queries (by key + time)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage(api_key_id, created_at DESC)
    `);

    // ── OpenBrain v3: Indexes ──
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_brand ON memories(brand_id);
      -- idx_memories_source_ref replaced by unique index below
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived) WHERE archived = false;
      CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status) WHERE embedding_status = 'pending';
      CREATE INDEX IF NOT EXISTS idx_edit_deltas_brand ON edit_deltas(brand_id);
      CREATE INDEX IF NOT EXISTS idx_edit_deltas_agent ON edit_deltas(agent_name);
      CREATE INDEX IF NOT EXISTS idx_edit_deltas_type ON edit_deltas(delta_type);
      CREATE INDEX IF NOT EXISTS idx_generations_brand ON generations(brand_id);
      CREATE INDEX IF NOT EXISTS idx_generations_agent ON generations(agent_name);
    `);

    // Make source_ref unique for ON CONFLICT to work (if not already)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_ref_unique ON memories(source_ref) WHERE source_ref IS NOT NULL
    `);

    // ── OpenBrain v5: Intelligence Layer ──

    // memory_events — raw event inbox (append-only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_events_brand_type_created
        ON memory_events (brand_id, event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_events_unprocessed
        ON memory_events (created_at) WHERE processed_at IS NULL;
    `);

    // distilled_memory — learned knowledge with reasoning and embeddings
    await client.query(`
      CREATE TABLE IF NOT EXISTS distilled_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence FLOAT NOT NULL DEFAULT 0.5,
        source_event_ids UUID[] DEFAULT '{}',
        reasoning TEXT,
        superseded_by UUID REFERENCES distilled_memory(id),
        embedding float8[],
        embedding_status VARCHAR(20) DEFAULT 'pending',
        last_used TIMESTAMPTZ,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_distilled_brand_type
        ON distilled_memory (brand_id, memory_type);
      CREATE INDEX IF NOT EXISTS idx_distilled_active_brand
        ON distilled_memory (brand_id)
        WHERE superseded_by IS NULL;
    `);

    // session_summaries — compressed conversation history
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL UNIQUE,
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        summary TEXT NOT NULL,
        key_decisions JSONB DEFAULT '[]',
        open_threads JSONB DEFAULT '[]',
        embedding float8[],
        embedding_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // learning_velocity — metrics tracking improvement over time
    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_velocity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
        metric_type TEXT NOT NULL,
        metric_value FLOAT NOT NULL,
        measured_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_velocity_brand
        ON learning_velocity (brand_id, metric_type, measured_at);
    `);

    console.log('Database schema initialized (v5)');
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
