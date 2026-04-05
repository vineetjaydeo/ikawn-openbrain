'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('deploy_staging', () => {
  let tool;
  let mockExec;
  let tmpDir;

  beforeEach(() => {
    vi.resetModules();
    tool = require('../../src/tools/v2/deploy-staging.tool');
    mockExec = vi.fn().mockResolvedValue({ stdout: 'deployed successfully', stderr: '' });
    tool._setExec(mockExec);

    // Create a real temp dir with fly.toml
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-test-'));
    fs.writeFileSync(path.join(tmpDir, 'fly.toml'), 'app = "test"');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates fly.toml exists', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-empty-'));
    try {
      const result = await tool.execute({ app: 'my-app', projectDir: emptyDir });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/fly\.toml or Dockerfile/);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('runs pre-deploy before flyctl deploy', async () => {
    const callOrder = [];
    mockExec.mockImplementation((cmd) => {
      if (cmd === 'npm') callOrder.push('pre-deploy');
      else callOrder.push('deploy');
      return Promise.resolve({ stdout: 'ok', stderr: '' });
    });
    tool._setExec(mockExec);

    await tool.execute({ app: 'my-app', projectDir: tmpDir });
    expect(callOrder).toEqual(['pre-deploy', 'deploy']);
    expect(mockExec).toHaveBeenCalledWith('npm', ['run', 'pre-deploy'], expect.objectContaining({ cwd: tmpDir }));
  });

  it('returns success envelope on successful deploy', async () => {
    const result = await tool.execute({ app: 'my-app', projectDir: tmpDir });
    expect(result.ok).toBe(true);
    expect(result.data.success).toBe(true);
    expect(result.data.app).toBe('my-app');
    expect(result.data.deployOutput).toContain('deployed successfully');
    expect(result.metadata.tool).toBe('deploy_staging');
  });

  it('returns error when pre-deploy fails', async () => {
    mockExec.mockRejectedValueOnce({ stderr: 'lint errors found', message: 'exit code 1' });
    const result = await tool.execute({ app: 'my-app', projectDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Pre-deploy failed/);
  });

  it('rejects missing projectDir', async () => {
    const result = await tool.execute({ app: 'my-app', projectDir: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/projectDir is required/);
  });
});

describe('deploy_production', () => {
  let tool;
  let mockExec;
  let tmpDir;

  beforeEach(() => {
    vi.resetModules();
    tool = require('../../src/tools/v2/deploy-production.tool');
    mockExec = vi.fn().mockResolvedValue({ stdout: 'deployed successfully', stderr: '' });
    tool._setExec(mockExec);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-test-'));
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires reason — rejects if missing', async () => {
    const result = await tool.execute({ app: 'my-app', projectDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reason is required/);
  });

  it('requires reason — rejects empty string', async () => {
    const result = await tool.execute({ app: 'my-app', projectDir: tmpDir, reason: '   ' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reason is required/);
  });

  it('has review permissionTier', () => {
    expect(tool.permissionTier).toBe('review');
  });

  it('has 0 maxRetries', () => {
    expect(tool.retryPolicy.maxRetries).toBe(0);
    expect(tool.retryPolicy.backoff).toEqual([]);
  });

  it('includes reason in metadata on success', async () => {
    const result = await tool.execute({
      app: 'my-app',
      projectDir: tmpDir,
      reason: 'critical bugfix',
    });
    expect(result.ok).toBe(true);
    expect(result.metadata.reason).toBe('critical bugfix');
  });

  it('rejects missing projectDir', async () => {
    const result = await tool.execute({ app: 'my-app', projectDir: '', reason: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/projectDir is required/);
  });

  it('returns success envelope on successful deploy', async () => {
    const result = await tool.execute({
      app: 'prod-app',
      projectDir: tmpDir,
      reason: 'hotfix',
    });
    expect(result.ok).toBe(true);
    expect(result.data.app).toBe('prod-app');
    expect(result.metadata.tool).toBe('deploy_production');
  });
});
