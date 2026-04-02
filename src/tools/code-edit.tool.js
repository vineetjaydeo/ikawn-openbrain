// src/tools/code-edit.tool.js
'use strict';

const fs = require('fs');
const nodePath = require('path');

const PROJECT_ROOT = nodePath.resolve(__dirname, '../../');

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

function isPathAllowed(relPath) {
  // Check blocklist patterns
  const lower = relPath.toLowerCase();
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (lower.includes(pattern)) return { allowed: false, reason: `Path matches blocked pattern: ${pattern}` };
  }

  // Check protected files
  for (const pf of PROTECTED_FILES) {
    if (relPath === pf) return { allowed: false, reason: `${pf} is a protected file` };
  }

  // Check allowlist directories
  const inAllowed = ALLOWED_DIRS.some(dir => relPath.startsWith(dir));
  if (!inAllowed) {
    return { allowed: false, reason: `Path must be within: ${ALLOWED_DIRS.join(', ')}` };
  }

  return { allowed: true };
}

module.exports = {
  name: 'code_edit',
  description: 'Edit source code files using string replacement. Finds old_string and replaces with new_string. Creates backup before editing.',
  tier: 'agent',
  parameters: {
    path:        { type: 'string',  required: true,  description: 'File path relative to project root' },
    old_string:  { type: 'string',  required: true,  description: 'The exact string to find and replace' },
    new_string:  { type: 'string',  required: true,  description: 'The replacement string' },
    replace_all: { type: 'boolean', required: false, description: 'Replace all occurrences (default: false — only first unique match)' },
  },

  async execute(config, context) {
    const { path: filePath, old_string, new_string, replace_all } = config;

    if (!filePath || typeof old_string !== 'string' || typeof new_string !== 'string') {
      return { success: false, summary: 'Missing required parameters: path, old_string, new_string' };
    }

    // Resolve and validate path stays within project root
    const resolved = nodePath.resolve(PROJECT_ROOT, filePath);
    if (!resolved.startsWith(PROJECT_ROOT + nodePath.sep) && resolved !== PROJECT_ROOT) {
      return { success: false, summary: 'Path traversal detected — must stay within project root' };
    }

    const relPath = nodePath.relative(PROJECT_ROOT, resolved);

    // Check allowlist / blocklist / protected
    const check = isPathAllowed(relPath);
    if (!check.allowed) {
      return { success: false, summary: check.reason };
    }

    // Read existing file
    let content;
    try {
      content = fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: false, summary: `File not found: ${relPath}` };
      }
      return { success: false, summary: `Failed to read file: ${err.message}` };
    }

    // Check if old_string exists
    const firstIndex = content.indexOf(old_string);
    if (firstIndex === -1) {
      return { success: false, summary: 'old_string not found in file' };
    }

    // Count occurrences
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf(old_string, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + old_string.length;
    }

    // If not replace_all and ambiguous, reject
    if (!replace_all && count > 1) {
      return {
        success: false,
        summary: `old_string is ambiguous (found ${count} times). Provide more context or use replace_all: true`,
      };
    }

    // Create backup
    let backedUp = false;
    try {
      fs.writeFileSync(resolved + '.bak', content, 'utf8');
      backedUp = true;
    } catch (err) {
      // Non-fatal — proceed without backup
      console.warn(`[code_edit] Could not create backup for ${relPath}: ${err.message}`);
    }

    // Perform replacement
    let newContent;
    let replacedCount;
    if (replace_all) {
      newContent = content.split(old_string).join(new_string);
      replacedCount = count;
    } else {
      // Single replacement (already verified unique)
      newContent = content.replace(old_string, new_string);
      replacedCount = 1;
    }

    // Write back
    try {
      fs.writeFileSync(resolved, newContent, 'utf8');
    } catch (err) {
      return { success: false, summary: `Failed to write file: ${err.message}` };
    }

    const backupNote = backedUp ? ` Backup at ${relPath}.bak` : '';
    return {
      success: true,
      data: {
        path: relPath,
        occurrences_replaced: replacedCount,
        backed_up: backedUp,
      },
      summary: `Edited ${relPath}: replaced ${replacedCount} occurrence${replacedCount > 1 ? 's' : ''}.${backupNote}`,
    };
  },
};
