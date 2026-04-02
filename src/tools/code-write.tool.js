// src/tools/code-write.tool.js
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');

const ALLOWED_DIRS = [
  'src/tools/',
  'src/utils/',
  'src/skills/',
  'src/workers/',
  'src/connectors/',
  'docs/',
  'tests/',
];

const PROTECTED_FILES = [
  'src/db.js',
  'src/auth.js',
  'src/index.js',
  'package.json',
  'package-lock.json',
  '.env',
];

const BLOCKLIST_PATTERNS = [
  '.env',
  'secret',
  'credential',
  'password',
  '.key',
  '.pem',
  'node_modules',
  '.git/',
];

const MAX_FILE_SIZE = 50000; // 50KB in chars

module.exports = {
  name: 'code_write',
  description: 'Write or create source code files in the OpenBrain codebase. Creates backup of existing files before overwriting.',
  tier: 'agent',
  parameters: {
    path: { type: 'string', description: 'File path relative to project root', required: true },
    content: { type: 'string', description: 'Full file content to write', required: true },
  },

  async execute(config, context) {
    const filePath = config.path;
    const content = config.content;

    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'path is required and must be a string' };
    }
    if (!content || typeof content !== 'string') {
      return { success: false, error: 'content is required and must be a string' };
    }

    // Max file size check
    if (content.length > MAX_FILE_SIZE) {
      return { success: false, error: `Content exceeds maximum size of ${MAX_FILE_SIZE} characters (got ${content.length})` };
    }

    // Resolve and validate path stays within project root
    const resolved = path.resolve(PROJECT_ROOT, filePath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
      return { success: false, error: 'Path traversal detected — path must be within project root' };
    }

    const relative = path.relative(PROJECT_ROOT, resolved);

    // Blocklist pattern check
    const lowerRelative = relative.toLowerCase();
    for (const pattern of BLOCKLIST_PATTERNS) {
      if (lowerRelative.includes(pattern.toLowerCase())) {
        return { success: false, error: `Path contains blocked pattern: ${pattern}` };
      }
    }

    // Protected file check
    const normalizedRelative = relative.split(path.sep).join('/');
    for (const protectedFile of PROTECTED_FILES) {
      if (normalizedRelative === protectedFile) {
        return { success: false, error: `${protectedFile} is a protected file and cannot be written` };
      }
    }

    // Allowlist directory check
    const inAllowedDir = ALLOWED_DIRS.some(dir => normalizedRelative.startsWith(dir));
    if (!inAllowedDir) {
      return { success: false, error: `Path must be in one of: ${ALLOWED_DIRS.join(', ')}` };
    }

    // Backup existing file if it exists
    let backedUp = false;
    let backupPath;
    if (fs.existsSync(resolved)) {
      backupPath = resolved + '.bak';
      fs.copyFileSync(resolved, backupPath);
      backedUp = true;
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(resolved);
    fs.mkdirSync(parentDir, { recursive: true });

    // Write the file
    fs.writeFileSync(resolved, content, 'utf8');

    const bytes = Buffer.byteLength(content, 'utf8');
    const relativeBackup = backedUp ? path.relative(PROJECT_ROOT, backupPath).split(path.sep).join('/') : undefined;

    const data = {
      path: normalizedRelative,
      bytes,
      backed_up: backedUp,
    };
    if (backedUp) {
      data.backup_path = relativeBackup;
    }

    const action = backedUp ? 'Updated' : 'Created';
    const backupNote = backedUp ? ', backup created' : '';
    const summary = `${action} ${normalizedRelative} (${bytes} bytes${backupNote})`;

    return { success: true, data, summary };
  },
};
