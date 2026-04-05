'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { createEnvelope } = require('../../engine/tool-interface');

const FLYCTL = process.env.FLYCTL_PATH || `${process.env.HOME}/.fly/bin/flyctl`;

let _execFn = promisify(execFile);

const mod = module.exports = {
  name: 'deploy_production',
  description: 'Deploy an application to production on Fly.io. Requires explicit approval and a reason. Runs pre-deploy checks first.',
  inputSchema: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'Fly app name to deploy' },
      projectDir: { type: 'string', description: 'Absolute path to the project directory' },
      reason: { type: 'string', description: 'Why this deploy is happening (mandatory, logged for audit)' },
    },
    required: ['app', 'projectDir', 'reason'],
  },
  permissionTier: 'review',
  category: 'ship',
  timeout: 300000,
  retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 300000 },

  _setExec(fn) {
    _execFn = fn;
  },

  async execute(input) {
    const start = Date.now();
    const { app, projectDir, reason } = input;
    const meta = { tool: 'deploy_production', duration_ms: 0, attempt: 1, truncated: false, cost_usd: 0 };

    // Validate reason
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, 'reason is required for production deploys', meta);
    }

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
      const envelope = createEnvelope(false, null, `Pre-deploy failed: ${(err.stderr || err.message || '').slice(0, 500)}`, meta);
      envelope.metadata.reason = reason;
      return envelope;
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
      const envelope = createEnvelope(true, { success: true, app, deployOutput: deployOutput.slice(0, 2000) }, null, meta);
      envelope.metadata.reason = reason;
      return envelope;
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || err.message || '');
      meta.duration_ms = Date.now() - start;
      const envelope = createEnvelope(false, null, `Deploy failed: ${output.slice(0, 500)}`, meta);
      envelope.metadata.reason = reason;
      return envelope;
    }
  },
};
