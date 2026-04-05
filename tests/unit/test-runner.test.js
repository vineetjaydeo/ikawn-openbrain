'use strict';

const path = require('path');

describe('test_runner tool', () => {
  let tool;

  beforeEach(() => {
    vi.resetModules();
    tool = require('../../src/tools/v2/test-runner.tool.js');
  });

  it('runs tests in valid project dir (mock execFile)', async () => {
    tool._setExec(async (cmd, args, opts) => {
      expect(cmd).toBe('npm');
      expect(args).toEqual(['run', 'test']);
      expect(opts.cwd).toBe('/Users/vineet/ikawn-openbrain');
      return {
        stdout: 'Tests  5 passed (5)\n',
        stderr: '',
      };
    });

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
    });
    expect(result.ok).toBe(true);
    expect(result.data.passed).toBe(5);
    expect(result.data.failed).toBe(0);
    expect(result.data.total).toBe(5);
    expect(result.data.output).toContain('5 passed');
  });

  it('rejects missing projectDir', async () => {
    const result = await tool.execute({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/projectDir/);
  });

  it('rejects dir without package.json', async () => {
    const result = await tool.execute({
      projectDir: '/tmp',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No package\.json/);
  });

  it('parses vitest output format', async () => {
    tool._setExec(async () => ({
      stdout: `
 ✓ tests/unit/auth.test.js (3 tests)
 ✗ tests/unit/db.test.js (2 tests | 1 failed)

 Tests  12 passed | 3 failed (15)
 Duration  4.21s
`,
      stderr: '',
    }));

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
    });
    expect(result.ok).toBe(true);
    expect(result.data.passed).toBe(12);
    expect(result.data.failed).toBe(3);
    expect(result.data.total).toBe(15);
  });

  it('truncates long output', async () => {
    const longOutput = 'x'.repeat(10000);
    tool._setExec(async () => ({
      stdout: longOutput,
      stderr: '',
    }));

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
    });
    expect(result.ok).toBe(true);
    expect(result.metadata.truncated).toBe(true);
    expect(result.data.output).toContain('...[truncated]...');
    expect(result.data.output.length).toBeLessThan(longOutput.length);
  });

  it('handles test pattern parameter', async () => {
    tool._setExec(async (cmd, args) => {
      expect(args).toEqual(['run', 'test', '--', '--grep', 'auth']);
      return {
        stdout: 'Tests  2 passed (2)\n',
        stderr: '',
      };
    });

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
      testPattern: 'auth',
    });
    expect(result.ok).toBe(true);
    expect(result.data.passed).toBe(2);
  });

  it('handles non-zero exit code from test failures', async () => {
    const err = new Error('Command failed');
    err.stdout = 'Tests  3 passed | 2 failed (5)\n';
    err.stderr = '';
    err.code = 1;
    tool._setExec(async () => { throw err; });

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
    });
    expect(result.ok).toBe(true);
    expect(result.data.passed).toBe(3);
    expect(result.data.failed).toBe(2);
    expect(result.data.exitCode).toBe(1);
  });

  it('returns proper envelope metadata', async () => {
    tool._setExec(async () => ({
      stdout: 'Tests  1 passed (1)\n',
      stderr: '',
    }));

    const result = await tool.execute({
      projectDir: '/Users/vineet/ikawn-openbrain',
    });
    expect(result.metadata.tool).toBe('test_runner');
    expect(typeof result.metadata.duration_ms).toBe('number');
    expect(result.metadata.cost_usd).toBe(0);
  });

  it('rejects non-existent directory', async () => {
    const result = await tool.execute({
      projectDir: '/nonexistent/path/xyz',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });
});
