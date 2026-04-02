// src/utils/features.js
'use strict';

/**
 * Centralized feature flags for OpenBrain.
 * Controls which features are enabled per deployment (Lucy vs Ruhi).
 *
 * Usage:
 *   const { feature } = require('../utils/features');
 *   if (feature('CODE_TOOLS')) { ... }
 */

const FEATURES = {
  // Intelligence enhancements (from LCC power-up)
  CONTEXT_COMPRESSION: { default: true, env: 'ENABLE_CONTEXT_COMPRESSION', description: 'Compress older messages in long conversations' },
  PARALLEL_TOOLS: { default: true, env: 'ENABLE_PARALLEL_TOOLS', description: 'Execute independent tool calls concurrently' },
  MEMORY_EXTRACTION: { default: true, env: 'ENABLE_MEMORY_EXTRACTION', description: 'Extract facts/decisions from conversations' },

  // Coding abilities
  CODE_TOOLS: { default: true, env: 'ENABLE_CODE_TOOLS', description: 'Allow agents to read/write/edit code' },
  DEPLOY_TOOLS: { default: false, env: 'ENABLE_DEPLOY_TOOLS', description: 'Allow agents to deploy (requires explicit opt-in)' },

  // Agent platform
  AGENT_PLATFORM: { default: true, env: 'ENABLE_AGENTS', description: 'Agent scheduler and executor' },
  MISSION_CONTROL: { default: true, env: 'ENABLE_MISSION_CONTROL', description: 'Mission Control UI' },

  // Integrations
  BRAND_API: { default: false, env: 'ENABLE_BRAND_API', description: 'Multi-tenant brand API' },
  ACTIVEPIECES: { default: false, env: 'ENABLE_ACTIVEPIECES', description: 'ActivePieces orchestration integration' },

  // Experimental
  COST_DASHBOARD: { default: true, env: 'ENABLE_COST_DASHBOARD', description: 'OpenAI cost monitoring dashboard' },
};

// Cache resolved values
const resolved = {};

function feature(name) {
  if (name in resolved) return resolved[name];

  const def = FEATURES[name];
  if (!def) {
    console.warn(`[Features] Unknown feature flag: ${name}`);
    return false;
  }

  const envVal = process.env[def.env];
  if (envVal !== undefined) {
    resolved[name] = envVal === 'true' || envVal === '1';
  } else {
    resolved[name] = def.default;
  }

  return resolved[name];
}

/**
 * List all feature flags and their current state.
 * Used by admin/health endpoints.
 */
function getAllFeatures() {
  return Object.entries(FEATURES).map(([name, def]) => ({
    name,
    enabled: feature(name),
    env: def.env,
    description: def.description,
  }));
}

/**
 * Reset cache (for testing).
 */
function _resetCache() {
  for (const key of Object.keys(resolved)) delete resolved[key];
}

module.exports = { feature, getAllFeatures, _resetCache };
