# Lucy's Desktop Agent ("Hands") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Lucy a persistent, controllable Linux desktop she delegates GUI tasks to (web scraping, WhatsApp Web, any app without an API), driven by UI-TARS-1.5-7B, with a live in-chat preview and an approval gate on irreversible actions.

**Architecture:** Two-brain delegation. Lucy (Claude, in OpenBrain) stays the reasoning brain and calls a `delegate_to_desktop` tool. That tool opens a WebSocket to a new standalone Fly service, `lucy-desktop`, which owns a Dockerized Xfce desktop and runs the see-think-click loop (screenshot to UI-TARS to xdotool). The desktop streams its work back over the same socket (steps, screenshots, approval requests, results) and a token-gated noVNC stream provides a live pixel view embedded in the Lucy chat. Outward or irreversible actions park for the user's approval before executing.

**Tech Stack:**
- `lucy-desktop` (new repo `/Users/vineet/lucy-desktop`, Fly app `lucy-desktop`): Node 20 + TypeScript, `ws`, vitest; Docker on `node:20-bookworm` with Xfce, Xvfb, x11vnc, noVNC/websockify, Chromium, xdotool, scrot, supervisord.
- OpenBrain integration (`/Users/vineet/ikawn-openbrain`): existing Node + JS tool/registry, SSE chat, vitest, `ws` (new dep); React 19 + Vite + Zustand + shadcn frontend at `src/frontend/src/`.
- Model: UI-TARS-1.5-7B via OpenRouter (OpenAI-compatible chat-completions). Provider-agnostic via `MODEL_BASE_URL` / `MODEL_NAME`.

---

## Prerequisites

- An OpenRouter API key set as the Fly secret `OPENROUTER_API_KEY` on `lucy-desktop` (rotate the key shared during design once provisioned). Confirmed live: `bytedance/ui-tars-1.5-7b`, 128K context, image+text input, $0.10/$0.20 per 1M.
- Fly secrets on `lucy-desktop`: `OPENROUTER_API_KEY`, `NOVNC_TOKEN`, `DESKTOP_WS_SECRET`. Fly secrets on OpenBrain (`ikawn-openbrain`): `DESKTOP_WS_SECRET` (same value), `DESKTOP_NOVNC_TOKEN` (same value as `NOVNC_TOKEN`).
- Fly volume `data` created for `lucy-desktop` (persistent Chromium profile).

## Build order

1. **Part 1 (lucy-desktop) Tasks 1 to 8** first: the service must exist and pass its unit tests before integration.
2. **Part 1 Tasks 9 to 10** (Docker image + Fly deploy): get a running desktop reachable over Fly 6PN and a public noVNC URL.
3. **Part 2 (OpenBrain) Tasks 1 to 9**: connector, tool, chat-stream wiring, frontend panel. Part 2 unit tests use a mock WS server, so they do not require Part 1 to be deployed, but **Part 2 Task 10 (golden-task UAT) requires both deployed**.
4. **Part 2 Task 10** last: the end-to-end WhatsApp golden task and kill-criterion check.

## Cross-cutting caveats

- **Do NOT globally reorder `checkToolPermission`.** Recent commits (`0779782b`, `1540dcb6`) intentionally gave paying brands full tool parity. The brand gate must restrict **only `delegate_to_desktop`** to the `ikawn` brand and leave `IKAWN_ONLY_TOOLS` behavior for every other tool unchanged. If Part 2 Task 5 as written reorders the global check, narrow it to a `delegate_to_desktop`-specific guard instead.
- **Deploy CWD discipline.** `lucy-desktop` is a new, separate repo and Fly app. Deploy it only from `/Users/vineet/lucy-desktop`. Never run its deploy from an OpenBrain or ikawn-v3 checkout.
- **Secrets never in code or git.** All keys/tokens are Fly secrets referenced by env-var name only.
- **Provider swap is config-only.** If UI-TARS-7B underperforms on real screens, switching to Volcengine doubao or a self-hosted GPU model is a change to `MODEL_BASE_URL` / `MODEL_NAME` / key, not code.

## Coordinate + action notes (from Part 1 design)

- UI-TARS emits coordinates normalized 0 to 1000; the executor rescales to the 1280x800 absolute display. Model verbs outside the frozen `AgentAction` set (e.g. `right_single`, `call_user`) collapse into existing kinds.
- The noVNC public proxy (port 6080) enforces `?token=`; websockify runs internally on 6081.

---

## Part 1: lucy-desktop service

This part builds the standalone `lucy-desktop` repo at `/Users/vineet/lucy-desktop` (its own git repo), deployed as Fly app `lucy-desktop` in region `sin`. It is a Dockerized Linux desktop driven by a GUI vision model (UI-TARS-1.5-7B via OpenRouter), exposing a `DESKTOP_WS_SECRET`-authed WebSocket+HTTP control server on port 8080 (reached over Fly 6PN private net) and a `NOVNC_TOKEN`-gated noVNC stream on port 6080.

### File structure (built in dependency order)

```
/Users/vineet/lucy-desktop
  package.json             # Node 20, type:module, vitest, ws, vite-node
  tsconfig.json            # strict, NodeNext, target ES2022
  vitest.config.ts
  .gitignore
  src/
    protocol.ts            # Task 1  — frozen WS message types
    screenshot.ts          # Task 2  — capture X display :99 -> base64 PNG
    executor.ts            # Task 3  — AgentAction -> xdotool/chromium shell calls
    uitars.ts              # Task 4  — build prompt, call model, parse action, track cost
    classifier.ts          # Task 5  — guarded-action denylist + Claude-judge fallback
    agent-loop.ts          # Task 6  — orchestration loop, emits ServerMsg via callback
    server.ts              # Task 7  — WS+HTTP server on 8080, single session
    novnc-proxy.ts         # Task 10 — token-gating reverse proxy for noVNC 6080
  Dockerfile               # Task 8
  supervisord.conf         # Task 8
  entrypoint.sh            # Task 8
  fly.toml                 # Task 9
  docs/
    DEPLOY.md              # Task 9
  tests/
    protocol.test.ts
    screenshot.test.ts
    executor.test.ts
    uitars.test.ts
    classifier.test.ts
    agent-loop.test.ts
    server.test.ts
    novnc-proxy.test.ts
```

Every `src` module is import-only at the top level (no work on import) so vitest can unit-test it. All shell-invoking modules accept an injectable `run` function (default = a real `child_process` wrapper) so tests never touch a real X display.

---

### Task 1: Repo scaffold + frozen protocol types

**Files:**
- Create: `/Users/vineet/lucy-desktop/package.json`
- Create: `/Users/vineet/lucy-desktop/tsconfig.json`
- Create: `/Users/vineet/lucy-desktop/vitest.config.ts`
- Create: `/Users/vineet/lucy-desktop/.gitignore`
- Create: `/Users/vineet/lucy-desktop/src/protocol.ts`
- Test: `/Users/vineet/lucy-desktop/tests/protocol.test.ts`

Steps:

- [ ] Initialize the repo and project files.
```bash
mkdir -p /Users/vineet/lucy-desktop/src /Users/vineet/lucy-desktop/tests /Users/vineet/lucy-desktop/docs
cd /Users/vineet/lucy-desktop && git init
```

- [ ] Write `/Users/vineet/lucy-desktop/package.json`:
```json
{
  "name": "lucy-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "start": "node --import tsx/esm src/server.ts"
  },
  "dependencies": {
    "ws": "^8.18.0",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/ws": "^8.5.12",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] Write `/Users/vineet/lucy-desktop/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] Write `/Users/vineet/lucy-desktop/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] Write `/Users/vineet/lucy-desktop/.gitignore`:
```
node_modules/
dist/
*.log
.env
.DS_Store
```

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/protocol.test.ts`. Protocol types are compile-time only, so the test asserts the runtime helpers exported alongside them (a type guard for `ClientMsg` used by the server to validate inbound JSON).
```ts
import { describe, it, expect } from 'vitest';
import { isClientMsg, SESSION_STATES } from '../src/protocol.js';

describe('protocol', () => {
  it('accepts every valid ClientMsg shape', () => {
    expect(isClientMsg({ type: 'start', goal: 'do thing' })).toBe(true);
    expect(isClientMsg({ type: 'start', goal: 'x', maxSteps: 10, costCapUsd: 1 })).toBe(true);
    expect(isClientMsg({ type: 'approve', stepId: 's1' })).toBe(true);
    expect(isClientMsg({ type: 'reject', stepId: 's1', reason: 'no' })).toBe(true);
    expect(isClientMsg({ type: 'abort' })).toBe(true);
  });

  it('rejects malformed messages', () => {
    expect(isClientMsg(null)).toBe(false);
    expect(isClientMsg({})).toBe(false);
    expect(isClientMsg({ type: 'start' })).toBe(false); // missing goal
    expect(isClientMsg({ type: 'approve' })).toBe(false); // missing stepId
    expect(isClientMsg({ type: 'bogus' })).toBe(false);
    expect(isClientMsg('start')).toBe(false);
  });

  it('enumerates all session states', () => {
    expect(SESSION_STATES).toEqual([
      'idle', 'running', 'awaiting_approval', 'paused', 'done', 'error',
    ]);
  });
});
```

- [ ] Run the test and watch it FAIL (module does not exist yet):
```bash
cd /Users/vineet/lucy-desktop && npm install && npm test -- tests/protocol.test.ts
```
Expected: FAIL — `Cannot find module '../src/protocol.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/protocol.ts` with the frozen types plus the runtime helpers:
```ts
// Frozen WebSocket contract shared by lucy-desktop and OpenBrain. Do not rename.

export type ClientMsg =
  | { type: 'start'; goal: string; maxSteps?: number; costCapUsd?: number }
  | { type: 'approve'; stepId: string }
  | { type: 'reject'; stepId: string; reason?: string }
  | { type: 'abort' };

export type SessionState =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'paused'
  | 'done'
  | 'error';

export type AgentAction =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'double_click'; x: number; y: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; keys: string }
  | { kind: 'scroll'; dx: number; dy: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'navigate'; url: string }
  | { kind: 'finished'; result: string };

export type Artifact = { name: string; mime: string; b64?: string; text?: string };

export type ServerMsg =
  | { type: 'status'; state: SessionState }
  | { type: 'step'; stepId: string; thought: string; action: AgentAction }
  | { type: 'screenshot'; stepId: string; b64: string }
  | { type: 'awaiting_approval'; stepId: string; intent: string; b64: string }
  | { type: 'result'; success: boolean; data: unknown; summary: string; artifacts?: Artifact[] }
  | { type: 'error'; message: string };

// Runtime helpers (the types above are erased at compile time).

export const SESSION_STATES: readonly SessionState[] = [
  'idle',
  'running',
  'awaiting_approval',
  'paused',
  'done',
  'error',
] as const;

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

export function isClientMsg(v: unknown): v is ClientMsg {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case 'start':
      return isStr(m.goal);
    case 'approve':
      return isStr(m.stepId);
    case 'reject':
      return isStr(m.stepId);
    case 'abort':
      return true;
    default:
      return false;
  }
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/protocol.test.ts
```
Expected: PASS — 3 tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Scaffold lucy-desktop repo and frozen WS protocol types"
```

---

### Task 2: Screenshot capture

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/screenshot.ts`
- Test: `/Users/vineet/lucy-desktop/tests/screenshot.test.ts`

`captureScreenshot` shells out to `scrot` writing a PNG to a temp path on display `:99`, reads the bytes, and returns a base64 string. The child-process call and the file read are injected so the test never touches a display or disk.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/screenshot.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { captureScreenshot } from '../src/screenshot.js';

describe('captureScreenshot', () => {
  it('invokes scrot on the configured display and returns base64 PNG', async () => {
    const calls: { cmd: string; args: string[]; env?: NodeJS.ProcessEnv }[] = [];
    const fakeRun = vi.fn(async (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => {
      calls.push({ cmd, args, env });
    });
    const fakeReadFile = vi.fn(async () => Buffer.from('PNGDATA'));

    const b64 = await captureScreenshot({
      display: ':99',
      run: fakeRun,
      readFile: fakeReadFile,
      tmpPath: '/tmp/shot-test.png',
    });

    expect(b64).toBe(Buffer.from('PNGDATA').toString('base64'));
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('scrot');
    // overwrite + quiet, target path last
    expect(calls[0].args).toContain('-o');
    expect(calls[0].args[calls[0].args.length - 1]).toBe('/tmp/shot-test.png');
    expect(calls[0].env?.DISPLAY).toBe(':99');
  });

  it('propagates a capture failure', async () => {
    const fakeRun = vi.fn(async () => {
      throw new Error('scrot exited 1');
    });
    await expect(
      captureScreenshot({
        display: ':99',
        run: fakeRun,
        readFile: async () => Buffer.from(''),
        tmpPath: '/tmp/x.png',
      }),
    ).rejects.toThrow('scrot exited 1');
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/screenshot.test.ts
```
Expected: FAIL — `Cannot find module '../src/screenshot.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/screenshot.ts`:
```ts
import { spawn } from 'node:child_process';
import { readFile as fsReadFile } from 'node:fs/promises';

export type RunFn = (
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<void>;

export type ReadFileFn = (path: string) => Promise<Buffer>;

export interface CaptureOpts {
  display?: string;
  tmpPath?: string;
  run?: RunFn;
  readFile?: ReadFileFn;
}

// Default child-process wrapper: resolves on exit 0, rejects otherwise.
export const defaultRun: RunFn = (cmd, args, env) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });

export async function captureScreenshot(opts: CaptureOpts = {}): Promise<string> {
  const display = opts.display ?? process.env.DISPLAY ?? ':99';
  const tmpPath = opts.tmpPath ?? `/tmp/lucy-shot-${Date.now()}.png`;
  const run = opts.run ?? defaultRun;
  const readFile = opts.readFile ?? fsReadFile;

  // scrot -o (overwrite) -z (compress) writes a PNG of the whole screen.
  await run('scrot', ['-o', '-z', tmpPath], { DISPLAY: display });
  const buf = await readFile(tmpPath);
  return buf.toString('base64');
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/screenshot.test.ts
```
Expected: PASS — 2 tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add screenshot capture via scrot on display :99"
```

---

### Task 3: Action executor

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/executor.ts`
- Test: `/Users/vineet/lucy-desktop/tests/executor.test.ts`

`executeAction` is a pure mapping from an `AgentAction` to one or more shell commands (`xdotool` for input, Chromium navigation via xdotool keyboard, an injected delay for `wait`). The runner is injected so tests assert the exact command sequence without a display.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/executor.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { executeAction } from '../src/executor.js';
import type { AgentAction } from '../src/protocol.js';

function recorder() {
  const calls: { cmd: string; args: string[] }[] = [];
  const run = vi.fn(async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
  });
  return { calls, run };
}

const display = ':99';

describe('executeAction', () => {
  it('click -> xdotool mousemove + click 1', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'click', x: 100, y: 200 }, { run, display });
    expect(calls[0]).toEqual({ cmd: 'xdotool', args: ['mousemove', '100', '200'] });
    expect(calls[1]).toEqual({ cmd: 'xdotool', args: ['click', '1'] });
  });

  it('double_click -> mousemove + click --repeat 2 1', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'double_click', x: 5, y: 6 }, { run, display });
    expect(calls[0]).toEqual({ cmd: 'xdotool', args: ['mousemove', '5', '6'] });
    expect(calls[1]).toEqual({ cmd: 'xdotool', args: ['click', '--repeat', '2', '1'] });
  });

  it('type -> xdotool type with --clearmodifiers and the literal text', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'type', text: 'hello world' }, { run, display });
    expect(calls[0]).toEqual({
      cmd: 'xdotool',
      args: ['type', '--clearmodifiers', '--', 'hello world'],
    });
  });

  it('key -> xdotool key, passing the chord through verbatim', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'key', keys: 'ctrl+l' }, { run, display });
    expect(calls[0]).toEqual({ cmd: 'xdotool', args: ['key', '--clearmodifiers', 'ctrl+l'] });
  });

  it('scroll down -> click button 5 repeated; scroll up -> button 4', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'scroll', dx: 0, dy: 3 }, { run, display });
    expect(calls[0]).toEqual({ cmd: 'xdotool', args: ['click', '--repeat', '3', '5'] });

    const up = recorder();
    await executeAction({ kind: 'scroll', dx: 0, dy: -2 }, { run: up.run, display });
    expect(up.calls[0]).toEqual({ cmd: 'xdotool', args: ['click', '--repeat', '2', '4'] });
  });

  it('navigate -> focus address bar (ctrl+l), type url, press Return', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'navigate', url: 'https://web.whatsapp.com' }, { run, display });
    expect(calls[0]).toEqual({ cmd: 'xdotool', args: ['key', '--clearmodifiers', 'ctrl+l'] });
    expect(calls[1]).toEqual({
      cmd: 'xdotool',
      args: ['type', '--clearmodifiers', '--', 'https://web.whatsapp.com'],
    });
    expect(calls[2]).toEqual({ cmd: 'xdotool', args: ['key', '--clearmodifiers', 'Return'] });
  });

  it('wait -> calls injected sleep with the given ms, no shell call', async () => {
    const { calls, run } = recorder();
    const sleep = vi.fn(async () => {});
    await executeAction({ kind: 'wait', ms: 500 }, { run, display, sleep });
    expect(sleep).toHaveBeenCalledWith(500);
    expect(calls).toHaveLength(0);
  });

  it('finished -> no shell call', async () => {
    const { calls, run } = recorder();
    await executeAction({ kind: 'finished', result: 'done' } as AgentAction, { run, display });
    expect(calls).toHaveLength(0);
  });

  it('every input command runs with DISPLAY in env', async () => {
    const seenEnvs: (NodeJS.ProcessEnv | undefined)[] = [];
    const run = vi.fn(async (_c: string, _a: string[], env?: NodeJS.ProcessEnv) => {
      seenEnvs.push(env);
    });
    await executeAction({ kind: 'click', x: 1, y: 1 }, { run, display });
    expect(seenEnvs.every((e) => e?.DISPLAY === ':99')).toBe(true);
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/executor.test.ts
```
Expected: FAIL — `Cannot find module '../src/executor.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/executor.ts`:
```ts
import type { AgentAction } from './protocol.js';
import { defaultRun, type RunFn } from './screenshot.js';

export type SleepFn = (ms: number) => Promise<void>;

export interface ExecOpts {
  display?: string;
  run?: RunFn;
  sleep?: SleepFn;
}

const defaultSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));

export async function executeAction(action: AgentAction, opts: ExecOpts = {}): Promise<void> {
  const display = opts.display ?? process.env.DISPLAY ?? ':99';
  const baseRun = opts.run ?? defaultRun;
  const sleep = opts.sleep ?? defaultSleep;
  const env: NodeJS.ProcessEnv = { DISPLAY: display };
  const run = (cmd: string, args: string[]) => baseRun(cmd, args, env);

  switch (action.kind) {
    case 'click':
      await run('xdotool', ['mousemove', String(action.x), String(action.y)]);
      await run('xdotool', ['click', '1']);
      return;

    case 'double_click':
      await run('xdotool', ['mousemove', String(action.x), String(action.y)]);
      await run('xdotool', ['click', '--repeat', '2', '1']);
      return;

    case 'type':
      await run('xdotool', ['type', '--clearmodifiers', '--', action.text]);
      return;

    case 'key':
      await run('xdotool', ['key', '--clearmodifiers', action.keys]);
      return;

    case 'scroll': {
      // X11 wheel buttons: 4 = up, 5 = down. dy>0 scrolls down.
      const steps = Math.max(1, Math.abs(action.dy));
      const button = action.dy >= 0 ? '5' : '4';
      await run('xdotool', ['click', '--repeat', String(steps), button]);
      return;
    }

    case 'navigate':
      await run('xdotool', ['key', '--clearmodifiers', 'ctrl+l']);
      await run('xdotool', ['type', '--clearmodifiers', '--', action.url]);
      await run('xdotool', ['key', '--clearmodifiers', 'Return']);
      return;

    case 'wait':
      await sleep(action.ms);
      return;

    case 'finished':
      return;
  }
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/executor.test.ts
```
Expected: PASS — 8 tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add AgentAction executor mapping to xdotool commands"
```

---

### Task 4: UI-TARS prompt builder, model call, and parser

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/uitars.ts`
- Test: `/Users/vineet/lucy-desktop/tests/uitars.test.ts`

This module: builds the system prompt + step history + latest screenshot as an image content block, POSTs to the OpenAI-compatible `/chat/completions` at `MODEL_BASE_URL` with `MODEL_NAME`, parses the model's `Thought:`/`Action:` text into `{ thought, action }`, and tracks token cost. The HTTP `fetch` is injected. The parser is original code written from the documented UI-TARS action grammar (`click(start_box='(x,y)')`, `left_double`, `right_single`, `type(content='...')`, `hotkey(key='...')`, `scroll(start_box='(x,y)', direction='...')`, `wait()`, `finished(content='...')`), with coordinates normalized on a 0-1000 factor that we rescale to absolute pixels using the supplied screen size.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/uitars.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { parseAction, buildMessages, callUiTars, computeCostUsd } from '../src/uitars.js';

const screen = { width: 1280, height: 800 };

describe('parseAction', () => {
  it('parses click with 0-1000 normalized coords into absolute pixels', () => {
    const out = parseAction("Thought: tap the button\nAction: click(start_box='(500,250)')", screen);
    expect(out.thought).toBe('tap the button');
    // 500/1000*1280 = 640 ; 250/1000*800 = 200
    expect(out.action).toEqual({ kind: 'click', x: 640, y: 200 });
  });

  it('parses left_double as double_click', () => {
    const out = parseAction("Action: left_double(start_box='(0,0)')", screen);
    expect(out.action).toEqual({ kind: 'double_click', x: 0, y: 0 });
  });

  it('strips the box_start/box_end tag wrappers if present', () => {
    const out = parseAction(
      "Action: click(start_box='<|box_start|>(250,500)<|box_end|>')",
      screen,
    );
    expect(out.action).toEqual({ kind: 'click', x: 320, y: 400 });
  });

  it('parses type content verbatim including spaces and commas', () => {
    const out = parseAction("Action: type(content='Hello, V at 5pm')", screen);
    expect(out.action).toEqual({ kind: 'type', text: 'Hello, V at 5pm' });
  });

  it('maps hotkey to a key action with + joined chord', () => {
    const out = parseAction("Action: hotkey(key='ctrl l')", screen);
    expect(out.action).toEqual({ kind: 'key', keys: 'ctrl+l' });
  });

  it('parses scroll direction into dx/dy steps', () => {
    expect(parseAction("Action: scroll(start_box='(1,1)', direction='down')", screen).action)
      .toEqual({ kind: 'scroll', dx: 0, dy: 3 });
    expect(parseAction("Action: scroll(start_box='(1,1)', direction='up')", screen).action)
      .toEqual({ kind: 'scroll', dx: 0, dy: -3 });
  });

  it('parses wait() into a default 1000ms wait', () => {
    expect(parseAction('Action: wait()', screen).action).toEqual({ kind: 'wait', ms: 1000 });
  });

  it('parses finished(content=...) into a finished action carrying the result', () => {
    const out = parseAction("Thought: all set\nAction: finished(content='message sent')", screen);
    expect(out.action).toEqual({ kind: 'finished', result: 'message sent' });
  });

  it('throws on an unparseable response', () => {
    expect(() => parseAction('I am not following the grammar', screen)).toThrow(/parse/i);
  });
});

describe('buildMessages', () => {
  it('puts the system prompt first and the screenshot as an image_url data URI', () => {
    const msgs = buildMessages({
      goal: 'send a whatsapp',
      history: [{ thought: 't1', actionText: "click(start_box='(1,1)')" }],
      screenshotB64: 'AAAA',
    });
    expect(msgs[0].role).toBe('system');
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    const img = (last.content as any[]).find((c) => c.type === 'image_url');
    expect(img.image_url.url).toBe('data:image/png;base64,AAAA');
    // history surfaces in a prior assistant turn
    expect(JSON.stringify(msgs)).toContain('t1');
  });
});

describe('computeCostUsd', () => {
  it('prices prompt at $0.10/1M and completion at $0.20/1M', () => {
    // 1,000,000 prompt + 1,000,000 completion = 0.10 + 0.20 = 0.30
    expect(computeCostUsd(1_000_000, 1_000_000)).toBeCloseTo(0.3, 6);
    expect(computeCostUsd(0, 0)).toBe(0);
  });
});

describe('callUiTars', () => {
  it('POSTs to MODEL_BASE_URL/chat/completions with auth and returns parsed action + cost', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Thought: go\nAction: click(start_box='(500,500)')" } }],
        usage: { prompt_tokens: 2_000_000, completion_tokens: 1_000_000 },
      }),
    }));

    const result = await callUiTars(
      {
        goal: 'test',
        history: [],
        screenshotB64: 'IMG',
        screen,
      },
      {
        baseUrl: 'https://openrouter.ai/api/v1',
        modelName: 'bytedance/ui-tars-1.5-7b',
        apiKey: 'sk-test',
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('bytedance/ui-tars-1.5-7b');

    expect(result.thought).toBe('go');
    expect(result.action).toEqual({ kind: 'click', x: 640, y: 400 });
    expect(result.actionText).toContain('click');
    // 2M prompt * 0.10 + 1M completion * 0.20 = 0.20 + 0.20 = 0.40
    expect(result.costUsd).toBeCloseTo(0.4, 6);
  });

  it('throws when the API returns a non-ok response', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'rate limited' }));
    await expect(
      callUiTars(
        { goal: 'x', history: [], screenshotB64: 'IMG', screen },
        { baseUrl: 'https://x/v1', modelName: 'm', apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/429/);
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/uitars.test.ts
```
Expected: FAIL — `Cannot find module '../src/uitars.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/uitars.ts`:
```ts
import type { AgentAction } from './protocol.js';

export interface Screen {
  width: number;
  height: number;
}

export interface HistoryEntry {
  thought: string;
  actionText: string;
}

export interface ParsedStep {
  thought: string;
  action: AgentAction;
  actionText: string;
}

// OpenRouter UI-TARS-1.5-7B pricing (USD per token), validated 2026-05-20.
const PROMPT_USD_PER_TOKEN = 0.1 / 1_000_000;
const COMPLETION_USD_PER_TOKEN = 0.2 / 1_000_000;

export function computeCostUsd(promptTokens: number, completionTokens: number): number {
  return promptTokens * PROMPT_USD_PER_TOKEN + completionTokens * COMPLETION_USD_PER_TOKEN;
}

// Scroll is expressed by UI-TARS as a direction; we translate to a fixed step count.
const SCROLL_STEPS = 3;

const SYSTEM_PROMPT = [
  'You are a GUI agent operating a Linux desktop with a Chromium browser.',
  'You see a screenshot each turn and choose ONE action to move toward the goal.',
  'Coordinates are on a 0-1000 normalized grid relative to the screenshot.',
  'Respond in exactly this format:',
  'Thought: <one short sentence of reasoning>',
  "Action: <one of click(start_box='(x,y)'), left_double(start_box='(x,y)'),",
  "right_single(start_box='(x,y)'), type(content='...'), hotkey(key='...'),",
  "scroll(start_box='(x,y)', direction='up|down|left|right'), wait(), finished(content='...')>",
].join('\n');

interface TextPart {
  type: 'text';
  text: string;
}
interface ImagePart {
  type: 'image_url';
  image_url: { url: string };
}
type Part = TextPart | ImagePart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}

export interface BuildArgs {
  goal: string;
  history: HistoryEntry[];
  screenshotB64: string;
}

export function buildMessages(args: BuildArgs): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  messages.push({ role: 'user', content: `Goal: ${args.goal}` });
  for (const h of args.history) {
    messages.push({ role: 'assistant', content: `Thought: ${h.thought}\nAction: ${h.actionText}` });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: 'Current screen:' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${args.screenshotB64}` } },
    ],
  });
  return messages;
}

// --- Original parser for the documented UI-TARS action grammar ---

const BOX_TAG_RE = /<\|box_start\|>|<\|box_end\|>/g;

function parseCoords(boxArg: string, screen: Screen): { x: number; y: number } {
  const cleaned = boxArg.replace(BOX_TAG_RE, '').trim();
  const m = cleaned.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (!m) throw new Error(`could not parse coordinates from "${boxArg}"`);
  const nx = parseFloat(m[1]);
  const ny = parseFloat(m[2]);
  // Normalized on a 0-1000 grid -> absolute pixels.
  return {
    x: Math.round((nx / 1000) * screen.width),
    y: Math.round((ny / 1000) * screen.height),
  };
}

function extractArg(call: string, name: string): string | null {
  // name='....' — capture up to the closing quote, allowing inner commas/spaces.
  const re = new RegExp(`${name}\\s*=\\s*'([^']*)'`);
  const m = call.match(re);
  return m ? m[1] : null;
}

function actionFromCall(call: string, screen: Screen): AgentAction {
  const head = call.slice(0, call.indexOf('(')).trim();

  switch (head) {
    case 'click':
    case 'left_single': {
      const box = extractArg(call, 'start_box') ?? '';
      const { x, y } = parseCoords(box, screen);
      return { kind: 'click', x, y };
    }
    case 'left_double':
    case 'double_click': {
      const box = extractArg(call, 'start_box') ?? '';
      const { x, y } = parseCoords(box, screen);
      return { kind: 'double_click', x, y };
    }
    case 'right_single':
    case 'right_click': {
      // No right-click in the frozen AgentAction set; surface as a click at the target.
      const box = extractArg(call, 'start_box') ?? '';
      const { x, y } = parseCoords(box, screen);
      return { kind: 'click', x, y };
    }
    case 'type': {
      const content = extractArg(call, 'content');
      if (content === null) throw new Error('type() missing content');
      return { kind: 'type', text: content };
    }
    case 'hotkey': {
      const key = extractArg(call, 'key');
      if (key === null) throw new Error('hotkey() missing key');
      // UI-TARS separates chord parts with spaces; xdotool wants '+'.
      return { kind: 'key', keys: key.trim().split(/\s+/).join('+') };
    }
    case 'scroll': {
      const dir = (extractArg(call, 'direction') ?? 'down').toLowerCase();
      if (dir === 'up') return { kind: 'scroll', dx: 0, dy: -SCROLL_STEPS };
      if (dir === 'left') return { kind: 'scroll', dx: -SCROLL_STEPS, dy: 0 };
      if (dir === 'right') return { kind: 'scroll', dx: SCROLL_STEPS, dy: 0 };
      return { kind: 'scroll', dx: 0, dy: SCROLL_STEPS };
    }
    case 'wait':
      return { kind: 'wait', ms: 1000 };
    case 'finished':
    case 'finish':
    case 'call_user': {
      const content = extractArg(call, 'content') ?? '';
      return { kind: 'finished', result: content };
    }
    default:
      throw new Error(`could not parse action: unknown verb "${head}"`);
  }
}

export function parseAction(raw: string, screen: Screen): ParsedStep {
  const thoughtMatch = raw.match(/Thought:\s*([\s\S]*?)(?:\n\s*Action:|$)/i);
  const actionMatch = raw.match(/Action:\s*([\s\S]+)$/i);
  if (!actionMatch) throw new Error('failed to parse: no Action line in model output');

  const actionText = actionMatch[1].trim().split('\n')[0].trim();
  const thought = (thoughtMatch ? thoughtMatch[1] : '').trim();
  const action = actionFromCall(actionText, screen);
  return { thought, action, actionText };
}

// --- Model call ---

export interface CallArgs {
  goal: string;
  history: HistoryEntry[];
  screenshotB64: string;
  screen: Screen;
}

export interface CallDeps {
  baseUrl: string;
  modelName: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface CallResult extends ParsedStep {
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

export async function callUiTars(args: CallArgs, deps: CallDeps): Promise<CallResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const messages = buildMessages(args);

  const res = await fetchImpl(`${deps.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deps.apiKey}`,
    },
    body: JSON.stringify({ model: deps.modelName, messages, temperature: 0, max_tokens: 512 }),
  });

  if (!res.ok) {
    const detail = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`UI-TARS request failed: ${res.status} ${detail}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = json.choices?.[0]?.message?.content ?? '';
  const parsed = parseAction(content, args.screen);
  const promptTokens = json.usage?.prompt_tokens ?? 0;
  const completionTokens = json.usage?.completion_tokens ?? 0;

  return {
    ...parsed,
    promptTokens,
    completionTokens,
    costUsd: computeCostUsd(promptTokens, completionTokens),
  };
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/uitars.test.ts
```
Expected: PASS — all `parseAction`, `buildMessages`, `computeCostUsd`, `callUiTars` tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add UI-TARS prompt builder, OpenRouter call, original action parser, cost tracking"
```

---

### Task 5: Guarded-action classifier

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/classifier.ts`
- Test: `/Users/vineet/lucy-desktop/tests/classifier.test.ts`

`classifyAction` is the riskiest unit: it must NEVER mislabel an outward/irreversible commit as free. Rule-based denylist first (text matching send/post/pay/buy/confirm/delete/submit/place order on type/finished intents, and Enter pressed inside a messaging composer), then an optional Claude-judge fallback for ambiguous cases. The Claude call is injected and is skipped entirely unless an `anthropicJudge` is supplied.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/classifier.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { classifyAction } from '../src/classifier.js';
import type { AgentAction } from '../src/protocol.js';

const ctx = (overrides: Partial<{ thought: string; inMessagingComposer: boolean }> = {}) => ({
  thought: overrides.thought ?? '',
  inMessagingComposer: overrides.inMessagingComposer ?? false,
});

describe('classifyAction (denylist)', () => {
  it('guards a key=Return while inside a messaging composer', async () => {
    const r = await classifyAction(
      { kind: 'key', keys: 'Return' },
      ctx({ inMessagingComposer: true, thought: 'press enter to send' }),
    );
    expect(r.guarded).toBe(true);
    expect(r.reason).toMatch(/send|composer|enter/i);
  });

  it('does NOT guard a key=Return outside a composer (e.g. address bar)', async () => {
    const r = await classifyAction({ kind: 'key', keys: 'Return' }, ctx({ inMessagingComposer: false }));
    expect(r.guarded).toBe(false);
  });

  it('guards clicks whose thought mentions a denylisted verb', async () => {
    for (const verb of ['send', 'post', 'pay', 'buy', 'confirm', 'delete', 'submit', 'place order']) {
      const r = await classifyAction(
        { kind: 'click', x: 10, y: 10 },
        ctx({ thought: `click the ${verb} button` }),
      );
      expect(r.guarded, `verb=${verb}`).toBe(true);
    }
  });

  it('treats finished as free (it executes nothing)', async () => {
    const r = await classifyAction({ kind: 'finished', result: 'all done' } as AgentAction, ctx());
    expect(r.guarded).toBe(false);
  });

  it('navigate, scroll, wait, and typing are free', async () => {
    expect((await classifyAction({ kind: 'navigate', url: 'https://x' }, ctx())).guarded).toBe(false);
    expect((await classifyAction({ kind: 'scroll', dx: 0, dy: 3 }, ctx())).guarded).toBe(false);
    expect((await classifyAction({ kind: 'wait', ms: 100 }, ctx())).guarded).toBe(false);
    expect((await classifyAction({ kind: 'type', text: 'hello mom' }, ctx())).guarded).toBe(false);
  });

  it('is case-insensitive on denylist matching', async () => {
    const r = await classifyAction({ kind: 'click', x: 1, y: 1 }, ctx({ thought: 'Click SEND now' }));
    expect(r.guarded).toBe(true);
  });
});

describe('classifyAction (Claude-judge fallback)', () => {
  it('does NOT call the judge when the denylist already decided guarded', async () => {
    const judge = vi.fn(async () => false);
    const r = await classifyAction(
      { kind: 'key', keys: 'Return' },
      ctx({ inMessagingComposer: true }),
      { anthropicJudge: judge },
    );
    expect(r.guarded).toBe(true);
    expect(judge).not.toHaveBeenCalled();
  });

  it('consults the judge for an ambiguous click and honors a true verdict', async () => {
    const judge = vi.fn(async () => true);
    const r = await classifyAction(
      { kind: 'click', x: 5, y: 5 },
      ctx({ thought: 'click the green checkmark' }),
      { anthropicJudge: judge },
    );
    expect(judge).toHaveBeenCalledTimes(1);
    expect(r.guarded).toBe(true);
    expect(r.reason).toMatch(/judge/i);
  });

  it('honors a false judge verdict (stays free)', async () => {
    const judge = vi.fn(async () => false);
    const r = await classifyAction(
      { kind: 'click', x: 5, y: 5 },
      ctx({ thought: 'click an ordinary link' }),
      { anthropicJudge: judge },
    );
    expect(r.guarded).toBe(false);
  });

  it('skips the judge entirely when none is supplied (default safe = free for ambiguous clicks)', async () => {
    const r = await classifyAction({ kind: 'click', x: 5, y: 5 }, ctx({ thought: 'click something' }));
    expect(r.guarded).toBe(false);
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/classifier.test.ts
```
Expected: FAIL — `Cannot find module '../src/classifier.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/classifier.ts`:
```ts
import type { AgentAction } from './protocol.js';

export interface ClassifyContext {
  // The model's stated reasoning for this step, used for verb matching.
  thought: string;
  // True when the focused element is a chat/message composer (Enter == send).
  inMessagingComposer: boolean;
}

export type AnthropicJudge = (action: AgentAction, ctx: ClassifyContext) => Promise<boolean>;

export interface ClassifyDeps {
  // Optional fallback judge for ambiguous clicks. Skipped when absent.
  anthropicJudge?: AnthropicJudge;
}

export interface ClassifyResult {
  guarded: boolean;
  reason: string;
}

// Outward / irreversible commit verbs. Order does not matter; matched as words.
const DENYLIST = [
  'send',
  'post',
  'pay',
  'buy',
  'confirm',
  'delete',
  'submit',
  'place order',
];

function matchesDenylist(text: string): string | null {
  const lower = text.toLowerCase();
  for (const verb of DENYLIST) {
    // word/phrase boundary match so "resend" or "deposit" don't false-trigger.
    const re = new RegExp(`\\b${verb.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(lower)) return verb;
  }
  return null;
}

function isEnterKey(keys: string): boolean {
  return /^(return|enter|kp_enter)$/i.test(keys.trim());
}

export async function classifyAction(
  action: AgentAction,
  ctx: ClassifyContext,
  deps: ClassifyDeps = {},
): Promise<ClassifyResult> {
  // 1) Enter inside a messaging composer is a send.
  if (action.kind === 'key' && isEnterKey(action.keys) && ctx.inMessagingComposer) {
    return { guarded: true, reason: 'Enter pressed inside a messaging composer (sends the message)' };
  }

  // 2) Denylisted verb in the stated intent on a committing action.
  if (action.kind === 'click' || action.kind === 'double_click' || action.kind === 'finished') {
    const hit = matchesDenylist(ctx.thought);
    if (hit) {
      return { guarded: true, reason: `intent matches guarded verb "${hit}"` };
    }
  }

  // 3) Inherently free actions never need approval.
  if (
    action.kind === 'navigate' ||
    action.kind === 'scroll' ||
    action.kind === 'wait' ||
    action.kind === 'type' ||
    action.kind === 'finished'
  ) {
    return { guarded: false, reason: 'free action' };
  }

  // 4) Ambiguous click/double_click/key: optional Claude-judge fallback.
  if (deps.anthropicJudge) {
    const verdict = await deps.anthropicJudge(action, ctx);
    return verdict
      ? { guarded: true, reason: 'Claude judge flagged action as irreversible or outward-facing' }
      : { guarded: false, reason: 'Claude judge cleared action as reversible' };
  }

  // 5) No judge available: default to free for ordinary navigation clicks.
  return { guarded: false, reason: 'no denylist match, no judge configured' };
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/classifier.test.ts
```
Expected: PASS — all denylist and judge-fallback tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add guarded-action classifier with denylist and optional Claude-judge fallback"
```

---

### Task 6: Agent orchestration loop

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/agent-loop.ts`
- Test: `/Users/vineet/lucy-desktop/tests/agent-loop.test.ts`

`runAgentLoop` ties it together: screenshot -> uitars -> classify -> (if guarded, emit `awaiting_approval` and await a resolution via an injected approval gate) -> execute -> repeat. It halts on `finished`, `MAX_STEPS`, `COST_CAP_USD`, stuck detection (same screenshot N times), or abort. All collaborators (screenshot, uitars, classify, execute, approval gate, abort signal) are injected; nothing real runs. It emits `ServerMsg` via an `emit` callback.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/agent-loop.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../src/agent-loop.js';
import type { ServerMsg, AgentAction } from '../src/protocol.js';
import type { CallResult } from '../src/uitars.js';

function makeCall(action: AgentAction, thought = 't', cost = 0.01): CallResult {
  return { thought, action, actionText: 'x', costUsd: cost, promptTokens: 1, completionTokens: 1 };
}

const baseDeps = () => {
  const emitted: ServerMsg[] = [];
  return {
    emitted,
    deps: {
      screenshot: vi.fn(async () => 'IMG'),
      execute: vi.fn(async () => {}),
      classify: vi.fn(async () => ({ guarded: false, reason: 'free' })),
      emit: (m: ServerMsg) => emitted.push(m),
      isAborted: () => false,
      screen: { width: 1280, height: 800 },
      maxSteps: 40,
      costCapUsd: 1.5,
      stuckThreshold: 3,
    },
  };
};

describe('runAgentLoop', () => {
  it('runs steps until finished and emits a result', async () => {
    const { emitted, deps } = baseDeps();
    const calls = [
      makeCall({ kind: 'click', x: 1, y: 1 }),
      makeCall({ kind: 'finished', result: 'message sent' }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);

    const out = await runAgentLoop({ goal: 'send' }, { ...deps, callModel });

    expect(out.success).toBe(true);
    expect(out.summary).toBe('message sent');
    expect(deps.execute).toHaveBeenCalledTimes(1); // finished is not executed
    const types = emitted.map((m) => m.type);
    expect(types).toContain('step');
    expect(types).toContain('result');
    expect(emitted.some((m) => m.type === 'status' && m.state === 'done')).toBe(true);
  });

  it('parks on a guarded action and resumes on approve', async () => {
    const { emitted, deps } = baseDeps();
    deps.classify = vi.fn(async (a: AgentAction) =>
      a.kind === 'key' ? { guarded: true, reason: 'send' } : { guarded: false, reason: 'free' },
    );
    const calls = [
      makeCall({ kind: 'key', keys: 'Return' }, 'press enter to send'),
      makeCall({ kind: 'finished', result: 'sent' }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const awaitApproval = vi.fn(async () => ({ approved: true as const }));

    const out = await runAgentLoop({ goal: 'send' }, { ...deps, callModel, awaitApproval });

    expect(awaitApproval).toHaveBeenCalledTimes(1);
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'key', keys: 'Return' }),
      expect.anything(),
    );
    expect(out.success).toBe(true);
    expect(emitted.some((m) => m.type === 'awaiting_approval')).toBe(true);
  });

  it('rejecting a guarded action skips execution and continues', async () => {
    const { emitted, deps } = baseDeps();
    deps.classify = vi.fn(async (a: AgentAction) =>
      a.kind === 'key' ? { guarded: true, reason: 'send' } : { guarded: false, reason: 'free' },
    );
    const calls = [
      makeCall({ kind: 'key', keys: 'Return' }),
      makeCall({ kind: 'finished', result: 'aborted send' }),
    ];
    let i = 0;
    const callModel = vi.fn(async () => calls[i++]);
    const awaitApproval = vi.fn(async () => ({ approved: false as const, reason: 'wrong contact' }));

    const out = await runAgentLoop({ goal: 'send' }, { ...deps, callModel, awaitApproval });

    // The guarded key action must NOT have been executed.
    expect(deps.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'key' }),
      expect.anything(),
    );
    expect(out.success).toBe(true);
    void emitted;
  });

  it('halts at MAX_STEPS with an error result', async () => {
    const { deps } = baseDeps();
    const callModel = vi.fn(async () => makeCall({ kind: 'scroll', dx: 0, dy: 1 }));
    // each step returns a distinct screenshot so stuck-detection never fires
    let n = 0;
    deps.screenshot = vi.fn(async () => `IMG${n++}`);

    const out = await runAgentLoop({ goal: 'loop' }, { ...deps, callModel, maxSteps: 5 });

    expect(out.success).toBe(false);
    expect(out.summary).toMatch(/max steps/i);
    expect(callModel).toHaveBeenCalledTimes(5);
  });

  it('halts when COST_CAP_USD is exceeded', async () => {
    const { deps } = baseDeps();
    let n = 0;
    deps.screenshot = vi.fn(async () => `IMG${n++}`);
    const callModel = vi.fn(async () => makeCall({ kind: 'scroll', dx: 0, dy: 1 }, 't', 1.0));

    const out = await runAgentLoop({ goal: 'expensive' }, { ...deps, callModel, costCapUsd: 1.5 });

    expect(out.success).toBe(false);
    expect(out.summary).toMatch(/cost cap/i);
    // two steps = $2.00 which exceeds $1.50; loop must stop after the second.
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('halts on stuck detection (same screenshot N times)', async () => {
    const { deps } = baseDeps();
    deps.screenshot = vi.fn(async () => 'SAME'); // identical every step
    const callModel = vi.fn(async () => makeCall({ kind: 'scroll', dx: 0, dy: 1 }));

    const out = await runAgentLoop({ goal: 'stuck' }, { ...deps, callModel, stuckThreshold: 3 });

    expect(out.success).toBe(false);
    expect(out.summary).toMatch(/stuck/i);
  });

  it('halts immediately when aborted before the first step', async () => {
    const { deps } = baseDeps();
    deps.isAborted = () => true;
    const callModel = vi.fn(async () => makeCall({ kind: 'finished', result: 'never' }));

    const out = await runAgentLoop({ goal: 'abort' }, { ...deps, callModel });

    expect(out.success).toBe(false);
    expect(out.summary).toMatch(/abort/i);
    expect(callModel).not.toHaveBeenCalled();
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/agent-loop.test.ts
```
Expected: FAIL — `Cannot find module '../src/agent-loop.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/agent-loop.ts`:
```ts
import type { AgentAction, ServerMsg } from './protocol.js';
import type { CallArgs, CallResult, Screen, HistoryEntry } from './uitars.js';
import type { ClassifyContext, ClassifyResult } from './classifier.js';
import type { ExecOpts } from './executor.js';

export interface Approval {
  approved: boolean;
  reason?: string;
}

export interface LoopInput {
  goal: string;
  maxSteps?: number;
  costCapUsd?: number;
}

export interface LoopDeps {
  screenshot: () => Promise<string>;
  callModel: (args: CallArgs) => Promise<CallResult>;
  classify: (action: AgentAction, ctx: ClassifyContext) => Promise<ClassifyResult>;
  execute: (action: AgentAction, opts?: ExecOpts) => Promise<void>;
  awaitApproval?: (stepId: string) => Promise<Approval>;
  emit: (msg: ServerMsg) => void;
  isAborted: () => boolean;
  screen: Screen;
  maxSteps: number;
  costCapUsd: number;
  stuckThreshold: number;
}

export interface LoopResult {
  success: boolean;
  summary: string;
  data: unknown;
}

let stepCounter = 0;
function nextStepId(): string {
  stepCounter += 1;
  return `step-${stepCounter}`;
}

export async function runAgentLoop(input: LoopInput, deps: LoopDeps): Promise<LoopResult> {
  const maxSteps = input.maxSteps ?? deps.maxSteps;
  const costCapUsd = input.costCapUsd ?? deps.costCapUsd;
  const history: HistoryEntry[] = [];

  let costUsd = 0;
  let lastScreenshot: string | null = null;
  let repeatCount = 0;

  deps.emit({ type: 'status', state: 'running' });

  const finish = (success: boolean, summary: string, data: unknown): LoopResult => {
    deps.emit({ type: 'result', success, data, summary });
    deps.emit({ type: 'status', state: success ? 'done' : 'error' });
    return { success, summary, data };
  };

  for (let step = 0; step < maxSteps; step++) {
    if (deps.isAborted()) {
      return finish(false, 'Session aborted by user', null);
    }

    const screenshotB64 = await deps.screenshot();

    // Stuck detection: identical screenshot stuckThreshold times in a row.
    if (lastScreenshot !== null && screenshotB64 === lastScreenshot) {
      repeatCount += 1;
      if (repeatCount + 1 >= deps.stuckThreshold) {
        return finish(false, 'Halted: agent appears stuck (no screen change)', null);
      }
    } else {
      repeatCount = 0;
    }
    lastScreenshot = screenshotB64;

    const result = await deps.callModel({
      goal: input.goal,
      history,
      screenshotB64,
      screen: deps.screen,
    });

    costUsd += result.costUsd;

    const stepId = nextStepId();
    deps.emit({ type: 'step', stepId, thought: result.thought, action: result.action });
    deps.emit({ type: 'screenshot', stepId, b64: screenshotB64 });
    history.push({ thought: result.thought, actionText: result.actionText });

    if (result.action.kind === 'finished') {
      return finish(true, result.action.result, result.action.result);
    }

    // Classify before executing.
    const ctx: ClassifyContext = {
      thought: result.thought,
      inMessagingComposer: /compos|message box|chat input|type a message/i.test(result.thought),
    };
    const verdict = await deps.classify(result.action, ctx);

    if (verdict.guarded) {
      deps.emit({ type: 'status', state: 'awaiting_approval' });
      deps.emit({
        type: 'awaiting_approval',
        stepId,
        intent: `${result.thought} (${verdict.reason})`,
        b64: screenshotB64,
      });

      const approval = deps.awaitApproval
        ? await deps.awaitApproval(stepId)
        : { approved: false, reason: 'no approval channel' };

      if (!approval.approved) {
        // Rejected: tell the model and let it replan on the next step.
        history.push({
          thought: 'User rejected the previous action',
          actionText: `rejected: ${approval.reason ?? 'no reason given'}`,
        });
        deps.emit({ type: 'status', state: 'running' });
        if (costUsd >= costCapUsd) return finish(false, 'Halted: cost cap reached', { costUsd });
        continue;
      }
      deps.emit({ type: 'status', state: 'running' });
    }

    await deps.execute(result.action, { display: undefined });

    if (costUsd >= costCapUsd) {
      return finish(false, `Halted: cost cap of $${costCapUsd} reached`, { costUsd });
    }
  }

  return finish(false, `Halted: reached max steps (${maxSteps})`, null);
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/agent-loop.test.ts
```
Expected: PASS — all loop, approval, cap, stuck, and abort tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add agent orchestration loop with approval gate, caps, stuck detection, abort"
```

---

### Task 7: WebSocket + HTTP control server

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/server.ts`
- Test: `/Users/vineet/lucy-desktop/tests/server.test.ts`

`createServer` builds an HTTP server with a `/health` endpoint and a `ws` WebSocketServer on port 8080. It authenticates connections by `DESKTOP_WS_SECRET` (header or `?secret=` query). It holds exactly one active session. It wires the agent-loop's `emit` to the socket and resolves `awaitApproval` from inbound `approve`/`reject` messages; `abort` sets the abort flag. The loop runner is injected so the test drives the round-trip with a mock loop.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/server.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import type { ServerMsg } from '../src/protocol.js';

const SECRET = 'test-secret';
let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) await close();
  close = null;
});

function startWith(runLoop: any) {
  const { httpServer, shutdown } = createServer({
    secret: SECRET,
    runLoop,
  });
  return new Promise<{ port: number }>((resolve) => {
    httpServer.listen(0, () => {
      close = shutdown;
      resolve({ port: (httpServer.address() as AddressInfo).port });
    });
  });
}

function collect(ws: WebSocket): ServerMsg[] {
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  return msgs;
}

describe('control server', () => {
  it('serves /health', async () => {
    const { port } = await startWith(vi.fn());
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects a WS connection without the secret', async () => {
    const { port } = await startWith(vi.fn());
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => {});
    });
    expect(code).toBe(1008); // policy violation
  });

  it('accepts a WS connection with the secret and runs a session on start', async () => {
    const runLoop = vi.fn(async (input: any, hooks: any) => {
      hooks.emit({ type: 'status', state: 'running' });
      hooks.emit({ type: 'result', success: true, data: 'ok', summary: 'done' } satisfies ServerMsg);
      return { success: true, summary: 'done', data: 'ok' };
    });
    const { port } = await startWith(runLoop);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?secret=${SECRET}`);
    const msgs = collect(ws);

    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'start', goal: 'do thing' }));

    await vi.waitFor(() => {
      expect(msgs.some((m) => m.type === 'result')).toBe(true);
    });
    expect(runLoop).toHaveBeenCalledTimes(1);
    expect(runLoop.mock.calls[0][0]).toMatchObject({ goal: 'do thing' });
    ws.close();
  });

  it('routes approve back into the running loop via the approval hook', async () => {
    let resolveApproval: ((a: any) => void) | null = null;
    const runLoop = vi.fn(async (_input: any, hooks: any) => {
      hooks.emit({ type: 'awaiting_approval', stepId: 's1', intent: 'send?', b64: 'IMG' } satisfies ServerMsg);
      const approval = await hooks.awaitApproval('s1');
      hooks.emit({ type: 'result', success: approval.approved, data: null, summary: 'x' } satisfies ServerMsg);
      return { success: approval.approved, summary: 'x', data: null };
    });
    // expose the awaitApproval resolution timing via a probe
    void resolveApproval;

    const { port } = await startWith(runLoop);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?secret=${SECRET}`);
    const msgs = collect(ws);

    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'start', goal: 'send' }));

    await vi.waitFor(() => {
      expect(msgs.some((m) => m.type === 'awaiting_approval')).toBe(true);
    });
    ws.send(JSON.stringify({ type: 'approve', stepId: 's1' }));

    await vi.waitFor(() => {
      const r = msgs.find((m) => m.type === 'result');
      expect(r && (r as any).success).toBe(true);
    });
    ws.close();
  });

  it('refuses a second concurrent session with an error message', async () => {
    const runLoop = vi.fn(
      () => new Promise(() => {}), // never resolves; first session stays active
    );
    const { port } = await startWith(runLoop);

    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/?secret=${SECRET}`);
    await new Promise<void>((r) => ws1.on('open', () => r()));
    ws1.send(JSON.stringify({ type: 'start', goal: 'first' }));
    await vi.waitFor(() => expect(runLoop).toHaveBeenCalledTimes(1));

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/?secret=${SECRET}`);
    const msgs2 = collect(ws2);
    await new Promise<void>((r) => ws2.on('open', () => r()));
    ws2.send(JSON.stringify({ type: 'start', goal: 'second' }));

    await vi.waitFor(() => {
      expect(msgs2.some((m) => m.type === 'error' && /busy|active session/i.test((m as any).message))).toBe(true);
    });
    expect(runLoop).toHaveBeenCalledTimes(1);
    ws1.close();
    ws2.close();
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/server.test.ts
```
Expected: FAIL — `Cannot find module '../src/server.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/server.ts`:
```ts
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { isClientMsg, type ClientMsg, type ServerMsg } from './protocol.js';
import type { LoopInput, LoopResult, Approval } from './agent-loop.js';

export interface LoopHooks {
  emit: (msg: ServerMsg) => void;
  awaitApproval: (stepId: string) => Promise<Approval>;
  isAborted: () => boolean;
}

export type RunLoopFn = (input: LoopInput, hooks: LoopHooks) => Promise<LoopResult>;

export interface ServerOpts {
  secret: string;
  runLoop: RunLoopFn;
}

interface ActiveSession {
  socket: WebSocket;
  aborted: boolean;
  pendingApproval: { stepId: string; resolve: (a: Approval) => void } | null;
}

export function createServer(opts: ServerOpts): {
  httpServer: http.Server;
  shutdown: () => Promise<void>;
} {
  const httpServer = http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });
  let active: ActiveSession | null = null;

  function send(socket: WebSocket, msg: ServerMsg): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  }

  wss.on('connection', (socket, req) => {
    // Auth: secret via ?secret= query or x-desktop-secret header.
    const url = new URL(req.url ?? '/', 'http://localhost');
    const provided = url.searchParams.get('secret') ?? req.headers['x-desktop-secret'];
    if (provided !== opts.secret) {
      socket.close(1008, 'unauthorized');
      return;
    }

    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', message: 'invalid JSON' });
        return;
      }
      if (!isClientMsg(parsed)) {
        send(socket, { type: 'error', message: 'unrecognized message' });
        return;
      }
      const msg = parsed as ClientMsg;

      switch (msg.type) {
        case 'start': {
          if (active) {
            send(socket, { type: 'error', message: 'desktop is busy: an active session is running' });
            return;
          }
          const session: ActiveSession = { socket, aborted: false, pendingApproval: null };
          active = session;

          const hooks: LoopHooks = {
            emit: (m) => send(socket, m),
            isAborted: () => session.aborted,
            awaitApproval: (stepId) =>
              new Promise<Approval>((resolve) => {
                session.pendingApproval = { stepId, resolve };
              }),
          };

          opts
            .runLoop({ goal: msg.goal, maxSteps: msg.maxSteps, costCapUsd: msg.costCapUsd }, hooks)
            .catch((err: unknown) => {
              send(socket, { type: 'error', message: err instanceof Error ? err.message : String(err) });
            })
            .finally(() => {
              if (active === session) active = null;
            });
          return;
        }

        case 'approve': {
          const p = active?.pendingApproval;
          if (p && p.stepId === msg.stepId) {
            active!.pendingApproval = null;
            p.resolve({ approved: true });
          }
          return;
        }

        case 'reject': {
          const p = active?.pendingApproval;
          if (p && p.stepId === msg.stepId) {
            active!.pendingApproval = null;
            p.resolve({ approved: false, reason: msg.reason });
          }
          return;
        }

        case 'abort': {
          if (active) {
            active.aborted = true;
            // Unblock any pending approval so the loop can exit promptly.
            if (active.pendingApproval) {
              const p = active.pendingApproval;
              active.pendingApproval = null;
              p.resolve({ approved: false, reason: 'aborted' });
            }
          }
          return;
        }
      }
    });

    socket.on('close', () => {
      if (active && active.socket === socket) {
        active.aborted = true;
        if (active.pendingApproval) {
          const p = active.pendingApproval;
          active.pendingApproval = null;
          p.resolve({ approved: false, reason: 'socket closed' });
        }
      }
    });
  });

  const shutdown = (): Promise<void> =>
    new Promise<void>((resolve) => {
      wss.close(() => httpServer.close(() => resolve()));
    });

  return { httpServer, shutdown };
}

// Boot when run directly (not under test import).
const isDirectRun =
  typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('server.ts');
if (isDirectRun) {
  const secret = process.env.DESKTOP_WS_SECRET;
  if (!secret) {
    console.error('DESKTOP_WS_SECRET is required');
    process.exit(1);
  }
  // The real runLoop wiring (screenshot/uitars/classifier/executor) is composed
  // in the entrypoint; here we fail loudly if started without it injected.
  console.error('server.ts must be started via the composed entrypoint, not directly');
  process.exit(1);
}
```

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/server.test.ts
```
Expected: PASS — health, auth-reject, start, approve round-trip, and single-session tests pass.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add authenticated single-session WS+HTTP control server on 8080"
```

---

### Task 8: Desktop Docker image (Dockerfile, supervisord, entrypoint)

**Files:**
- Create: `/Users/vineet/lucy-desktop/Dockerfile`
- Create: `/Users/vineet/lucy-desktop/supervisord.conf`
- Create: `/Users/vineet/lucy-desktop/entrypoint.sh`
- Create: `/Users/vineet/lucy-desktop/src/main.ts` (the composed entrypoint that wires real collaborators into `createServer`)

This is infrastructure: no unit test. The verification step is a local `docker build` + `docker run` + curl of `/health`, asserting `{"ok":true}`.

Steps:

- [ ] Write `/Users/vineet/lucy-desktop/src/main.ts` (the real composition root the container runs):
```ts
import { createServer, type LoopHooks } from './server.js';
import { runAgentLoop } from './agent-loop.js';
import { captureScreenshot } from './screenshot.js';
import { executeAction } from './executor.js';
import { classifyAction } from './classifier.js';
import { callUiTars } from './uitars.js';

const display = process.env.DISPLAY ?? ':99';
const baseUrl = process.env.MODEL_BASE_URL ?? 'https://openrouter.ai/api/v1';
const modelName = process.env.MODEL_NAME ?? 'bytedance/ui-tars-1.5-7b';
const apiKey = process.env.OPENROUTER_API_KEY ?? '';
const secret = process.env.DESKTOP_WS_SECRET ?? '';
const maxSteps = Number(process.env.MAX_STEPS ?? '40');
const costCapUsd = Number(process.env.COST_CAP_USD ?? '1.5');
const screen = { width: 1280, height: 800 };

if (!secret) {
  console.error('DESKTOP_WS_SECRET is required');
  process.exit(1);
}
if (!apiKey) {
  console.error('OPENROUTER_API_KEY is required');
  process.exit(1);
}

const { httpServer } = createServer({
  secret,
  runLoop: (input, hooks: LoopHooks) =>
    runAgentLoop(input, {
      screenshot: () => captureScreenshot({ display }),
      callModel: (args) => callUiTars(args, { baseUrl, modelName, apiKey }),
      classify: (action, ctx) => classifyAction(action, ctx),
      execute: (action) => executeAction(action, { display }),
      awaitApproval: hooks.awaitApproval,
      emit: hooks.emit,
      isAborted: hooks.isAborted,
      screen,
      maxSteps,
      costCapUsd,
      stuckThreshold: 3,
    }),
});

httpServer.listen(8080, '0.0.0.0', () => {
  console.log('lucy-desktop control server listening on 8080');
});
```

- [ ] Write `/Users/vineet/lucy-desktop/supervisord.conf`:
```ini
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:dbus]
command=/usr/bin/dbus-daemon --system --nofork
autorestart=true
priority=5

[program:xvfb]
command=/usr/bin/Xvfb :99 -screen 0 1280x800x24 -ac
autorestart=true
priority=10

[program:xfce]
command=/usr/bin/startxfce4
environment=DISPLAY=":99"
autorestart=true
priority=20

[program:x11vnc]
command=/usr/bin/x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -noxdamage
autorestart=true
priority=30

[program:novnc]
command=/usr/bin/websockify --web=/usr/share/novnc 6080 localhost:5900
autorestart=true
priority=40

[program:control]
command=/usr/local/bin/node --import tsx/esm /app/src/main.ts
directory=/app
environment=DISPLAY=":99"
autorestart=true
priority=50
stdout_logfile=/var/log/control.log
stderr_logfile=/var/log/control.err
```

- [ ] Write `/Users/vineet/lucy-desktop/entrypoint.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Ensure the persistent Chromium profile dir exists on the Fly volume.
mkdir -p "${CHROME_PROFILE_DIR:-/data/chrome-profile}"

# Launch Chromium under the virtual display once Xvfb is up (xfce starts it via supervisor,
# but we launch the browser explicitly with the persistent profile so logins survive).
(
  for _ in $(seq 1 30); do
    if DISPLAY="${DISPLAY:-:99}" xdotool getdisplaygeometry >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  DISPLAY="${DISPLAY:-:99}" chromium \
    --no-sandbox \
    --no-first-run \
    --disable-gpu \
    --start-maximized \
    --user-data-dir="${CHROME_PROFILE_DIR:-/data/chrome-profile}" \
    about:blank &
) &

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

- [ ] Write `/Users/vineet/lucy-desktop/Dockerfile`:
```dockerfile
FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    CHROME_PROFILE_DIR=/data/chrome-profile

RUN apt-get update && apt-get install -y --no-install-recommends \
      xfce4 \
      xfce4-session \
      x11vnc \
      novnc \
      websockify \
      chromium \
      xdotool \
      scrot \
      xvfb \
      dbus-x11 \
      supervisor \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

# App source.
COPY tsconfig.json vitest.config.ts ./
COPY src ./src

# Process supervision + entrypoint.
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# noVNC web client on 6080 (public, token-gated by the proxy in Task 10).
# Control server WS+HTTP on 8080 (private 6PN only).
EXPOSE 6080 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] Verify the image builds and the control server answers `/health`. (The container needs `DESKTOP_WS_SECRET` and `OPENROUTER_API_KEY` to start the control program; supervisord keeps the rest alive.)
```bash
cd /Users/vineet/lucy-desktop && docker build -t lucy-desktop:test .
docker run -d --name lucy-desktop-smoke \
  -e DESKTOP_WS_SECRET=smoke \
  -e OPENROUTER_API_KEY=smoke \
  -e NOVNC_TOKEN=smoke \
  -p 18080:8080 -p 16080:6080 \
  lucy-desktop:test
# give supervisord a moment to launch the control program
for i in $(seq 1 20); do curl -sf http://127.0.0.1:18080/health && break; sleep 2; done
curl -s http://127.0.0.1:18080/health
docker rm -f lucy-desktop-smoke
```
Expected output: `{"ok":true}` from the `/health` curl.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add Docker desktop image, supervisord, entrypoint, and composition root"
```

---

### Task 9: Fly config and deploy docs

**Files:**
- Create: `/Users/vineet/lucy-desktop/fly.toml`
- Create: `/Users/vineet/lucy-desktop/docs/DEPLOY.md`

Infrastructure: no unit test. Verification is a `flyctl config validate` and a deploy + remote `/health` check over 6PN.

Steps:

- [ ] Write `/Users/vineet/lucy-desktop/fly.toml`:
```toml
app = "lucy-desktop"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[env]
  MODEL_BASE_URL = "https://openrouter.ai/api/v1"
  MODEL_NAME = "bytedance/ui-tars-1.5-7b"
  MAX_STEPS = "40"
  COST_CAP_USD = "1.5"
  DISPLAY = ":99"
  CHROME_PROFILE_DIR = "/data/chrome-profile"

# noVNC live view — public, gated by the token proxy (Task 10) on 6080.
[http_service]
  internal_port = 6080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[mounts]]
  source = "data"
  destination = "/data"

[[vm]]
  memory = "4gb"
  cpu_kind = "shared"
  cpus = 2
```

- [ ] Write `/Users/vineet/lucy-desktop/docs/DEPLOY.md`:
```markdown
# Deploying lucy-desktop

Standalone Fly app `lucy-desktop`, region `sin`. Deploy ONLY from this repo
(`/Users/vineet/lucy-desktop`). Wrong CWD = wrong image = outage.

## One-time provisioning

```bash
# Create the app (no deploy yet)
~/.fly/bin/flyctl apps create lucy-desktop

# Create the persistent volume for the Chromium profile (logins survive restarts)
~/.fly/bin/flyctl volumes create data --app lucy-desktop --region sin --size 10
```

## Secrets (names only — never commit values)

```bash
~/.fly/bin/flyctl secrets set OPENROUTER_API_KEY=... --app lucy-desktop
~/.fly/bin/flyctl secrets set DESKTOP_WS_SECRET=... --app lucy-desktop
~/.fly/bin/flyctl secrets set NOVNC_TOKEN=... --app lucy-desktop
```

`OPENROUTER_API_KEY`, `DESKTOP_WS_SECRET`, and `NOVNC_TOKEN` are required.
`MODEL_BASE_URL`, `MODEL_NAME`, `MAX_STEPS`, `COST_CAP_USD`, `DISPLAY`,
`CHROME_PROFILE_DIR` are non-secret defaults already set in `fly.toml [env]`.

Because the OpenRouter key was shared in plaintext during design, rotate it once
the app is provisioned.

## Deploy

```bash
cd /Users/vineet/lucy-desktop
~/.fly/bin/flyctl config validate
~/.fly/bin/flyctl deploy --app lucy-desktop --remote-only
```

## Verify

```bash
# noVNC public endpoint requires the token (Task 10 proxy):
#   https://lucy-desktop.fly.dev/vnc.html?token=<NOVNC_TOKEN>&view_only=1
# Control server health over 6PN private net (run from a machine on the org net,
# e.g. ikawn-openbrain):
~/.fly/bin/flyctl ssh console --app ikawn-openbrain \
  -C "curl -s http://lucy-desktop.internal:8080/health"
# Expected: {"ok":true}
```
```

- [ ] Verify the Fly config is valid:
```bash
cd /Users/vineet/lucy-desktop && ~/.fly/bin/flyctl config validate
```
Expected: `Configuration is valid`.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add fly.toml (sin, 4gb, /data volume, 6080 http_service) and DEPLOY.md"
```

---

### Task 10: noVNC token-gating proxy

**Files:**
- Create: `/Users/vineet/lucy-desktop/src/novnc-proxy.ts`
- Test: `/Users/vineet/lucy-desktop/tests/novnc-proxy.test.ts`
- Modify: `/Users/vineet/lucy-desktop/supervisord.conf`
- Modify: `/Users/vineet/lucy-desktop/fly.toml`

A small Node reverse proxy listens on the public port (6080) and requires `?token=<NOVNC_TOKEN>` on the initial HTTP/WS handshake before proxying to the internal websockify (now moved to 6081). It also passes `&view_only=1` through. This is unit-testable at the request-gating layer: a factory returns a request handler whose decision (allow/deny) is asserted without binding a real socket.

Steps:

- [ ] Write the failing test `/Users/vineet/lucy-desktop/tests/novnc-proxy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkToken } from '../src/novnc-proxy.js';

describe('checkToken', () => {
  const token = 'secret-novnc';

  it('allows a request whose ?token matches', () => {
    expect(checkToken('/vnc.html?token=secret-novnc', token)).toEqual({ allowed: true });
  });

  it('allows the websockify upgrade path with a matching token', () => {
    expect(checkToken('/websockify?token=secret-novnc', token)).toEqual({ allowed: true });
  });

  it('preserves view_only alongside a valid token', () => {
    expect(checkToken('/vnc.html?token=secret-novnc&view_only=1', token)).toEqual({ allowed: true });
  });

  it('denies a missing token', () => {
    expect(checkToken('/vnc.html', token).allowed).toBe(false);
  });

  it('denies a wrong token', () => {
    expect(checkToken('/vnc.html?token=nope', token).allowed).toBe(false);
  });

  it('denies when no token is configured (fail closed)', () => {
    expect(checkToken('/vnc.html?token=anything', '').allowed).toBe(false);
  });
});
```

- [ ] Run the test and watch it FAIL:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/novnc-proxy.test.ts
```
Expected: FAIL — `Cannot find module '../src/novnc-proxy.js'`.

- [ ] Write `/Users/vineet/lucy-desktop/src/novnc-proxy.ts`:
```ts
import http from 'node:http';
import net from 'node:net';

export interface TokenCheck {
  allowed: boolean;
}

// Pure gate: a request is allowed only if it carries ?token= equal to the
// configured NOVNC_TOKEN. Fails closed when no token is configured.
export function checkToken(reqUrl: string, configured: string): TokenCheck {
  if (!configured) return { allowed: false };
  const url = new URL(reqUrl, 'http://localhost');
  const provided = url.searchParams.get('token');
  return { allowed: provided === configured };
}

export interface ProxyOpts {
  token: string;
  listenPort: number; // public port (6080)
  upstreamPort: number; // internal websockify (6081)
  upstreamHost?: string;
}

// Reverse proxy that gates the initial HTTP request and the WS upgrade on the
// token, then transparently pipes bytes to the internal websockify.
export function createNovncProxy(opts: ProxyOpts): http.Server {
  const upstreamHost = opts.upstreamHost ?? '127.0.0.1';

  const server = http.createServer((req, res) => {
    if (!checkToken(req.url ?? '/', opts.token).allowed) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('unauthorized');
      return;
    }
    const upstream = http.request(
      { host: upstreamHost, port: opts.upstreamPort, method: req.method, path: req.url, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end('bad gateway');
    });
    req.pipe(upstream);
  });

  // Gate the WebSocket upgrade, then splice the raw sockets to websockify.
  server.on('upgrade', (req, socket, head) => {
    if (!checkToken(req.url ?? '/', opts.token).allowed) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const upstream = net.connect(opts.upstreamPort, upstreamHost, () => {
      const headerLines = [
        `${req.method} ${req.url} HTTP/1.1`,
        ...Object.entries(req.headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`),
        '\r\n',
      ];
      upstream.write(headerLines.join('\r\n'));
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  server.listen(opts.listenPort, '0.0.0.0');
  return server;
}

// Boot when launched directly by supervisord.
const isDirectRun =
  typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('novnc-proxy.ts');
if (isDirectRun) {
  const token = process.env.NOVNC_TOKEN ?? '';
  if (!token) {
    console.error('NOVNC_TOKEN is required');
    process.exit(1);
  }
  createNovncProxy({ token, listenPort: 6080, upstreamPort: 6081 });
  console.log('noVNC token proxy listening on 6080 -> 6081');
}
```

- [ ] Move internal websockify to 6081 and add the proxy as a supervised program. In `/Users/vineet/lucy-desktop/supervisord.conf`, change the `novnc` program command to bind 6081 and add a `novnc-proxy` program:
```ini
[program:novnc]
command=/usr/bin/websockify --web=/usr/share/novnc 6081 localhost:5900
autorestart=true
priority=40

[program:novnc-proxy]
command=/usr/local/bin/node --import tsx/esm /app/src/novnc-proxy.ts
directory=/app
autorestart=true
priority=45
stdout_logfile=/var/log/novnc-proxy.log
stderr_logfile=/var/log/novnc-proxy.err
```

- [ ] Confirm `fly.toml` still points `http_service.internal_port` at the public proxy port `6080` (no change needed — the proxy now owns 6080, websockify moved to internal 6081). Leave `fly.toml` as written in Task 9.

- [ ] Run the test and watch it PASS:
```bash
cd /Users/vineet/lucy-desktop && npm test -- tests/novnc-proxy.test.ts
```
Expected: PASS — 6 token-gating tests pass.

- [ ] Run the full suite to confirm nothing regressed:
```bash
cd /Users/vineet/lucy-desktop && npm test
```
Expected: PASS — all suites green.

- [ ] Commit:
```bash
cd /Users/vineet/lucy-desktop && git add -A && git commit -m "Add token-gating noVNC reverse proxy on 6080; move websockify to internal 6081"
```
## Part 2: OpenBrain integration

> **Conventions discovered (use these exactly):**
> - **Tool export shape:** `module.exports = { name, description, tier, parameters, execute(config, context) }`. `parameters` is an object keyed by param name, each `{ type, required?, description, enum?, items? }`. `execute` returns `{ success, data, summary }`. (See `src/tools/orbit.tool.js`, `src/tools/deploy.tool.js`.)
> - **Cost-tier / brand gating:** `src/tools/registry.js` reads `tool.costTier` (falling back to `DEFAULT_COST_TIERS[name]`). Tier `'critical'` is blocked for any brand that is not `ikawn` / a paying brand / internal. The `IKAWN_ONLY_TOOLS` array further restricts a tool to `ikawn` only. We set BOTH `costTier: 'critical'` on the tool and add it to `IKAWN_ONLY_TOOLS`, and we harden `checkToolPermission` so `IKAWN_ONLY_TOOLS` is enforced for paying brands too (today the early `PAYING_BRANDS` return bypasses it).
> - **Chat-stream mechanism:** SSE via `res.write('data: ' + JSON.stringify(...) + '\\n\\n')` in `src/routes/chat-api.js`. Tools run inside `executeToolFn` (line ~853) which closes over `res`. We pass an `onToolEvent(evt)` callback through the tool `context` so `delegate_to_desktop` can push `desktop_event` SSE frames. The browser consumes SSE in `src/frontend/src/hooks/useStreamChat.ts`.
> - **Approval round-trip:** no bidirectional stream exists. We add an in-process registry `src/engine/desktop-approvals.js` (Map of `approvalId → { resolve, reject, timer }`) and a POST route `POST /api/chat/desktop-approval` that resolves the pending promise. The tool `await`s that promise (5-min timeout → pause, never auto-approve).
> - **Frontend:** React 19 + Vite 6 + TanStack Router + Zustand + shadcn/ui (`src/frontend/`), editable source under `src/frontend/src/`. Chat components live in `src/frontend/src/components/chat/`; chat state in `src/frontend/src/stores/chat.ts`; SSE handler in `src/frontend/src/hooks/useStreamChat.ts`; layout in `src/frontend/src/components/chat/ChatView.tsx`.
> - **Test runner:** `vitest` (`npm test` → `vitest run`). Tests live in `tests/unit/`, `tests/integration/`. Config at `vitest.config.js`.
> - **New runtime dep required:** `ws` (not currently a root dependency).

---

### Task 1: Add `ws` dependency and the desktop env config module

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/package.json`
- Create: `/Users/vineet/ikawn-openbrain/src/config/desktop.js`
- Test: `/Users/vineet/ikawn-openbrain/tests/unit/desktop-config.test.js`

- [ ] **Write failing test** `tests/unit/desktop-config.test.js`:
```js
// Tests for src/config/desktop.js — resolves DESKTOP_* env with documented defaults.
describe('desktop config', () => {
  let cfg;
  const ENV = ['DESKTOP_WS_URL', 'DESKTOP_WS_SECRET', 'DESKTOP_NOVNC_URL', 'DESKTOP_NOVNC_TOKEN'];
  let saved;

  beforeEach(() => {
    saved = {};
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('falls back to documented defaults for URLs', () => {
    cfg = require('../../src/config/desktop');
    expect(cfg.getWsUrl()).toBe('ws://lucy-desktop.internal:8080');
    expect(cfg.getNoVncBaseUrl()).toBe('https://lucy-desktop.fly.dev/vnc');
  });

  it('honours overrides', () => {
    process.env.DESKTOP_WS_URL = 'ws://10.0.0.5:9090';
    process.env.DESKTOP_NOVNC_URL = 'https://example/vnc';
    cfg = require('../../src/config/desktop');
    expect(cfg.getWsUrl()).toBe('ws://10.0.0.5:9090');
    expect(cfg.getNoVncBaseUrl()).toBe('https://example/vnc');
  });

  it('isConfigured() is false without secret, true with it', () => {
    cfg = require('../../src/config/desktop');
    expect(cfg.isConfigured()).toBe(false);
    process.env.DESKTOP_WS_SECRET = 's3cret';
    vi.resetModules();
    cfg = require('../../src/config/desktop');
    expect(cfg.isConfigured()).toBe(true);
  });

  it('buildNoVncEmbedUrl appends token and view_only by default', () => {
    process.env.DESKTOP_NOVNC_TOKEN = 'tok123';
    cfg = require('../../src/config/desktop');
    const viewOnly = cfg.buildNoVncEmbedUrl(true);
    expect(viewOnly).toBe('https://lucy-desktop.fly.dev/vnc?token=tok123&view_only=1');
    const control = cfg.buildNoVncEmbedUrl(false);
    expect(control).toBe('https://lucy-desktop.fly.dev/vnc?token=tok123');
  });
});
```
- [ ] **Run (expect FAIL):** `npm test -- desktop-config` — fails with `Cannot find module '../../src/config/desktop'`.
- [ ] **Add `ws` to dependencies** in `package.json`. Add this line inside `"dependencies"` (alphabetical, after `"sharp"`):
```json
    "ws": "^8.18.1"
```
Then run `npm install` to write the lockfile.
- [ ] **Create** `src/config/desktop.js`:
```js
// src/config/desktop.js
'use strict';

// Centralised resolution of lucy-desktop connection settings.
// Env vars (exact names, frozen contract):
//   DESKTOP_WS_URL      — control-server WebSocket (default ws://lucy-desktop.internal:8080)
//   DESKTOP_WS_SECRET   — shared secret, sent as the first WS message (auth)
//   DESKTOP_NOVNC_URL   — public noVNC base (default https://lucy-desktop.fly.dev/vnc)
//   DESKTOP_NOVNC_TOKEN — token appended to the noVNC embed URL

const DEFAULT_WS_URL = 'ws://lucy-desktop.internal:8080';
const DEFAULT_NOVNC_URL = 'https://lucy-desktop.fly.dev/vnc';

function getWsUrl() {
  return process.env.DESKTOP_WS_URL || DEFAULT_WS_URL;
}

function getWsSecret() {
  return process.env.DESKTOP_WS_SECRET || '';
}

function getNoVncBaseUrl() {
  return process.env.DESKTOP_NOVNC_URL || DEFAULT_NOVNC_URL;
}

function getNoVncToken() {
  return process.env.DESKTOP_NOVNC_TOKEN || '';
}

function isConfigured() {
  return Boolean(getWsSecret());
}

// Build the embed URL for the iframe. viewOnly=true appends &view_only=1 (read-only);
// dropping it grants take-control.
function buildNoVncEmbedUrl(viewOnly = true) {
  const base = getNoVncBaseUrl();
  const token = getNoVncToken();
  const sep = base.includes('?') ? '&' : '?';
  let url = `${base}${sep}token=${encodeURIComponent(token)}`;
  if (viewOnly) url += '&view_only=1';
  return url;
}

module.exports = {
  DEFAULT_WS_URL,
  DEFAULT_NOVNC_URL,
  getWsUrl,
  getWsSecret,
  getNoVncBaseUrl,
  getNoVncToken,
  isConfigured,
  buildNoVncEmbedUrl,
};
```
- [ ] **Run (expect PASS):** `npm test -- desktop-config` — 4 tests pass.
- [ ] **Commit:** `git add package.json package-lock.json src/config/desktop.js tests/unit/desktop-config.test.js && git commit -m "feat(desktop): ws dep + DESKTOP_* config module"`

---

### Task 2: WebSocket connector `src/connectors/desktop.js`

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/src/connectors/desktop.js`
- Test: `/Users/vineet/ikawn-openbrain/tests/unit/desktop-connector.test.js`

The connector is an `EventEmitter` wrapping a `ws` socket. It authenticates by sending `{type:'auth', secret}` as the first message, exposes `start/approve/reject/abort`, re-emits every ServerMsg as a `'message'` event, and supports one reconnect attempt on unexpected close while a session is active.

- [ ] **Write failing test** `tests/unit/desktop-connector.test.js` (uses an in-memory mock `ws` via `vi.mock`):
```js
import { EventEmitter } from 'node:events';

// Mock 'ws' with a controllable fake socket.
let lastSocket = null;
class FakeWebSocket extends EventEmitter {
  constructor(url, opts) {
    super();
    this.url = url;
    this.opts = opts;
    this.sent = [];
    this.readyState = 0; // CONNECTING
    lastSocket = this;
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close', 1000, Buffer.from('bye')); }
  // test helpers
  _open() { this.readyState = 1; this.emit('open'); }
  _serverMsg(obj) { this.emit('message', Buffer.from(JSON.stringify(obj))); }
}
FakeWebSocket.CONNECTING = 0; FakeWebSocket.OPEN = 1; FakeWebSocket.CLOSING = 2; FakeWebSocket.CLOSED = 3;

vi.mock('ws', () => ({ default: FakeWebSocket, WebSocket: FakeWebSocket }));

describe('DesktopConnector', () => {
  let DesktopConnector;
  beforeEach(async () => {
    lastSocket = null;
    vi.resetModules();
    ({ DesktopConnector } = await import('../../src/connectors/desktop.js'));
  });

  it('connects to wsUrl and sends auth as first message on open', async () => {
    const c = new DesktopConnector({ wsUrl: 'ws://desk:8080', secret: 'sek' });
    const connected = c.connect();
    expect(lastSocket.url).toBe('ws://desk:8080');
    lastSocket._open();
    await connected;
    const first = JSON.parse(lastSocket.sent[0]);
    expect(first).toEqual({ type: 'auth', secret: 'sek' });
  });

  it('start() sends a start frame and re-emits server messages', async () => {
    const c = new DesktopConnector({ wsUrl: 'ws://desk:8080', secret: 'sek' });
    const got = [];
    c.on('message', (m) => got.push(m));
    const connected = c.connect();
    lastSocket._open();
    await connected;
    c.start({ goal: 'send whatsapp', maxSteps: 40, costCapUsd: 1.5 });
    const startFrame = JSON.parse(lastSocket.sent[1]);
    expect(startFrame).toEqual({ type: 'start', goal: 'send whatsapp', maxSteps: 40, costCapUsd: 1.5 });
    lastSocket._serverMsg({ type: 'step', stepId: 's1', thought: 'open chrome', action: 'launch' });
    lastSocket._serverMsg({ type: 'result', success: true, data: { ok: 1 }, summary: 'done' });
    expect(got[0]).toEqual({ type: 'step', stepId: 's1', thought: 'open chrome', action: 'launch' });
    expect(got[1].type).toBe('result');
  });

  it('approve/reject/abort send the correct frames', async () => {
    const c = new DesktopConnector({ wsUrl: 'ws://desk:8080', secret: 'sek' });
    const connected = c.connect();
    lastSocket._open();
    await connected;
    c.approve('s9');
    c.reject('s9', 'wrong contact');
    c.abort();
    const frames = lastSocket.sent.slice(1).map((s) => JSON.parse(s));
    expect(frames).toEqual([
      { type: 'approve', stepId: 's9' },
      { type: 'reject', stepId: 's9', reason: 'wrong contact' },
      { type: 'abort' },
    ]);
  });

  it('emits "error" event when a malformed frame arrives', async () => {
    const c = new DesktopConnector({ wsUrl: 'ws://desk:8080', secret: 'sek' });
    const errs = [];
    c.on('parse_error', (e) => errs.push(e));
    const connected = c.connect();
    lastSocket._open();
    await connected;
    lastSocket.emit('message', Buffer.from('not-json'));
    expect(errs.length).toBe(1);
  });
});
```
- [ ] **Run (expect FAIL):** `npm test -- desktop-connector` — fails (`src/connectors/desktop.js` missing).
- [ ] **Create** `src/connectors/desktop.js`:
```js
// src/connectors/desktop.js
'use strict';

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

const VALID_STATES = ['idle', 'running', 'awaiting_approval', 'paused', 'done', 'error'];

/**
 * WebSocket client for the lucy-desktop control server.
 * Emits:
 *   'open'        — socket opened and auth sent
 *   'message'     — a parsed ServerMsg ({type, ...})
 *   'parse_error' — a frame failed to JSON.parse (Error)
 *   'close'       — socket closed ({ code, reason, willReconnect })
 *   'error'       — transport error (Error)
 */
class DesktopConnector extends EventEmitter {
  constructor({ wsUrl, secret, reconnect = true }) {
    super();
    this.wsUrl = wsUrl;
    this.secret = secret;
    this.reconnectEnabled = reconnect;
    this.ws = null;
    this.sessionActive = false;
    this._reconnectUsed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        // Auth handshake: first frame carries the shared secret.
        ws.send(JSON.stringify({ type: 'auth', secret: this.secret }));
        this.emit('open');
        if (!settled) { settled = true; resolve(); }
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
        } catch (err) {
          this.emit('parse_error', err);
          return;
        }
        if (msg && msg.type === 'status' && msg.state && !VALID_STATES.includes(msg.state)) {
          this.emit('parse_error', new Error(`Unknown desktop state: ${msg.state}`));
          return;
        }
        this.emit('message', msg);
      });

      ws.on('error', (err) => {
        this.emit('error', err);
        if (!settled) { settled = true; reject(err); }
      });

      ws.on('close', (code, reasonBuf) => {
        const reason = reasonBuf ? reasonBuf.toString('utf8') : '';
        const willReconnect =
          this.reconnectEnabled && this.sessionActive && !this._reconnectUsed && code !== 1000;
        this.emit('close', { code, reason, willReconnect });
        if (willReconnect) {
          this._reconnectUsed = true;
          this.connect().catch((e) => this.emit('error', e));
        }
      });
    });
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Desktop socket not open');
    }
    this.ws.send(JSON.stringify(obj));
  }

  start({ goal, maxSteps, costCapUsd }) {
    this.sessionActive = true;
    const frame = { type: 'start', goal };
    if (maxSteps != null) frame.maxSteps = maxSteps;
    if (costCapUsd != null) frame.costCapUsd = costCapUsd;
    this._send(frame);
  }

  approve(stepId) { this._send({ type: 'approve', stepId }); }

  reject(stepId, reason) {
    const frame = { type: 'reject', stepId };
    if (reason != null) frame.reason = reason;
    this._send(frame);
  }

  abort() {
    this.sessionActive = false;
    this._send({ type: 'abort' });
  }

  close() {
    this.sessionActive = false;
    if (this.ws) this.ws.close();
  }
}

module.exports = { DesktopConnector, VALID_STATES };
```
- [ ] **Run (expect PASS):** `npm test -- desktop-connector` — all tests pass.
- [ ] **Commit:** `git add src/connectors/desktop.js tests/unit/desktop-connector.test.js && git commit -m "feat(desktop): WebSocket connector with auth, frames, reconnect"`

---

### Task 3: In-process approval registry `src/engine/desktop-approvals.js`

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/src/engine/desktop-approvals.js`
- Test: `/Users/vineet/ikawn-openbrain/tests/unit/desktop-approvals.test.js`

A singleton Map keyed by `approvalId`. `register(approvalId, timeoutMs)` returns a Promise that resolves with `{decision:'approve'|'reject', reason?}` when `resolve()` is called, or `{decision:'timeout'}` after `timeoutMs` (default 5 min). Never auto-approves.

- [ ] **Write failing test** `tests/unit/desktop-approvals.test.js`:
```js
describe('desktop-approvals registry', () => {
  let reg;
  beforeEach(() => { vi.resetModules(); reg = require('../../src/engine/desktop-approvals'); reg._reset(); });

  it('resolves with approve when resolve() is called', async () => {
    const p = reg.register('a1', 1000);
    expect(reg.has('a1')).toBe(true);
    const ok = reg.resolve('a1', 'approve');
    expect(ok).toBe(true);
    await expect(p).resolves.toEqual({ decision: 'approve', reason: undefined });
    expect(reg.has('a1')).toBe(false);
  });

  it('resolves with reject + reason', async () => {
    const p = reg.register('a2', 1000);
    reg.resolve('a2', 'reject', 'wrong contact');
    await expect(p).resolves.toEqual({ decision: 'reject', reason: 'wrong contact' });
  });

  it('resolves with timeout (pause) and never approves', async () => {
    vi.useFakeTimers();
    const p = reg.register('a3', 5000);
    vi.advanceTimersByTime(5000);
    await expect(p).resolves.toEqual({ decision: 'timeout', reason: undefined });
    expect(reg.has('a3')).toBe(false);
    vi.useRealTimers();
  });

  it('resolve() on unknown id returns false', () => {
    expect(reg.resolve('nope', 'approve')).toBe(false);
  });
});
```
- [ ] **Run (expect FAIL):** `npm test -- desktop-approvals` — module missing.
- [ ] **Create** `src/engine/desktop-approvals.js`:
```js
// src/engine/desktop-approvals.js
'use strict';

// In-process registry of pending desktop approvals.
// Single-user Lucy: one tiny Map keyed by approvalId. The delegate_to_desktop tool
// awaits register(); the POST /api/chat/desktop-approval route calls resolve().
// On timeout we resolve with { decision: 'timeout' } — the loop PAUSES, never auto-sends.

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const pending = new Map(); // approvalId -> { resolve, timer }

function register(approvalId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.has(approvalId)) {
        pending.delete(approvalId);
        resolve({ decision: 'timeout', reason: undefined });
      }
    }, timeoutMs);
    // Do not keep the event loop alive solely for this timer.
    if (timer.unref) timer.unref();
    pending.set(approvalId, { resolve, timer });
  });
}

function resolve(approvalId, decision, reason) {
  const entry = pending.get(approvalId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(approvalId);
  entry.resolve({ decision, reason });
  return true;
}

function has(approvalId) {
  return pending.has(approvalId);
}

// Test-only: clear all pending (does NOT resolve them).
function _reset() {
  for (const { timer } of pending.values()) clearTimeout(timer);
  pending.clear();
}

module.exports = { register, resolve, has, _reset, DEFAULT_TIMEOUT_MS };
```
- [ ] **Run (expect PASS):** `npm test -- desktop-approvals` — 4 tests pass.
- [ ] **Commit:** `git add src/engine/desktop-approvals.js tests/unit/desktop-approvals.test.js && git commit -m "feat(desktop): in-process approval registry with 5-min pause timeout"`

---

### Task 4: The `delegate_to_desktop` tool

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/src/tools/delegate_to_desktop.tool.js`
- Test: `/Users/vineet/ikawn-openbrain/tests/unit/delegate-to-desktop-tool.test.js`

The tool: matches the standard shape, `costTier: 'critical'`, params `{ goal (required), max_steps?, cost_cap_usd? }`. `execute(config, context)` opens the connector, sends `start`, relays `step`/`screenshot`/`status` events to chat via `context.onToolEvent`, and on `awaiting_approval` registers an approval, emits an `awaiting_approval` chat event, and BLOCKS on the registry promise. On `approve` → `connector.approve(stepId)`; on `reject` → `connector.reject(...)`; on `timeout` → emits a paused event and aborts the loop with `success:false`. Returns `{ success, data, summary, artifacts }` on `result`. The connector class is injectable (`mod._Connector`) for tests.

- [ ] **Write failing test** `tests/unit/delegate-to-desktop-tool.test.js`:
```js
import { EventEmitter } from 'node:events';

describe('delegate_to_desktop tool', () => {
  let tool, approvals;
  const ENV = { DESKTOP_WS_URL: 'ws://desk:8080', DESKTOP_WS_SECRET: 'sek' };

  // A fake connector we drive from the test.
  class FakeConnector extends EventEmitter {
    constructor() { super(); this.calls = []; }
    async connect() { this.calls.push(['connect']); }
    start(opts) { this.calls.push(['start', opts]); }
    approve(id) { this.calls.push(['approve', id]); }
    reject(id, r) { this.calls.push(['reject', id, r]); }
    abort() { this.calls.push(['abort']); }
    close() { this.calls.push(['close']); }
  }

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, ENV);
    approvals = require('../../src/engine/desktop-approvals'); approvals._reset();
    tool = require('../../src/tools/delegate_to_desktop.tool.js');
  });
  afterEach(() => { delete process.env.DESKTOP_WS_URL; delete process.env.DESKTOP_WS_SECRET; });

  it('has the standard tool shape, critical tier, ikawn brand gate marker', () => {
    expect(tool.name).toBe('delegate_to_desktop');
    expect(typeof tool.description).toBe('string');
    expect(tool.costTier).toBe('critical');
    expect(tool.parameters.goal.required).toBe(true);
    expect(tool.parameters.max_steps.required).toBe(false);
    expect(tool.parameters.cost_cap_usd.required).toBe(false);
    expect(typeof tool.execute).toBe('function');
  });

  it('returns graceful failure when DESKTOP_WS_SECRET missing', async () => {
    delete process.env.DESKTOP_WS_SECRET;
    vi.resetModules();
    tool = require('../../src/tools/delegate_to_desktop.tool.js');
    const res = await tool.execute({ goal: 'x' }, { brandId: 'ikawn' });
    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/not configured/i);
  });

  it('rejects missing goal', async () => {
    const res = await tool.execute({}, { brandId: 'ikawn' });
    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/goal/);
  });

  it('streams step events and returns result on success', async () => {
    const fake = new FakeConnector();
    tool._Connector = function () { return fake; };
    const events = [];
    const onToolEvent = (e) => events.push(e);

    const p = tool.execute(
      { goal: 'send whatsapp', max_steps: 40, cost_cap_usd: 1.5 },
      { brandId: 'ikawn', conversationId: 'c1', onToolEvent }
    );
    // let connect() + start() flush
    await new Promise((r) => setImmediate(r));
    expect(fake.calls).toContainEqual(['start', { goal: 'send whatsapp', maxSteps: 40, costCapUsd: 1.5 }]);

    fake.emit('message', { type: 'step', stepId: 's1', thought: 'opening WhatsApp Web', action: 'navigate' });
    fake.emit('message', { type: 'screenshot', stepId: 's1', b64: 'iVBOR...' });
    fake.emit('message', { type: 'result', success: true, data: { sent: true }, summary: 'Message sent', artifacts: [] });

    const res = await p;
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ sent: true });
    expect(res.summary).toBe('Message sent');
    // step + screenshot relayed
    expect(events.find((e) => e.kind === 'step' && e.stepId === 's1')).toBeTruthy();
    expect(events.find((e) => e.kind === 'screenshot' && e.stepId === 's1')).toBeTruthy();
    expect(fake.calls).toContainEqual(['close']);
  });

  it('blocks on awaiting_approval and forwards approve over the socket', async () => {
    const fake = new FakeConnector();
    tool._Connector = function () { return fake; };
    const events = [];
    const p = tool.execute(
      { goal: 'send whatsapp' },
      { brandId: 'ikawn', conversationId: 'c1', onToolEvent: (e) => events.push(e) }
    );
    await new Promise((r) => setImmediate(r));

    fake.emit('message', { type: 'awaiting_approval', stepId: 's5', intent: "Send 'hi' to V", b64: 'shot' });
    // approval event surfaced to chat with an approvalId
    const ask = events.find((e) => e.kind === 'awaiting_approval');
    expect(ask).toBeTruthy();
    expect(ask.intent).toBe("Send 'hi' to V");
    expect(ask.approvalId).toBeTruthy();

    // user approves via the registry
    approvals.resolve(ask.approvalId, 'approve');
    await new Promise((r) => setImmediate(r));
    expect(fake.calls).toContainEqual(['approve', 's5']);

    fake.emit('message', { type: 'result', success: true, data: {}, summary: 'done' });
    const res = await p;
    expect(res.success).toBe(true);
  });

  it('reject forwards reject frame and reason', async () => {
    const fake = new FakeConnector();
    tool._Connector = function () { return fake; };
    const events = [];
    const p = tool.execute({ goal: 'g' }, { brandId: 'ikawn', conversationId: 'c1', onToolEvent: (e) => events.push(e) });
    await new Promise((r) => setImmediate(r));
    fake.emit('message', { type: 'awaiting_approval', stepId: 's6', intent: 'Send', b64: 'shot' });
    const ask = events.find((e) => e.kind === 'awaiting_approval');
    approvals.resolve(ask.approvalId, 'reject', 'wrong number');
    await new Promise((r) => setImmediate(r));
    expect(fake.calls).toContainEqual(['reject', 's6', 'wrong number']);
    fake.emit('message', { type: 'result', success: false, data: {}, summary: 'aborted by user' });
    const res = await p;
    expect(res.success).toBe(false);
  });

  it('approval timeout pauses and aborts without approving', async () => {
    vi.useFakeTimers();
    const fake = new FakeConnector();
    tool._Connector = function () { return fake; };
    const events = [];
    const p = tool.execute({ goal: 'g' }, { brandId: 'ikawn', conversationId: 'c1', onToolEvent: (e) => events.push(e) });
    await Promise.resolve(); await Promise.resolve();
    fake.emit('message', { type: 'awaiting_approval', stepId: 's7', intent: 'Send', b64: 'shot' });
    await Promise.resolve();
    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.runAllTicks?.();
    const res = await p;
    expect(res.success).toBe(false);
    expect(res.summary).toMatch(/paused|timed out|no response/i);
    expect(fake.calls).toContainEqual(['abort']);
    expect(fake.calls).not.toContainEqual(['approve', 's7']);
    vi.useRealTimers();
  });
});
```
- [ ] **Run (expect FAIL):** `npm test -- delegate-to-desktop-tool` — tool module missing.
- [ ] **Create** `src/tools/delegate_to_desktop.tool.js`:
```js
// src/tools/delegate_to_desktop.tool.js
'use strict';

const crypto = require('node:crypto');
const desktopConfig = require('../config/desktop');
const approvals = require('../engine/desktop-approvals');
const { DesktopConnector } = require('../connectors/desktop');

const APPROVAL_TIMEOUT_MS = approvals.DEFAULT_TIMEOUT_MS; // 5 minutes

const mod = module.exports = {
  name: 'delegate_to_desktop',
  description:
    "Delegate a hands-on computer task to Lucy's Desktop (a controllable Linux desktop with Chromium and logged-in sessions). " +
    'Use ONLY for work that has no API and must be done by operating real software, e.g. WhatsApp Web. ' +
    'The desktop streams a live view and an activity timeline into chat. Outward/irreversible actions (Send, Pay, Post, Delete) ' +
    'pause for your explicit Approve/Reject. Returns a structured result when the goal completes. Internal (ikawn) only.',
  // Critical tier => registry blocks all non-ikawn/non-paying brands; IKAWN_ONLY_TOOLS narrows to ikawn only.
  costTier: 'critical',
  tier: 'agent',
  parameters: {
    goal: { type: 'string', required: true, description: 'Plain-English goal for the desktop agent, e.g. "Send \'See you at 5\' to V on WhatsApp".' },
    max_steps: { type: 'number', required: false, description: 'Max screenshot->act steps before the loop aborts (default 40).' },
    cost_cap_usd: { type: 'number', required: false, description: 'Per-session model spend cap in USD (default 1.5).' },
  },

  // Injectable for tests.
  _Connector: function (opts) { return new DesktopConnector(opts); },

  async execute(config, context = {}) {
    const onToolEvent = typeof context.onToolEvent === 'function' ? context.onToolEvent : () => {};
    const conversationId = context.conversationId || context.sessionId || null;

    if (!config || !config.goal || typeof config.goal !== 'string' || !config.goal.trim()) {
      return { success: false, data: null, summary: 'delegate_to_desktop: goal is required' };
    }
    if (!desktopConfig.isConfigured()) {
      return { success: false, data: null, summary: "Lucy's Desktop is not configured (DESKTOP_WS_SECRET missing). Cannot delegate." };
    }

    const connector = mod._Connector({
      wsUrl: desktopConfig.getWsUrl(),
      secret: desktopConfig.getWsSecret(),
    });

    // Resolve the whole tool call when the session terminates (result/error/timeout).
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    let finished = false;
    const settle = (value) => { if (!finished) { finished = true; finish(value); } };

    connector.on('message', async (msg) => {
      try {
        switch (msg.type) {
          case 'status':
            onToolEvent({ kind: 'status', state: msg.state, conversationId });
            break;

          case 'step':
            onToolEvent({ kind: 'step', stepId: msg.stepId, thought: msg.thought, action: msg.action, conversationId });
            break;

          case 'screenshot':
            onToolEvent({ kind: 'screenshot', stepId: msg.stepId, b64: msg.b64, conversationId });
            break;

          case 'awaiting_approval': {
            const approvalId = crypto.randomUUID();
            onToolEvent({
              kind: 'awaiting_approval',
              approvalId,
              stepId: msg.stepId,
              intent: msg.intent,
              b64: msg.b64,
              conversationId,
            });
            const { decision, reason } = await approvals.register(approvalId, APPROVAL_TIMEOUT_MS);
            if (decision === 'approve') {
              onToolEvent({ kind: 'approval_resolved', approvalId, stepId: msg.stepId, decision: 'approve', conversationId });
              connector.approve(msg.stepId);
            } else if (decision === 'reject') {
              onToolEvent({ kind: 'approval_resolved', approvalId, stepId: msg.stepId, decision: 'reject', conversationId });
              connector.reject(msg.stepId, reason);
            } else {
              // timeout => pause, never auto-approve. Abort the session.
              onToolEvent({ kind: 'paused', approvalId, stepId: msg.stepId, conversationId });
              connector.abort();
              settle({
                success: false,
                data: { state: 'paused', stepId: msg.stepId },
                summary: 'Desktop task paused: no Approve/Reject within 5 minutes. The desktop did NOT send anything. Ask the user to retry.',
                artifacts: [],
              });
            }
            break;
          }

          case 'result':
            settle({
              success: !!msg.success,
              data: msg.data ?? null,
              summary: msg.summary || (msg.success ? 'Desktop task completed.' : 'Desktop task did not complete.'),
              artifacts: Array.isArray(msg.artifacts) ? msg.artifacts : [],
            });
            break;

          case 'error':
            onToolEvent({ kind: 'error', message: msg.message, conversationId });
            settle({ success: false, data: null, summary: `Desktop error: ${msg.message || 'unknown error'}`, artifacts: [] });
            break;

          default:
            // Unknown frame — ignore but surface for debugging.
            onToolEvent({ kind: 'unknown', raw: msg, conversationId });
        }
      } catch (err) {
        settle({ success: false, data: null, summary: `Desktop handler error: ${err.message}`, artifacts: [] });
      }
    });

    connector.on('error', (err) => {
      settle({ success: false, data: null, summary: `Desktop connection error: ${err.message}`, artifacts: [] });
    });

    connector.on('close', ({ willReconnect }) => {
      if (!willReconnect) {
        settle({ success: false, data: null, summary: 'Desktop connection closed before the task completed.', artifacts: [] });
      }
    });

    try {
      await connector.connect();
      connector.start({
        goal: config.goal.trim(),
        maxSteps: typeof config.max_steps === 'number' ? config.max_steps : 40,
        costCapUsd: typeof config.cost_cap_usd === 'number' ? config.cost_cap_usd : 1.5,
      });
    } catch (err) {
      settle({ success: false, data: null, summary: `Could not reach Lucy's Desktop: ${err.message}`, artifacts: [] });
    }

    const result = await done;
    try { connector.close(); } catch { /* already closed */ }
    return result;
  },
};
```
- [ ] **Run (expect PASS):** `npm test -- delegate-to-desktop-tool` — all tests pass.
- [ ] **Commit:** `git add src/tools/delegate_to_desktop.tool.js tests/unit/delegate-to-desktop-tool.test.js && git commit -m "feat(desktop): delegate_to_desktop tool with approval-gated session relay"`

---

### Task 5: Brand-gate the tool to ikawn-only in the registry

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/src/tools/registry.js`
- Test: `/Users/vineet/ikawn-openbrain/tests/unit/desktop-tool-permission.test.js`

The registry currently lets paying brands through before `IKAWN_ONLY_TOOLS` is checked. We add `delegate_to_desktop` to `IKAWN_ONLY_TOOLS` and move the `IKAWN_ONLY_TOOLS` enforcement ahead of the broad paying-brand allow, so it is truly ikawn-only.

- [ ] **Write failing test** `tests/unit/desktop-tool-permission.test.js`:
```js
describe('delegate_to_desktop brand gating', () => {
  let registry;
  beforeEach(() => { vi.resetModules(); registry = require('../../src/tools/registry'); });

  it('is in IKAWN_ONLY and tier critical via DEFAULT_COST_TIERS', () => {
    expect(registry.getToolCostTier('delegate_to_desktop')).toBe('critical');
  });

  it('allows ikawn brand', () => {
    const r = registry.checkToolPermission('delegate_to_desktop', { brandId: 'ikawn' });
    expect(r.allowed).toBe(true);
  });

  it('blocks paying brands (fedfina, shubhkart)', () => {
    expect(registry.checkToolPermission('delegate_to_desktop', { brandId: 'fedfina' }).allowed).toBe(false);
    expect(registry.checkToolPermission('delegate_to_desktop', { brandId: 'shubhkart' }).allowed).toBe(false);
  });

  it('blocks unknown external brands', () => {
    expect(registry.checkToolPermission('delegate_to_desktop', { brandId: 'acme' }).allowed).toBe(false);
  });
});
```
- [ ] **Run (expect FAIL):** `npm test -- desktop-tool-permission` — fails: paying brands currently allowed and tier defaults to `medium`.
- [ ] **Edit** `src/tools/registry.js`:
  1. Add to `IKAWN_ONLY_TOOLS`: `const IKAWN_ONLY_TOOLS = ['delegate_to_desktop'];`
  2. Add to `DEFAULT_COST_TIERS`: `delegate_to_desktop: 'critical',`
  3. Rewrite `checkToolPermission` so IKAWN_ONLY is enforced before the paying-brand allow:
```js
function checkToolPermission(toolName, context = {}) {
  const { brandId, isInternal } = context;
  const tier = getToolCostTier(toolName);

  // ikawn-only tools: ONLY the ikawn brand (or explicit internal) may use them.
  if (IKAWN_ONLY_TOOLS.includes(toolName)) {
    if (brandId === 'ikawn' || isInternal) return { allowed: true, tier };
    return { allowed: false, tier, reason: `Tool '${toolName}' is internal (ikawn) only.` };
  }

  // Internal (ikawn brand) and paying brands have full access to the rest.
  if (brandId === 'ikawn' || PAYING_BRANDS.includes(brandId) || isInternal) {
    return { allowed: true, tier };
  }

  // External brands: block critical and high tools.
  if (tier === 'critical') {
    return { allowed: false, tier, reason: `Tool '${toolName}' requires manual approval for external brands` };
  }
  if (tier === 'high') {
    return { allowed: false, tier, reason: `Tool '${toolName}' is restricted for external brands. Contact admin to enable.` };
  }
  if (PAYING_BRAND_TOOLS.includes(toolName) && !PAYING_BRANDS.includes(brandId)) {
    return { allowed: false, tier, reason: `Tool '${toolName}' is restricted to paying brands.` };
  }

  return { allowed: true, tier };
}
```
- [ ] **Run (expect PASS):** `npm test -- desktop-tool-permission` and `npm test -- tool-permissions` (existing suite must stay green).
- [ ] **Commit:** `git add src/tools/registry.js tests/unit/desktop-tool-permission.test.js && git commit -m "feat(desktop): brand-gate delegate_to_desktop to ikawn only"`

---

### Task 6: Chat-stream wiring — relay desktop events to SSE + approval POST route

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/src/routes/chat-api.js`
- Modify: `/Users/vineet/ikawn-openbrain/src/index.js` (mount the approval route; verify it lands BEFORE `chatApi` per Non-Negotiable Rule 3)
- Test: `/Users/vineet/ikawn-openbrain/tests/integration/desktop-approval-route.test.js`

Two changes:
1. In `chat-api.js` `executeToolFn`, pass `onToolEvent` in the tool context. It writes a single SSE frame `{ type: 'desktop_event', ... }` (guarded by `!clientDisconnected && !res.writableEnded`).
2. A new tiny route `POST /api/chat/desktop-approval` body `{ approvalId, decision, reason? }` → `approvals.resolve(...)` → `{ ok: true }` or 404 if unknown.

- [ ] **Write failing integration test** `tests/integration/desktop-approval-route.test.js`:
```js
const request = require('supertest');
const { makeApp } = require('../helpers/test-app'); // existing helper that mounts routes with a mock session

describe('POST /api/chat/desktop-approval', () => {
  let app, approvals;
  beforeEach(() => {
    vi.resetModules();
    approvals = require('../../src/engine/desktop-approvals'); approvals._reset();
    const route = require('../../src/routes/desktop-approval');
    app = makeApp((a) => a.use(route));
  });

  it('resolves a pending approval and returns ok', async () => {
    const p = approvals.register('ap-1', 60000);
    const res = await request(app)
      .post('/api/chat/desktop-approval')
      .send({ approvalId: 'ap-1', decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    await expect(p).resolves.toEqual({ decision: 'approve', reason: undefined });
  });

  it('returns 404 for an unknown approvalId', async () => {
    const res = await request(app)
      .post('/api/chat/desktop-approval')
      .send({ approvalId: 'nope', decision: 'approve' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid decision with 400', async () => {
    approvals.register('ap-2', 60000);
    const res = await request(app)
      .post('/api/chat/desktop-approval')
      .send({ approvalId: 'ap-2', decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});
```
> Note: `tests/helpers/test-app.js` already exists (used by `tests/integration/upload.test.js`). If its signature differs from `makeApp((a) => a.use(route))`, adapt the helper-call line to the real export — read the helper first and match it; the route logic under test does not change.
- [ ] **Run (expect FAIL):** `npm test -- desktop-approval-route` — route module missing.
- [ ] **Create** `src/routes/desktop-approval.js`:
```js
// src/routes/desktop-approval.js
'use strict';

const express = require('express');
const approvals = require('../engine/desktop-approvals');

const router = express.Router();

// POST /api/chat/desktop-approval  { approvalId, decision: 'approve'|'reject', reason? }
router.post('/api/chat/desktop-approval', express.json(), (req, res) => {
  const { approvalId, decision, reason } = req.body || {};
  if (!approvalId || typeof approvalId !== 'string') {
    return res.status(400).json({ ok: false, error: 'approvalId required' });
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ ok: false, error: "decision must be 'approve' or 'reject'" });
  }
  const ok = approvals.resolve(approvalId, decision, typeof reason === 'string' ? reason : undefined);
  if (!ok) return res.status(404).json({ ok: false, error: 'No pending approval with that id' });
  return res.json({ ok: true });
});

module.exports = router;
```
- [ ] **Edit** `src/index.js` — require and mount the route alongside the other auth-gated routes (it must be mounted BEFORE `chatApi`; per the codebase rule the chat/memory routes precede `chatApi`). Add near the other `require('./routes/...')` lines:
```js
const desktopApprovalRoute = require('./routes/desktop-approval');
```
and mount it with the auth-or-api-key block (immediately after `app.use(notifyRoute);`):
```js
app.use(requireAuthOrApiKey, desktopApprovalRoute);
```
- [ ] **Edit** `src/routes/chat-api.js` — inside `executeToolFn`, extend the context passed to `registryTool.execute` so desktop events reach SSE. Replace the existing context object on the `registryTool.execute(...)` call (around line 864-866) with one that adds `onToolEvent`:
```js
          registryTool.execute(
            toolInput || {},
            {
              brandId: req.brand_id,
              userId: req.session?.user?.id,
              conversationId: convInternalId,
              pool,
              onToolEvent: (evt) => {
                if (clientDisconnected || res.writableEnded) return;
                res.write(`data: ${JSON.stringify({ type: 'desktop_event', ...evt })}\n\n`);
              },
            }
          ),
```
- [ ] **Run (expect PASS):** `npm test -- desktop-approval-route` then full `npm test` to confirm no regression in chat/streaming suites.
- [ ] **Commit:** `git add src/routes/desktop-approval.js src/index.js src/routes/chat-api.js tests/integration/desktop-approval-route.test.js && git commit -m "feat(desktop): SSE relay of desktop_event + approval POST route"`

---

### Task 7: Frontend — chat store state for the desktop session

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/src/frontend/src/stores/chat.ts`

Add a `desktopSession` slice: live state, the activity timeline (steps + thoughts), a pending approval, and a `takeControl` flag. The `useStreamChat` hook (Task 8) writes into it; the panel (Task 9) reads it.

- [ ] **Edit** `src/frontend/src/stores/chat.ts` — add the types and the slice. Insert these interfaces after the `ActiveTask` interface:
```ts
export interface DesktopStep {
  stepId: string
  thought?: string
  action?: string
  /** Latest base64 screenshot for this step (timeline thumbnail). */
  b64?: string
  at: number
}

export interface DesktopApproval {
  approvalId: string
  stepId: string
  intent: string
  b64?: string
}

export interface DesktopSession {
  active: boolean
  state: 'idle' | 'running' | 'awaiting_approval' | 'paused' | 'done' | 'error'
  steps: DesktopStep[]
  approval: DesktopApproval | null
  takeControl: boolean
  error?: string
}
```
  Add to the `ChatState` interface:
```ts
  desktop: DesktopSession
  startDesktopSession: () => void
  pushDesktopStep: (step: { stepId: string; thought?: string; action?: string; b64?: string }) => void
  setDesktopState: (state: DesktopSession['state']) => void
  setDesktopApproval: (a: DesktopApproval | null) => void
  setTakeControl: (on: boolean) => void
  endDesktopSession: (opts?: { error?: string; state?: DesktopSession['state'] }) => void
```
  Add to the `create<ChatState>` initial object and actions:
```ts
  desktop: { active: false, state: 'idle', steps: [], approval: null, takeControl: false },
  startDesktopSession: () =>
    set({ desktop: { active: true, state: 'running', steps: [], approval: null, takeControl: false } }),
  pushDesktopStep: (step) =>
    set((state) => {
      const steps = [...state.desktop.steps]
      const idx = steps.findIndex((s) => s.stepId === step.stepId)
      if (idx >= 0) {
        steps[idx] = { ...steps[idx], ...step }
      } else {
        steps.push({ ...step, at: Date.now() })
      }
      return { desktop: { ...state.desktop, active: true, steps } }
    }),
  setDesktopState: (s) => set((state) => ({ desktop: { ...state.desktop, state: s } })),
  setDesktopApproval: (a) =>
    set((state) => ({ desktop: { ...state.desktop, approval: a, state: a ? 'awaiting_approval' : state.desktop.state } })),
  setTakeControl: (on) => set((state) => ({ desktop: { ...state.desktop, takeControl: on } })),
  endDesktopSession: (opts) =>
    set((state) => ({
      desktop: { ...state.desktop, active: false, approval: null, state: opts?.state ?? 'done', error: opts?.error },
    })),
```
- [ ] **Manual verification:** Run `cd src/frontend && npm run type-check`. Expected: no TypeScript errors. (Store-only change; runtime exercised in Task 9/10.)
- [ ] **Commit:** `git add src/frontend/src/stores/chat.ts && git commit -m "feat(desktop): chat store slice for live desktop session"`

---

### Task 8: Frontend — consume `desktop_event` SSE frames in useStreamChat

**Files:**
- Modify: `/Users/vineet/ikawn-openbrain/src/frontend/src/hooks/useStreamChat.ts`

Handle `parsed.type === 'desktop_event'` by routing each `kind` into the store. This sits alongside the existing `task_started` / `artifact_ready` branches.

- [ ] **Edit** `useStreamChat.ts` — extend the `StreamEventDelta` interface with the desktop fields:
```ts
  kind?: string
  state?: string
  stepId?: string
  thought?: string
  action?: string
  b64?: string
  approvalId?: string
  intent?: string
```
  Add a new branch inside the SSE parse loop, before the `parsed.type === 'error'` branch:
```ts
              } else if (parsed.type === 'desktop_event') {
                const {
                  startDesktopSession, pushDesktopStep, setDesktopState,
                  setDesktopApproval, endDesktopSession,
                } = useChatStore.getState()
                const { desktop } = useChatStore.getState()
                if (!desktop.active) startDesktopSession()
                switch (parsed.kind) {
                  case 'status':
                    if (parsed.state) setDesktopState(parsed.state as never)
                    break
                  case 'step':
                    if (parsed.stepId)
                      pushDesktopStep({ stepId: parsed.stepId, thought: parsed.thought, action: parsed.action })
                    break
                  case 'screenshot':
                    if (parsed.stepId) pushDesktopStep({ stepId: parsed.stepId, b64: parsed.b64 })
                    break
                  case 'awaiting_approval':
                    if (parsed.approvalId && parsed.stepId)
                      setDesktopApproval({
                        approvalId: parsed.approvalId,
                        stepId: parsed.stepId,
                        intent: parsed.intent ?? 'Confirm this action?',
                        b64: parsed.b64,
                      })
                    break
                  case 'approval_resolved':
                    setDesktopApproval(null)
                    break
                  case 'paused':
                    setDesktopApproval(null)
                    endDesktopSession({ state: 'paused' })
                    break
                  case 'error':
                    endDesktopSession({ state: 'error', error: parsed.message })
                    break
                }
              }
```
- [ ] **Manual verification:** `cd src/frontend && npm run type-check`. Expected: no TS errors. (Behavioural verification happens in Task 10 UAT.)
- [ ] **Commit:** `git add src/frontend/src/hooks/useStreamChat.ts && git commit -m "feat(desktop): route desktop_event SSE into chat store"`

---

### Task 9: Frontend — "Lucy's Computer" panel (noVNC iframe + timeline + approve/reject + take-control)

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/src/frontend/src/components/chat/DesktopPanel.tsx`
- Modify: `/Users/vineet/ikawn-openbrain/src/frontend/src/components/chat/ChatView.tsx`

The panel: renders only when `desktop.active`. It (a) embeds noVNC via iframe using a URL fetched from `GET /api/chat/desktop-novnc-url?view_only=1|0` (the token must NOT ship to the bundle, so the embed URL is built server-side from `DESKTOP_NOVNC_TOKEN`); (b) renders the timeline from `desktop.steps`; (c) shows Approve/Reject when `desktop.approval` is set, POSTing to `/api/chat/desktop-approval`; (d) a take-control toggle that re-fetches the URL with `view_only=0` and reloads the iframe.

- [ ] **Add the noVNC URL endpoint** to `src/routes/desktop-approval.js` (same router so it mounts together):
```js
const desktopConfig = require('../config/desktop');

// GET /api/chat/desktop-novnc-url?view_only=1|0 -> { url }
router.get('/api/chat/desktop-novnc-url', (req, res) => {
  if (!desktopConfig.isConfigured()) {
    return res.status(503).json({ ok: false, error: "Lucy's Desktop not configured" });
  }
  const viewOnly = req.query.view_only !== '0';
  return res.json({ ok: true, url: desktopConfig.buildNoVncEmbedUrl(viewOnly) });
});
```
- [ ] **Create** `src/frontend/src/components/chat/DesktopPanel.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react'
import { Check, X, Monitor, Hand, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat'

async function fetchNoVncUrl(viewOnly: boolean): Promise<string | null> {
  try {
    const res = await fetch(`/api/chat/desktop-novnc-url?view_only=${viewOnly ? '1' : '0'}`, {
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string }
    return data.url ?? null
  } catch {
    return null
  }
}

export function DesktopPanel() {
  const desktop = useChatStore((s) => s.desktop)
  const setTakeControl = useChatStore((s) => s.setTakeControl)
  const setDesktopApproval = useChatStore((s) => s.setDesktopApproval)
  const [vncUrl, setVncUrl] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState(0)

  // (Re)load the embed URL whenever take-control flips.
  useEffect(() => {
    if (!desktop.active) return
    let alive = true
    fetchNoVncUrl(!desktop.takeControl).then((url) => {
      if (alive) {
        setVncUrl(url)
        setIframeKey((k) => k + 1) // force iframe reload
      }
    })
    return () => {
      alive = false
    }
  }, [desktop.active, desktop.takeControl])

  const respond = useCallback(
    async (decision: 'approve' | 'reject') => {
      const approval = desktop.approval
      if (!approval) return
      await fetch('/api/chat/desktop-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approvalId: approval.approvalId, decision }),
      })
      setDesktopApproval(null)
    },
    [desktop.approval, setDesktopApproval],
  )

  if (!desktop.active && desktop.state !== 'paused' && desktop.state !== 'error') return null

  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: '1px solid #2A2A2A',
        background: '#0E0E10',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 60,
          padding: '0 16px',
          borderBottom: '1px solid #2A2A2A',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#F5F5F5',
        }}
      >
        <Monitor size={16} color="#FFC01C" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Lucy&apos;s Computer</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6B6B6B' }}>{desktop.state}</span>
        <Button
          size="sm"
          variant={desktop.takeControl ? 'default' : 'secondary'}
          onClick={() => setTakeControl(!desktop.takeControl)}
          title={desktop.takeControl ? 'Hand control back to Lucy' : 'Take control'}
        >
          {desktop.takeControl ? <Hand size={14} /> : <Eye size={14} />}
          <span style={{ marginLeft: 6 }}>{desktop.takeControl ? 'Controlling' : 'View only'}</span>
        </Button>
      </div>

      {/* Live noVNC */}
      <div style={{ aspectRatio: '4 / 3', background: '#000', position: 'relative' }}>
        {vncUrl ? (
          <iframe
            key={iframeKey}
            src={vncUrl}
            title="Lucy's Computer live view"
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#6B6B6B', fontSize: 12 }}>
            Connecting to desktop…
          </div>
        )}
      </div>

      {/* Approval gate */}
      {desktop.approval && (
        <div style={{ padding: 14, borderTop: '1px solid #2A2A2A', background: '#15110A' }}>
          <div style={{ fontSize: 12, color: '#FFC01C', fontWeight: 600, marginBottom: 6 }}>
            Approval needed
          </div>
          <div style={{ fontSize: 13, color: '#F5F5F5', marginBottom: 10 }}>{desktop.approval.intent}</div>
          {desktop.approval.b64 && (
            <img
              src={`data:image/jpeg;base64,${desktop.approval.b64}`}
              alt="Action preview"
              style={{ width: '100%', borderRadius: 8, marginBottom: 10, border: '1px solid #2A2A2A' }}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => respond('approve')} style={{ flex: 1 }}>
              <Check size={14} /> <span style={{ marginLeft: 6 }}>Approve</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => respond('reject')} style={{ flex: 1 }}>
              <X size={14} /> <span style={{ marginLeft: 6 }}>Reject</span>
            </Button>
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {desktop.steps.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6B6B6B' }}>Waiting for the desktop to act…</div>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {desktop.steps.map((step) => (
              <li key={step.stepId} style={{ display: 'flex', gap: 10 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: '#FFC01C',
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  {step.thought && (
                    <div style={{ fontSize: 12.5, color: '#E5E5E5', lineHeight: 1.5 }}>{step.thought}</div>
                  )}
                  {step.action && (
                    <div style={{ fontSize: 11, color: '#8A8A8A', marginTop: 2 }}>{step.action}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {desktop.state === 'paused' && (
          <div style={{ fontSize: 12, color: '#FFB020', marginTop: 12 }}>
            Paused — no response within 5 minutes. Nothing was sent.
          </div>
        )}
        {desktop.state === 'error' && desktop.error && (
          <div style={{ fontSize: 12, color: '#FF6B6B', marginTop: 12 }}>Error: {desktop.error}</div>
        )}
      </div>
    </div>
  )
}
```
- [ ] **Edit** `ChatView.tsx` — render the panel beside the conversation. Add the import:
```tsx
import { DesktopPanel } from '@/components/chat/DesktopPanel'
```
  Then wrap the existing main column and the panel in the outer flex container. Change the closing of the main column so the panel is a sibling: place `<DesktopPanel />` immediately after the closing `</div>` of the `flex min-w-0 flex-1 flex-col` main column, still inside the top-level `<div className="flex h-full w-full" ...>`:
```tsx
      {/* Main message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ...existing header, ScrollArea, ChatInput unchanged... */}
      </div>

      <DesktopPanel />
    </div>
  )
}
```
- [ ] **Manual verification:** `cd src/frontend && npm run type-check` (no errors), then `npm run build` (build succeeds). With the dev server running and `desktop.active` forced true via React devtools (or after a real delegate call in Task 10), expect: a 380px right-hand panel titled "Lucy's Computer", an iframe area, a "View only" toggle button, and an empty timeline placeholder.
- [ ] **Commit:** `git add src/frontend/src/components/chat/DesktopPanel.tsx src/frontend/src/components/chat/ChatView.tsx src/routes/desktop-approval.js && git commit -m "feat(desktop): Lucy's Computer panel — noVNC iframe, timeline, approve/reject, take-control"`

---

### Task 10: Golden-task manual UAT — Lucy sends a WhatsApp to V's number

**Files:**
- Create: `/Users/vineet/ikawn-openbrain/docs/superpowers/uat/desktop-whatsapp-golden-task.md`

This is a manual UAT (the full loop spans two Fly apps + a real model + a phone). It exercises first-time QR login via the noVNC panel, the live timeline, the approval gate on Send, and take-control.

- [ ] **Create** `docs/superpowers/uat/desktop-whatsapp-golden-task.md` with this content:
```md
# Golden-task UAT — Lucy sends a WhatsApp via the Desktop Agent

## Preconditions
- `lucy-desktop` Fly app deployed and reachable on 6PN (`ws://lucy-desktop.internal:8080`).
- OpenBrain (Lucy) deployed with Fly secrets set: `DESKTOP_WS_SECRET`, `DESKTOP_NOVNC_TOKEN`
  (and `DESKTOP_WS_URL` / `DESKTOP_NOVNC_URL` if overriding defaults).
- Logged into Lucy (ruhi.ikawn.in) as V. Brand context is `ikawn`.
- A phone with WhatsApp ready to scan a QR.

## Steps & expected results

1. **Invoke.** In Lucy chat, send: "Use your computer to send 'UAT ping from Lucy' to me on
   WhatsApp" (V's own number).
   - PASS: chat begins streaming; the "Lucy's Computer" panel appears on the right with state `running`.

2. **First-time QR login.** WhatsApp Web shows a QR in the live noVNC view.
   - The timeline narrates opening WhatsApp Web and detecting the QR / login screen.
   - Click **Take control** (button flips to "Controlling"); the iframe reloads WITHOUT `&view_only=1`.
   - Scan the QR with the phone. WhatsApp Web logs in.
   - Click the toggle again to return to **View only**.
   - PASS: login succeeds; the session continues; you regained read-only after handing control back.

3. **Live timeline.** As UI-TARS navigates to the chat and types the message:
   - PASS: timeline shows ordered step thoughts/actions (e.g. "searching contact", "typing message")
     with the gold step dots; entries appear within a few seconds of each on-screen action.

4. **Approval gate on Send.** Before the message is actually sent:
   - PASS: an "Approval needed" card appears in the panel with the intent text
     (e.g. "About to send 'UAT ping from Lucy' to <V> on WhatsApp") and a screenshot.
   - The desktop does NOT send while waiting.

5. **Approve.** Click **Approve**.
   - PASS: the approval card disappears; the timeline continues; the message is sent; the phone
     receives "UAT ping from Lucy"; the chat ends with Lucy's success synthesis and the tool result
     `{ success: true }`.

6. **Reject path (separate run).** Repeat steps 1–4, then click **Reject**.
   - PASS: nothing is sent; the desktop replans or aborts; chat reports the task was not completed.

7. **Timeout path (separate run).** Repeat to the approval card, then wait 5 minutes without clicking.
   - PASS: the panel shows "Paused — no response within 5 minutes. Nothing was sent."; no message is
     delivered to the phone; the tool returns `success: false` with a "paused" summary.

## Overall pass criteria
- The message is delivered to V's WhatsApp ONLY after an explicit Approve.
- QR login completed via take-control in the embedded panel (no SSH/VNC client needed).
- The timeline reflected the agent's steps in near-real-time.
- Reject and timeout both result in NOTHING being sent.

## Kill criterion (per spec §2)
- If UI-TARS cannot reliably reach the Send-approval step across ~3 attempts even with take-control
  as backup, record it here and fall back to whatsapp-web.js for this specific task.
```
- [ ] **Verification (manual, full pre-deploy gate first):** Run `npm run pre-deploy` locally — lint + the full vitest suite (including the new desktop unit/integration tests) must pass before any deploy.
- [ ] **Deploy & execute:** Deploy Lucy (`cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only`), set the `DESKTOP_*` secrets, then walk the checklist above. Record PASS/FAIL per step in the doc.
- [ ] **Commit:** `git add docs/superpowers/uat/desktop-whatsapp-golden-task.md && git commit -m "docs(desktop): golden-task WhatsApp UAT checklist"`
