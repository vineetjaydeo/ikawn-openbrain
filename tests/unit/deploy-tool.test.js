// tests/unit/deploy-tool.test.js
// Tests for deploy_openbrain tool — uses execFile (safe, no shell injection)

// Tool uses _exec, _notify, _capture as internal seams — we override them directly.
// No need to mock child_process (vitest can't mock Node built-ins with doMock).

const deployTool = require('../../src/tools/deploy.tool');

const STATUS_OK = JSON.stringify({
  Name: 'ikawn-openbrain', Status: 'running',
  Machines: [{ id: 'abc123', state: 'started', region: 'sin' }],
});

const context = { brandId: 'ikawn' };

function stubExecSequence(responses) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw Object.assign(new Error('unexpected call'), { stdout: '', stderr: '' });
    if (r.error) throw Object.assign(new Error(r.error), { stdout: r.stdout || '', stderr: r.stderr || '' });
    return { stdout: r.stdout || '', stderr: r.stderr || '' };
  });
}

describe('deploy_openbrain tool', () => {
  let origExec, origNotify, origCapture;

  beforeEach(() => {
    origExec = deployTool._exec;
    origNotify = deployTool._notify;
    origCapture = deployTool._capture;
    // Default stubs
    deployTool._notify = vi.fn().mockResolvedValue(true);
    deployTool._capture = vi.fn().mockResolvedValue({});
    deployTool._exec = vi.fn().mockRejectedValue(new Error('not configured'));
  });

  afterEach(() => {
    deployTool._exec = origExec;
    deployTool._notify = origNotify;
    deployTool._capture = origCapture;
  });

  it('has correct tool metadata', () => {
    expect(deployTool.name).toBe('deploy_openbrain');
    expect(deployTool.tier).toBe('agent');
    expect(deployTool.parameters.reason.required).toBe(true);
    expect(deployTool.parameters.app.required).toBe(false);
    expect(deployTool.parameters.skip_tests.required).toBe(false);
  });

  it('rejects ruhi-os-brain with explanation', async () => {
    const result = await deployTool.execute({ app: 'ruhi-os-brain', reason: 'test' }, context);
    expect(result.success).toBe(false);
    expect(result.summary).toContain('manual approval');
    expect(result.summary).toContain('ruhi-os-brain');
    expect(deployTool._exec).not.toHaveBeenCalled();
  });

  it('rejects unknown app names', async () => {
    const result = await deployTool.execute({ app: 'some-other-app', reason: 'test' }, context);
    expect(result.success).toBe(false);
    expect(result.summary).toContain('not allowed');
  });

  it('blocks deploy when pre-deploy fails', async () => {
    deployTool._exec = stubExecSequence([{ error: 'lint failed', stderr: 'ESLint found 3 errors' }]);
    const result = await deployTool.execute({ reason: 'test deploy' }, context);
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Pre-deploy failed');
    expect(result.data.tests_passed).toBe(false);
    expect(deployTool._exec).toHaveBeenCalledTimes(1);
  });

  it('completes full deploy flow on success', async () => {
    deployTool._exec = stubExecSequence([
      { stdout: 'All tests passed' },
      { stdout: 'Deployed successfully' },
      { stdout: STATUS_OK },
    ]);
    const result = await deployTool.execute({ reason: 'feature release' }, context);
    expect(result.success).toBe(true);
    expect(result.data.app).toBe('ikawn-openbrain');
    expect(result.data.tests_passed).toBe(true);
    expect(result.data.machines).toHaveLength(1);
    expect(result.data.machines[0].state).toBe('started');
    expect(result.summary).toContain('successfully');
    expect(deployTool._exec).toHaveBeenCalledTimes(3);
  });

  it('skips pre-deploy when skip_tests is true', async () => {
    deployTool._exec = stubExecSequence([{ stdout: 'Deployed' }, { stdout: STATUS_OK }]);
    const result = await deployTool.execute({ reason: 'hotfix', skip_tests: true }, context);
    expect(result.success).toBe(true);
    expect(result.data.tests_passed).toBe('skipped');
    expect(deployTool._exec).toHaveBeenCalledTimes(2);
  });

  it('sends Telegram notification on success', async () => {
    deployTool._exec = stubExecSequence([{ stdout: 'ok' }, { stdout: 'ok' }, { stdout: STATUS_OK }]);
    await deployTool.execute({ reason: 'notification test' }, context);
    expect(deployTool._notify).toHaveBeenCalledTimes(1);
    const msg = deployTool._notify.mock.calls[0][0];
    expect(msg).toContain('OpenBrain deployed to Lucy');
    expect(msg).toContain('notification test');
    expect(msg).toContain('success');
  });

  it('sends Telegram notification on deploy failure', async () => {
    deployTool._exec = stubExecSequence([
      { stdout: 'tests ok' },
      { error: 'deploy crashed', stderr: 'out of memory' },
    ]);
    const result = await deployTool.execute({ reason: 'failure test' }, context);
    expect(result.success).toBe(false);
    expect(deployTool._notify).toHaveBeenCalledTimes(1);
    expect(deployTool._notify.mock.calls[0][0]).toContain('FAILED');
  });

  it('calls captureMessage on successful deploy', async () => {
    deployTool._exec = stubExecSequence([{ stdout: 'ok' }, { stdout: 'ok' }, { stdout: STATUS_OK }]);
    await deployTool.execute({ reason: 'capture test' }, context);
    expect(deployTool._capture).toHaveBeenCalledTimes(1);
    const call = deployTool._capture.mock.calls[0][0];
    expect(call.channel).toBe('deploy');
    expect(call.direction).toBe('outbound');
    expect(call.content).toContain('capture test');
    expect(call.content).toContain('success');
    expect(call.source_ref).toMatch(/^deploy_\d+$/);
  });

  it('calls captureMessage on deploy failure too', async () => {
    deployTool._exec = stubExecSequence([{ stdout: 'ok' }, { error: 'boom' }]);
    await deployTool.execute({ reason: 'fail capture' }, context);
    expect(deployTool._capture).toHaveBeenCalledTimes(1);
    expect(deployTool._capture.mock.calls[0][0].content).toContain('failed');
  });
});
