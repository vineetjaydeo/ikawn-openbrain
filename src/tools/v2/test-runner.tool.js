'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile: _execFile } = require('child_process');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

let execFile = promisify(_execFile);

/** Allow test injection of execFile */
function _setExec(fn) {
  execFile = fn;
}

const MAX_OUTPUT = 5000;
const TRUNCATE_HALF = 2500;

function truncateOutput(str) {
  if (!str || str.length <= MAX_OUTPUT) return { text: str || '', truncated: false };
  const head = str.slice(0, TRUNCATE_HALF);
  const tail = str.slice(-TRUNCATE_HALF);
  return { text: `${head}\n...[truncated]...\n${tail}`, truncated: true };
}

function parseVitestOutput(output) {
  const counts = { passed: 0, failed: 0, total: 0 };

  // vitest format: "Tests  12 passed | 3 failed (15)"
  const vitestMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i);
  if (vitestMatch) {
    counts.passed = parseInt(vitestMatch[1], 10);
    counts.failed = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
    counts.total = counts.passed + counts.failed;
    return counts;
  }

  // alternative: "X passed" standalone
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);
  if (passedMatch) counts.passed = parseInt(passedMatch[1], 10);
  if (failedMatch) counts.failed = parseInt(failedMatch[1], 10);
  counts.total = counts.passed + counts.failed;

  return counts;
}

module.exports = {
  name: 'test_runner',
  description: 'Run npm test or specific test files in a project directory. Captures pass/fail counts from test output.',
  inputSchema: {
    type: 'object',
    properties: {
      projectDir: { type: 'string', description: 'Absolute path to the project directory' },
      testPattern: { type: 'string', description: 'Optional grep pattern to filter tests' },
    },
    required: ['projectDir'],
  },
  permissionTier: 'confirm',
  category: 'execute',
  timeout: 120000,
  retryPolicy: DEFAULT_RETRY_POLICIES.execute,

  _setExec,

  async execute(input) {
    const start = Date.now();
    const meta = { tool: 'test_runner', duration_ms: 0, attempt: 1, truncated: false, cost_usd: 0 };

    try {
      const { projectDir, testPattern } = input;

      if (!projectDir || typeof projectDir !== 'string') {
        meta.duration_ms = Date.now() - start;
        return createEnvelope(false, null, 'projectDir is required and must be a string', meta);
      }

      if (!fs.existsSync(projectDir)) {
        meta.duration_ms = Date.now() - start;
        return createEnvelope(false, null, `Directory does not exist: ${projectDir}`, meta);
      }

      const pkgPath = path.join(projectDir, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        meta.duration_ms = Date.now() - start;
        return createEnvelope(false, null, `No package.json found in: ${projectDir}`, meta);
      }

      const args = ['run', 'test'];
      if (testPattern) {
        args.push('--', '--grep', testPattern);
      }

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      try {
        const result = await execFile('npm', args, {
          cwd: projectDir,
          timeout: 110000,
          maxBuffer: 10 * 1024 * 1024,
        });
        stdout = result.stdout || '';
        stderr = result.stderr || '';
      } catch (execErr) {
        // npm test returns non-zero on test failure — that's expected
        stdout = execErr.stdout || '';
        stderr = execErr.stderr || '';
        exitCode = execErr.code || 1;
      }

      const combined = stdout + '\n' + stderr;
      const counts = parseVitestOutput(combined);
      const { text: output, truncated } = truncateOutput(combined);
      meta.truncated = truncated;

      meta.duration_ms = Date.now() - start;
      return createEnvelope(true, {
        passed: counts.passed,
        failed: counts.failed,
        total: counts.total,
        exitCode,
        output,
      }, null, meta);
    } catch (err) {
      meta.duration_ms = Date.now() - start;
      return createEnvelope(false, null, err.message, meta);
    }
  },
};
