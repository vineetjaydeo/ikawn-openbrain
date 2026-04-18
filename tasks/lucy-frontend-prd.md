# Lucy Frontend v1: PRD

## Context
- Demo audience: Analytics head at a bank evaluating Claude-on-VPS
- Demo date: Monday (2026-04-21)
- Wow moment: "This runs on YOUR servers, your data never leaves, and look what it can do"
- Design reference: Palantir.com (density, trust) meets Claude.ai (chat UX)

## Stack (FINAL DECISION)
- React 19 + Vite 6 + TypeScript
- Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- Zustand (client state)
- TanStack Query v5 (server state, wiring to OpenBrain API)
- Motion (fka Framer Motion) for animations
- Location: `/Users/vineet/ikawn-openbrain/src/frontend/` (replace old prototype)

**Why not Expo:** Web output quality was poor. Fought NativeWind for hours. shadcn/ui produces production-grade web UI immediately. Mobile can come later via Capacitor.

## Screens (Priority Order)

### P0: Chat (the hero screen)
- SSE streaming from OpenBrain chat API (wire this, not mock)
- User messages: right-aligned rounded bubble, Google Sans
- Agent messages: full width, Noto Serif, with inline citation chips
- Citation chips: tap to see the memory source (access level badge)
- Suggested prompts on empty state (banking context: treasury, risk, compliance)
- Composer: textarea + send button (gold gradient), file attach button
- Conversation list sidebar (desktop), sheet overlay (mobile)
- Skeleton loading states

### P0: Sign In
- Dark background, centered card
- Gold sparkle logo, "Sign in to Lucy" heading
- Email + password inputs, gold CTA button
- SSO placeholder button
- Mock auth for demo (just routes to chat)

### P1: Memory Browser
- Search input with live filtering
- Hashtag filter chips (horizontal scroll)
- Memory cards: content preview, hashtags, access-level badge, date
- Access level colors: private(gray), management(navy), internal(default), advisor(gold), investor(blue), public(green)
- Wire to GET /api/search endpoint

### P1: Settings / Connectors
- Profile row (avatar, name, email, role)
- Theme toggle (dark/light, persist to localStorage)
- Connected services section (shows Gmail connected status from API)
- Sign out button

### P2: Brand Switcher
- Simple modal with brand list
- Mock data for demo

## Theme Tokens

### Dark mode (default for demo)
- bg-base: #0A0A0A
- bg-surface: #161616
- bg-elevated: #1F1F1F
- border-subtle: #2A2A2A
- border-strong: #3A3A3A
- text-primary: #F5F5F5
- text-secondary: #A8A8A8
- text-muted: #6B6B6B
- accent: #FFC01C (iKawn gold)
- accent-hover: #FFCB3D
- accent-muted: #3D2F08
- navy: #0A0F2E (trust badges)

### Light mode
- bg-base: #FFFFFF
- bg-surface: #F5F4F0
- bg-elevated: #FAF8F3
- bg-sand: #E8DCC4
- border-subtle: #E5E0D5
- border-strong: #C9BFA8
- text-primary: #1A1A1A
- text-secondary: #5A5A5A
- text-muted: #8A8A8A
- accent: #FFC01C
- navy: #0A0F2E

### Typography
- Display: Parkinsans
- Body/UI: Google Sans
- Agent replies: Noto Serif
- Mono: JetBrains Mono

## Channel System
- Two channels: lucy (internal) and ruhi (client-facing)
- Env var: VITE_RELEASE_CHANNEL (default: lucy)
- Swaps: agent name, tagline, logo text
- Everything else identical

## API Endpoints to Wire (from OpenBrain backend)
- POST /api/chat (SSE streaming) -- main chat
- GET /api/chat/conversations -- list conversations
- GET /api/chat/conversations/:id/messages -- get messages
- GET /api/search?q=... -- memory search
- GET /api/connectors -- connector status
- POST /api/upload -- file upload (stretch)

## Hard Rules
- No emojis in UI, code, or copy
- No em/en dashes
- No dollar amounts in UI
- No files over 300 lines
- Deploy to Lucy ONLY (never touch ruhi-os-brain without V approval)
- Dark mode default for banking demo
- Gold sparkle glyph as agent avatar

## Definition of Done
- npm run dev renders all screens cleanly in dark mode
- Chat SSE streaming works against local OpenBrain backend
- Theme toggle persists across reloads
- Channel swap works (VITE_RELEASE_CHANNEL=ruhi changes branding)
- TypeScript: 0 errors
- Every screen has loading, empty, and error states

## Handoff Notes
- The Expo project at /Users/vineet/ikawn-openbrain/app/ can be deleted
- Old React prototype at src/frontend/ should be replaced entirely
- There is an approved design spec at docs/superpowers/specs/2026-04-17-lucy-react-frontend-design.md
- Gmail connector fix was deployed this session (c.status === 'active' in pages.js:759)
- The approved tech stack from the original spec: Vite 6 + SWC, shadcn/ui, Zustand, TanStack Query, TanStack Router, Motion
