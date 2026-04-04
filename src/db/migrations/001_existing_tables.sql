-- ============================================================================
-- 001_existing_tables.sql
-- Migrates all existing OpenBrain tables to Supabase (PostgreSQL 17.6)
-- Source of truth: src/db.js (schema v12)
--
-- IDEMPOTENT: Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- SCHEMA ONLY: No INSERT/UPDATE/seed data
-- Includes Lucy v3 columns from ARCHITECTURE.md Section 3A
-- ============================================================================

-- Enable pgvector (Supabase has it available)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  external_id TEXT,
  custom_instructions TEXT,
  trust_config JSONB DEFAULT '{}',  -- Lucy v3: HOTL trust configuration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_idx ON users(external_id) WHERE external_id IS NOT NULL;

-- brands
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  tier VARCHAR(50) DEFAULT 'starter',
  status VARCHAR(50) DEFAULT 'active',
  gdpr_region VARCHAR(10) DEFAULT 'global',
  data_retention_days INT DEFAULT 730,
  org_id VARCHAR(100),
  autonomy_budget JSONB DEFAULT '{}',   -- Lucy v3: budget-based autonomy for Ruhi SaaS
  supabase_project_id TEXT,             -- Lucy v3: per-brand Supabase project
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_org_id ON brands(org_id) WHERE org_id IS NOT NULL;

-- brand_users
CREATE TABLE IF NOT EXISTS brand_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR(100) NOT NULL REFERENCES brands(brand_id),
  user_id INTEGER REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  channels TEXT[] DEFAULT '{}',
  gdpr_consent BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_users_brand_user ON brand_users(brand_id, user_id);

-- settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================================

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT DEFAULT 'New Chat',
  brand_id VARCHAR(100) DEFAULT 'ikawn',
  uuid UUID DEFAULT gen_random_uuid(),
  share_token UUID,
  shared_at TIMESTAMPTZ,
  source VARCHAR(100),
  draft_text TEXT,
  draft_updated_at TIMESTAMPTZ,
  context_summary JSONB DEFAULT NULL,
  context_msg_count INTEGER DEFAULT 0,
  compressed_at TIMESTAMPTZ,
  hashtags TEXT[] DEFAULT '{}',
  session_id UUID,                       -- Lucy v3: link to sessions table
  working_memory JSONB DEFAULT '{}',     -- Lucy v3: per-conversation scratchpad
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_uuid ON conversations(uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_share_token ON conversations(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source) WHERE source IS NOT NULL;

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  attachments JSONB DEFAULT '[]',
  model TEXT,
  tier TEXT,
  brand_id VARCHAR(100) DEFAULT 'ikawn',
  compressed BOOLEAN DEFAULT false,      -- Lucy v3: context compression marker
  token_count INTEGER,                   -- Lucy v3: per-message token tracking
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MEMORIES & INTELLIGENCE
-- ============================================================================

-- memories (core memory table — all data through captureMessage())
CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding float8[],
  source TEXT DEFAULT 'manual',
  tags TEXT[],
  access_level TEXT DEFAULT 'private',
  memory_type TEXT DEFAULT 'note',
  author TEXT DEFAULT 'vineet',
  signed_off_by TEXT,
  project TEXT,
  conversation_id UUID,
  group_id TEXT,
  hashtags TEXT[],
  source_url TEXT,
  source_ref TEXT,
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  brand_id VARCHAR(100) DEFAULT 'ikawn',
  embedding_status VARCHAR(20) DEFAULT 'pending',
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
  embedded_at TIMESTAMPTZ,
  moderation_score FLOAT,
  moderation_flags TEXT[] DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_brand ON memories(brand_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status) WHERE embedding_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_ref_unique ON memories(source_ref) WHERE source_ref IS NOT NULL;

-- memory_events (raw event inbox, append-only)
CREATE TABLE IF NOT EXISTS memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  user_id VARCHAR(100),
  source VARCHAR(50) DEFAULT 'system',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_brand_type_created ON memory_events (brand_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_events_unprocessed ON memory_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_events_user ON memory_events (brand_id, user_id, event_type, created_at);

-- distilled_memory (learned knowledge with reasoning and embeddings)
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
  user_id VARCHAR(100),
  times_used INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distilled_brand_type ON distilled_memory (brand_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_distilled_active_brand ON distilled_memory (brand_id) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_distilled_user_brand ON distilled_memory (brand_id, user_id, memory_type) WHERE superseded_by IS NULL;

-- session_summaries (compressed conversation history)
CREATE TABLE IF NOT EXISTS session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE,
  brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
  summary TEXT NOT NULL,
  key_decisions JSONB DEFAULT '[]',
  open_threads JSONB DEFAULT '[]',
  embedding float8[],
  embedding_status VARCHAR(20) DEFAULT 'pending',
  user_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- learning_velocity (metrics tracking improvement over time)
CREATE TABLE IF NOT EXISTS learning_velocity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR(100) NOT NULL DEFAULT 'ikawn',
  metric_type TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_brand ON learning_velocity (brand_id, metric_type, measured_at);

-- intelligence_snapshots (cohort intelligence)
CREATE TABLE IF NOT EXISTS intelligence_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_type VARCHAR(50) NOT NULL,
  period VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_type_period ON intelligence_snapshots(snapshot_type, period);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON intelligence_snapshots(created_at DESC);

-- ============================================================================
-- CONTENT GENERATION & TRAINING
-- ============================================================================

-- edit_deltas (highest priority training data)
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
);

CREATE INDEX IF NOT EXISTS idx_edit_deltas_brand ON edit_deltas(brand_id);
CREATE INDEX IF NOT EXISTS idx_edit_deltas_agent ON edit_deltas(agent_name);
CREATE INDEX IF NOT EXISTS idx_edit_deltas_type ON edit_deltas(delta_type);

-- generations
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
);

CREATE INDEX IF NOT EXISTS idx_generations_brand ON generations(brand_id);
CREATE INDEX IF NOT EXISTS idx_generations_agent ON generations(agent_name);

-- mothership_log (anonymised cross-brand learning)
CREATE TABLE IF NOT EXISTS mothership_log (
  id BIGSERIAL PRIMARY KEY,
  source_brand_id VARCHAR(100),
  data_type VARCHAR(100) NOT NULL,
  anonymised_payload JSONB NOT NULL,
  demographic_tags JSONB DEFAULT '{}',
  signal_strength FLOAT,
  promoted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BRAND CONTEXT & KNOWLEDGE
-- ============================================================================

-- brand_context (per-brand persona and preferences)
CREATE TABLE IF NOT EXISTS brand_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR(100) UNIQUE NOT NULL,
  industry VARCHAR(100),
  tone_of_voice TEXT,
  target_audience TEXT,
  brand_guidelines JSONB DEFAULT '{}',
  connected_platforms TEXT[] DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  display_name TEXT,
  tone TEXT,
  system_prompt_override TEXT,
  context_injection TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- brand_knowledge (per-brand knowledge base docs)
CREATE TABLE IF NOT EXISTS brand_knowledge (
  id SERIAL PRIMARY KEY,
  brand_id VARCHAR(100) NOT NULL,
  doc_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, doc_type)
);

-- brand_ratings
CREATE TABLE IF NOT EXISTS brand_ratings (
  id BIGSERIAL PRIMARY KEY,
  brand_id VARCHAR(100) NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  abuse_flags INT DEFAULT 0,
  inappropriate_content_count INT DEFAULT 0,
  notes TEXT,
  rated_by VARCHAR(255),
  rated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- API KEYS & USAGE
-- ============================================================================

-- api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix VARCHAR(16) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  user_id VARCHAR(100),
  org_id VARCHAR(100),
  brand_id VARCHAR(100) DEFAULT 'ikawn',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_brand_id ON api_keys(brand_id);

-- api_key_usage
CREATE TABLE IF NOT EXISTS api_key_usage (
  id BIGSERIAL PRIMARY KEY,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
  endpoint TEXT NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage(api_key_id, created_at DESC);

-- ============================================================================
-- GOVERNANCE LAYER
-- ============================================================================

-- brand_budgets (per-brand credit budgets with atomic enforcement)
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
);

-- action_queue (approval state machine)
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
);

CREATE INDEX IF NOT EXISTS idx_action_queue_pending ON action_queue (brand_id, governance_result, created_at) WHERE governance_result IN ('pending', 'awaiting_human');
CREATE INDEX IF NOT EXISTS idx_action_queue_brand_time ON action_queue (brand_id, created_at);

-- action_log (immutable audit trail)
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
);

CREATE INDEX IF NOT EXISTS idx_action_log_brand ON action_log (brand_id, executed_at);

-- cost_catalog (versioned pricing)
CREATE TABLE IF NOT EXISTS cost_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  sub_type TEXT,
  cost_credits INTEGER NOT NULL,
  description TEXT,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cost_catalog_lookup ON cost_catalog (action_type, sub_type) WHERE effective_until IS NULL;

-- ============================================================================
-- AGENT PLATFORM
-- ============================================================================

-- scheduled_tasks
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
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks (next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_brand ON scheduled_tasks (brand_id);

-- task_runs
CREATE TABLE IF NOT EXISTS task_runs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES scheduled_tasks(id),
  agent_slug TEXT NOT NULL,
  brand_id VARCHAR(100),
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
  approved_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs (task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_runs_brand ON task_runs(brand_id);

-- domain_agents
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
);

-- brand_oauth_tokens
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
);

-- ============================================================================
-- AGENT SUPPORT TABLES
-- ============================================================================

-- growth_experiments
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
);

CREATE INDEX IF NOT EXISTS idx_growth_experiments_brand_status ON growth_experiments(brand_id, status);

-- weekly_scorecards
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
);

CREATE INDEX IF NOT EXISTS idx_weekly_scorecards_brand_week ON weekly_scorecards(brand_id, week_start DESC);

-- ============================================================================
-- SKILL SESSIONS (Brand Onboarding Wizard)
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_sessions (
  id TEXT PRIMARY KEY,
  skill_name VARCHAR(50) NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  current_step VARCHAR(50) NOT NULL DEFAULT 'init',
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_sessions_org ON skill_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_skill_sessions_user ON skill_sessions(user_id);

-- ============================================================================
-- USER TASKS (Ruhi task relay)
-- ============================================================================

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
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_assigned ON user_tasks(assigned_to, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tasks_uuid ON user_tasks(uuid);

-- ============================================================================
-- ACTIVEPIECES INTEGRATION
-- ============================================================================

-- flow_versions (AP flow version tracking + rollback)
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
);

CREATE INDEX IF NOT EXISTS idx_flow_versions_flow ON flow_versions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_version ON flow_versions(flow_id, version DESC);

-- flow_configs (runtime intelligence for AP flows)
CREATE TABLE IF NOT EXISTS flow_configs (
  id SERIAL PRIMARY KEY,
  flow_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT DEFAULT 'system',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- OPENBRAIN v2 TABLES (legacy but still in schema)
-- ============================================================================

-- ob_users (OpenBrain internal user registry)
CREATE TABLE IF NOT EXISTS ob_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL,
  access_levels TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ob_groups (access control groups)
CREATE TABLE IF NOT EXISTS ob_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  members TEXT[],
  default_access_level TEXT DEFAULT 'private',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ob_conversations (OpenBrain v2 conversations — distinct from chat conversations)
CREATE TABLE IF NOT EXISTS ob_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  group_id TEXT,
  access_level TEXT DEFAULT 'private',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- ob_decisions (decision log)
CREATE TABLE IF NOT EXISTS ob_decisions (
  id SERIAL PRIMARY KEY,
  decision TEXT NOT NULL,
  context TEXT,
  decided_by TEXT,
  signed_off_by TEXT,
  project TEXT,
  access_level TEXT DEFAULT 'management',
  hashtags TEXT[],
  brand_id VARCHAR(100) DEFAULT 'ikawn',
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  memory_id INTEGER
);

-- ob_ingestion_log (data ingestion tracking)
CREATE TABLE IF NOT EXISTS ob_ingestion_log (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT,
  records_added INTEGER DEFAULT 0,
  error_message TEXT,
  ran_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Cosine similarity for float8[] arrays (fallback when not using pgvector operators)
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
