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

module.exports = { loadTools, getTools, getTool, getToolsForAgent, getToolSchemas };
