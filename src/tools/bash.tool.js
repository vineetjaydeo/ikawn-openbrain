// src/tools/bash.tool.js
'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const MAX_OUTPUT = 10000;
const TIMEOUT_MS = 30000;
const MAX_BUFFER = 1024 * 1024; // 1MB
const MAX_NODE_EVAL_LENGTH = 500;

// ── Allowlisted base commands ──────────────────────────────────────────

const ALLOWED_BASE_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'find', 'diff',
  'git', 'npm', 'node', 'flyctl',
]);

// ── Git subcommand rules ───────────────────────────────────────────────

const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'status', 'diff', 'log', 'add', 'commit', 'push', 'branch', 'stash',
]);

const BLOCKED_GIT_PATTERNS = [
  'git push --force', 'git push -f ', 'git reset --hard', 'git clean', 'git checkout .',
];

// ── NPM subcommand rules ──────────────────────────────────────────────

const ALLOWED_NPM_COMMANDS = new Set([
  'npm test', 'npm run lint', 'npm run pre-deploy',
]);

const BLOCKED_NPM_PATTERNS = ['npm install', 'npm uninstall', 'npm i '];

// ── Flyctl subcommand rules ────────────────────────────────────────────

const ALLOWED_FLYCTL_SUBCOMMANDS = new Set(['status', 'logs']);
const BLOCKED_FLYCTL_PATTERNS = ['flyctl secrets', 'flyctl destroy', 'flyctl scale'];

// ── Universal blocked patterns (always reject) ────────────────────────

const BLOCKED_PATTERNS = [
  /rm\s+-(r|rf|fr)\b/,
  /\bDROP\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bcurl\b/,
  /\bwget\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\beval\b/,
  /\bexec\b/,
  /\bsource\b/,
  /\bsudo\b/,
  />\s*(\.env|auth\.js|db\.js|index\.js)/,
  /\|\s*(bash|sh|zsh)\b/,
  /`[^`]+`/,          // backtick command substitution
  /\$\([^)]+\)/,      // $() command substitution
];

// ── Sensitive env vars to strip ────────────────────────────────────────

const SENSITIVE_ENV_KEYS = [
  'OPENAI_API_KEY', 'OPENAI_ADMIN_KEY', 'ANTHROPIC_API_KEY',
  'DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'API_KEY', 'ADMIN_API_KEY',
  'ACTIVEPIECES_API_KEY', 'AP_INTERNAL_KEY', 'GITHUB_TOKEN',
];

// ── Validation logic (exported separately for testing) ─────────────────

function isCommandAllowed(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, reason: 'Command must be a non-empty string' };
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: false, reason: 'Command must be a non-empty string' };
  }

  // Check universal blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: `Command contains blocked pattern: ${pattern}` };
    }
  }

  // Check for command chaining — reject if chaining operators are present
  // (after blocked pattern check so we catch the specific block reason)
  if (/[;]|&&|\|\|/.test(trimmed)) {
    // Allow simple pipe (|) but not || or ; or &&
    // Actually, let's check for ; and && and || specifically
    if (/;/.test(trimmed) || /&&/.test(trimmed) || /\|\|/.test(trimmed)) {
      return { allowed: false, reason: 'Command chaining (;, &&, ||) is not allowed' };
    }
  }

  // Simple pipe is allowed for things like `grep foo | wc -l`
  // but the piped-to command must also be in the allowlist
  const pipeSegments = trimmed.split(/\s*\|\s*/).filter(Boolean);
  for (const segment of pipeSegments) {
    const segBase = segment.trim().split(/\s+/)[0];
    if (!ALLOWED_BASE_COMMANDS.has(segBase)) {
      return { allowed: false, reason: `Base command '${segBase}' is not in the allowlist` };
    }
  }

  // Extract base command from first segment
  const baseCommand = pipeSegments[0].trim().split(/\s+/)[0];

  if (!ALLOWED_BASE_COMMANDS.has(baseCommand)) {
    return { allowed: false, reason: `Base command '${baseCommand}' is not in the allowlist` };
  }

  // ── find: block -exec and -delete ──
  if (baseCommand === 'find') {
    if (/-exec\b/.test(trimmed) || /-delete\b/.test(trimmed)) {
      return { allowed: false, reason: 'find with -exec or -delete is not allowed' };
    }
  }

  // ── git: validate subcommand ──
  if (baseCommand === 'git') {
    // Check blocked git patterns first
    for (const pattern of BLOCKED_GIT_PATTERNS) {
      if (trimmed.startsWith(pattern)) {
        return { allowed: false, reason: `Destructive git command blocked: ${pattern}` };
      }
    }

    const parts = trimmed.split(/\s+/);
    const subcommand = parts[1];
    if (!subcommand || !ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
      return { allowed: false, reason: `git subcommand '${subcommand || '(none)'}' is not allowed. Allowed: ${[...ALLOWED_GIT_SUBCOMMANDS].join(', ')}` };
    }
  }

  // ── npm: validate full command ──
  if (baseCommand === 'npm') {
    // Check blocked patterns first
    for (const pattern of BLOCKED_NPM_PATTERNS) {
      if (trimmed.startsWith(pattern)) {
        return { allowed: false, reason: `npm command blocked: ${pattern.trim()}` };
      }
    }

    // Must match an allowed npm command exactly (with optional trailing args)
    const isAllowed = [...ALLOWED_NPM_COMMANDS].some(cmd => trimmed === cmd || trimmed.startsWith(cmd + ' '));
    if (!isAllowed) {
      return { allowed: false, reason: `npm command not allowed. Allowed: ${[...ALLOWED_NPM_COMMANDS].join(', ')}` };
    }
  }

  // ── node: only -e with short eval ──
  if (baseCommand === 'node') {
    if (!trimmed.includes(' -e ') && !trimmed.includes(" -e '") && !trimmed.includes(' -e "')) {
      return { allowed: false, reason: 'node is only allowed with -e flag for simple evaluations' };
    }
    // Check eval length (everything after -e)
    const evalMatch = trimmed.match(/-e\s+(['"]?)(.+)\1\s*$/);
    const evalContent = evalMatch ? evalMatch[2] : trimmed.split(/-e\s+/)[1] || '';
    if (evalContent.length > MAX_NODE_EVAL_LENGTH) {
      return { allowed: false, reason: `node -e expression exceeds max length of ${MAX_NODE_EVAL_LENGTH} characters` };
    }
  }

  // ── flyctl: validate subcommand ──
  if (baseCommand === 'flyctl') {
    // Check blocked patterns first
    for (const pattern of BLOCKED_FLYCTL_PATTERNS) {
      if (trimmed.startsWith(pattern)) {
        return { allowed: false, reason: `flyctl command blocked: ${pattern}` };
      }
    }

    const parts = trimmed.split(/\s+/);
    const subcommand = parts[1];

    // Special case: flyctl deploy only with --app ikawn-openbrain
    if (subcommand === 'deploy') {
      if (!trimmed.includes('--app ikawn-openbrain')) {
        return { allowed: false, reason: 'flyctl deploy is only allowed with --app ikawn-openbrain' };
      }
      return { allowed: true };
    }

    if (!subcommand || !ALLOWED_FLYCTL_SUBCOMMANDS.has(subcommand)) {
      return { allowed: false, reason: `flyctl subcommand '${subcommand || '(none)'}' is not allowed. Allowed: ${[...ALLOWED_FLYCTL_SUBCOMMANDS].join(', ')}, deploy (with --app ikawn-openbrain)` };
    }
  }

  return { allowed: true };
}

function truncateOutput(str) {
  if (!str || str.length <= MAX_OUTPUT) return str;
  return str.substring(0, MAX_OUTPUT) + `\n... [truncated, ${str.length} total chars]`;
}

function buildSafeEnv() {
  const env = { ...process.env };
  for (const key of SENSITIVE_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

// ── Tool export ────────────────────────────────────────────────────────

module.exports = {
  name: 'bash_exec',
  description: 'Execute allowlisted shell commands in the OpenBrain project directory. Only safe, pre-approved commands are permitted.',
  tier: 'agent',
  parameters: {
    command: { type: 'string', required: true, description: 'The shell command to execute' },
  },

  // Exported for testing
  isCommandAllowed,

  async execute(config, context) {
    const { command } = config;

    // Validate
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      return {
        success: false,
        data: null,
        summary: `Command not allowed: ${validation.reason}`,
      };
    }

    // Execute
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: PROJECT_ROOT,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: buildSafeEnv(),
      });

      return {
        success: true,
        data: {
          command,
          exitCode: 0,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
        },
        summary: `${command.split(/\s+/).slice(0, 3).join(' ')} completed successfully (exit code 0)`,
      };
    } catch (err) {
      // exec errors include exit code and stdout/stderr
      const exitCode = err.code || 1;
      const killed = err.killed || false;

      if (killed) {
        return {
          success: false,
          data: { command, exitCode, stdout: truncateOutput(err.stdout || ''), stderr: truncateOutput(err.stderr || '') },
          summary: `Command timed out after ${TIMEOUT_MS / 1000}s and was killed`,
        };
      }

      return {
        success: false,
        data: {
          command,
          exitCode,
          stdout: truncateOutput(err.stdout || ''),
          stderr: truncateOutput(err.stderr || ''),
        },
        summary: `Command failed (exit code ${exitCode}): ${(err.stderr || err.message || '').substring(0, 200)}`,
      };
    }
  },
};
