# Lucy/Ruhi Frontend Rewrite — Architecture Plan

**Author:** Claude Code  
**Date:** 2026-04-05  
**Status:** PROPOSAL — awaiting V's approval before implementation

---

## 1. Current State Analysis

### chat-page.js — The Monolith

**File:** `src/routes/chat-page.js` — **3,615 lines** of server-rendered template literal.

A single Express route handler (`chatPage()`) returns an entire HTML document as a JS string. It contains:

- **~1,500 lines of CSS** — custom design system (CSS variables, sidebar, messages, input area, gallery picker, lightbox, mention dropdown, responsive breakpoints, generation cards, context cards, toast, share dropdown)
- **~200 lines of HTML** — sidebar rail + panel, main chat area, welcome screen, compose bar, gallery modal, lightbox, drag overlay
- **~1,900 lines of JavaScript** — all client-side logic inlined in a `<script>` tag:
  - State management (conversations array, activeConvId, pendingAttachments, streaming state)
  - Conversation CRUD (load, create, delete, rename)
  - SSE streaming with EventSource (text chunks, tool execution, generation cards)
  - Markdown rendering via marked.js + highlight.js
  - File upload (presigned URLs via `/api/upload/presign`)
  - Gallery picker (unified ikawn OS generations + chat attachments)
  - @mention autocomplete (agents + skills)
  - /skill command autocomplete
  - Draft save/restore (per-conversation, saved on page unload via sendBeacon)
  - Share link creation/revocation
  - Context card rendering (conversation summary from backend)
  - Dynamic greeting system (20+ variants based on time, day, recent work)
  - Image lightbox
  - Mobile responsive behavior (hamburger menu, sidebar overlay)
  - Model tier toggle (regular/pro/expert)

### Other Server-Rendered Pages

| File | Lines | What It Renders |
|------|-------|-----------------|
| `pages.js` | 424 | Login page, admin page, settings page |
| `reports.js` | 478 | Reports dashboard |
| `mission-control.js` | 1,366 | Mission Control (tasks + agents CRUD) |
| `shared.js` | 309 | Public shared conversation viewer |
| `admin-costs.js` | 428 | OpenAI cost dashboard + Brain Health |
| `brain-health.js` | 90 | Brain Health API (JSON only, no HTML) |

**Total server-rendered HTML:** ~6,620 lines across 6 files.

### API Endpoints (chat-api.js — 1,165 lines)

The chat-api.js file exposes these endpoints consumed by the frontend:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations` | List user's conversations (UUID, title, hashtags) |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get conversation with messages |
| DELETE | `/api/conversations/:id` | Delete conversation |
| PATCH | `/api/conversations/:id` | Update title |
| POST | `/api/chat/send` | Send message (returns SSE stream) |
| POST | `/api/conversations/:id/share` | Create share link |
| DELETE | `/api/conversations/:id/share` | Revoke share link |
| GET | `/api/conversations/:id/markdown` | Export as markdown |
| GET | `/api/settings` | Get settings (admin) |
| PUT | `/api/settings` | Update settings (admin) |
| GET | `/api/custom-instructions` | Get user's custom instructions |
| PATCH | `/api/custom-instructions` | Update custom instructions |
| PUT/POST | `/api/conversations/:id/draft` | Save draft text |
| POST | `/api/conversations/:id/generation` | Save completed generation to chat |

Additional endpoints used by the frontend (from other route files):

| Method | Endpoint | Source File |
|--------|----------|-------------|
| GET | `/api/upload/presign` | `upload.js` |
| GET | `/api/gallery` | `actions.js` |
| GET | `/api/reports/*` | `reports.js` |
| GET/POST/DELETE | `/api/mission/*` | `mission-control.js` |
| GET | `/admin/costs` | `admin-costs.js` |
| GET | `/brain-health` | `brain-health.js` |
| POST | `/auth/login`, `/auth/logout` | `auth-routes.js` |
| GET | `/api/mission/mentions` | `mission-control.js` |
| GET | `/api/mission/tools` | `mission-control.js` |
| GET | `/health` | `index.js` |

### Key Observations

1. **No build system** — zero bundling, zero tree-shaking. All JS/CSS shipped inline.
2. **No component reuse** — sidebar, message rendering, gallery picker are all bespoke inline code. Mission Control reimplements its own sidebar, its own CSS variables.
3. **No type safety** — all data flows are implicit. No interfaces for API responses.
4. **No testing** — client-side code is untestable (embedded in template strings).
5. **Tight server coupling** — user data injected via `JSON.stringify(user)` directly into script tag. Session state leaked into markup.
6. **Two CDN dependencies** — marked.js and highlight.js loaded from jsdelivr.
7. **Design system exists but is duplicated** — CSS variables defined in chat-page.js, then partially re-defined in pages.js, reports.js, mission-control.js.

---

## 2. Recommendation: Option B — Frontend Inside OpenBrain Repo

### Why Option B over A and C

| Criterion | Option A (Separate Repo) | **Option B (In-Repo)** | Option C (ikawn-v3 Monorepo) |
|-----------|--------------------------|------------------------|------------------------------|
| Deploy simplicity | Two deploys needed | **Single deploy, single Dockerfile** | Wrong — Lucy is not ikawn-v3 |
| API proximity | HTTP calls only | **Can share types, evolve API + UI together** | Different stack (Nuxt vs React) |
| Dual deployment (Lucy + Ruhi Brain) | Works (both apps serve same static) | **Works — Vite builds to `dist/`, Express serves it** | Doesn't apply — ikawn-v3 is separate |
| CI/CD complexity | Separate pipelines | **One pipeline** | Would bloat ikawn-v3 CI |
| Developer context | Must switch repos | **One repo, one mental model** | Confusing — OpenBrain logic in wrong repo |
| Brand API compatibility | Fine | **Fine — same origin, same cookies** | Breaks — different domain |
| Independent versioning | Yes (unnecessary) | **Coupled — which is correct for this codebase** | Coupled to wrong thing |

**Option C is eliminated** because OpenBrain and ikawn-v3 are fundamentally different systems with different deployment targets, different databases, and different auth. Forcing them together creates coupling where none should exist.

**Option A is viable** but introduces unnecessary operational overhead. OpenBrain is one codebase deploying to two Fly apps. The frontend is tightly coupled to the API (SSE streaming, session cookies, file uploads). Keeping them together means atomic API + UI changes.

**Option B wins** because it preserves the single-deploy model, allows shared TypeScript types between API and frontend, and keeps the mental model simple: one repo, one deploy, two Fly apps.

---

## 3. Tech Stack Recommendation

### Framework: React 19 + Vite

**Why React over Vue:**
- shadcn/ui is React-native (shadcn-vue exists but lags behind, fewer components, smaller community)
- Gemma 4 WebGPU integration has better React ecosystem support (transformers.js examples are React-first)
- React Native path for future mobile app (shared component logic)
- ikawn-v3 uses Nuxt/Vue — but that is a *different product*. Lucy's frontend should optimize for Lucy's needs, not for stack uniformity across unrelated codebases.

**Why Vite:**
- Already in the ecosystem (vitest is a devDependency)
- Fast HMR, ES modules native
- Produces optimized static build (`dist/`) that Express can serve

### Component Library: shadcn/ui

- Radix UI primitives (accessibility, keyboard nav, focus management)
- Tailwind CSS for styling (replaces 1,500+ lines of custom CSS)
- Copy-paste model — components live in the codebase, fully customizable
- Dark theme built-in, easy to map to existing CSS variable system

### State Management: Zustand

- Lightweight (1KB), no boilerplate
- Perfect for the chat state model (conversations list, active conversation, messages, streaming state)
- Works well with SSE streaming (direct store mutations from event handlers)
- No context provider hell

### Additional Libraries

| Library | Purpose | Replaces |
|---------|---------|----------|
| `@tanstack/react-query` | API data fetching, caching, optimistic updates | Manual fetch() calls |
| `react-markdown` + `remark-gfm` | Markdown rendering | marked.js CDN |
| `react-syntax-highlighter` | Code block highlighting | highlight.js CDN |
| `@radix-ui/react-dropdown-menu` | Share dropdown, context menus | Custom dropdown JS |
| `@radix-ui/react-dialog` | Gallery picker, lightbox, modals | Custom overlay JS |
| `@radix-ui/react-tooltip` | Tooltips | title attributes |
| `cmdk` | Command palette (future: /skill and @mention) | Custom autocomplete |
| `sonner` | Toast notifications | Custom toast JS |
| `tailwind-merge` + `clsx` | className utility | — |
| `lucide-react` | Icon set | Inline SVGs (50+ scattered across template) |

### TypeScript

The frontend will be TypeScript. API response types will be defined in a shared `src/shared/types.ts` file importable by both the Express backend and the React frontend. This eliminates the current problem where API contracts are implicit.

---

## 4. Migration Strategy

### Principle: Parallel Operation, Gradual Cutover

The new frontend builds to static files. Express serves them at `/` (catch-all). During migration, the old template-literal routes still exist but are bypassed once the new frontend is active.

### Step 1: Scaffold (no user-visible change)

Add `src/frontend/` to the repo. Configure Vite. Wire Express to serve `dist/` in production and proxy to Vite dev server in development. The old `chat-page.js` route continues serving at `/`. A feature flag (`USE_NEW_FRONTEND=true`) switches between old and new.

### Step 2: Core Chat (replaces chat-page.js)

Build the chat experience: sidebar, conversation list, message rendering, SSE streaming, compose bar. This replaces the largest file (3,615 lines). Deploy behind feature flag.

### Step 3: Auxiliary Pages (replaces pages.js, reports.js, etc.)

Migrate login, settings, admin, reports, mission control, shared conversations, brain health. Each page becomes a React route.

### Step 4: Remove Old Routes

Delete `chat-page.js`, the HTML-rendering portions of `pages.js`, `reports.js`, `mission-control.js`, `shared.js`, `admin-costs.js`. Keep their API endpoints.

### Step 5: Gemma 4 Integration

Add on-device AI features once the UI foundation is stable.

### Safety Mechanism

The feature flag `USE_NEW_FRONTEND` is a Fly secret. Deploying with `false` instantly reverts to the old UI. Both UIs hit the same API endpoints — zero data migration needed.

---

## 5. File/Folder Structure

```
ikawn-openbrain/
├── src/                          # Existing Express backend
│   ├── index.js                  # Add: serve dist/ for production, proxy for dev
│   ├── routes/
│   │   ├── chat-api.js           # KEEP — API only, no HTML
│   │   ├── chat-page.js          # KEEP during migration, DELETE after
│   │   ├── brain-health.js       # KEEP — already JSON API
│   │   └── ...
│   └── shared/
│       └── types.ts              # NEW — shared API types (compiled to JS for backend)
│
├── src/frontend/                 # NEW — React + Vite app
│   ├── index.html                # Vite entry
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.js
│   │
│   ├── src/
│   │   ├── main.tsx              # React entry, router setup
│   │   ├── App.tsx               # Layout wrapper, auth guard
│   │   │
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui components (Button, Dialog, etc.)
│   │   │   ├── chat/
│   │   │   │   ├── ChatSidebar.tsx        # Rail + expandable panel
│   │   │   │   ├── ConversationList.tsx   # Grouped by date, hashtag filter
│   │   │   │   ├── ConversationItem.tsx   # Title, rename, delete actions
│   │   │   │   ├── MessageList.tsx        # Scrollable message area
│   │   │   │   ├── MessageBubble.tsx      # User vs assistant styling
│   │   │   │   ├── MessageAttachments.tsx # Images, documents, links
│   │   │   │   ├── ComposeBar.tsx         # Input, file upload, gallery, send
│   │   │   │   ├── MentionDropdown.tsx    # @agent and /skill autocomplete
│   │   │   │   ├── StreamingMessage.tsx   # SSE text accumulation + tool indicators
│   │   │   │   ├── GenerationCard.tsx     # In-chat image generation progress
│   │   │   │   ├── ContextCard.tsx        # Conversation summary display
│   │   │   │   ├── WelcomeScreen.tsx      # Greeting + spacetime background
│   │   │   │   └── ShareMenu.tsx          # Share link, copy markdown, download
│   │   │   ├── gallery/
│   │   │   │   ├── GalleryPicker.tsx      # Modal with tabs (All/Generations/Chat)
│   │   │   │   └── GalleryThumbnail.tsx   # Selectable image with agent badge
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx           # Sidebar + main content wrapper
│   │   │   │   ├── Header.tsx             # Mobile hamburger + title + actions
│   │   │   │   └── MobileNav.tsx          # Touch-friendly sidebar overlay
│   │   │   ├── shared/
│   │   │   │   ├── Lightbox.tsx           # Full-screen image viewer
│   │   │   │   ├── Toast.tsx              # Sonner wrapper with iKawn styling
│   │   │   │   ├── MarkdownRenderer.tsx   # react-markdown + code highlighting
│   │   │   │   └── MentionPill.tsx        # Gold @mention badge
│   │   │   ├── mission/
│   │   │   │   ├── MissionDashboard.tsx   # Tasks + agents management
│   │   │   │   ├── TaskTable.tsx
│   │   │   │   ├── AgentCard.tsx
│   │   │   │   └── TaskRunHistory.tsx
│   │   │   ├── reports/
│   │   │   │   ├── ReportsDashboard.tsx
│   │   │   │   └── ReportCard.tsx
│   │   │   ├── admin/
│   │   │   │   ├── BrainHealth.tsx        # Cost monitor + embedding queue + moderation
│   │   │   │   ├── CostChart.tsx          # 7-day bar chart
│   │   │   │   ├── AdminUsers.tsx
│   │   │   │   └── Settings.tsx
│   │   │   └── auth/
│   │   │       └── LoginPage.tsx          # Spacetime background + sign-in form
│   │   │
│   │   ├── hooks/
│   │   │   ├── useConversations.ts        # React Query: CRUD conversations
│   │   │   ├── useMessages.ts             # React Query: get messages for conversation
│   │   │   ├── useChatStream.ts           # SSE streaming hook (EventSource wrapper)
│   │   │   ├── useUpload.ts               # Presigned upload flow
│   │   │   ├── useGallery.ts              # Gallery data fetching
│   │   │   ├── useMentions.ts             # Agent/skill mention data
│   │   │   ├── useDraft.ts                # Draft save/restore per conversation
│   │   │   ├── useAuth.ts                 # Session state, login/logout
│   │   │   └── useGemma.ts                # On-device AI (Gemma 4 via WebGPU)
│   │   │
│   │   ├── stores/
│   │   │   ├── chat-store.ts              # Zustand: active conversation, streaming state
│   │   │   ├── ui-store.ts                # Zustand: sidebar open, mobile state
│   │   │   └── settings-store.ts          # Zustand: model tier, custom instructions
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                     # Typed API client (fetch wrapper)
│   │   │   ├── sse.ts                     # SSE parser for chat streaming
│   │   │   ├── markdown.ts                # Markdown config + custom renderers
│   │   │   ├── gemma.ts                   # Gemma 4 model loader + inference
│   │   │   ├── spacetime.ts               # Spacetime background animation
│   │   │   └── utils.ts                   # escapeHtml, formatDate, greeting generator
│   │   │
│   │   ├── styles/
│   │   │   ├── globals.css                # Tailwind base + custom CSS variables
│   │   │   └── fonts.css                  # Google Sans, Noto Serif, Parkinsans
│   │   │
│   │   ├── types/
│   │   │   ├── api.ts                     # API response types (mirrors shared/types.ts)
│   │   │   ├── chat.ts                    # Conversation, Message, Attachment types
│   │   │   └── gemma.ts                   # Gemma inference types
│   │   │
│   │   └── pages/                         # Route-level components (react-router)
│   │       ├── ChatPage.tsx               # / and /chat/:id
│   │       ├── LoginPage.tsx              # /login
│   │       ├── SettingsPage.tsx           # /settings
│   │       ├── AdminPage.tsx              # /admin
│   │       ├── BrainHealthPage.tsx        # /admin/brain-health
│   │       ├── ReportsPage.tsx            # /reports
│   │       ├── MissionPage.tsx            # /mission
│   │       └── SharedPage.tsx             # /shared/:token (public, no auth)
│   │
│   └── dist/                              # Vite build output (gitignored, built in Docker)
│
├── Dockerfile                             # Updated: npm run build:frontend before start
├── package.json                           # Updated: add frontend build script
└── ...
```

---

## 6. API Contract

### Authentication

Current: cookie-session (`ob_session`). The frontend runs on the same origin as the API, so cookies are sent automatically. No CORS needed.

For the new frontend in development (Vite dev server on port 5173, Express on port 3000), configure Vite's proxy:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/capture': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
    }
  }
})
```

### Core Chat API Types

```typescript
// src/shared/types.ts

interface Conversation {
  id: string;           // UUID
  title: string;
  hashtags: string[];
  updated_at: string;   // ISO timestamp
  draft_text?: string;
  share_token?: string;
  context_summary?: ContextSummary | null;
}

interface ContextSummary {
  topic?: string;
  complexity?: 'casual' | 'standard' | 'complex';
  bullets?: Array<{ text: string }>;
  decisions?: string[];
  open_questions?: string[];
}

interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  model?: string;
  tier?: string;
  created_at: string;
}

interface Attachment {
  type: 'image' | 'document' | 'link';
  url: string;
  name?: string;
  filename?: string;
  contentType?: string;
  extracted_text?: string;
}

// SSE event types from POST /api/chat/send
type ChatSSEEvent =
  | { type: 'chunk'; text: string }
  | { type: 'tool_start'; tool: string; detail?: string }
  | { type: 'tool_done'; tool: string; success: boolean; error?: string }
  | { type: 'generation_started'; generationId: string; agent: string; prompt: string; batchSize: number }
  | { type: 'agent_identity'; slug?: string; name: string; role?: string }
  | { type: 'tier_switch'; tier: string; label: string }
  | { type: 'title'; title: string }
  | { type: 'done'; message_id: number; conversation_id: string; context_summary?: ContextSummary }
  | { type: 'error'; error: string }
```

### Full Endpoint Catalog

**Chat (auth required):**
- `GET /api/conversations` → `Conversation[]`
- `POST /api/conversations` → `Conversation`
- `GET /api/conversations/:id` → `Conversation & { messages: Message[] }`
- `DELETE /api/conversations/:id` → `{ success: true }`
- `PATCH /api/conversations/:id` → `Conversation`
- `POST /api/chat/send` → SSE stream (ChatSSEEvent)
- `POST /api/conversations/:id/share` → `{ share_token: string }`
- `DELETE /api/conversations/:id/share` → `{ success: true }`
- `GET /api/conversations/:id/markdown` → `{ markdown: string; title: string }`
- `PUT /api/conversations/:id/draft` → `{ success: true }`
- `GET /api/custom-instructions` → `{ custom_instructions: string }`
- `PATCH /api/custom-instructions` → `{ success: true }`
- `POST /api/conversations/:id/generation` → `{ success: true }`

**Upload (auth required):**
- `GET /api/upload/presign` → `{ url: string; fields: object; publicUrl: string }`

**Gallery (auth required):**
- `GET /api/gallery` → `{ images: GalleryImage[] }`

**Mentions (auth required):**
- `GET /api/mission/mentions` → `MentionItem[]`
- `GET /api/mission/tools` → `{ tools: ToolItem[] }`

**Reports (auth required):**
- `GET /api/reports` → reports list
- `GET /api/reports/unread-count` → `{ count: number }`

**Admin (admin only):**
- `GET /api/settings` → settings object
- `PUT /api/settings` → `{ success: true }`
- `GET /admin/costs` → cost summary
- `GET /brain-health` → brain health data
- `GET /api/admin/users` → user list

**Auth (public):**
- `POST /auth/login` → redirect or session
- `POST /auth/logout` → redirect
- `GET /health` → `{ status: 'ok'; version: string }`

**Public:**
- `GET /shared/:token` → shared conversation data

---

## 7. Phase Breakdown

### Phase 1: Scaffold + Core Chat (Weeks 1-2)

**Goal:** Replace chat-page.js with a React app that has feature parity for the core chat experience.

1. Initialize Vite + React + TypeScript in `src/frontend/`
2. Install and configure Tailwind CSS + shadcn/ui
3. Set up react-router with routes: `/`, `/chat/:id`, `/login`
4. Build `AppShell` layout (sidebar rail + panel + main area)
5. Build `ConversationList` with date grouping and hashtag filter
6. Build `MessageList` + `MessageBubble` with markdown rendering
7. Build `ComposeBar` with file upload and gallery picker
8. Build `useChatStream` hook for SSE streaming
9. Build `StreamingMessage` for real-time text + tool indicators
10. Build `GenerationCard` for in-chat image generation
11. Wire Express to serve `dist/` behind `USE_NEW_FRONTEND` flag
12. Build `LoginPage` with spacetime background

**Acceptance:** A user can log in, create conversations, send messages, receive streaming responses, upload files, and browse chat history — all via the new frontend.

### Phase 2: Feature Parity (Week 3)

**Goal:** Everything the old UI does, the new UI does.

1. @mention autocomplete (`MentionDropdown` + `cmdk`)
2. /skill command autocomplete
3. Share link creation/revocation (`ShareMenu`)
4. Draft save/restore (`useDraft` hook with sendBeacon)
5. Context card display
6. Model tier toggle (regular/pro/expert)
7. Dynamic greeting system (`WelcomeScreen`)
8. Mobile responsive layout (hamburger, sidebar overlay, touch targets)
9. Image lightbox
10. Gallery picker (tabs: All/Generations/Chat)

**Acceptance:** Side-by-side comparison of old and new UI reveals no missing features.

### Phase 3: Auxiliary Pages (Week 4)

**Goal:** Migrate all remaining server-rendered pages.

1. `SettingsPage` — custom instructions
2. `AdminPage` — user management
3. `BrainHealthPage` — cost dashboard, embedding queue, moderation
4. `ReportsPage` — reports dashboard with unread badges
5. `MissionPage` — tasks CRUD, agents management, run history
6. `SharedPage` — public conversation viewer (no auth)

**Acceptance:** All 6 server-rendered page files can be deleted. Only JSON API routes remain.

### Phase 4: Polish + Design System (Week 5)

**Goal:** Exceed the old UI in quality. Enterprise-grade feel.

1. Animation system — smooth transitions between views (sidebar open/close, conversation switch)
2. Keyboard shortcuts — Cmd+K for search, Cmd+N for new chat, Cmd+Shift+S for share
3. Optimistic updates — conversation create/delete feels instant
4. Skeleton loading states — shimmer placeholders instead of "Loading..."
5. Error boundaries with retry UI
6. Dark/light theme support (dark default, light available)
7. Extract design tokens to Tailwind config (colors, fonts, spacing)
8. Accessibility audit — focus management, ARIA labels, screen reader testing

### Phase 5: Gemma 4 On-Device AI (Week 6+)

See section 8 below.

### Phase 6: Cleanup (After Stabilization)

1. Delete `chat-page.js` (3,615 lines)
2. Delete HTML-rendering portions of `pages.js`, `reports.js`, `mission-control.js`, `shared.js`, `admin-costs.js`
3. Remove `USE_NEW_FRONTEND` flag — new frontend is the only frontend
4. Remove marked.js and highlight.js CDN references
5. Update Dockerfile to always build frontend

---

## 8. Gemma 4 On-Device AI Integration

### What It Handles Client-Side

| Feature | How Gemma 4 Helps |
|---------|-------------------|
| **Intent classification** | Before sending to API: classify if message is casual greeting (route to Haiku tier), complex analysis (route to Opus tier), or normal (Sonnet). Saves server-side tier detection logic and reduces unnecessary Opus/Sonnet calls for "hi" messages. |
| **Message pre-processing** | Summarize long pasted text before sending to API (reduce input tokens). Extract key entities from uploaded documents client-side. |
| **Smart autocomplete** | Suggest completions based on conversation context — not just @mentions but contextual suggestions ("Would you like me to generate an image of that?"). |
| **Offline draft mode** | When offline or on slow connections, Gemma can provide quick responses for simple queries while queuing the real API call. Graceful degradation. |
| **Search intent extraction** | Parse natural language search queries into structured filters for the conversation search. |
| **Title suggestion** | Generate conversation titles client-side instead of making an API call (currently uses Gemini Flash). |

### Technical Approach

```typescript
// src/frontend/src/lib/gemma.ts

import { pipeline } from '@huggingface/transformers';

interface GemmaConfig {
  modelId: string;    // e.g., 'google/gemma-3-4b-it'
  quantization: 'q4' | 'q8'; // 4-bit for mobile, 8-bit for desktop
  maxTokens: number;
}

class GemmaEngine {
  private pipe: any = null;
  private loading = false;
  private supported = false;

  async init(): Promise<boolean> {
    // Check WebGPU support
    if (!navigator.gpu) {
      console.warn('[Gemma] WebGPU not supported — falling back to server-side');
      return false;
    }
    // Check available GPU memory (need ~2GB for 4-bit model)
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    
    this.supported = true;
    // Lazy-load model on first use (not on page load)
    return true;
  }

  async classifyIntent(message: string): Promise<'casual' | 'standard' | 'complex'> {
    if (!this.supported) return 'standard'; // fallback
    // ...inference logic
  }

  async suggestTitle(messages: Message[]): Promise<string> {
    if (!this.supported) throw new Error('Not supported');
    // ...inference logic
  }
}

export const gemma = new GemmaEngine();
```

### WebGPU Requirements

- **Supported browsers:** Chrome 113+, Edge 113+, Firefox (behind flag), Safari (no support yet)
- **Required GPU:** Any discrete GPU or Apple Silicon. Most Intel iGPUs work for 4-bit models.
- **Memory:** ~2GB GPU memory for gemma-3-4b-it (4-bit quantized)
- **Model size:** ~2.5GB download on first use, cached in browser storage

### Fallback Strategy

```
User sends message
  ├── WebGPU available + model loaded?
  │     ├── YES → Run intent classification locally (10-50ms)
  │     │          → Attach tier hint to API request
  │     │          → Server uses hint (skips its own tier detection)
  │     └── NO → Fall through to server
  └── Server runs tier detection as today (detectTier() in chat-api.js)
```

**Hard rule:** Gemma is a progressive enhancement. The app must be fully functional without it. No feature should require WebGPU. The `useGemma` hook returns `{ supported: boolean, ready: boolean, classifyIntent, suggestTitle }` — components check `supported` before using any Gemma feature.

### Model Loading UX

- Model download (~2.5GB) happens in the background after first login
- Progress indicator in settings page: "Downloading on-device AI... 45%"
- Once cached, loads in ~2 seconds on subsequent visits
- User can opt out in settings ("Use on-device AI for faster responses")
- Settings flag stored in localStorage, respected by `useGemma` hook

---

## 9. Dual Deployment Considerations

Both Lucy (`ikawn-openbrain`) and Ruhi Brain (`ruhi-os-brain`) deploy from this codebase. The frontend must work for both.

### What Differs Between Deployments

| Aspect | Lucy | Ruhi Brain |
|--------|------|------------|
| Domain | ruhi.ikawn.in | ruhi-os-brain.fly.dev (proxied by ikawn-v3) |
| Instance name | "Lucy" | "Ruhi" (or brand-specific) |
| User base | Internal (V + team) | SaaS customers |
| Admin features | Full access | Hidden or restricted |
| Brand | ikawn | Per-tenant (brand_id from session) |

### How the Frontend Handles It

The Express backend already injects `INSTANCE_NAME` (via `ruhi-assets.js`). The new frontend will:

1. Call `GET /health` on load to get `{ version, instance_name }` (add `instance_name` to health endpoint)
2. Store instance name in a React context
3. Use it for branding: welcome screen, page title, avatar labels
4. Admin features gated by `user.role === 'admin'` (same as today)

No conditional builds, no environment-specific bundles. One build, two deployments, runtime configuration.

---

## 10. Build + Deploy Integration

### Dockerfile Changes

```dockerfile
# Add Node build stage for frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/frontend/ src/frontend/
COPY src/shared/ src/shared/
RUN npm run build:frontend

# Main stage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ src/
COPY docs/ docs/
COPY --from=frontend-build /app/src/frontend/dist src/frontend/dist
CMD ["node", "src/index.js"]
```

### package.json Changes

```json
{
  "scripts": {
    "dev": "concurrently \"node src/index.js\" \"cd src/frontend && npx vite\"",
    "build:frontend": "cd src/frontend && npx vite build",
    "start": "node src/index.js"
  }
}
```

### Express Changes (src/index.js)

```javascript
// After all API routes, before catch-all:
if (process.env.USE_NEW_FRONTEND === 'true') {
  const frontendDist = path.join(__dirname, 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA catch-all: serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || 
          req.path.startsWith('/capture') || req.path.startsWith('/search') ||
          req.path.startsWith('/webhooks')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}
```

---

## 11. Open Questions for V

1. **React confirmed?** Or should we reconsider Vue for stack alignment with ikawn-v3? (Recommendation: React, for the reasons above.)
2. **Gemma 4 model size** — the 4B parameter model is ~2.5GB. Is this acceptable for first-load UX? Alternative: start with the 2B model (~1.2GB) for faster adoption.
3. **Mobile app timeline** — if a native mobile app is planned within 6 months, React + React Native is the strongest path. If mobile is 12+ months out, framework choice matters less.
4. **Public pages** — should `/shared/:token` (public conversation viewer) also use the new frontend? Or keep it as a lightweight server-rendered page for SEO/performance?
5. **Gemma 4 priority** — is on-device AI a Phase 1 requirement, or can it wait until the core UI is stable?
