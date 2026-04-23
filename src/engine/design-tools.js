'use strict';

/**
 * Creates a virtual filesystem and design tools for the reasoning loop.
 * Returns { toolSchemas, executors, getFs } where toolSchemas is an array of tool schemas
 * and getFs() returns the current filesystem state.
 */
function createDesignTools({ onFsUpdate, onTodosUpdate } = {}) {
  const fs = new Map();
  const viewedFull = new Set();

  function getFs() {
    return Object.fromEntries(fs);
  }

  // --- str_replace_based_edit_tool ---
  const textEditorTool = {
    name: 'str_replace_based_edit_tool',
    description: 'Virtual filesystem for creating and editing design files. Commands: view, create, str_replace, insert.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['view', 'create', 'str_replace', 'insert'] },
        path: { type: 'string', description: 'File path (e.g. index.html)' },
        file_text: { type: 'string', description: 'Full file content (create command only)' },
        old_str: { type: 'string', description: 'String to replace (str_replace command)' },
        new_str: { type: 'string', description: 'Replacement string (str_replace command)' },
        insert_line: { type: 'integer', description: 'Line number to insert before (insert command)' },
        new_str_insert: { type: 'string', description: 'Text to insert (insert command)' },
        view_range: {
          type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2,
          description: 'Line range [start, end] for partial view'
        },
      },
      required: ['command', 'path'],
    },
  };

  function executeTextEditor(input) {
    const { command, path } = input;

    if (command === 'create') {
      if (!input.file_text) return { error: 'file_text is required for create' };
      fs.set(path, input.file_text);
      if (onFsUpdate) onFsUpdate(path, input.file_text);
      const lines = input.file_text.split('\n').length;
      return { result: `Created ${path} (${lines} lines)` };
    }

    if (command === 'view') {
      const content = fs.get(path);
      if (!content) return { error: `File not found: ${path}` };
      const lines = content.split('\n');

      if (input.view_range) {
        const [start, end] = input.view_range;
        const slice = lines.slice(start - 1, end);
        return { result: slice.map((l, i) => `${start + i}\t${l}`).join('\n') };
      }

      if (viewedFull.has(path) && lines.length > 50) {
        return { result: `File ${path} (${lines.length} lines). Use view_range for specific sections. Preview:\n${lines.slice(0, 10).join('\n')}\n...` };
      }
      viewedFull.add(path);
      return { result: lines.map((l, i) => `${i + 1}\t${l}`).join('\n') };
    }

    if (command === 'str_replace') {
      const content = fs.get(path);
      if (!content) return { error: `File not found: ${path}` };
      if (!input.old_str) return { error: 'old_str is required for str_replace' };
      const count = content.split(input.old_str).length - 1;
      if (count === 0) return { error: `old_str not found in ${path}. Use view to check current content.` };
      if (count > 1) return { error: `old_str found ${count} times in ${path}. Make it more specific.` };
      const updated = content.replace(input.old_str, input.new_str || '');
      fs.set(path, updated);
      if (onFsUpdate) onFsUpdate(path, updated);
      return { result: `Replaced in ${path}` };
    }

    if (command === 'insert') {
      const content = fs.get(path);
      if (!content) return { error: `File not found: ${path}` };
      if (!input.insert_line || !input.new_str_insert) return { error: 'insert_line and new_str_insert required' };
      const lines = content.split('\n');
      lines.splice(input.insert_line - 1, 0, input.new_str_insert);
      const updated = lines.join('\n');
      fs.set(path, updated);
      if (onFsUpdate) onFsUpdate(path, updated);
      return { result: `Inserted at line ${input.insert_line} in ${path}` };
    }

    return { error: `Unknown command: ${command}` };
  }

  // --- set_todos ---
  const setTodosTool = {
    name: 'set_todos',
    description: 'Show your implementation plan to the user as a checklist. Replaces previous list.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              done: { type: 'boolean', default: false },
            },
            required: ['label'],
          },
        },
      },
      required: ['todos'],
    },
  };

  function executeSetTodos(input) {
    if (onTodosUpdate) onTodosUpdate(input.todos);
    const done = input.todos.filter(t => t.done).length;
    return { result: `Plan updated: ${done}/${input.todos.length} complete` };
  }

  // --- list_files ---
  const listFilesTool = {
    name: 'list_files',
    description: 'List all files in the design virtual filesystem.',
    input_schema: { type: 'object', properties: {} },
  };

  function executeListFiles() {
    const files = [...fs.keys()];
    if (files.length === 0) return { result: 'No files yet.' };
    return { result: files.map(f => `${f} (${fs.get(f).split('\n').length} lines)`).join('\n') };
  }

  // --- done ---
  const doneTool = {
    name: 'done',
    description: 'Signal that the design is complete. Runs basic validation on the artifact.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief description of what was built' },
      },
      required: ['summary'],
    },
  };

  function executeDone(input) {
    const html = fs.get('index.html');
    if (!html) return { error: 'No index.html found. Create it first.' };
    const issues = [];
    if (!html.includes('<!DOCTYPE html>') && !html.includes('<!doctype html>')) issues.push('Missing DOCTYPE');
    if (!html.includes('</html>')) issues.push('Missing closing </html>');
    if (!html.includes('<meta name="viewport"')) issues.push('Missing viewport meta (not mobile-responsive)');
    if (html.split('\n').length > 1200) issues.push(`File is ${html.split('\n').length} lines (target: under 1000)`);

    if (issues.length > 0) {
      return { error: `Validation issues:\n${issues.map(i => `- ${i}`).join('\n')}\nFix these before marking done.` };
    }
    return { result: `Design complete: ${input.summary}. ${html.split('\n').length} lines, ${(html.length / 1024).toFixed(1)} KB.` };
  }

  const executors = {
    str_replace_based_edit_tool: executeTextEditor,
    set_todos: executeSetTodos,
    list_files: executeListFiles,
    done: executeDone,
  };

  const toolSchemas = [textEditorTool, setTodosTool, listFilesTool, doneTool];

  return { toolSchemas, executors, getFs };
}

module.exports = { createDesignTools };
