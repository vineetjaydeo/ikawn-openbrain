'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { createEnvelope } = require('../../engine/tool-interface');

const FLYCTL = process.env.FLYCTL_PATH || `${process.env.HOME}/.fly/bin/flyctl`;

let _execFn = promisify(execFile);

const mod = module.exports = {
  name: 'deploy_staging',
  description: 'Deploy an application to staging environment on Fly.io. Runs pre-deploy checks first.',
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'Fly app name to deploy' },
      projectDir: { type: 'string', description: 'Absolute path to the project directory' },
    },
    required: ['app', 'projectDir'],
  },
  permissionTier: 'confirm',
  category: 'execute',
  timeout: 300000,
  retryPolicy: { maxRetries: 1, backoff: [5000], timeoutMs: 300000 },

  _setExec(fn) {
    _execFn = fn;
  },

  async execute(input) {
    const start = Date.now();
    const { app, projectDir } = input;
    const meta = { tool: 'deploy_staging', duration_ms: 0, attempt: 1, truncated: false, cost_usd: 0 };

    // Validate projectDir
    if (!projectDir) {
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, 'projectDir is required', meta);
    }

    // Check projectDir exists and has fly.toml or Dockerfile
    const hasFlyToml = fs.existsSync(path.join(projectDir, 'fly.toml'));
    const hasDockerfile = fs.existsSync(path.join(projectDir, 'Dockerfile'));
    if (!hasFlyToml && !hasDockerfile) {
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, `projectDir "${projectDir}" must contain a fly.toml or Dockerfile`, meta);
    }

    // Run pre-deploy
    try {
      await _execFn('npm', ['run', 'pre-deploy'], { cwd: projectDir, timeout: 120000 });
    } catch (err) {
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, `Pre-deploy failed: ${(err.stderr || err.message || '').slice(0, 500)}`, meta);
    }

    // Run deploy
    try {
      const { stdout, stderr } = await _execFn(
        FLYCTL,
        ['deploy', '--app', app, '--remote-only'],
        { cwd: projectDir, timeout: 300000 }
      );
      const deployOutput = (stdout || '') + (stderr || '');
      meta.duration_ms = Date.now() - start;
      return createEnvelope(true, { success: true, app, deployOutput: deployOutput.slice(0, 2000) }, null, meta);
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || err.message || '');
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, `Deploy failed: ${output.slice(0, 500)}`, meta);
    }
  },
};
