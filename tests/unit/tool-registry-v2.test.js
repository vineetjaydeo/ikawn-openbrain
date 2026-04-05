'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadToolsV2,
  lookupTool,
  listTools,
  listAllTools,
  getToolDefinitions,
  getRegisteredCount,
  clearRegistry,
} = require('../../src/engine/tool-registry-v2');

// Helper: create a temp dir and return its path + cleanup function
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-registry-v2-test-'));
  return dir;
}

const VALID_TOOL_CONTENT = `'use strict';
module.exports = {
  name: 'test_tool',
  description: 'A test tool',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  permissionTier: 'auto',
  category: 'observe',
  timeout: 5000,
  retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
  execute: async (input) => ({ ok: true, data: input.query, error: null, metadata: {} }),
};
`;

const VALID_TOOL_2_CONTENT = `'use strict';
module.exports = {
  name: 'create_thing',
  description: 'Creates a thing',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
  permissionTier: 'confirm',
  category: 'create',
  timeout: 10000,
  retryPolicy: { maxRetries: 1, backoff: [2000], timeoutMs: 10000 },
  execute: async (input) => ({ ok: true, data: input.name, error: null, metadata: {} }),
};
`;

const INVALID_TOOL_CONTENT = `'use strict';
module.exports = {
  name: '',
  description: '',
};
`;

describe('tool-registry-v2', () => {
  let tempDir;

  beforeEach(() => {
    clearRegistry();
    tempDir = makeTempDir();
  });

  afterEach(() => {
    clearRegistry();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('discovers tools from directory', () => {
    fs.writeFileSync(path.join(tempDir, 'test.tool.js'), VALID_TOOL_CONTENT);

    const count = loadToolsV2(tempDir);
    expect(count).toBe(1);
    expect(getRegisteredCount()).toBe(1);
  });

  it('validates tools and skips invalid ones with warning', () => {
    fs.writeFileSync(path.join(tempDir, 'bad.tool.js'), INVALID_TOOL_CONTENT);

    const count = loadToolsV2(tempDir);
    expect(count).toBe(0);
    expect(getRegisteredCount()).toBe(0);
  });

  it('lookupTool finds registered tool by name', () => {
    fs.writeFileSync(path.join(tempDir, 'test.tool.js'), VALID_TOOL_CONTENT);
    loadToolsV2(tempDir);

    const tool = lookupTool('test_tool');
    expect(tool).not.toBeNull();
    expect(tool.name).toBe('test_tool');
    expect(tool.category).toBe('observe');
  });

  it('lookupTool returns null for missing tool', () => {
    expect(lookupTool('nonexistent')).toBeNull();
  });

  it('listTools with scope filters by category', () => {
    fs.writeFileSync(path.join(tempDir, 'observe.tool.js'), VALID_TOOL_CONTENT);
    fs.writeFileSync(path.join(tempDir, 'create.tool.js'), VALID_TOOL_2_CONTENT);
    loadToolsV2(tempDir);

    const observeTools = listTools(['observe']);
    expect(observeTools).toHaveLength(1);
    expect(observeTools[0].name).toBe('test_tool');

    const createTools = listTools(['create']);
    expect(createTools).toHaveLength(1);
    expect(createTools[0].name).toBe('create_thing');

    const both = listTools(['observe', 'create']);
    expect(both).toHaveLength(2);
  });

  it('listTools with null scope returns all tools', () => {
    fs.writeFileSync(path.join(tempDir, 'observe.tool.js'), VALID_TOOL_CONTENT);
    fs.writeFileSync(path.join(tempDir, 'create.tool.js'), VALID_TOOL_2_CONTENT);
    loadToolsV2(tempDir);

    expect(listTools(null)).toHaveLength(2);
    expect(listTools(undefined)).toHaveLength(2);
    expect(listTools()).toHaveLength(2);
  });

  it('listAllTools returns all registered tools', () => {
    fs.writeFileSync(path.join(tempDir, 'observe.tool.js'), VALID_TOOL_CONTENT);
    fs.writeFileSync(path.join(tempDir, 'create.tool.js'), VALID_TOOL_2_CONTENT);
    loadToolsV2(tempDir);

    const all = listAllTools();
    expect(all).toHaveLength(2);
    const names = all.map(t => t.name).sort();
    expect(names).toEqual(['create_thing', 'test_tool']);
  });

  it('getToolDefinitions returns Claude API format', () => {
    fs.writeFileSync(path.join(tempDir, 'test.tool.js'), VALID_TOOL_CONTENT);
    loadToolsV2(tempDir);

    const defs = getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      name: 'test_tool',
      description: 'A test tool',
      input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    });
  });

  it('getToolDefinitions filters by scope', () => {
    fs.writeFileSync(path.join(tempDir, 'observe.tool.js'), VALID_TOOL_CONTENT);
    fs.writeFileSync(path.join(tempDir, 'create.tool.js'), VALID_TOOL_2_CONTENT);
    loadToolsV2(tempDir);

    const defs = getToolDefinitions(['create']);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('create_thing');
  });

  it('clearRegistry empties the registry', () => {
    fs.writeFileSync(path.join(tempDir, 'test.tool.js'), VALID_TOOL_CONTENT);
    loadToolsV2(tempDir);
    expect(getRegisteredCount()).toBe(1);

    clearRegistry();
    expect(getRegisteredCount()).toBe(0);
    expect(lookupTool('test_tool')).toBeNull();
  });

  it('non-tool files are ignored', () => {
    fs.writeFileSync(path.join(tempDir, 'test.tool.js'), VALID_TOOL_CONTENT);
    fs.writeFileSync(path.join(tempDir, 'readme.md'), '# Not a tool');
    fs.writeFileSync(path.join(tempDir, 'helper.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{}');

    const count = loadToolsV2(tempDir);
    expect(count).toBe(1);
    expect(getRegisteredCount()).toBe(1);
  });

  it('empty directory loads 0 tools without error', () => {
    const count = loadToolsV2(tempDir);
    expect(count).toBe(0);
    expect(getRegisteredCount()).toBe(0);
  });

  it('handles nonexistent directory gracefully', () => {
    const count = loadToolsV2('/tmp/does-not-exist-registry-v2-test');
    expect(count).toBe(0);
  });
});
