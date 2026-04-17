// src/tools/registry.js
'use strict';

const fs = require('fs');
const path = require('path');

const tools = new Map();

/**
 * Load all *.tool.js files from the tools directory.
 */
function loadTools() {
  const toolsDir = path.join(__dirname);
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.tool.js'));

  for (const file of files) {
    try {
      const tool = require(path.join(toolsDir, file));
      if (!tool.name || !tool.execute) {
        console.warn(`[ToolRegistry] Skipping ${file}: missing name or execute`);
        continue;
      }
      tools.set(tool.name, tool);
      console.log(`[ToolRegistry] Loaded: ${tool.name} (${tool.tier || 'direct'})`);
    } catch (err) {
      console.error(`[ToolRegistry] Failed to load ${file}:`, err.message);
    }
  }

  console.log(`[ToolRegistry] ${tools.size} tools loaded`);
}

/**
 * Permission tiers for tools:
 * - 'low': safe, read-only operations (system_status, code_read, ga_report)
 * - 'medium': writes/side-effects (code_write, code_edit, content_draft, gmail_draft)
 * - 'high': destructive/costly operations (bash_exec, deploy_openbrain, notify)
 * - 'critical': requires explicit approval (deploy_openbrain for non-ikawn brands)
 */
const DEFAULT_COST_TIERS = {
  system_status: 'low',
  code_read: 'low',
  ga_report: 'low',
  fly_status: 'low',
  calendar_read: 'low',
  calendar_manage: 'medium',
  gmail_read: 'low',
  content_draft: 'medium',
  code_write: 'medium',
  code_edit: 'medium',
  gmail_draft: 'medium',
  create_user_task: 'medium',
  manage_task: 'medium',
  brand_analysis: 'medium',
  ikawn_generate: 'medium',
  manage_automation: 'medium',
  generate_spreadsheet: 'low',
  generate_chart: 'low',
  query_data: 'low',
  generate_pptx: 'medium',
  bash_exec: 'high',
  notify: 'high',
  gmail_send: 'high',
  deploy_openbrain: 'critical',
  start_background_task: 'medium',
  check_task_status: 'low',
};

function getToolCostTier(toolName) {
  const tool = tools.get(toolName);
  if (tool && tool.costTier) return tool.costTier;
  return DEFAULT_COST_TIERS[toolName] || 'medium';
}

/**
 * Check if a tool can be used in the given context.
 * Returns { allowed: true, tier } or { allowed: false, tier, reason: '...' }
 */
function checkToolPermission(toolName, context = {}) {
  const { brandId, userId, isInternal } = context;
  const tier = getToolCostTier(toolName);

  // Internal (ikawn brand) has full access
  if (brandId === 'ikawn' || isInternal) {
    return { allowed: true, tier };
  }

  // External brands: block critical tools
  if (tier === 'critical') {
    return { allowed: false, tier, reason: `Tool '${toolName}' requires manual approval for external brands` };
  }

  // External brands: block high-tier tools unless explicitly enabled
  if (tier === 'high') {
    return { allowed: false, tier, reason: `Tool '${toolName}' is restricted for external brands. Contact admin to enable.` };
  }

  return { allowed: true, tier };
}

function getTools() { return tools; }
function getTool(name) { return tools.get(name); }

function getToolsForAgent(allowedTools) {
  const filtered = new Map();
  for (const name of allowedTools) {
    const tool = tools.get(name);
    if (tool) filtered.set(name, tool);
  }
  return filtered;
}

/**
 * Generate Anthropic tool_use definitions for a set of tool names.
 */
function getToolSchemas(toolNames) {
  const schemas = [];
  for (const name of toolNames) {
    const tool = tools.get(name);
    if (!tool) continue;

    const properties = {};
    const required = [];
    for (const [key, def] of Object.entries(tool.parameters || {})) {
      properties[key] = { type: def.type, description: def.description };
      if (def.enum) properties[key].enum = def.enum;
      if (def.required) required.push(key);
    }

    schemas.push({
      name: tool.name,
      description: tool.description,
      input_schema: { type: 'object', properties, required },
    });
  }
  return schemas;
}

module.exports = { loadTools, getTools, getTool, getToolsForAgent, getToolSchemas, getToolCostTier, checkToolPermission };
