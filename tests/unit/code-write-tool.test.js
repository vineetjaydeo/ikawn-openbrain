// tests/unit/code-write-tool.test.js
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TMP_FILE = path.join(PROJECT_ROOT, 'tests/tmp-test-write.js');
const TMP_BAK = TMP_FILE + '.bak';

describe('code_write tool', () => {
  let tool;

  beforeAll(() => {
    tool = require('../../src/tools/code-write.tool.js');
  });

  afterEach(() => {
    // Clean up any test files
    for (const f of [TMP_FILE, TMP_BAK]) {
      try { fs.unlinkSync(f); } catch {}
    }
  });

  afterAll(() => {
    for (const f of [TMP_FILE, TMP_BAK]) {
      try { fs.unlinkSync(f); } catch {}
    }
  });

  it('writes a new file in an allowed directory', async () => {
    const result = await tool.execute({
      path: 'tests/tmp-test-write.js',
      content: '// test file\nconsole.log("hello");\n',
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.path).toBe('tests/tmp-test-write.js');
    expect(result.data.backed_up).toBe(false);
    expect(result.summary).toContain('Created');
    expect(fs.existsSync(TMP_FILE)).toBe(true);
    expect(fs.readFileSync(TMP_FILE, 'utf8')).toBe('// test file\nconsole.log("hello");\n');
  });

  it('blocks path traversal', async () => {
    const result = await tool.execute({
      path: '../../../etc/passwd',
      content: 'malicious',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path traversal/i);
  });

  it('blocks protected files', async () => {
    const result = await tool.execute({
      path: 'src/db.js',
      content: 'overwrite',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/protected file/i);
  });

  it('blocks .env in path', async () => {
    const result = await tool.execute({
      path: 'src/tools/.env.local',
      content: 'SECRET=bad',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocked pattern/i);
  });

  it('blocks paths outside allowed directories', async () => {
    const result = await tool.execute({
      path: 'config/something.js',
      content: 'nope',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must be in one of/i);
  });

  it('enforces max file size', async () => {
    const bigContent = 'x'.repeat(50001);
    const result = await tool.execute({
      path: 'tests/tmp-test-write.js',
      content: bigContent,
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exceeds maximum size/i);
  });

  it('creates backup when overwriting existing file', async () => {
    // Create the file first
    fs.writeFileSync(TMP_FILE, 'original content', 'utf8');

    const result = await tool.execute({
      path: 'tests/tmp-test-write.js',
      content: 'new content',
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.backed_up).toBe(true);
    expect(result.data.backup_path).toBe('tests/tmp-test-write.js.bak');
    expect(result.summary).toContain('Updated');
    expect(result.summary).toContain('backup created');
    expect(fs.readFileSync(TMP_FILE, 'utf8')).toBe('new content');
    expect(fs.readFileSync(TMP_BAK, 'utf8')).toBe('original content');
  });

  it('rejects missing path', async () => {
    const result = await tool.execute({ content: 'hello' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path is required/i);
  });

  it('rejects missing content', async () => {
    const result = await tool.execute({ path: 'tests/tmp-test-write.js' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/content is required/i);
  });

  it('blocks node_modules paths', async () => {
    const result = await tool.execute({
      path: 'src/tools/node_modules/bad.js',
      content: 'nope',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocked pattern/i);
  });

  it('blocks .git paths', async () => {
    const result = await tool.execute({
      path: 'src/tools/.git/config',
      content: 'nope',
    }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocked pattern/i);
  });
});
