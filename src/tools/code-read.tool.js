// src/tools/code-read.tool.js
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');

const ALLOWED_DIRS = ['src/', 'docs/', 'tests/', 'tasks/'];
const ALLOWED_ROOT_FILES = ['package.json', 'CLAUDE.md', 'ARCHITECTURE.md', 'README.md'];
const BLOCKLIST_PATTERNS = ['.env', 'node_modules', '.git/', 'secret', 'credential', 'password', '.key', '.pem'];

const MAX_FILE_SIZE = 500 * 1024; // 500KB
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

function isPathAllowed(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  // Check blocklist
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (normalized.toLowerCase().includes(pattern.toLowerCase())) {
      return { allowed: false, reason: `Path contains blocked pattern: ${pattern}` };
    }
  }

  // Check if it's an allowed root file
  if (ALLOWED_ROOT_FILES.includes(normalized)) {
    return { allowed: true };
  }

  // Check if it's in an allowed directory
  for (const dir of ALLOWED_DIRS) {
    if (normalized.startsWith(dir)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: `Path not in allowed directories (${ALLOWED_DIRS.join(', ')}) or root files (${ALLOWED_ROOT_FILES.join(', ')})` };
}

module.exports = {
  name: 'code_read',
  description: 'Read source code files from the OpenBrain codebase. Returns file content with line numbers.',
  tier: 'agent',
  parameters: {
    path: { type: 'string', description: 'File path relative to project root (e.g., src/routes/chat-api.js)', required: true },
    offset: { type: 'number', description: 'Line number to start reading from (default: 1)' },
    limit: { type: 'number', description: 'Number of lines to read (default: 200, max: 500)' },
  },
  async execute(config, context) {
    const filePath = config.path;

    if (!filePath || typeof filePath !== 'string') {
      return { success: false, summary: 'Missing required parameter: path' };
    }

    // Resolve absolute path and validate it stays within project root
    const absolutePath = path.resolve(PROJECT_ROOT, filePath);
    if (!absolutePath.startsWith(PROJECT_ROOT + path.sep) && absolutePath !== PROJECT_ROOT) {
      return { success: false, summary: 'Path traversal detected — access denied.' };
    }

    // Get relative path for allowlist check
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);

    // Check allowlist/blocklist
    const check = isPathAllowed(relativePath);
    if (!check.allowed) {
      return { success: false, summary: `Access denied: ${check.reason}` };
    }

    // Check file exists
    if (!fs.existsSync(absolutePath)) {
      return { success: false, summary: `File not found: ${filePath}` };
    }

    // Check file size
    const stat = fs.statSync(absolutePath);
    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        summary: `File too large (${Math.round(stat.size / 1024)}KB > 500KB limit). Use offset and limit parameters to read a portion.`,
      };
    }

    // Read file
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    // Apply offset and limit (1-indexed)
    const offset = Math.max(1, Math.floor(config.offset || 1));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(config.limit || DEFAULT_LIMIT)));
    const startIdx = offset - 1;
    const endIdx = Math.min(startIdx + limit, totalLines);
    const selectedLines = allLines.slice(startIdx, endIdx);

    // Format with line numbers (cat -n style)
    const maxLineNumWidth = String(endIdx).length;
    const formatted = selectedLines
      .map((line, i) => {
        const lineNum = String(offset + i).padStart(maxLineNumWidth, ' ');
        return `${lineNum}\t${line}`;
      })
      .join('\n');

    const linesRead = endIdx - startIdx;
    return {
      success: true,
      data: {
        path: relativePath,
        content: formatted,
        lines: linesRead,
        totalLines,
      },
      summary: `Read ${relativePath} lines ${offset}-${offset + linesRead - 1} (${totalLines} total)`,
    };
  },
};
