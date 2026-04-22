-- ============================================================================
-- Migration 002: Lucy v3 Tables
-- ============================================================================
-- Creates the 10 core tables for Lucy v3 autonomous engine:
--   1. sessions              — conversation/task sessions with budget caps
--   2. episodic_memories      — raw event log (messages, tool results, observations)
--   3. semantic_knowledge     — distilled facts with confidence and superseding
--   4. task_queue             — scheduled and on-demand task definitions
--   5. task_executions        — individual execution runs of queued tasks
--   6. approval_requests      — human-on-the-loop approval gates
--   7. trust_ledger           — audit trail of trust-affecting actions
--   8. trust_scores           — current trust tier per brand+domain
--   9. tool_results           — per-tool-call result tracking
--  10. cost_events            — granular cost accounting per LLM/tool call
--
-- Depends on: 001_existing_tables.sql (users, brands, agent_definitions)
-- Requires: pgvector extension (enabled in 001)
-- ============================================================================

-- ==========================================================================
-- 1. sessions
-- ==========================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,  -- matches brands.brand_id (VARCHAR), no FK (consistent with existing tables)
  user_id         INTEGER REFERENCES users(id),
  agent_slug      TEXT,  -- no FK yet, will reference agent_definitions after Task 0.5
  channel         TEXT CHECK (channel IN ('web','telegram','api','scheduled','sub_agent')),
  status          TEXT CHECK (status IN ('active','suspended','completed','failed','expired')),
  model_tier      TEXT CHECK (model_tier IN ('fast','balanced','deep')),
  working_memory  JSONB DEFAULT '{}',
  message_count   INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  total_cost_usd  NUMERIC(10,6) DEFAULT 0,
  dollar_cap      NUMERIC(10,4) NOT NULL,
  suspended_at    TIMESTAMPTZ,
  resume_token    UUID,
  parent_session  UUID REFERENCES sessions(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_brand_status ON sessions(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session) WHERE parent_session IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_resume ON sessions(resume_token) WHERE resume_token IS NOT NULL;

-- ==========================================================================
-- 2. episodic_memories
-- ==========================================================================
CREATE TABLE IF NOT EXISTS episodic_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,
  user_id         INTEGER,
  session_id      UUID REFERENCES sessions(id),
  content         TEXT NOT NULL,
  content_type    TEXT CHECK (content_type IN ('message','tool_result','decision','observation','error')),
  author_type     TEXT CHECK (author_type IN ('user','agent','system','tool')),
  author_ref      TEXT,
  source          TEXT NOT NULL CHECK (source IN ('chat','telegram','scheduled','sub_agent','webhook')),
  tags            TEXT[],
  embedding       vector(768),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_episodic_brand_created ON episodic_memories(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_episodic_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_episodic_tags ON episodic_memories USING gin(tags);

-- ==========================================================================
-- 3. semantic_knowledge
-- ==========================================================================
CREATE TABLE IF NOT EXISTS semantic_knowledge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,
  fact            TEXT NOT NULL,
  reasoning       TEXT,
  confidence      NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  source_episodes UUID[],
  embedding       vector(768),
  superseded_by   UUID REFERENCES semantic_knowledge(id),
  times_referenced INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_brand ON semantic_knowledge(brand_id);
CREATE INDEX IF NOT EXISTS idx_semantic_embedding ON semantic_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_semantic_active ON semantic_knowledge(brand_id) WHERE superseded_by IS NULL;

-- ==========================================================================
-- 4. task_queue
-- ==========================================================================
CREATE TABLE IF NOT EXISTS task_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,
  agent_slug      TEXT NOT NULL,
  task_type       TEXT CHECK (task_type IN ('scheduled','on_demand','sub_agent','hotl_resume')),
  priority        INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  cron_expression TEXT,
  timezone        TEXT DEFAULT 'Asia/Kolkata',
  prompt          TEXT NOT NULL,
  config          JSONB DEFAULT '{}',
  status          TEXT CHECK (status IN ('pending','queued','running','suspended','completed','failed','cancelled')),
  next_run_at     TIMESTAMPTZ,
  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taskq_pending ON task_queue(next_run_at) WHERE status IN ('pending','queued') AND enabled = true;
CREATE INDEX IF NOT EXISTS idx_taskq_brand ON task_queue(brand_id, status);

-- ==========================================================================
-- 5. task_executions
-- ==========================================================================
CREATE TABLE IF NOT EXISTS task_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES task_queue(id),
  session_id      UUID REFERENCES sessions(id),
  parent_execution UUID REFERENCES task_executions(id),
  status          TEXT CHECK (status IN ('running','suspended','completed','failed','killed','timeout')),
  result          JSONB,
  checkpoint      JSONB,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,6) DEFAULT 0,
  tool_calls      INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_executions_task ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_parent ON task_executions(parent_execution) WHERE parent_execution IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_executions_running ON task_executions(status) WHERE status = 'running';

-- ==========================================================================
-- 6. approval_requests
-- ==========================================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,
  session_id      UUID NOT NULL REFERENCES sessions(id),
  execution_id    UUID NOT NULL REFERENCES task_executions(id),
  action_type     TEXT NOT NULL,
  permission_tier TEXT CHECK (permission_tier IN ('confirm','review')),
  context         JSONB NOT NULL,
  status          TEXT CHECK (status IN ('pending','approved','rejected','timeout','expired')),
  timeout_hours   NUMERIC(4,1) NOT NULL,
  approved_by_user_id INTEGER REFERENCES users(id),
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  responded_by    TEXT,
  response_note   TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approval_requests(brand_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approvals_session ON approval_requests(session_id);

-- ==========================================================================
-- 7. trust_ledger
-- ==========================================================================
CREATE TABLE IF NOT EXISTS trust_ledger (
  id              SERIAL PRIMARY KEY,
  brand_id        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  outcome         TEXT CHECK (outcome IN ('success','failure','regression','false_positive')),
  session_id      UUID REFERENCES sessions(id),
  detail          TEXT,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_brand_domain ON trust_ledger(brand_id, domain, recorded_at DESC);

-- ==========================================================================
-- 8. trust_scores
-- ==========================================================================
CREATE TABLE IF NOT EXISTS trust_scores (
  brand_id                TEXT NOT NULL,
  domain                  TEXT NOT NULL,
  current_tier            TEXT CHECK (current_tier IN ('auto','confirm','review')),
  consecutive_successes   INTEGER DEFAULT 0,
  promotion_threshold     INTEGER NOT NULL,
  demotion_triggers       INTEGER DEFAULT 0,
  last_evaluated          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (brand_id, domain)
);

-- ==========================================================================
-- 9. tool_results
-- ==========================================================================
CREATE TABLE IF NOT EXISTS tool_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL REFERENCES task_executions(id),
  tool_name       TEXT NOT NULL,
  status          TEXT CHECK (status IN ('success','error','timeout','retrying')),
  result          JSONB NOT NULL,
  attempt         INTEGER DEFAULT 1,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_toolresults_execution ON tool_results(execution_id);

-- ==========================================================================
-- 10. cost_events
-- ==========================================================================
CREATE TABLE IF NOT EXISTS cost_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        TEXT NOT NULL,
  session_id      UUID REFERENCES sessions(id),
  execution_id    UUID,  -- correlation ID, no FK (reasoning loop uses random UUIDs)
  event_type      TEXT CHECK (event_type IN ('llm_call','tool_call','embedding','external_api')),
  model           TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_brand_date ON cost_events(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_daily ON cost_events(brand_id, ((created_at AT TIME ZONE 'UTC')::date));

-- ============================================================================
-- Summary: 10 tables created
-- ============================================================================
--  1. sessions              (17 columns, 3 indexes)
--  2. episodic_memories     (13 columns, 4 indexes)
--  3. semantic_knowledge    (10 columns, 3 indexes)
--  4. task_queue            (13 columns, 2 indexes)
--  5. task_executions       (13 columns, 3 indexes)
--  6. approval_requests     (14 columns, 2 indexes)
--  7. trust_ledger          ( 7 columns, 1 index)
--  8. trust_scores          ( 7 columns, 0 indexes — composite PK)
--  9. tool_results          ( 7 columns, 1 index)
-- 10. cost_events           (11 columns, 3 indexes)
-- ============================================================================
