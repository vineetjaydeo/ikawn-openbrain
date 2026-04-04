-- Migration 003: Rename domain_agents → agent_definitions
-- Adds: tool_scope, token_budget, dollar_cap columns
-- Idempotent: safe to run multiple times

-- Rename table (only if old name exists and new name doesn't)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'domain_agents' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_definitions' AND table_schema = 'public')
  THEN
    ALTER TABLE domain_agents RENAME TO agent_definitions;
  END IF;
END $$;

-- Add new columns (idempotent via IF NOT EXISTS)
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS tool_scope TEXT[] DEFAULT '{}';
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS token_budget INTEGER DEFAULT 200000;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS dollar_cap NUMERIC(10,4) DEFAULT 2.0000;
