# Lucy Frontend Rewrite -- Design Specification

## Status
Approved by V on 2026-04-17. Ready for implementation planning.

## Problem
Lucy's frontend is 100% server-rendered HTML -- every page is a massive Express route file returning template literals with inline CSS/JS. The chat page alone is 4,500 lines. This causes:
- Escaping bugs (template literal double-escaping issues)
- No component reuse
- No proper state management
- Impossible to extend to mobile/desktop native
- Amateur-looking UI despite functional features
- Every change risks breaking the entire page

## Vision
Uber-grade quality. Clean, purposeful, fluid. Professional use of space, typography, and motion. Must work flawlessly as web app, PWA, and eventually native mobile, desktop, and browser extension. Same experience everywhere.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | React 19 + TypeScript | Industry standard, native path via RN |
| Build | Vite 6 + SWC + React Compiler v1.0 | Auto-memoization, fastest builds |
| Components | shadcn/ui (Radix primitives) | Dark-first, own the code, full customization |
| Client State | Zustand (~3KB) | Simple, streaming-friendly |
| Server State | TanStack Query v5 | REST caching, optimistic updates, background refetch |
| SSE Streaming | Custom hooks + Zustand | For chat and brand analysis streams |
| Router | TanStack Router | Type-safe params, first-class search params |
| Animation | Motion (formerly Framer Motion) | Layout animations, gestures, 60fps |
| PWA | vite-plugin-pwa (injectManifest) | Custom service worker for offline, bg sync |
| Responsive | Container queries + media queries + clamp() | Components adapt to space, layout adapts to viewport |
| Future Native | NativeWind + shared hooks/services | Tailwind syntax reuse |
| Future Desktop | Tauri 2 | 96% smaller than Electron |
| Testing | Vitest + Testing Library + Playwright | Small focused E2E suite |

## Architecture

### Two Worlds -- Split Layout

**User App** (chat-centric layout -- sidebar rail + main area):
- **Chat** (home) -- conversation list, streaming chat with markdown, attachments with grid/list toggle, image gallery/lightbox, @mentions, reply threads, capability hints, welcome screen with spacetime background
- **Tasks** (formerly Mission Control + Reports combined) -- scheduled tasks, task runs with inline output, create/edit/toggle/delete tasks, unread indicators
- **Vault** -- file manager with folders, grid/list view, upload with progress, bulk operations, search, starred items
- **Settings** -- custom instructions, password change, connector OAuth flows

**Admin Dashboard** (data-dense layout -- top nav + content area):
- **Brain Health** -- LLM costs chart, embedding queue depth, moderation stats, brand ratings
- **Intelligence** -- cohort analysis, engagement funnel, activity trends, AI signals
- **Users** -- user CRUD, role management, password reset
- **API Keys** -- key generation, revocation, usage logs

### Navigation

**Desktop (>1024px)**: Icon Rail on left side
- Logo (Lucy sparkle icon)
- Chat (home)
- Tasks
- Vault
- Settings (bottom)
- Avatar (bottom) -- opens profile menu
- Admin section visible to admin users only

**Mobile (<1024px)**: Bottom Tab Bar
- Chat, Tasks, Vault, Settings as tabs
- Admin accessible via settings menu for admin users

### Routing

```
/                        -- Chat (home, conversation list + active chat)
/chat/:id                -- Direct conversation
/tasks                   -- Scheduled tasks and runs
/vault                   -- File manager
/settings                -- User settings + connectors
/admin                   -- Admin dashboard shell
/admin/health            -- Brain Health
/admin/intelligence      -- Intelligence/Cohort analysis
/admin/users             -- User management
/admin/api-keys          -- API key management
/shared/:token           -- Public shared conversation (standalone, no auth)
/login                   -- Auth flow
```

## Design System

### Color Palette (Warm Dark Zinc)

```
--bg:           #09090b    (page background)
--bg-card:      #18181b    (card/panel background)
--bg-elevated:  #1c1c1f    (elevated elements, dropdowns)
--bg-hover:     #27272a    (hover states)
--border:       rgba(255, 255, 255, 0.06)   (subtle borders -- rgba, not hex)
--border-hover: rgba(255, 255, 255, 0.1)    (border hover)

--text:         #fafafa    (primary text)
--text-secondary: #a1a1aa  (secondary text)
--text-muted:   #71717a    (muted/meta text)
--text-dim:     #52525b    (labels, disabled)

--gold:         #FFC01C    (primary accent)
--gold-end:     #F59E0B    (gradient end)
--gold-hover:   #e5a819    (gold hover/pressed)
--gold-glow:    rgba(255, 192, 28, 0.15)  (focus rings, glows)

--success:      #22c55e
--error:        #ef4444
--warning:      #f59e0b
--info:         #3b82f6
```

### Typography
- Display headers: Parkinsans (600-700 weight)
- Body / UI: Inter or system font stack (400-600)
- Lucy's replies: Noto Serif (400-500, italic for emphasis)
- Monospace (code): JetBrains Mono or system mono

### Spacing
- Base unit: 4px
- Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- Consistent padding: cards = 16px, sections = 24px, page = 32px

### Elevation System
- Level 0: --bg (page)
- Level 1: --bg-card + border (cards, sidebar)
- Level 2: --bg-elevated + stronger shadow (dropdowns, modals)
- Level 3: Floating elements (toasts, tooltips)
- All use rgba borders + box-shadow for depth, never solid color borders

### Component Polish Standards (MANDATORY for every component)
- Buttons: gradient background with inner highlight (inset 0 1px 0 rgba(255,255,255,0.15)), hover lift (-1px translateY), focus ring (gold glow)
- Inputs: rgba borders, gold focus ring (0 0 0 3px rgba(255,192,28,0.1)), placeholder text at --text-dim
- Cards: rgba(255,255,255,0.06) border, subtle box-shadow, hover border brightens
- Status indicators: colored dot with matching glow shadow, tinted background pill
- Transitions: 150ms ease on all interactive elements
- Lists: hover background, generous padding (12-16px), two-line layout (title + meta)
- Text: 4-level hierarchy always enforced (section label / title / body / meta)

## State Management Architecture

### Zustand Stores
- `useAuthStore` -- user session, role, login/logout
- `useChatStore` -- active conversation, streaming state, pending attachments, draft text
- `useUIStore` -- sidebar open, active tab, theme, mobile detection
- `useTaskStore` -- optimistic task updates

### TanStack Query
- Conversation list, messages (paginated), vault items, task list, admin data
- Stale time: 30s for chat, 5min for admin data
- Optimistic updates for: message send, task toggle, vault move/star

### SSE Streaming
- Custom `useStreamChat` hook -- manages EventSource, dispatches events to Zustand
- Events: chunk, tool_start, tool_done, generation_start, generation_complete, done, error
- Auto-reconnect with exponential backoff
- Typing indicator during stream

## Feedback & States (MANDATORY for every view)

Every screen MUST handle all states:
- **Loading**: Skeleton screens (not spinners), shimmer animation
- **Empty**: Illustrated empty state with action CTA
- **Error**: Inline error with retry button, toast for transient errors
- **Success**: Subtle confirmation (checkmark animation, toast)
- **Uploading**: Progress bar with percentage, cancel button
- **Streaming**: Typing indicator with pulse animation, token-by-token render
- **Background tasks**: Status pill in header/sidebar, toast on completion
- **Offline**: Banner at top, cached data still accessible, queue actions for sync

## Animation Standards

- Page transitions: crossfade (200ms)
- List item enter: slide up + fade (staggered 50ms per item)
- Modal/sheet: slide up from bottom on mobile, scale-in on desktop
- Button press: scale(0.97) on press, translateY(-1px) on hover
- Message appear: slide in from right (user) or left (Lucy)
- Skeleton shimmer: subtle gradient sweep (1.5s infinite)
- Tab switch: shared element transition where possible
- All animations respect prefers-reduced-motion

## API Integration

92 API endpoints mapped. Backend (Express) stays as-is. Key integration patterns:

- Auth: session cookie (httpOnly). React app calls /auth/me on mount to check session.
- Chat streaming: POST /api/chat/send returns SSE stream. Use fetch + ReadableStream (not EventSource, since it's POST).
- File upload: Two-step -- presign URL from /api/upload/presign, then PUT to R2 directly.
- Real-time updates: Poll TanStack Query with refetchInterval for task status, or SSE where available.

## File Structure

```
src/frontend/
  index.html
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  components.json           (shadcn/ui config)

  src/
    main.tsx                 (app entry)
    App.tsx                  (router + providers)

    routes/                  (TanStack Router file-based)
      __root.tsx             (root layout)
      index.tsx              (chat home)
      chat.$id.tsx           (direct conversation)
      tasks.tsx
      vault.tsx
      settings.tsx
      admin/
        __layout.tsx         (admin dashboard layout)
        health.tsx
        intelligence.tsx
        users.tsx
        api-keys.tsx
      shared.$token.tsx      (public, no auth)
      login.tsx

    components/
      ui/                    (shadcn/ui components)
      chat/                  (chat-specific components)
        ChatMessage.tsx
        ChatInput.tsx
        ConversationList.tsx
        StreamingIndicator.tsx
        AttachmentGrid.tsx
        Lightbox.tsx
      tasks/
        TaskList.tsx
        TaskRunOutput.tsx
        TaskEditor.tsx
      vault/
        VaultGrid.tsx
        FileCard.tsx
        FolderNav.tsx
        UploadDropzone.tsx
      layout/
        IconRail.tsx          (desktop nav)
        BottomTabs.tsx        (mobile nav)
        AdminLayout.tsx
        UserLayout.tsx
      shared/
        Skeleton.tsx
        EmptyState.tsx
        ErrorBoundary.tsx
        StatusPill.tsx
        Toast.tsx

    hooks/
      useStreamChat.ts       (SSE streaming)
      useAuth.ts
      useMediaQuery.ts
      useOffline.ts

    stores/
      auth.ts
      chat.ts
      ui.ts

    lib/
      api.ts                 (fetch wrapper with auth)
      queryKeys.ts           (TanStack Query key factory)
      cn.ts                  (classname utility)

    styles/
      globals.css            (Tailwind base + custom properties)
      fonts.css
```

## Migration Strategy

The React frontend lives in `src/frontend/` inside the OpenBrain repo. Express serves it as static files from the built dist. Migration is page-by-page:

1. **Phase 1**: Scaffold + Auth + Chat page (the core 80%)
2. **Phase 2**: Vault + Tasks pages
3. **Phase 3**: Settings + Admin pages
4. **Phase 4**: PWA setup, offline support, performance optimization
5. **Phase 5**: Kill old server-rendered routes

During migration, both old and new frontends coexist. Express serves React app at `/app/*` (or similar), old routes stay until replaced. Cookie-based auth works for both.

## Non-Goals (explicitly out of scope)
- SSR / Server Components -- this is a pure SPA
- React Native / Expo -- future phase, but we structure for it now
- Browser extension -- future phase
- Redesigning the API -- backend stays as-is
- Multi-tenant / multi-brand UI -- single-tenant Lucy only

## Quality Bar
Would a senior designer at Uber approve this? If not, it's not done.
