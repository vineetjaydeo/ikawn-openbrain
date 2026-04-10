'use strict';

const fs = require('fs');
const path = require('path');
const { validateTool } = require('./tool-interface');

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Scan a directory for *.tool.js files, validate each, and register valid tools.
 * @param {string} [toolsDir] - Directory to scan. Defaults to src/tools/v2/.
 * @returns {number} Count of successfully loaded tools.
 */
function loadToolsV2(toolsDir) {
  const dir = toolsDir || path.join(__dirname, '..', 'tools', 'v2');

  if (!fs.existsSync(dir)) {
    console.warn(`[ToolRegistryV2] Directory not found: ${dir}`);
    return 0;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tool.js'));
  let loaded = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      // Clear require cache so reloads work in tests
      delete require.cache[require.resolve(filePath)];
      const exported = require(filePath);

      // Support both single tool objects and arrays of tools
      const toolList = Array.isArray(exported) ? exported : [exported];

      for (const tool of toolList) {
        const result = validateTool(tool);

        if (!result.valid) {
          console.warn(`[ToolRegistryV2] Skipping ${tool.name || file}: ${result.errors.join(', ')}`);
          continue;
        }

        if (registry.has(tool.name)) {
          console.warn(`[ToolRegistryV2] Duplicate tool name '${tool.name}' from ${file}, overwriting`);
        }

        registry.set(tool.name, tool);
        loaded++;
        console.log(`[ToolRegistryV2] Loaded: ${tool.name} [${tool.category}/${tool.permissionTier}]`);
      }
    } catch (err) {
      console.warn(`[ToolRegistryV2] Failed to load ${file}: ${err.message}`);
    }
  }

  console.log(`[ToolRegistryV2] ${loaded} tools loaded (${registry.size} total registered)`);
  return loaded;
}

/**
 * Look up a tool by name.
 * @param {string} name
 * @returns {object|null}
 */
function lookupTool(name) {
  return registry.get(name) || null;
}

/**
 * List tools filtered by scope (array of category names).
 * If scope is null/undefined, returns all tools.
 * @param {string[]|null|undefined} scope
 * @returns {object[]}
 */
function listTools(scope) {
  if (!scope || !Array.isArray(scope) || scope.length === 0) {
    return Array.from(registry.values());
  }
  return Array.from(registry.values()).filter(t => scope.includes(t.category));
}

/**
 * Returns all registered tools.
 * @returns {object[]}
 */
function listAllTools() {
  return Array.from(registry.values());
}

/**
 * Returns tools formatted as Claude API tool definitions.
 * Filters by scope (array of category names) if provided.
 * @param {string[]|null|undefined} scope
 * @returns {Array<{name: string, description: string, input_schema: object}>}
 */
function getToolDefinitions(scope) {
  const tools = listTools(scope);
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/**
 * Returns the number of registered tools.
 * @returns {number}
 */
function getRegisteredCount() {
  return registry.size;
}

/**
 * Clears all registered tools. Primarily for testing.
 */
function clearRegistry() {
  registry.clear();
}

module.exports = {
  loadToolsV2,
  lookupTool,
  listTools,
  listAllTools,
  getToolDefinitions,
  getRegisteredCount,
  clearRegistry,
};
