
// Tests for code-read.tool.js

describe('code_read tool', () => {
  let tool;

  beforeEach(() => {
    vi.resetModules();
    tool = require('../../src/tools/code-read.tool.js');
  });

  it('reads a known file (package.json)', async () => {
    const result = await tool.execute({ path: 'package.json' }, {});
    expect(result.success).toBe(true);
    expect(result.data.path).toBe('package.json');
    expect(result.data.content).toContain('ikawn-openbrain');
    expect(result.data.lines).toBeGreaterThan(0);
    expect(result.data.totalLines).toBeGreaterThan(0);
    expect(result.summary).toContain('package.json');
  });

  it('reads a file in src/ directory', async () => {
    const result = await tool.execute({ path: 'src/tools/registry.js' }, {});
    expect(result.success).toBe(true);
    expect(result.data.content).toContain('loadTools');
  });

  it('blocks path traversal (../../etc/passwd)', async () => {
    const result = await tool.execute({ path: '../../etc/passwd' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/traversal|denied/i);
  });

  it('blocks path traversal with nested ..', async () => {
    const result = await tool.execute({ path: 'src/../../etc/passwd' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/traversal|denied/i);
  });

  it('blocks .env files', async () => {
    const result = await tool.execute({ path: 'src/.env' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('blocked pattern');
  });

  it('blocks node_modules', async () => {
    const result = await tool.execute({ path: 'node_modules/express/index.js' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('blocked pattern');
  });

  it('blocks .git directory', async () => {
    const result = await tool.execute({ path: '.git/config' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('blocked pattern');
  });

  it('blocks files outside allowed directories', async () => {
    const result = await tool.execute({ path: 'scripts/init-db.js' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('not in allowed directories');
  });

  it('returns error for non-existent file', async () => {
    const result = await tool.execute({ path: 'src/does-not-exist.js' }, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('File not found');
  });

  it('applies offset correctly', async () => {
    const result = await tool.execute({ path: 'package.json', offset: 3, limit: 2 }, {});
    expect(result.success).toBe(true);
    expect(result.data.lines).toBe(2);
    // Line numbers should start at 3
    expect(result.data.content).toMatch(/^\s*3\t/);
  });

  it('applies limit correctly', async () => {
    const result = await tool.execute({ path: 'package.json', limit: 5 }, {});
    expect(result.success).toBe(true);
    expect(result.data.lines).toBeLessThanOrEqual(5);
  });

  it('caps limit at 500', async () => {
    const result = await tool.execute({ path: 'package.json', limit: 9999 }, {});
    expect(result.success).toBe(true);
    // Should not exceed 500 or total lines, whichever is smaller
    expect(result.data.lines).toBeLessThanOrEqual(500);
  });

  it('formats output with line numbers (cat -n style)', async () => {
    const result = await tool.execute({ path: 'package.json', limit: 3 }, {});
    expect(result.success).toBe(true);
    const lines = result.data.content.split('\n');
    // Each line should have: number + tab + content
    for (const line of lines) {
      expect(line).toMatch(/^\s*\d+\t/);
    }
  });

  it('returns error for missing path parameter', async () => {
    const result = await tool.execute({}, {});
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Missing required parameter');
  });
});
