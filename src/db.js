const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL || '';
const useSSL = !connectionString.includes('sslmode=disable');

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// ikawn-v3 read-only connection (for intelligence worker)
const ikawnOsPool = process.env.IKAWN_OS_DATABASE_URL
  ? new Pool({
      connectionString: process.env.IKAWN_OS_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: !process.env.IKAWN_OS_DATABASE_URL.includes('sslmode=disable')
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

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

    // External ID for brand API users (cuid from ikawn-v3)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_idx ON users(external_id) WHERE external_id IS NOT NULL;
    `);

    // Custom instructions per user (appended to Ruhi's system prompt)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_instructions TEXT
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

    // Dynamic model tier tracking
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS tier TEXT
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

    // Add org_id column to brands (org model support)
    await client.query(`
      ALTER TABLE brands ADD COLUMN IF NOT EXISTS org_id VARCHAR(100)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_brands_org_id ON brands(org_id) WHERE org_id IS NOT NULL
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

    // ── Multi-user isolation: user_id on memories ──
    await client.query(`
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id) WHERE user_id IS NOT NULL;
    `);
    // Backfill: assign all existing memories to the admin user (Vineet)
    await client.query(`
      UPDATE memories SET user_id = (SELECT id FROM users WHERE email = 'v@ikawn.com' LIMIT 1)
      WHERE user_id IS NULL
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

    // Source tracking for external conversations (Telegram, etc.)
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source VARCHAR(100);
      CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source) WHERE source IS NOT NULL;
    `);

    // Unsaid words — draft text saved per conversation
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS draft_text TEXT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;
    `);

    // Context Card — living conversation summary for smart tier detection
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_summary JSONB DEFAULT NULL;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_msg_count INTEGER DEFAULT 0;
    `);

    // Context compression — track when conversation was last compressed
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS compressed_at TIMESTAMPTZ;
    `);

    // Hashtags for conversation filtering
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
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

    // P2.2: Per-brand persona columns
    await client.query(`
      ALTER TABLE brand_context ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE brand_context ADD COLUMN IF NOT EXISTS tone TEXT;
      ALTER TABLE brand_context ADD COLUMN IF NOT EXISTS system_prompt_override TEXT;
      ALTER TABLE brand_context ADD COLUMN IF NOT EXISTS context_injection TEXT;
    `);

    await client.query(`
      INSERT INTO brand_context (brand_id, industry, display_name) VALUES ('ikawn', 'AI SaaS / Commerce Tech', 'iKawn Technologies')
      ON CONFLICT (brand_id) DO UPDATE SET display_name = COALESCE(brand_context.display_name, 'iKawn Technologies')
    `);

    // ── P2.3: Per-brand knowledge base ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_knowledge (
        id SERIAL PRIMARY KEY,
        brand_id VARCHAR(100) NOT NULL,
        doc_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, doc_type)
      )
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

    // user_id on api_keys (Wave 1: user-scoped intelligence)
    await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);

    // org_id on api_keys (Wave 2: multi-tenant org model)
    await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS org_id VARCHAR(100)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id) WHERE org_id IS NOT NULL`);

    // brand_id on api_keys (P2.4: direct API key → brand mapping)
    await client.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100) DEFAULT 'ikawn'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_brand_id ON api_keys(brand_id)`);

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

    // user_id on memory_events (Wave 1: user-scoped intelligence)
    await client.query(`ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_events_brand_type_created
        ON memory_events (brand_id, event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_events_unprocessed
        ON memory_events (created_at) WHERE processed_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_memory_events_user
        ON memory_events (brand_id, user_id, event_type, created_at);
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

    // user_id on distilled_memory (Wave 1: user-scoped intelligence)
    await client.query(`ALTER TABLE distilled_memory ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_distilled_brand_type
        ON distilled_memory (brand_id, memory_type);
      CREATE INDEX IF NOT EXISTS idx_distilled_active_brand
        ON distilled_memory (brand_id)
        WHERE superseded_by IS NULL;
      CREATE INDEX IF NOT EXISTS idx_distilled_user_brand
        ON distilled_memory (brand_id, user_id, memory_type)
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

    // user_id on session_summaries (Wave 1: user-scoped intelligence)
    await client.query(`ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);

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

    // ── OpenBrain v6: Governance Layer ──

    // brand_budgets — per-brand credit budgets with atomic enforcement
    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL UNIQUE,
        budget_monthly_credits INTEGER NOT NULL DEFAULT 0,
        spent_monthly_credits INTEGER NOT NULL DEFAULT 0,
        budget_reset_day INTEGER NOT NULL DEFAULT 1,
        auto_pause_at_percent INTEGER NOT NULL DEFAULT 100,
        warn_at_percent INTEGER NOT NULL DEFAULT 80,
        auto_approve_above FLOAT NOT NULL DEFAULT 0.8,
        human_required_below FLOAT NOT NULL DEFAULT 0.6,
        status TEXT NOT NULL DEFAULT 'active',
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // action_queue — approval state machine
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100),
        action_type TEXT NOT NULL,
        sub_type TEXT,
        payload JSONB NOT NULL,
        estimated_cost_credits INTEGER NOT NULL DEFAULT 0,
        confidence FLOAT NOT NULL,
        reasoning TEXT NOT NULL,
        memories_used UUID[] DEFAULT '{}',
        governance_result TEXT NOT NULL DEFAULT 'pending',
        governance_reason TEXT,
        reviewed_by VARCHAR(100),
        feedback TEXT,
        reviewed_at TIMESTAMPTZ,
        executed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_action_queue_pending
        ON action_queue (brand_id, governance_result, created_at)
        WHERE governance_result IN ('pending', 'awaiting_human');
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_action_queue_brand_time
        ON action_queue (brand_id, created_at)
    `);

    // action_log — immutable audit trail with real costs
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_queue_id UUID NOT NULL,
        brand_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100),
        action_type TEXT NOT NULL,
        actual_cost_credits INTEGER NOT NULL DEFAULT 0,
        cost_breakdown JSONB DEFAULT '{}',
        outcome_status TEXT NOT NULL DEFAULT 'success',
        outcome_details JSONB DEFAULT '{}',
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_action_log_brand
        ON action_log (brand_id, executed_at)
    `);

    // cost_catalog — what things cost (versioned, effective dates)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cost_catalog (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_type TEXT NOT NULL,
        sub_type TEXT,
        cost_credits INTEGER NOT NULL,
        description TEXT,
        effective_from TIMESTAMPTZ DEFAULT NOW(),
        effective_until TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cost_catalog_lookup
        ON cost_catalog (action_type, sub_type)
        WHERE effective_until IS NULL
    `);

    // Seed cost catalog (only if empty)
    const { rows: existingCosts } = await client.query('SELECT COUNT(*)::int as count FROM cost_catalog');
    if (existingCosts[0].count === 0) {
      const seeds = [
        ['generate_content', 'genie', 1, 'Text-to-image (1 credit)'],
        ['generate_content', 'remix_standard', 2, 'Remix standard'],
        ['generate_content', 'remix_hd', 6, 'HD Remix'],
        ['generate_content', 'prism', 15, 'Prism creative shot'],
        ['generate_content', 'lazarus', 20, 'Image-to-video'],
        ['generate_content', 'muse', 40, 'Marketing video'],
        ['post_instagram', null, 0, 'Post to Instagram (API only)'],
        ['llm_reflection', null, 1, 'Per reflection LLM call'],
        ['llm_generation', null, 2, 'Per content generation LLM call'],
        ['brave_search', null, 0, 'Search query (free tier)'],
      ];
      for (const [action_type, sub_type, cost, desc] of seeds) {
        await client.query(
          'INSERT INTO cost_catalog (action_type, sub_type, cost_credits, description) VALUES ($1, $2, $3, $4)',
          [action_type, sub_type, cost, desc]
        );
      }
      console.log('[Schema] Cost catalog seeded');
    }

    // ── OpenBrain v7: Intelligence Layer — Cohort Intelligence ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS intelligence_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_type VARCHAR(50) NOT NULL,
        period VARCHAR(20) NOT NULL,
        data JSONB NOT NULL,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_type_period ON intelligence_snapshots(snapshot_type, period);
      CREATE INDEX IF NOT EXISTS idx_snapshots_created ON intelligence_snapshots(created_at DESC);
    `);

    // ── times_used on distilled_memory (recall weighted scoring) ──
    await client.query(`
      ALTER TABLE distilled_memory ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
    `);

    // ── source on memory_events (signal origin tracking) ──
    await client.query(`
      ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'system';
    `);

    // ── OpenBrain v8: Agent Platform ──

    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid() UNIQUE,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        user_id INTEGER REFERENCES users(id),
        agent_slug TEXT NOT NULL DEFAULT 'ruhi',
        name TEXT NOT NULL,
        description TEXT,
        tier TEXT NOT NULL DEFAULT 'direct',
        tool TEXT NOT NULL,
        config JSONB DEFAULT '{}',
        schedule_type TEXT NOT NULL,
        cron_expression TEXT,
        interval_minutes INTEGER,
        run_after TIMESTAMPTZ,
        trigger_event TEXT,
        active_window_start TIME DEFAULT '07:00',
        active_window_end TIME DEFAULT '19:00',
        timezone TEXT DEFAULT 'Asia/Calcutta',
        enabled BOOLEAN DEFAULT true,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        last_status TEXT,
        last_error TEXT,
        run_count INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        requires_approval BOOLEAN DEFAULT false,
        max_cost_per_run NUMERIC(8,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks (next_run_at) WHERE enabled = true;
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_brand ON scheduled_tasks (brand_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES scheduled_tasks(id),
        agent_slug TEXT NOT NULL,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status TEXT DEFAULT 'running',
        tier TEXT NOT NULL,
        result JSONB,
        error TEXT,
        cost_usd NUMERIC(8,4) DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        plan JSONB,
        approval_message TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs (task_id, started_at DESC);
    `);
    await client.query(`
      ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
    `);
    await client.query(`
      ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS brand_id VARCHAR(100);
    `);
    await client.query(`
      UPDATE task_runs SET brand_id = (SELECT brand_id FROM scheduled_tasks WHERE id = task_runs.task_id)
      WHERE brand_id IS NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_brand ON task_runs(brand_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS domain_agents (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        persona TEXT NOT NULL,
        tools TEXT[] NOT NULL,
        memory_tags TEXT[],
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS brand_oauth_tokens (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        provider TEXT NOT NULL,
        scopes TEXT[] NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, provider)
      )
    `);

    // ── OpenBrain v8.1: Agent Support Tables ──

    await client.query(`
      CREATE TABLE IF NOT EXISTS growth_experiments (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        agent_slug TEXT NOT NULL DEFAULT 'growth',
        name TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        channel TEXT,
        target_reps INTEGER NOT NULL DEFAULT 100,
        current_reps INTEGER NOT NULL DEFAULT 0,
        metric_name TEXT NOT NULL,
        metric_baseline FLOAT,
        metric_current FLOAT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'evaluating', 'scaled', 'killed')),
        outcome TEXT,
        started_at TIMESTAMPTZ,
        evaluated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_growth_experiments_brand_status ON growth_experiments(brand_id, status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_scorecards (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL DEFAULT 'ikawn',
        week_start DATE NOT NULL,
        compiled_by TEXT NOT NULL DEFAULT 'ruhi',
        sections JSONB NOT NULL DEFAULT '{}',
        highlights TEXT[],
        blockers TEXT[],
        score FLOAT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, week_start)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weekly_scorecards_brand_week ON weekly_scorecards(brand_id, week_start DESC);
    `);

    // ── OpenBrain v9: Skill Sessions (Brand Onboarding Wizard) ──

    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_sessions (
        id TEXT PRIMARY KEY,
        skill_name VARCHAR(50) NOT NULL,
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        current_step VARCHAR(50) NOT NULL DEFAULT 'init',
        state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_sessions_org ON skill_sessions(org_id);
      CREATE INDEX IF NOT EXISTS idx_skill_sessions_user ON skill_sessions(user_id);
    `);

    // ── Brand admin isolation: unique constraint + seed ──
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_users_brand_user ON brand_users(brand_id, user_id);
    `);
    await client.query(`
      INSERT INTO brand_users (brand_id, user_id, role)
      SELECT 'ikawn', id, 'admin' FROM users WHERE email = 'v@ikawn.com'
      ON CONFLICT (brand_id, user_id) DO NOTHING;
    `);

    // ── OpenBrain v10: User Tasks (Ruhi task relay) ──

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tasks (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid(),
        brand_id TEXT DEFAULT 'ikawn',
        title TEXT NOT NULL,
        description TEXT,
        assigned_to INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        created_by_name TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        source TEXT DEFAULT 'ruhi',
        conversation_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tasks_assigned ON user_tasks(assigned_to, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tasks_uuid ON user_tasks(uuid);
    `);

    // ── ActivePieces Integration: flow_versions table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS flow_versions (
        id SERIAL PRIMARY KEY,
        flow_id TEXT NOT NULL,
        version INT NOT NULL,
        display_name TEXT,
        definition JSONB NOT NULL,
        created_by TEXT,
        reason TEXT,
        performance JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(flow_id, version)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flow_versions_flow ON flow_versions(flow_id);
      CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_version ON flow_versions(flow_id, version DESC);
    `);

    // ── Flow Configs: runtime intelligence for AP flows ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS flow_configs (
        id SERIAL PRIMARY KEY,
        flow_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        config JSONB NOT NULL DEFAULT '{}',
        updated_by TEXT DEFAULT 'system',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO flow_configs (flow_id, display_name, config, updated_by)
      VALUES (
        'genie-single',
        'Genie — Single Generation',
        '{"default_model":"fal-ai/flux-pro/v1.1-ultra","fallback_model":"fal-ai/flux-dev","max_poll_attempts":120,"poll_interval_ms":5000,"timeout_ms":600000,"retry_on_failure":true,"max_retries":1,"thumbnail_width":400}',
        'system'
      ) ON CONFLICT (flow_id) DO NOTHING
    `);

    await client.query(`
      INSERT INTO flow_configs (flow_id, display_name, config, updated_by)
      VALUES (
        'genie-batch',
        'Genie — Batch Generation',
        '{"default_model":"fal-ai/flux-pro/v1.1-ultra","fallback_model":"fal-ai/flux-dev","max_poll_attempts":120,"poll_interval_ms":5000,"timeout_ms":600000,"parallel_submissions":true,"max_concurrent":4,"retry_on_failure":true,"max_retries":1,"thumbnail_width":400,"partial_completion":true}',
        'system'
      ) ON CONFLICT (flow_id) DO NOTHING
    `);

    console.log('Database schema initialized (v12 — flow_configs for AP runtime intelligence)');
  } finally {
    client.release();
  }
}

module.exports = { pool, ikawnOsPool, initSchema };
