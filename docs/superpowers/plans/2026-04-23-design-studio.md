# Design Studio (`/design`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Open-CoDesign from Electron to a web app served at `/design` in OpenBrain, giving Lucy a v0/Bolt.new-style design tool with prompt input, live iframe preview, and iterative editing.

**Architecture:** Standalone Vite React app in `src/design-app/` built to static files and served by Express at `/design`. Backend API endpoints handle design CRUD, chat persistence, and generation via SSE. Generation uses OpenBrain's existing reasoning loop with Open-CoDesign's tools (str_replace_based_edit_tool, set_todos, done) and design-generation system prompt. Designs/snapshots stored in Postgres.

**Tech Stack:** React 19, Vite 6, Zustand, Tailwind v4, SSE streaming, Express, Postgres

**Source Reference:** `/Users/vineet/ikawn-openbrain/references/open-codesign/`

---

## File Structure

### New files to create

```
src/design-app/                          # Standalone Vite React app
  package.json                           # React 19, Vite 6, Zustand, Tailwind v4
  vite.config.ts                         # Build to ../design-app-dist/
  tsconfig.json
  index.html                             # SPA entry
  src/
    main.tsx                             # React root
    App.tsx                              # Split layout: sidebar + preview
    api.ts                               # HTTP/SSE client (replaces IPC bridge)
    store.ts                             # Zustand store (ported from Open-CoDesign, IPC->fetch)
    types.ts                             # Shared types (Design, Snapshot, ChatMessage, etc.)
    components/
      Sidebar.tsx                        # Chat panel (copied from OCD)
      PreviewPane.tsx                    # Iframe preview (copied from OCD)
      PreviewToolbar.tsx                 # Viewport/zoom controls (copied from OCD)
      PhoneFrame.tsx                     # Mobile viewport chrome (copied from OCD)
      TopBar.tsx                         # Header: design name, model, export
      CanvasTabBar.tsx                   # File tabs (copied from OCD)
      Toast.tsx                          # Toast notifications (copied from OCD)
      ErrorBoundary.tsx                  # Error boundary (copied from OCD)
      chat/
        ChatMessageList.tsx              # Scrollable message list (copied)
        PromptInput.tsx                  # Composer with submit (copied)
        AssistantText.tsx                # Assistant bubble (copied)
        UserMessage.tsx                  # User bubble (copied)
        WorkingCard.tsx                  # Generation progress (copied)
        EmptyState.tsx                   # Welcome/starter prompts (adapted)
    hooks/
      useAgentStream.ts                  # SSE listener (replaces IPC bridge)
      useKeyboard.ts                     # Keyboard shortcuts (copied)
    lib/
      runtime.ts                         # buildSrcdoc() ported from @open-codesign/runtime

src/routes/design-api.js                 # Express router: design CRUD + generation SSE
src/routes/design-page.js                # Express route: serves built React app at /design
src/engine/design-tools.js               # Open-CoDesign tools adapted for reasoning loop
src/engine/design-prompts.js             # Design generation system prompt (from OCD prompts/)
```

### Files to modify

```
src/index.js                             # Mount design-api and design-page routes
src/db.js                                # Add designs, design_snapshots, design_chat tables
src/routes/chat-page.js                  # Sidebar link (ALREADY DONE)
package.json                             # Add build:design script
```

---

## Task 1: Database Schema

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Add design tables to db.js schema init**

Add after the existing `CREATE TABLE IF NOT EXISTS` blocks in the `initSchema()` function:

```sql
CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  brand_id TEXT NOT NULL DEFAULT 'ikawn',
  name TEXT NOT NULL DEFAULT 'Untitled',
  thumbnail_text TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS design_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES design_snapshots(id),
  type TEXT NOT NULL DEFAULT 'initial',
  prompt TEXT,
  artifact_type TEXT NOT NULL DEFAULT 'html',
  artifact_source TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS design_chat (
  seq SERIAL PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  snapshot_id TEXT REFERENCES design_snapshots(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designs_user ON designs(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_snapshots_design ON design_snapshots(design_id);
CREATE INDEX IF NOT EXISTS idx_design_chat_design ON design_chat(design_id);
```

- [ ] **Step 2: Run OpenBrain locally to verify schema creates**

```bash
node -e "require('./src/db').getPool()" 
```

Check logs for schema creation errors.

- [ ] **Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat(design): add designs, snapshots, chat tables"
```

---

## Task 2: Design Generation System Prompt

**Files:**
- Create: `src/engine/design-prompts.js`

- [ ] **Step 1: Port the system prompt from Open-CoDesign**

Copy the prompt constants from `references/open-codesign/packages/core/src/prompts/index.ts`. The key sections to port:

```js
// src/engine/design-prompts.js
'use strict';

const IDENTITY = `You are Lucy Design Studio, an expert web design partner. You create production-quality, visually distinctive HTML pages.`;

const WORKFLOW = `## Workflow
1. **Understand** - Parse the request, identify type (landing page, dashboard, form, etc.)
2. **Explore** - Consider 2-3 visual directions before committing
3. **Implement** - Write complete, self-contained HTML with inline CSS and JS
4. **Self-check** - Verify responsive behavior, accessibility, visual polish
5. **Deliver** - Output the complete HTML document`;

const OUTPUT_RULES = `## Output Rules
- Output a COMPLETE, self-contained HTML document (<!DOCTYPE html> through </html>)
- All CSS must be inline in a <style> tag (no external stylesheets except CDN)
- All JS must be inline in <script> tags
- Allowed CDN resources: Tailwind CSS (via CDN), Google Fonts, cdnjs libraries (recharts, Chart.js, d3, three.js, GSAP, Lucide icons)
- Use CSS custom properties for theming (at least 6 design tokens)
- Maximum 1000 lines
- Must be mobile-responsive`;

const ANTI_SLOP = `## Design Quality Rules
- NEVER use Inter, Roboto, or Arial as primary fonts. Use distinctive fonts: Fraunces, Syne, Space Grotesk, DM Serif Display, Outfit, Clash Display, Cabinet Grotesk, Satoshi
- NEVER use default Tailwind blue (#3B82F6) or generic corporate palettes
- Use oklch() color space for sophisticated palettes. No pure black (#000) or pure white (#fff)
- Layouts must have visual asymmetry — avoid perfectly centered everything
- Add subtle motion: transitions on hover, scroll-triggered reveals, micro-interactions
- Add texture: gradients, noise overlays, shadows with personality
- Typography must have clear hierarchy: display (bold, large), body (readable), accent (distinctive)`;

const AGENTIC_GUIDANCE = `## Tool Usage
- Use str_replace_based_edit_tool to write and edit files
- Start with 'create' command to write index.html
- Use 'str_replace' for subsequent edits (never recreate the whole file for small changes)
- Use 'set_todos' to show your plan to the user
- Call 'done' when finished to verify your work
- Work in this cadence: plan > skeleton > fill sections one at a time > polish > done`;

function composeDesignSystemPrompt(options = {}) {
  const sections = [IDENTITY, WORKFLOW, OUTPUT_RULES, ANTI_SLOP];
  if (options.agentic) sections.push(AGENTIC_GUIDANCE);
  if (options.designSystem) sections.push(`## Design System\n${options.designSystem}`);
  return sections.join('\n\n');
}

module.exports = { composeDesignSystemPrompt, IDENTITY, WORKFLOW, OUTPUT_RULES, ANTI_SLOP, AGENTIC_GUIDANCE };
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/design-prompts.js
git commit -m "feat(design): add design generation system prompt"
```

---

## Task 3: Design Tools for Reasoning Loop

**Files:**
- Create: `src/engine/design-tools.js`

- [ ] **Step 1: Port the virtual filesystem and tools**

Port `str_replace_based_edit_tool`, `set_todos`, `done`, and `list_files` from Open-CoDesign. These tools operate on an in-memory virtual filesystem (a Map). They need to be in OpenBrain's tool format (same as `src/tools/*.tool.js`).

```js
// src/engine/design-tools.js
'use strict';

/**
 * Creates a virtual filesystem and design tools for the reasoning loop.
 * Returns { tools, getFs } where tools is an array of tool schemas
 * and getFs() returns the current filesystem state.
 */
function createDesignTools({ onFsUpdate, onTodosUpdate } = {}) {
  // Virtual filesystem: Map<string, string>
  const fs = new Map();
  // View budget: track which files have been fully viewed
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

      // View budget: full view only once per file
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
    // Basic validation
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

  // Tool executor map
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
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/design-tools.js
git commit -m "feat(design): add virtual filesystem and design tools"
```

---

## Task 4: Design API Routes (CRUD + Generation SSE)

**Files:**
- Create: `src/routes/design-api.js`

- [ ] **Step 1: Create the design API router with CRUD endpoints**

```js
// src/routes/design-api.js
'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { getPool } = require('../db');
const { createDesignTools } = require('../engine/design-tools');
const { composeDesignSystemPrompt } = require('../engine/design-prompts');
const { resolveModel } = require('../engine/model-router');
const { randomUUID } = require('crypto');

// ── Design CRUD ──

router.get('/api/designs', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM designs WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[DesignAPI] list error:', err.message);
    res.status(500).json({ error: 'Failed to list designs' });
  }
});

router.post('/api/designs', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const id = randomUUID();
    const name = req.body.name || 'Untitled';
    const { rows } = await pool.query(
      `INSERT INTO designs (id, user_id, brand_id, name) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, req.session.user.id, req.session.user.brand_id || 'ikawn', name]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] create error:', err.message);
    res.status(500).json({ error: 'Failed to create design' });
  }
});

router.patch('/api/designs/:id', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE designs SET name = COALESCE($1, name), updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
      [req.body.name, req.params.id, req.session.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] update error:', err.message);
    res.status(500).json({ error: 'Failed to update design' });
  }
});

router.delete('/api/designs/:id', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE designs SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.session.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete design' });
  }
});

router.post('/api/designs/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const newId = randomUUID();
    const name = req.body.name || 'Copy';
    // Copy design
    await pool.query(
      `INSERT INTO designs (id, user_id, brand_id, name)
       SELECT $1, user_id, brand_id, $2 FROM designs WHERE id = $3 AND user_id = $4`,
      [newId, name, req.params.id, req.session.user.id]
    );
    // Copy snapshots
    await pool.query(
      `INSERT INTO design_snapshots (id, design_id, parent_id, type, prompt, artifact_type, artifact_source, message)
       SELECT gen_random_uuid()::text, $1, parent_id, type, prompt, artifact_type, artifact_source, message
       FROM design_snapshots WHERE design_id = $2`,
      [newId, req.params.id]
    );
    const { rows } = await pool.query(`SELECT * FROM designs WHERE id = $1`, [newId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[DesignAPI] duplicate error:', err.message);
    res.status(500).json({ error: 'Failed to duplicate' });
  }
});

// ── Snapshots ──

router.get('/api/designs/:designId/snapshots', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM design_snapshots WHERE design_id = $1 ORDER BY created_at ASC`,
      [req.params.designId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

router.post('/api/designs/:designId/snapshots', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { parent_id, type, prompt, artifact_type, artifact_source, message } = req.body;
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO design_snapshots (id, design_id, parent_id, type, prompt, artifact_type, artifact_source, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, req.params.designId, parent_id || null, type || 'edit', prompt, artifact_type || 'html', artifact_source, message]
    );
    // Touch design updated_at
    await pool.query(`UPDATE designs SET updated_at = NOW() WHERE id = $1`, [req.params.designId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// ── Chat Messages ──

router.get('/api/designs/:designId/chat', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM design_chat WHERE design_id = $1 ORDER BY seq ASC`,
      [req.params.designId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list chat' });
  }
});

router.post('/api/designs/:designId/chat', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { kind, payload, snapshot_id } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO design_chat (design_id, kind, payload, snapshot_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.designId, kind, JSON.stringify(payload || {}), snapshot_id || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to append chat' });
  }
});

// ── Generation (SSE) ──

// Active generation cancel tokens
const activeGenerations = new Map();

router.post('/api/design/generate', requireAuth, async (req, res) => {
  const { designId, prompt, history, model } = req.body;
  const generationId = randomUUID();
  const userId = req.session.user.id;
  const brandId = req.session.user.brand_id || 'ikawn';

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let cancelled = false;
  req.on('close', () => { cancelled = true; });
  activeGenerations.set(generationId, () => { cancelled = true; });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(':ping\n\n');
  }, 15000);

  function sendEvent(type, data) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    }
  }

  try {
    sendEvent('generation_start', { generationId });

    // Create design tools with live preview callbacks
    const { toolSchemas, executors, getFs } = createDesignTools({
      onFsUpdate: (path, content) => {
        sendEvent('fs_updated', { path, content });
      },
      onTodosUpdate: (todos) => {
        sendEvent('todos_updated', { todos });
      },
    });

    // Build system prompt
    const systemPrompt = composeDesignSystemPrompt({ agentic: true });

    // Build messages from history
    const messages = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: prompt });

    // Use reasoning loop for generation
    const { executeReasoningLoop } = require('../engine/reasoning-loop');

    // Custom tool executor that uses our design tools
    const executeToolFn = async (toolName, toolInput) => {
      if (cancelled) return { error: 'Generation cancelled' };
      const executor = executors[toolName];
      if (!executor) return { error: `Unknown tool: ${toolName}` };

      sendEvent('tool_call_start', { toolName, toolInput });
      const result = executor(toolInput);
      sendEvent('tool_call_result', { toolName, result });
      return result;
    };

    const result = await executeReasoningLoop({
      sessionId: `design-${designId}`,
      brandId,
      modelTier: model || 'balanced',
      tools: toolSchemas,
      systemPrompt,
      messages,
      executeToolFn,
      maxIterations: 15,
      timeoutMs: 600000, // 10 min for complex designs
      userId,
      onEvent: (event) => {
        if (event.type === 'text_delta') {
          sendEvent('text_delta', { text: event.text });
        } else if (event.type === 'done') {
          // handled below
        }
      },
    });

    // Extract artifact from virtual FS
    const artifact = getFs()['index.html'] || null;

    // Save snapshot if we have an artifact
    let snapshotId = null;
    if (artifact && designId) {
      const pool = getPool();
      const snapResult = await pool.query(
        `INSERT INTO design_snapshots (id, design_id, type, prompt, artifact_type, artifact_source)
         VALUES ($1, $2, 'edit', $3, 'html', $4) RETURNING id`,
        [randomUUID(), designId, prompt, artifact]
      );
      snapshotId = snapResult.rows[0]?.id;
      await pool.query(`UPDATE designs SET updated_at = NOW() WHERE id = $1`, [designId]);
    }

    sendEvent('generation_end', {
      generationId,
      artifact,
      snapshotId,
      message: result.response,
      files: getFs(),
    });

  } catch (err) {
    console.error('[DesignAPI] generation error:', err.message);
    sendEvent('error', { message: err.message });
  } finally {
    clearInterval(heartbeat);
    activeGenerations.delete(generationId);
    if (!res.writableEnded) res.end();
  }
});

router.post('/api/design/generate/:id/cancel', requireAuth, (req, res) => {
  const cancel = activeGenerations.get(req.params.id);
  if (cancel) {
    cancel();
    res.json({ cancelled: true });
  } else {
    res.status(404).json({ error: 'Generation not found' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/design-api.js
git commit -m "feat(design): add design CRUD + generation SSE API"
```

---

## Task 5: Mount Routes in Express

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add design route imports and mount them**

Near the other route imports at the top of `src/index.js`, add:

```js
const designApi = require('./routes/design-api');
const designPage = require('./routes/design-page');
```

In the route mounting section (near where `vaultPage` and `reportsRoute` are mounted), add:

```js
app.use(designApi);
app.use(designPage);
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js
git commit -m "feat(design): mount design API and page routes"
```

---

## Task 6: Design Page Route (Serves React App)

**Files:**
- Create: `src/routes/design-page.js`

- [ ] **Step 1: Create the page route**

```js
// src/routes/design-page.js
'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();
const { requireAuth } = require('../auth');

const DIST_DIR = path.join(__dirname, '..', 'design-app-dist');

// Serve static assets from the built React app
router.use('/design/assets', express.static(path.join(DIST_DIR, 'assets'), {
  maxAge: '30d',
  immutable: true,
}));

// Serve the SPA for /design and all sub-routes
router.get('/design', requireAuth, (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

router.get('/design/*', requireAuth, (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/design-page.js
git commit -m "feat(design): add /design page route serving React SPA"
```

---

## Task 7: Frontend App Scaffold

**Files:**
- Create: `src/design-app/package.json`
- Create: `src/design-app/vite.config.ts`
- Create: `src/design-app/tsconfig.json`
- Create: `src/design-app/index.html`
- Create: `src/design-app/src/main.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "lucy-design-studio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react-swc": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/design/',
  build: {
    outDir: '../design-app-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Studio - Lucy</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Noto+Serif:wght@400;500;600&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/design/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Install dependencies**

```bash
cd src/design-app && npm install
```

- [ ] **Step 7: Commit**

```bash
git add src/design-app/
git commit -m "feat(design): scaffold Vite React app for Design Studio"
```

---

## Task 8: Types and API Client

**Files:**
- Create: `src/design-app/src/types.ts`
- Create: `src/design-app/src/api.ts`

- [ ] **Step 1: Define shared types**

```ts
// src/design-app/src/types.ts

export interface Design {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  thumbnail_text: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignSnapshot {
  id: string;
  design_id: string;
  parent_id: string | null;
  type: 'initial' | 'edit' | 'fork';
  prompt: string | null;
  artifact_type: 'html' | 'react' | 'svg';
  artifact_source: string | null;
  message: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  seq: number;
  design_id: string;
  kind: 'user' | 'assistant_text' | 'tool_call' | 'artifact_delivered' | 'error';
  payload: Record<string, unknown>;
  snapshot_id: string | null;
  created_at: string;
}

export interface TodoItem {
  label: string;
  done: boolean;
}

export type GenerationStage =
  | 'idle'
  | 'sending'
  | 'thinking'
  | 'streaming'
  | 'done'
  | 'error';

export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Create API client**

```ts
// src/design-app/src/api.ts

import type { Design, DesignSnapshot, ChatMessageRow } from './types';

const BASE = '';  // Same origin

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Designs ──
export const listDesigns = () => json<Design[]>('/api/designs');
export const createDesign = (name?: string) => json<Design>('/api/designs', { method: 'POST', body: JSON.stringify({ name }) });
export const renameDesign = (id: string, name: string) => json<Design>(`/api/designs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const deleteDesign = (id: string) => json<Design>(`/api/designs/${id}`, { method: 'DELETE' });
export const duplicateDesign = (id: string, name: string) => json<Design>(`/api/designs/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) });

// ── Snapshots ──
export const listSnapshots = (designId: string) => json<DesignSnapshot[]>(`/api/designs/${designId}/snapshots`);
export const createSnapshot = (designId: string, data: Partial<DesignSnapshot>) =>
  json<DesignSnapshot>(`/api/designs/${designId}/snapshots`, { method: 'POST', body: JSON.stringify(data) });

// ── Chat ──
export const listChat = (designId: string) => json<ChatMessageRow[]>(`/api/designs/${designId}/chat`);
export const appendChat = (designId: string, kind: string, payload: unknown, snapshotId?: string) =>
  json<ChatMessageRow>(`/api/designs/${designId}/chat`, { method: 'POST', body: JSON.stringify({ kind, payload, snapshot_id: snapshotId }) });

// ── Generation (SSE) ──
export function startGeneration(params: {
  designId: string;
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  model?: string;
}): { eventSource: EventSource; abort: () => void } {
  // Use fetch with ReadableStream for POST SSE (EventSource only supports GET)
  const controller = new AbortController();
  const body = JSON.stringify(params);

  const stream = fetch('/api/design/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body,
    signal: controller.signal,
  });

  return {
    eventSource: stream as unknown as EventSource, // We'll use the reader pattern instead
    abort: () => controller.abort(),
  };
}

/**
 * POST-based SSE reader. Calls onEvent for each parsed SSE data line.
 * Returns an abort function.
 */
export function streamGeneration(
  params: { designId: string; prompt: string; history?: Array<{ role: string; content: string }>; model?: string },
  onEvent: (event: Record<string, unknown>) => void,
  onError?: (err: Error) => void,
  onDone?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch('/api/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Generation failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              onEvent(parsed);
            } catch { /* ignore parse errors */ }
          }
        }
      }
      onDone?.();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err as Error);
      }
    }
  })();

  return () => controller.abort();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/design-app/src/types.ts src/design-app/src/api.ts
git commit -m "feat(design): add types and API client with SSE streaming"
```

---

## Task 9: Zustand Store

**Files:**
- Create: `src/design-app/src/store.ts`

- [ ] **Step 1: Create the Zustand store**

Port the essential state from Open-CoDesign's store.ts (2800 lines) into a focused ~300-line store. Only include: designs, chat, generation, preview, UI state. Drop: comments, diagnostics, connection testing, onboarding, update system.

```ts
// src/design-app/src/store.ts

import { create } from 'zustand';
import * as api from './api';
import type { Design, DesignSnapshot, ChatMessageRow, TodoItem, GenerationStage } from './types';

interface DesignStore {
  // ── Designs ──
  designs: Design[];
  currentDesignId: string | null;
  loadDesigns: () => Promise<void>;
  createDesign: (name?: string) => Promise<Design>;
  switchDesign: (id: string) => void;
  renameDesign: (id: string, name: string) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;

  // ── Snapshots ──
  snapshots: DesignSnapshot[];
  currentSnapshotId: string | null;
  loadSnapshots: (designId: string) => Promise<void>;

  // ── Chat ──
  chatMessages: ChatMessageRow[];
  loadChat: (designId: string) => Promise<void>;

  // ── Generation ──
  isGenerating: boolean;
  generationStage: GenerationStage;
  activeGenerationId: string | null;
  streamingText: string;
  todos: TodoItem[];
  cancelFn: (() => void) | null;

  // ── Preview ──
  previewHtml: string | null;
  previewFiles: Record<string, string>;
  previewViewport: 'desktop' | 'tablet' | 'mobile';
  setPreviewViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;

  // ── UI ──
  view: 'hub' | 'workspace';
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toasts: Array<{ id: string; message: string; type: 'info' | 'error' }>;
  addToast: (message: string, type?: 'info' | 'error') => void;
  dismissToast: (id: string) => void;

  // ── Actions ──
  sendPrompt: (prompt: string) => Promise<void>;
  cancelGeneration: () => void;
}

export const useStore = create<DesignStore>((set, get) => ({
  // ── Initial state ──
  designs: [],
  currentDesignId: null,
  snapshots: [],
  currentSnapshotId: null,
  chatMessages: [],
  isGenerating: false,
  generationStage: 'idle',
  activeGenerationId: null,
  streamingText: '',
  todos: [],
  cancelFn: null,
  previewHtml: null,
  previewFiles: {},
  previewViewport: 'desktop',
  view: 'hub',
  sidebarCollapsed: false,
  toasts: [],

  // ── Design actions ──
  loadDesigns: async () => {
    const designs = await api.listDesigns();
    set({ designs });
  },

  createDesign: async (name) => {
    const design = await api.createDesign(name);
    set((s) => ({ designs: [design, ...s.designs], currentDesignId: design.id, view: 'workspace' }));
    return design;
  },

  switchDesign: (id) => {
    set({ currentDesignId: id, view: 'workspace', previewHtml: null, chatMessages: [], snapshots: [], streamingText: '', todos: [] });
    get().loadChat(id);
    get().loadSnapshots(id);
  },

  renameDesign: async (id, name) => {
    await api.renameDesign(id, name);
    set((s) => ({ designs: s.designs.map((d) => (d.id === id ? { ...d, name } : d)) }));
  },

  deleteDesign: async (id) => {
    await api.deleteDesign(id);
    set((s) => ({
      designs: s.designs.filter((d) => d.id !== id),
      currentDesignId: s.currentDesignId === id ? null : s.currentDesignId,
      view: s.currentDesignId === id ? 'hub' : s.view,
    }));
  },

  // ── Snapshot actions ──
  loadSnapshots: async (designId) => {
    const snapshots = await api.listSnapshots(designId);
    set({ snapshots });
    // Load the latest snapshot's artifact as preview
    const latest = snapshots[snapshots.length - 1];
    if (latest?.artifact_source) {
      set({ previewHtml: latest.artifact_source, currentSnapshotId: latest.id });
    }
  },

  // ── Chat actions ──
  loadChat: async (designId) => {
    const messages = await api.listChat(designId);
    set({ chatMessages: messages });
  },

  // ── UI actions ──
  setPreviewViewport: (v) => set({ previewViewport: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── Generation ──
  sendPrompt: async (prompt) => {
    const { currentDesignId, chatMessages } = get();

    // Auto-create design if none selected
    let designId = currentDesignId;
    if (!designId) {
      const design = await get().createDesign(prompt.slice(0, 50));
      designId = design.id;
    }

    // Append user message to chat
    await api.appendChat(designId, 'user', { text: prompt });

    // Build history from prior chat
    const history = chatMessages
      .filter((m) => m.kind === 'user' || m.kind === 'assistant_text')
      .map((m) => ({
        role: m.kind === 'user' ? 'user' : 'assistant',
        content: (m.payload as { text?: string }).text || '',
      }));

    set({
      isGenerating: true,
      generationStage: 'sending',
      streamingText: '',
      todos: [],
    });

    const cancel = api.streamGeneration(
      { designId, prompt, history },
      // onEvent
      (event) => {
        const { type } = event;

        if (type === 'generation_start') {
          set({ generationStage: 'thinking', activeGenerationId: event.generationId as string });
        } else if (type === 'text_delta') {
          set((s) => ({ generationStage: 'streaming', streamingText: s.streamingText + (event.text as string) }));
        } else if (type === 'fs_updated') {
          // Live preview update
          const path = event.path as string;
          const content = event.content as string;
          set((s) => ({
            previewFiles: { ...s.previewFiles, [path]: content },
            previewHtml: path === 'index.html' ? content : s.previewHtml,
          }));
        } else if (type === 'todos_updated') {
          set({ todos: event.todos as TodoItem[] });
        } else if (type === 'tool_call_start') {
          // Could show working indicator
        } else if (type === 'generation_end') {
          const artifact = event.artifact as string | null;
          set({
            isGenerating: false,
            generationStage: 'done',
            previewHtml: artifact || get().previewHtml,
            previewFiles: (event.files as Record<string, string>) || get().previewFiles,
            activeGenerationId: null,
            cancelFn: null,
          });
          // Save assistant message
          if (designId) {
            api.appendChat(designId, 'assistant_text', { text: get().streamingText });
            if (artifact) {
              api.appendChat(designId, 'artifact_delivered', { snapshotId: event.snapshotId });
            }
          }
          // Reload snapshots
          if (designId) get().loadSnapshots(designId);
        } else if (type === 'error') {
          set({
            isGenerating: false,
            generationStage: 'error',
            cancelFn: null,
          });
          get().addToast((event.message as string) || 'Generation failed', 'error');
        }
      },
      // onError
      (err) => {
        set({ isGenerating: false, generationStage: 'error', cancelFn: null });
        get().addToast(err.message, 'error');
      },
      // onDone
      () => {
        if (get().isGenerating) {
          set({ isGenerating: false, generationStage: 'done', cancelFn: null });
        }
      },
    );

    set({ cancelFn: cancel });
  },

  cancelGeneration: () => {
    const { cancelFn, activeGenerationId } = get();
    if (cancelFn) cancelFn();
    if (activeGenerationId) {
      fetch(`/api/design/generate/${activeGenerationId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
    set({ isGenerating: false, generationStage: 'idle', cancelFn: null });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/design-app/src/store.ts
git commit -m "feat(design): add Zustand store with SSE generation flow"
```

---

## Task 10: Runtime (buildSrcdoc)

**Files:**
- Create: `src/design-app/src/lib/runtime.ts`

- [ ] **Step 1: Port buildSrcdoc from Open-CoDesign runtime**

A simplified version that builds a sandboxed HTML document for iframe preview. We skip the Babel/JSX transform (Lucy generates plain HTML, not React components) and the tweaks bridge.

```ts
// src/design-app/src/lib/runtime.ts

/**
 * Build a sandboxed HTML string for iframe srcdoc preview.
 * Wraps the user's HTML with error reporting back to the parent.
 */
export function buildSrcdoc(html: string): string {
  // If the HTML is already a complete document, wrap it with error reporting
  if (html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>') || html.includes('<html')) {
    // Inject error reporter before closing </body>
    const errorScript = `
<script>
  window.addEventListener('error', (e) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: e.message, source: e.filename, line: e.lineno }, '*');
  });
  window.addEventListener('unhandledrejection', (e) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: String(e.reason) }, '*');
  });
  // Report console errors
  const origError = console.error;
  console.error = (...args) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: args.map(String).join(' ') }, '*');
    origError.apply(console, args);
  };
</script>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${errorScript}\n</body>`);
    }
    return html + errorScript;
  }

  // If it's a fragment, wrap in a minimal document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
</head>
<body>
${html}
<script>
  window.addEventListener('error', (e) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: e.message }, '*');
  });
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/design-app/src/lib/runtime.ts
git commit -m "feat(design): add iframe srcdoc builder"
```

---

## Task 11: Core UI Components

**Files:**
- Create: `src/design-app/src/styles.css`
- Create: `src/design-app/src/App.tsx`
- Create: `src/design-app/src/components/PreviewPane.tsx`
- Create: `src/design-app/src/components/Sidebar.tsx`
- Create: `src/design-app/src/components/TopBar.tsx`
- Create: `src/design-app/src/components/chat/PromptInput.tsx`
- Create: `src/design-app/src/components/chat/ChatMessageList.tsx`
- Create: `src/design-app/src/components/chat/EmptyState.tsx`
- Create: `src/design-app/src/components/chat/WorkingCard.tsx`
- Create: `src/design-app/src/components/PreviewToolbar.tsx`
- Create: `src/design-app/src/components/Toast.tsx`

This is the largest task. Each component should be ported from Open-CoDesign's renderer (`references/open-codesign/apps/desktop/src/renderer/src/`), with IPC calls replaced by Zustand store actions.

- [ ] **Step 1: Create styles.css (Tailwind + base styles)**

```css
@import 'tailwindcss';

:root {
  --bg: #0a0a0a;
  --bg-surface: #141414;
  --bg-elevated: #1a1a1a;
  --border: #262626;
  --border-subtle: #1e1e1e;
  --text: #e5e5e5;
  --text-muted: #737373;
  --text-dim: #525252;
  --accent: #FFC01C;
  --accent-hover: #F59E0B;
  --accent-subtle: rgba(255, 192, 28, 0.1);
  --error: #ef4444;
  --success: #22c55e;
  --font-body: 'Google Sans', system-ui, sans-serif;
  --font-serif: 'Noto Serif', Georgia, serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font-body); }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Drag handle for resizable panels */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-subtle);
  transition: background 0.15s;
  flex-shrink: 0;
}
.resize-handle:hover, .resize-handle:active {
  background: var(--accent);
}
```

- [ ] **Step 2: Create App.tsx (split layout)**

Port from Open-CoDesign's App.tsx. Two-panel layout: sidebar (left, resizable) + preview (right). Hub view for design gallery, workspace view for active design.

```tsx
// src/design-app/src/App.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PreviewPane } from './components/PreviewPane';
import { TopBar } from './components/TopBar';
import { Toast } from './components/Toast';

export function App() {
  const { view, loadDesigns, toasts, dismissToast } = useStore();
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isDragging = useRef(false);

  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  const handleMouseDown = useCallback(() => { isDragging.current = true; }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.max(320, Math.min(600, e.clientX));
    setSidebarWidth(newWidth);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        useStore.getState().createDesign();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="flex flex-col h-full"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, flexShrink: 0 }} className="flex flex-col border-r border-[var(--border)]">
          <Sidebar />
        </div>
        <div className="resize-handle" onMouseDown={handleMouseDown} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'workspace' ? (
            <PreviewPane />
          ) : (
            <HubPlaceholder />
          )}
        </div>
      </div>
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </div>
  );
}

function HubPlaceholder() {
  const { designs, switchDesign, createDesign } = useStore();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="text-4xl mb-4">&#10022;</div>
        <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Design Studio</h1>
        <p className="text-[var(--text-muted)] mb-8">Create production-quality web designs with AI</p>
        <button
          onClick={() => createDesign()}
          className="px-6 py-3 rounded-lg font-medium text-black"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}
        >
          New Design
        </button>
        {designs.length > 0 && (
          <div className="mt-8 text-left">
            <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Recent Designs</h3>
            <div className="space-y-2">
              {designs.slice(0, 5).map((d) => (
                <button
                  key={d.id}
                  onClick={() => switchDesign(d.id)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors border border-[var(--border-subtle)]"
                >
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{new Date(d.updated_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Sidebar.tsx**

```tsx
// src/design-app/src/components/Sidebar.tsx
import { useStore } from '../store';
import { ChatMessageList } from './chat/ChatMessageList';
import { PromptInput } from './chat/PromptInput';
import { EmptyState } from './chat/EmptyState';
import { WorkingCard } from './chat/WorkingCard';

export function Sidebar() {
  const { chatMessages, isGenerating, streamingText, todos, currentDesignId } = useStore();
  const hasMessages = chatMessages.length > 0 || isGenerating;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4">
        {!hasMessages && !currentDesignId ? (
          <EmptyState />
        ) : (
          <>
            <ChatMessageList messages={chatMessages} />
            {isGenerating && (
              <WorkingCard text={streamingText} todos={todos} />
            )}
          </>
        )}
      </div>
      {/* Prompt input */}
      <div className="p-4 border-t border-[var(--border)]">
        <PromptInput />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create PromptInput.tsx**

```tsx
// src/design-app/src/components/chat/PromptInput.tsx
import { useState, useRef, useCallback } from 'react';
import { useStore } from '../../store';

export function PromptInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendPrompt, isGenerating, cancelGeneration } = useStore();

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isGenerating) return;
    sendPrompt(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, isGenerating, sendPrompt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => { setText(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={isGenerating ? 'Generating...' : 'Describe what you want to build...'}
        disabled={isGenerating}
        rows={1}
        className="w-full resize-none rounded-xl px-4 py-3 pr-12 text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
      />
      <button
        onClick={isGenerating ? cancelGeneration : handleSubmit}
        disabled={!isGenerating && !text.trim()}
        className="absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all"
        style={{ background: isGenerating ? 'var(--error)' : text.trim() ? 'var(--accent)' : 'transparent' }}
        title={isGenerating ? 'Cancel' : 'Send'}
      >
        {isGenerating ? (
          <svg viewBox="0 0 24 24" fill="white" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke={text.trim() ? 'black' : 'var(--text-muted)'} strokeWidth="2" width="16" height="16"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create ChatMessageList.tsx**

```tsx
// src/design-app/src/components/chat/ChatMessageList.tsx
import { useEffect, useRef } from 'react';
import type { ChatMessageRow } from '../../types';

export function ChatMessageList({ messages }: { messages: ChatMessageRow[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.seq} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageRow }) {
  const payload = message.payload as { text?: string };
  const text = payload.text || '';

  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm" style={{ background: 'var(--accent)', color: 'black' }}>
          {text}
        </div>
      </div>
    );
  }

  if (message.kind === 'assistant_text') {
    return (
      <div className="max-w-[85%] text-sm leading-relaxed" style={{ fontFamily: 'var(--font-serif)' }}>
        {text}
      </div>
    );
  }

  if (message.kind === 'artifact_delivered') {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-1">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        Design updated
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6: Create EmptyState.tsx**

```tsx
// src/design-app/src/components/chat/EmptyState.tsx
import { useStore } from '../../store';

const STARTERS = [
  'A sleek SaaS pricing page with dark theme and gradient accents',
  'A portfolio landing page with bento grid layout and smooth animations',
  'An e-commerce product page with image gallery and sticky add-to-cart',
  'A dashboard with charts, stats cards, and a clean data table',
];

export function EmptyState() {
  const { sendPrompt, createDesign } = useStore();

  const handleStarter = async (prompt: string) => {
    await createDesign(prompt.slice(0, 50));
    sendPrompt(prompt);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="text-2xl mb-2">&#10022;</div>
      <h2 className="text-lg font-medium mb-1" style={{ fontFamily: 'var(--font-serif)' }}>What would you like to design?</h2>
      <p className="text-xs text-[var(--text-muted)] mb-6">Describe a page, and I'll build it for you</p>
      <div className="w-full max-w-sm space-y-2">
        {STARTERS.map((s, i) => (
          <button
            key={i}
            onClick={() => handleStarter(s)}
            className="w-full text-left px-3 py-2.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create WorkingCard.tsx**

```tsx
// src/design-app/src/components/chat/WorkingCard.tsx
import type { TodoItem } from '../../types';

export function WorkingCard({ text, todos }: { text: string; todos: TodoItem[] }) {
  return (
    <div className="space-y-3">
      {todos.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Plan</div>
          {todos.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${t.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                {t.done && <svg viewBox="0 0 24 24" fill="black" width="10" height="10"><polyline points="20 6 9 17 4 12" fill="none" stroke="black" strokeWidth="3"/></svg>}
              </div>
              <span className={t.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text)]'}>{t.label}</span>
            </div>
          ))}
        </div>
      )}
      {text && (
        <div className="text-sm leading-relaxed animate-pulse" style={{ fontFamily: 'var(--font-serif)' }}>
          {text}
          <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-0.5 animate-pulse" />
        </div>
      )}
      {!text && todos.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          Thinking...
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create PreviewPane.tsx**

```tsx
// src/design-app/src/components/PreviewPane.tsx
import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { buildSrcdoc } from '../lib/runtime';
import { PreviewToolbar } from './PreviewToolbar';

const VIEWPORT_SIZES = {
  desktop: { width: '100%', height: '100%' },
  tablet: { width: '768px', height: '100%' },
  mobile: { width: '375px', height: '100%' },
};

export function PreviewPane() {
  const { previewHtml, previewViewport, generationStage } = useStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update iframe when HTML changes
  useEffect(() => {
    if (!iframeRef.current || !previewHtml) return;
    iframeRef.current.srcdoc = buildSrcdoc(previewHtml);
  }, [previewHtml]);

  // Listen for iframe messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'IFRAME_ERROR') {
        console.warn('[Preview] iframe error:', e.data.error);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const viewport = VIEWPORT_SIZES[previewViewport];

  if (!previewHtml && generationStage === 'idle') {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-dim)] text-sm">
        Preview will appear here
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <PreviewToolbar />
      <div className="flex-1 flex items-start justify-center overflow-auto bg-[var(--bg-surface)] p-4">
        <div
          className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300"
          style={{ width: viewport.width, height: viewport.height, maxHeight: '100%' }}
        >
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title="Design Preview"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create PreviewToolbar.tsx**

```tsx
// src/design-app/src/components/PreviewToolbar.tsx
import { useStore } from '../store';

export function PreviewToolbar() {
  const { previewViewport, setPreviewViewport, previewHtml } = useStore();

  const viewports = [
    { key: 'desktop' as const, label: 'Desktop', icon: 'M4 6h16v10H4z M1 18h22' },
    { key: 'tablet' as const, label: 'Tablet', icon: 'M6 3h12v18H6z' },
    { key: 'mobile' as const, label: 'Mobile', icon: 'M8 2h8v20H8z' },
  ];

  const handleNewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const handleDownload = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'design.html';
    a.click();
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center gap-1">
        {viewports.map((v) => (
          <button
            key={v.key}
            onClick={() => setPreviewViewport(v.key)}
            className={`px-2 py-1 rounded text-xs transition-colors ${previewViewport === v.key ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            title={v.label}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleNewTab}
          disabled={!previewHtml}
          className="px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
          title="Open in new tab"
        >
          Open
        </button>
        <button
          onClick={handleDownload}
          disabled={!previewHtml}
          className="px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
          title="Download HTML"
        >
          Download
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create TopBar.tsx**

```tsx
// src/design-app/src/components/TopBar.tsx
import { useStore } from '../store';

export function TopBar() {
  const { currentDesignId, designs, view, generationStage } = useStore();
  const currentDesign = designs.find((d) => d.id === currentDesignId);

  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)] bg-[var(--bg)] flex-shrink-0">
      <div className="flex items-center gap-3">
        <a href="/chat" className="text-lg" title="Back to Lucy" style={{ color: 'var(--accent)' }}>&#10022;</a>
        <span className="text-xs text-[var(--text-dim)]">/</span>
        {view === 'workspace' && currentDesign ? (
          <span className="text-sm font-medium">{currentDesign.name}</span>
        ) : (
          <span className="text-sm font-medium">Design Studio</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {generationStage !== 'idle' && generationStage !== 'done' && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            {generationStage === 'thinking' ? 'Thinking' : generationStage === 'streaming' ? 'Building' : 'Sending'}
          </div>
        )}
        {view === 'workspace' && (
          <button
            onClick={() => useStore.setState({ view: 'hub', currentDesignId: null })}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            All Designs
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Create Toast.tsx**

```tsx
// src/design-app/src/components/Toast.tsx
export function Toast({ message, type, onDismiss }: { message: string; type: 'info' | 'error'; onDismiss: () => void }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg text-sm shadow-lg flex items-center gap-2 ${type === 'error' ? 'bg-red-900/80 text-red-200' : 'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)]'}`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-[var(--text-muted)] hover:text-[var(--text)]">&times;</button>
    </div>
  );
}
```

- [ ] **Step 12: Commit all components**

```bash
git add src/design-app/src/
git commit -m "feat(design): add core UI components - App, Sidebar, PreviewPane, chat, toolbar"
```

---

## Task 12: Build Script and Integration

**Files:**
- Modify: `package.json` (root)
- Modify: `.dockerignore` / `Dockerfile` (if needed)

- [ ] **Step 1: Add build:design script to root package.json**

Add to `scripts`:
```json
"build:design": "cd src/design-app && npm run build"
```

Add to `predeploy` or pre-deploy.sh to include the design build:
```bash
# In scripts/pre-deploy.sh, add before the test step:
echo "[0/2] Building Design Studio..."
cd src/design-app && npm run build && cd ../..
echo "  Design Studio built."
```

- [ ] **Step 2: Ensure design-app-dist is included in Docker build**

Check the Dockerfile to make sure `src/design-app-dist/` is copied into the image. If using a multi-stage build, the design app needs to be built first.

Add to Dockerfile (or verify it's covered by existing COPY):
```dockerfile
# If needed, before the final COPY:
COPY src/design-app-dist/ src/design-app-dist/
```

- [ ] **Step 3: Add design-app-dist to .gitignore**

```
src/design-app-dist/
```

- [ ] **Step 4: Build and verify locally**

```bash
cd src/design-app && npm install && npm run build
# Verify dist was created
ls -la ../design-app-dist/
```

- [ ] **Step 5: Start OpenBrain locally and test /design**

```bash
npm start
# Visit http://localhost:3000/design
```

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/pre-deploy.sh .gitignore Dockerfile
git commit -m "feat(design): add build integration and deployment config"
```

---

## Task 13: Wire Reasoning Loop to Design Tools

**Files:**
- Modify: `src/routes/design-api.js`

The generation endpoint in Task 4 passes `executeToolFn` to the reasoning loop. But `executeReasoningLoop` expects tools in a specific format. This task verifies the integration works correctly.

- [ ] **Step 1: Read the reasoning loop's tool execution interface**

Check `src/engine/reasoning-loop.js` to understand how `executeToolFn` is called. Verify the design tools' schema format matches what the reasoning loop passes to Claude.

- [ ] **Step 2: Adapt if needed**

If the reasoning loop uses a `toolRegistry` pattern instead of raw `executeToolFn`, adapt `design-api.js` to match. The key is that when Claude calls `str_replace_based_edit_tool`, the design tool executor runs and sends SSE events.

- [ ] **Step 3: Test generation end-to-end locally**

Start OpenBrain, go to `/design`, type "Create a simple landing page", verify:
1. SSE events stream to the frontend
2. `fs_updated` events trigger live iframe preview
3. The final artifact is saved as a snapshot
4. Chat messages are persisted

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(design): wire reasoning loop to design tools"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Test the full flow**

1. Go to `/design`
2. See the hub/empty state
3. Click "New Design" or use a starter prompt
4. Watch the generation stream in the sidebar
5. See live preview build up in the iframe
6. After generation, iterate: "Change the hero to use a dark gradient"
7. Verify the edit modifies existing HTML (not regenerates)
8. Verify snapshots are saved (check Postgres)
9. Verify designs list shows the new design
10. Switch between designs

- [ ] **Step 2: Test the sidebar link from chat**

1. Go to `/chat` (Lucy's main page)
2. Verify "Design Studio" appears in both the icon rail and expanded sidebar
3. Click it, verify navigation to `/design`

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "feat(design): Design Studio v1 complete"
```
