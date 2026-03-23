# Markdown Rendering — Verification Test Prompt

**For:** Claude Cowork / Manual Testing
**Date:** 2026-03-22
**System:** Lucy (ruhi.ikawn.in) + Ruhi Brain (os.ikawn.com/ruhi)
**Context:** highlight.js CDN failure was causing ALL markdown to render as plain text. Fixed by guarding `hljs` in `renderer.code`. Need to verify all markdown elements render correctly.

---

## Pre-flight

1. Open https://ruhi.ikawn.in (Lucy) — log in as V
2. Open browser console (Cmd+Option+J)
3. Confirm `[initMarked] marked v... loaded OK` appears
4. Check for any `[renderContent]` errors

---

## Test 1: Basic Markdown (New Conversation)

Send this message to Lucy:

```
Explain the difference between SQL and NoSQL databases. Use headings, bullet points, bold text, and a comparison table.
```

**Expected:** Response renders with:
- [ ] `##` / `###` headings (rendered as large/medium text, not raw `##`)
- [ ] **Bold text** (not showing `**`)
- [ ] Bullet points (proper list, not `- text`)
- [ ] Table with borders and header row (not pipe characters)

---

## Test 2: Code Blocks

Send:

```
Show me a simple Express.js server with a health check endpoint. Include both JavaScript and bash commands.
```

**Expected:**
- [ ] Code blocks have dark background with monospace font
- [ ] Copy button appears on hover (top-right of code block)
- [ ] Language-specific syntax highlighting (if hljs loaded) OR plain monospace (if hljs failed — acceptable degradation)
- [ ] Inline `code` has subtle background

---

## Test 3: Complex Formatting

Send:

```
Create a project setup checklist with:
1. Numbered steps with sub-bullets
2. A table comparing 3 deployment options
3. A code block with HCL (Terraform) syntax
4. Horizontal rules between sections
5. Some blockquotes for important notes
```

**Expected:**
- [ ] Numbered list with nested bullets
- [ ] Table renders as grid (not raw pipes)
- [ ] HCL code block renders in monospace (highlighting optional)
- [ ] `---` renders as thin horizontal line (not literal dashes)
- [ ] Blockquotes have gold left border

---

## Test 4: Reload Persistence

After Tests 1-3:
1. Hard-refresh the page (Cmd+Shift+R)
2. Re-open any conversation from Tests 1-3

**Expected:**
- [ ] All formatting preserved on reload (not plain text)
- [ ] No `[renderContent] marked.parse failed` errors in console

---

## Test 5: Streaming Rendering

Send a prompt that generates a long response:

```
Write a detailed guide to setting up a production Node.js app on Fly.io. Cover: project structure, Dockerfile, fly.toml config, secrets management, database setup, deployment commands, monitoring, and scaling. Be thorough.
```

**Expected during streaming:**
- [ ] Text appears progressively (not all at once)
- [ ] Formatting applies in real-time as markdown syntax completes
- [ ] No flashing/jumping between raw markdown and formatted text
- [ ] Final result fully formatted after stream ends

---

## Test 6: Edge Cases

Send:

```
Show me examples of: an empty code block, a single backtick `inline`, a table with one row, and nested bold inside a list item.
```

**Expected:**
- [ ] No crashes or console errors
- [ ] All elements render reasonably

---

## Test 7: hljs Failure Simulation (Optional)

In browser console, run:
```js
delete window.hljs;
```

Then send a message requesting code blocks. Verify:
- [ ] Markdown still renders (headings, bold, tables work)
- [ ] Code blocks render in monospace but without syntax highlighting
- [ ] No console errors about `hljs`

---

## Failure Modes to Watch

| Symptom | Likely Cause |
|---------|-------------|
| ALL markdown raw (##, **, pipes visible) | `marked` or `hljs` not loaded — check console for `[initMarked]` |
| Code blocks raw but rest formatted | `renderer.code` throwing — check hljs guard |
| Formatting works on stream but breaks on reload | `renderContent` vs streaming path inconsistency |
| Console shows `marked.parse failed` | Check full error — likely a renderer function referencing undefined global |

---

## Deploy Checklist (if fixes needed)

```bash
# Always use CACHE_BUST to defeat Depot layer cache
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --build-arg "CACHE_BUST=$(date +%s)"

# Also deploy to Ruhi Brain if shared code changed
~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only --build-arg "CACHE_BUST=$(date +%s)"
```
