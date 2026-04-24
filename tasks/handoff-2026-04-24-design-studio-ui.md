# Design Studio UI Rewrite — Handoff

## Context

Design Studio (`/design`) was built in the previous session. The **backend is solid** (Tasks 1-6, 13 verified): DB schema, design-tools.js, design-prompts.js, design-api.js, design-page.js, reasoning loop integration. All 723 tests pass, deployed to Lucy.

**The frontend is broken.** Instead of porting the real Open-CoDesign (OCD) components, simplified rewrites were created from scratch. They're missing features, polish, and the battle-tested UX of OCD. V wants the actual OCD code ported, not a stripped-down version.

## What needs to happen

**Replace ALL frontend components** in `src/design-app/src/` with proper ports of the OCD renderer at `references/open-codesign/apps/desktop/src/renderer/src/`. 

This is ~15,000 lines of source across 60+ files. NOT all of it applies — skip Electron-only features. But the UI components, store, styles, and hooks should be ported faithfully.

## Source files (OCD) → Target files (Design Studio)

### OCD Source Root
```
references/open-codesign/apps/desktop/src/renderer/src/
```

### Design Studio Target Root
```
src/design-app/src/
```

### Files to port (keep the same structure)

**Core:**
- `store.ts` (2802 lines) → Port to `store.ts`. This is the big one. Keep ALL design/chat/generation/preview/snapshot logic. Replace `window.api.*` IPC calls with `api.*` fetch calls (api.ts already exists and has all the endpoints). Remove: config loading, update checking, connection testing, diagnostics, onboarding, i18n. Keep: designs CRUD, chat, generation streaming, preview state, snapshots, todos, viewport, interaction modes, toasts, design files.
- `index.css` (224 lines) → Port to `styles.css`. Use iKawn design tokens (gold #FFC01C, navy #0A0F2E) instead of OCD's tokens. Keep all the structural CSS.
- `App.tsx` (264 lines) → Port to `App.tsx`. Remove: UpdateBanner, Settings view, i18n, ReportEventDialog, DeleteDesignDialog (add back later if needed). Keep: split layout, resize logic, keyboard shortcuts, HubView vs workspace switching.

**Components (port each faithfully):**
- `components/Sidebar.tsx` → Full sidebar with chat panel
- `components/PreviewPane.tsx` → Iframe preview with all viewport logic
- `components/PreviewToolbar.tsx` → Viewport/zoom controls
- `components/PhoneFrame.tsx` → Mobile viewport chrome (the nice phone bezel)
- `components/TopBar.tsx` → Header bar
- `components/CanvasTabBar.tsx` → File tabs for multi-file designs
- `components/Toast.tsx` → Toast notifications
- `components/ErrorBoundary.tsx` → Error boundary
- `components/DesignsView.tsx` → Design gallery/switcher overlay
- `components/DesignSwitcher.tsx` → Quick design switcher
- `components/FilesPanel.tsx` → Files panel
- `components/FilesTabView.tsx` → Files tab view
- `components/ModelSwitcher.tsx` → Model selector (adapt to Lucy's model tiers)
- `components/DeleteDesignDialog.tsx` → Confirm delete
- `components/RenameDesignDialog.tsx` → Rename dialog

**Chat components (port each faithfully):**
- `components/chat/ChatMessageList.tsx` → Message list
- `components/chat/PromptInput.tsx` → Composer with submit, file attach placeholder
- `components/chat/AssistantText.tsx` → Assistant message bubble
- `components/chat/UserMessage.tsx` → User message bubble  
- `components/chat/WorkingCard.tsx` → Generation progress with todo checklist
- `components/chat/EmptyState.tsx` → Welcome/starter prompts (adapt starters to Lucy branding)

**Preview states:**
- `preview/EmptyState.tsx` → Empty preview placeholder
- `preview/ErrorState.tsx` → Preview error display
- `preview/LoadingState.tsx` → Preview loading state

**Hub view (port the gallery):**
- `views/HubView.tsx` → Hub with tabs
- `views/hub/DesignGrid.tsx` → Grid layout for designs
- `views/hub/DesignCardPreview.tsx` → Design thumbnail cards
- `views/hub/RecentTab.tsx` → Recent designs tab
- `views/hub/YourDesignsTab.tsx` → All designs tab
- `views/hub/ExamplesTab.tsx` → Example designs (adapt to Lucy starters)
- `views/hub/ExampleCard.tsx` → Example card

**Hooks:**
- `hooks/useKeyboard.ts` → Keyboard shortcuts
- `hooks/useDesignFiles.ts` → Design files hook
- `hooks/useAgentStream.ts` → Agent SSE stream (adapt to use api.ts streamGeneration)

**Lib:**
- `lib/relativeTime.ts` → Time formatting
- `lib/action-timeline.ts` → Action timeline (if used by components)

**UI package (port needed components):**
- `packages/ui/src/tokens.css` → Design tokens (merge with styles.css, use iKawn colors)
- `packages/ui/src/components/Button.tsx` → Button component
- `packages/ui/src/components/IconButton.tsx` → Icon button
- `packages/ui/src/components/Tooltip.tsx` → Tooltip
- `packages/ui/src/components/Card.tsx` → Card

**Runtime package:**
- `packages/runtime/src/index.ts` → Port to `lib/runtime.ts` (buildSrcdoc). Already done but check against OCD's version for completeness.

### Files to SKIP (Electron-only or not applicable)
- `components/Settings.tsx` and `components/settings/` — API key config (Lucy uses server-side auth)
- `components/ConnectionDiagnosticPanel.tsx` — Tests Electron IPC connection
- `components/UpdateBanner.tsx` — Electron auto-updater
- `components/ChatgptLoginCard.tsx` — ChatGPT-specific login
- `components/ThemeToggle.tsx` — Can add later, not critical
- `components/LanguageToggle.tsx` — i18n (Lucy is English-only)
- `components/TweakPanel.tsx` — Advanced tweak mode (Phase 2)
- `components/comment/` — Inline comments (Phase 2)
- `components/InlineCommentComposer.tsx` — Phase 2
- `components/diagnostics/` — Electron diagnostics
- `state/update-store.ts` — Electron updates
- `hooks/useUpdateWiring.ts` — Electron updates
- `hooks/polishPrompt.ts` — Can add later
- `lib/redact.ts` — Log redaction
- `lib/renderer-logger.ts` — Electron logger
- `components/AddCustomProviderModal.tsx` — BYOK provider config

## Key adaptation patterns

### 1. IPC → Fetch
Every `window.api.*` call becomes an `api.*` call from `src/design-app/src/api.ts`:
```
window.api.listDesigns() → api.listDesigns()
window.api.createDesign(name) → api.createDesign(name)
window.api.renameDesign(id, name) → api.renameDesign(id, name)
window.api.deleteDesign(id) → api.deleteDesign(id)
window.api.duplicateDesign(id) → api.duplicateDesign(id)
window.api.getSnapshots(id) → api.listSnapshots(id)
window.api.getChatHistory(id) → api.listChat(id)
```

### 2. Generation streaming
OCD uses `window.api.onAgentEvent(callback)` IPC. Lucy uses POST-based SSE via `api.streamGeneration()`. The store's `sendPrompt` already handles this in the current store.ts — preserve that SSE pattern when porting the OCD store.

### 3. i18n removal
OCD uses `useT()` for translations: `t('key')`. Replace all `t('...')` calls with the English string literal. Remove `@open-codesign/i18n` imports entirely.

### 4. Icon imports
OCD uses `lucide-react` icons. Keep using lucide-react — add it to design-app/package.json dependencies.

### 5. UI component imports
OCD imports from `@open-codesign/ui`. Port the needed components (Button, IconButton, Tooltip, Card) directly into `src/design-app/src/components/ui/` rather than creating a separate package.

### 6. Design tokens
OCD tokens live in `packages/ui/src/tokens.css`. Merge them into `styles.css` but replace:
- OCD brand colors → iKawn gold (#FFC01C), navy (#0A0F2E), gold gradient (#FFC01C → #F59E0B)
- OCD fonts → Google Sans (body), Noto Serif (assistant text), Parkinsans (display headers)

### 7. Runtime/sandbox
OCD's `@open-codesign/runtime` builds srcdoc with esbuild-wasm + import maps. Lucy generates plain HTML (no JSX/React transform needed). The current `lib/runtime.ts` (buildSrcdoc) is fine — just verify it matches OCD's error-reporting bridge.

### 8. Config/settings
OCD loads config from TOML files. Lucy uses server-side session auth. Remove all config/API-key/provider logic. The user is already authenticated via the Express session cookie.

### 9. Wordmark
OCD shows "Open CoDesign" wordmark. Replace with Lucy's gold sparkle (&#10022;) and "Design Studio" text.

## Execution plan

### Wave 1: Foundation (parallel)
1. Port `index.css` → `styles.css` with iKawn tokens
2. Port UI components (Button, IconButton, Tooltip, Card) to `components/ui/`
3. Port `lib/relativeTime.ts`, `lib/action-timeline.ts`
4. Add `lucide-react` to design-app/package.json

### Wave 2: Store (sequential — this blocks everything)
5. Port `store.ts` — the full 2800-line store, adapted per rules above

### Wave 3: Components (parallel, 3 agents)
Agent A — Layout:
6. Port App.tsx, TopBar.tsx, Sidebar.tsx, ErrorBoundary.tsx

Agent B — Preview:
7. Port PreviewPane.tsx, PreviewToolbar.tsx, PhoneFrame.tsx, CanvasTabBar.tsx, CanvasErrorBar.tsx
8. Port preview/EmptyState.tsx, preview/ErrorState.tsx, preview/LoadingState.tsx

Agent C — Chat:
9. Port ChatMessageList.tsx, PromptInput.tsx, AssistantText.tsx, UserMessage.tsx, WorkingCard.tsx, EmptyState.tsx

### Wave 4: Hub & Dialogs (parallel)
10. Port HubView.tsx, DesignGrid.tsx, DesignCardPreview.tsx, RecentTab.tsx, YourDesignsTab.tsx, ExamplesTab.tsx, ExampleCard.tsx
11. Port DesignsView.tsx, DesignSwitcher.tsx, DeleteDesignDialog.tsx, RenameDesignDialog.tsx
12. Port FilesPanel.tsx, FilesTabView.tsx, ModelSwitcher.tsx

### Wave 5: Hooks & Integration
13. Port useKeyboard.ts, useDesignFiles.ts, useAgentStream.ts (adapt to api.ts)

### Wave 6: Build & Test
14. TypeScript check: `cd src/design-app && npx tsc --noEmit`
15. Build: `cd src/design-app && npm run build`
16. Start OpenBrain locally, test /design end-to-end
17. Run `npm run pre-deploy`

### Wave 7: Deploy
18. Deploy to Lucy ONLY: `cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only`
19. Do NOT deploy to ruhi-os-brain
20. Commit and push: `git add -A && git commit -m "feat(design): port full OCD UI components" && git push`

## Critical rules
- **Use the ACTUAL OCD code.** Read each OCD file, port it faithfully. Do not write simplified versions.
- **Backend is done.** Do not modify: db.js, design-api.js, design-tools.js, design-prompts.js, design-page.js, index.js, reasoning-loop.js.
- **api.ts and types.ts are done.** They match the backend. Don't change them unless a new endpoint is needed.
- **Deploy to Lucy only.** Never touch ruhi-os-brain without V's approval.
- **No emojis** in code or UI.
- **Pre-deploy must pass** before deploying (lint + 723 tests + design build).

## Backend endpoints (already working)
```
GET    /api/designs                    — list user's designs
POST   /api/designs                    — create design
PATCH  /api/designs/:id                — rename
DELETE /api/designs/:id                — soft delete
POST   /api/designs/:id/duplicate      — duplicate
GET    /api/designs/:designId/snapshots — list snapshots
POST   /api/designs/:designId/snapshots — create snapshot
GET    /api/designs/:designId/chat      — list chat
POST   /api/designs/:designId/chat      — append chat message
POST   /api/design/generate            — SSE generation stream
POST   /api/design/generate/:id/cancel  — cancel generation
```

## Current state
- Backend: deployed to Lucy, schema v24 created, all working
- Frontend: deployed but using simplified components — needs full OCD port
- Tests: 723 passing
- Branch: main
- Latest commits: `ac2feb03` (Design Studio v1), `32acd043` (lint fix)
