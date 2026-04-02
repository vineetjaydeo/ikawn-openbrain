// tests/unit/code-edit-tool.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('code_edit tool', () => {
  let tool;
  let tmpDir;
  let origResolve;

  // We need to override PROJECT_ROOT so the tool operates on our temp dir.
  // The tool resolves paths relative to ../../ from its own location.
  // Instead, we'll test the tool directly and create files in the expected allowlist dirs.

  beforeAll(() => {
    tool = require('../../src/tools/code-edit.tool.js');
  });

  // Create a temp project structure that mirrors the allowlist
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-edit-test-'));
  });

  afterEach(() => {
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper: create a test file inside the real project's allowed directory
  // We'll use a dedicated test fixture path under tests/ which is in the allowlist
  const FIXTURE_REL = 'tests/_code_edit_fixture.js';
  const PROJECT_ROOT = path.resolve(__dirname, '../../');
  const FIXTURE_ABS = path.join(PROJECT_ROOT, FIXTURE_REL);

  afterEach(() => {
    // Clean up fixture and backup
    try { fs.unlinkSync(FIXTURE_ABS); } catch {}
    try { fs.unlinkSync(FIXTURE_ABS + '.bak'); } catch {}
  });

  function writeFixture(content) {
    fs.writeFileSync(FIXTURE_ABS, content, 'utf8');
  }

  function readFixture() {
    return fs.readFileSync(FIXTURE_ABS, 'utf8');
  }

  it('successfully replaces a unique string', async () => {
    writeFixture('const x = 1;\nconst y = 2;\n');
    const result = await tool.execute({
      path: FIXTURE_REL,
      old_string: 'const x = 1;',
      new_string: 'const x = 42;',
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.occurrences_replaced).toBe(1);
    expect(result.data.backed_up).toBe(true);
    expect(readFixture()).toBe('const x = 42;\nconst y = 2;\n');
  });

  it('rejects ambiguous match when replace_all is false', async () => {
    writeFixture('foo bar foo baz foo\n');
    const result = await tool.execute({
      path: FIXTURE_REL,
      old_string: 'foo',
      new_string: 'qux',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/ambiguous.*3 times/);
    // File should be unchanged
    expect(readFixture()).toBe('foo bar foo baz foo\n');
  });

  it('replaces all occurrences when replace_all is true', async () => {
    writeFixture('foo bar foo baz foo\n');
    const result = await tool.execute({
      path: FIXTURE_REL,
      old_string: 'foo',
      new_string: 'qux',
      replace_all: true,
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.occurrences_replaced).toBe(3);
    expect(readFixture()).toBe('qux bar qux baz qux\n');
  });

  it('returns error when old_string not found', async () => {
    writeFixture('hello world\n');
    const result = await tool.execute({
      path: FIXTURE_REL,
      old_string: 'nonexistent string',
      new_string: 'replacement',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toBe('old_string not found in file');
  });

  it('blocks path traversal', async () => {
    const result = await tool.execute({
      path: '../../../etc/passwd',
      old_string: 'root',
      new_string: 'hacked',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/traversal/i);
  });

  it('blocks protected files', async () => {
    const result = await tool.execute({
      path: 'src/db.js',
      old_string: 'pool',
      new_string: 'hacked',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/protected/i);
  });

  it('blocks .env files', async () => {
    const result = await tool.execute({
      path: 'src/tools/.env.local',
      old_string: 'KEY=',
      new_string: 'KEY=hacked',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/blocked pattern/i);
  });

  it('creates backup before editing', async () => {
    const original = 'original content\n';
    writeFixture(original);
    await tool.execute({
      path: FIXTURE_REL,
      old_string: 'original',
      new_string: 'modified',
    }, {});

    const backup = fs.readFileSync(FIXTURE_ABS + '.bak', 'utf8');
    expect(backup).toBe(original);
  });

  it('returns error for non-existent file', async () => {
    const result = await tool.execute({
      path: 'tests/does_not_exist_12345.js',
      old_string: 'anything',
      new_string: 'something',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/not found/i);
  });

  it('rejects paths outside allowed directories', async () => {
    const result = await tool.execute({
      path: 'src/routes/chat-api.js',
      old_string: 'something',
      new_string: 'else',
    }, {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/must be within/i);
  });
});
