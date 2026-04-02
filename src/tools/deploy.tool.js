// src/tools/deploy.tool.js
'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const { sendTelegramMessage } = require('../utils/telegram');
const { captureMessage } = require('../utils/capture');

const FLYCTL = process.env.FLYCTL_PATH || `${process.env.HOME}/.fly/bin/flyctl`;
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// Note: uses execFile (not exec) — safe from shell injection.
// _exec, _notify, _capture exposed for test overrides only.
const mod = module.exports = {
  name: 'deploy_openbrain',
  description: 'Deploy OpenBrain to Fly.io (Lucy only). Runs pre-deploy checks (lint + tests), then deploys. Sends Telegram notification on completion.',
  tier: 'agent',
  parameters: {
    app: { type: 'string', required: false, description: 'Fly app name. Only ikawn-openbrain (Lucy) is allowed. ruhi-os-brain requires manual approval.' },
    reason: { type: 'string', required: true, description: 'Why this deploy is happening (logged to memory)' },
    skip_tests: { type: 'boolean', required: false, description: 'Skip pre-deploy checks. Default: false. Strongly discouraged.' },
  },

  // Internal helpers — overridable in tests
  _exec: promisify(execFile),
  _notify: sendTelegramMessage,
  _capture: captureMessage,

  async execute(config, context) {
    const app = config.app || 'ikawn-openbrain';
    const reason = config.reason;
    const skipTests = config.skip_tests || false;

    // 1. Validate app — only Lucy is allowed
    if (app === 'ruhi-os-brain') {
      return {
        success: false,
        data: null,
        summary: 'Ruhi Brain (ruhi-os-brain) deploys require V\'s manual approval. Only Lucy (ikawn-openbrain) can be auto-deployed.',
      };
    }
    if (app !== 'ikawn-openbrain') {
      return {
        success: false,
        data: null,
        summary: `App "${app}" is not allowed. Only ikawn-openbrain (Lucy) can be deployed.`,
      };
    }

    let testsPassed = null;

    // 2. Pre-deploy gate
    if (!skipTests) {
      try {
        await mod._exec('npm', ['run', 'pre-deploy'], {
          cwd: PROJECT_ROOT,
          timeout: 120_000,
        });
        testsPassed = true;
      } catch (err) {
        return {
          success: false,
          data: { tests_passed: false, stderr: (err.stderr || err.message).slice(0, 500) },
          summary: `Pre-deploy failed: ${(err.stderr || err.message).slice(0, 200)}. Fix issues before deploying.`,
        };
      }
    } else {
      testsPassed = 'skipped';
    }

    // 3. Deploy
    let deployOutput;
    try {
      const { stdout, stderr } = await mod._exec(
        FLYCTL,
        ['deploy', '--app', 'ikawn-openbrain', '--remote-only'],
        { cwd: PROJECT_ROOT, timeout: 300_000 }
      );
      deployOutput = (stdout || '') + (stderr || '');
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || err.message);
      await mod._notify(
        `<b>Deploy FAILED</b> — Lucy (ikawn-openbrain)\nReason: ${reason}\nTests: ${testsPassed === true ? 'passed' : testsPassed}\nError: ${(err.message || '').slice(0, 200)}`
      ).catch(() => {});

      await mod._capture({
        brand_id: context.brandId || 'ikawn',
        channel: 'deploy',
        direction: 'outbound',
        content: `Deployed OpenBrain to Lucy. Reason: ${reason}. Status: failed. Error: ${(err.message || '').slice(0, 300)}`,
        source_ref: `deploy_${Date.now()}`,
      }).catch(() => {});

      return {
        success: false,
        data: { tests_passed: testsPassed, deploy_output: output.slice(0, 500) },
        summary: `Deploy failed: ${(err.message || '').slice(0, 200)}`,
      };
    }

    // 4. Verify — check app status
    let machines = [];
    try {
      const { stdout } = await mod._exec(FLYCTL, ['status', '--app', 'ikawn-openbrain', '--json'], { timeout: 15_000 });
      const parsed = JSON.parse(stdout);
      machines = (parsed.Machines || []).map(m => ({ id: m.id, state: m.state, region: m.region }));
    } catch (err) {
      machines = [{ id: 'unknown', state: 'unknown', region: 'unknown' }];
    }

    const runningMachines = machines.filter(m => m.state === 'started');
    const success = runningMachines.length > 0;
    const regionStr = runningMachines.map(m => m.region).join(', ') || 'unknown';

    // 5. Notify via Telegram
    const testsLabel = testsPassed === true ? 'passed' : testsPassed === 'skipped' ? 'skipped' : 'unknown';
    await mod._notify(
      `<b>OpenBrain deployed to Lucy</b> (ikawn-openbrain)\nReason: ${reason}\nTests: ${testsLabel}\nStatus: ${success ? 'success' : 'failed'}\nMachines: ${runningMachines.length} running in ${regionStr}`
    ).catch(() => {});

    // 6. Capture to memory
    await mod._capture({
      brand_id: context.brandId || 'ikawn',
      channel: 'deploy',
      direction: 'outbound',
      content: `Deployed OpenBrain to Lucy. Reason: ${reason}. Status: ${success ? 'success' : 'failed'}. Machines: ${runningMachines.length} in ${regionStr}.`,
      source_ref: `deploy_${Date.now()}`,
    }).catch(() => {});

    return {
      success,
      data: {
        app: 'ikawn-openbrain',
        tests_passed: testsPassed,
        deploy_output: deployOutput.slice(0, 500),
        machines,
      },
      summary: success
        ? `Deployed OpenBrain to Lucy successfully. Tests ${testsLabel}. ${runningMachines.length} machine(s) running in ${regionStr}.`
        : `Deploy completed but no running machines found. Tests ${testsLabel}. Check Fly dashboard.`,
    };
  },
};
