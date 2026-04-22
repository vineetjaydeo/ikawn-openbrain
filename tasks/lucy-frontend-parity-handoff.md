# Lucy React Frontend - Parity Handoff (2026-04-19)

## Goal
Make the new React frontend at `src/frontend/` do everything the old single-JS frontend (`src/routes/pages.js`, `chat-page.js`, `vault-page.js`, etc.) could do. No new features -- just parity.

## What's Working Now
- Login/logout (real auth, session cookies)
- Chat: send messages, SSE streaming, conversation creation, auto-scroll
- Nav: Chat, Memory, Vault, Tasks, Settings, Admin
- Empty state with suggested prompts
- Login password: `v@ikawn.com` / `lucy2026`

## What's NOT Working (Parity Gaps)

### P0 - Chat Parity
1. **Conversation history sidebar** - LeftRail shows static nav items, NOT the conversation list. Old UI had a toggleable sidebar panel showing conversations grouped by time (Today, Yesterday, This Week, etc.). The `useConversations` hook exists and works (`GET /api/conversations` returns array). Need to add a panel that shows conversation list and allows switching.
2. **Conversation switching** - Clicking a conversation in the list should navigate to `/chat/:id` and load its messages. The `useConversationDetail` hook exists. Messages load on mount but only if store is empty (to avoid overwriting streaming state).
3. **Conversation deletion** - `deleteMutation` exists in `useConversations` hook but not wired to UI.
4. **Markdown rendering** - Lucy's responses come as plain text/markdown but render as raw text. Old UI used marked.js for markdown. Need to add a markdown renderer to the Message component.
5. **User identity in messages** - Messages show hardcoded "Amira" / "AK" from the design mock. Should show the real logged-in user's name/initials. The `useAuth` hook has `user.name`.

### P1 - Page Parity
6. **Settings page** - Currently renders `Screen_Settings` (design mock). Old UI had:
   - Custom instructions textarea (500 char limit) - `GET/POST /api/custom-instructions`
   - Change password form - `POST /auth/change-password`
   - Connected services (Google/Microsoft/Meta OAuth) - `GET /api/connectors`
7. **Admin page** - Currently renders `Screen_Admin` (design mock). Old UI had:
   - User table with CRUD - `GET/POST/PUT/DELETE /admin/api/users`
   - Toggle user active/suspended
   - Reset user passwords - `PUT /admin/api/users/:id/password`
8. **Vault page** - Currently a stub. Old UI had:
   - File list with upload/delete - `GET/POST/DELETE /api/vault/*`
   - File preview
9. **Tasks/Reports page** - Currently a stub. Old UI had reports:
   - Report runs list - `GET /api/reports/runs`
   - Task list - `GET /api/reports/tasks`
   - Unread badge count - `GET /api/reports/unread-count`

### P2 - Polish
10. **Brand switcher** - Shows mock "Meridian Bank". Should show actual brand or hide if single-tenant.
11. **User block** - Shows mock "Amira Khalil / Chief Risk Officer". Should show real user from auth.
12. **Theme toggle** - Sun/moon buttons exist in header but `onToggleTheme` isn't passed through from AppShell. Need to wire the toggle.
13. **Google Sans font** - Not available on Google Fonts (proprietary). Replace with Inter in `tokens.ts` body font.

## Architecture Notes

### API Response Formats (already fixed)
- `GET /api/conversations` -> array directly (not `{ conversations: [...] }`)
- `POST /api/conversations` -> object directly (not `{ conversation: {...} }`)
- `GET /api/conversations/:id` -> object with `.messages` array
- `GET /auth/me` -> user object directly (not `{ user: {...} }`)
- `POST /auth/login` -> `{ ok: true, user: {...} }`
- SSE: `{"type":"chunk","text":"..."}` and `{"type":"done",...}`

### Key Files
- `src/frontend/src/pages/Chat.tsx` - Main chat, wired to real API
- `src/frontend/src/hooks/useStreamChat.ts` - SSE streaming (fixed for OpenBrain format)
- `src/frontend/src/hooks/useConversations.ts` - CRUD conversations (fixed response types)
- `src/frontend/src/hooks/useAuth.ts` - Auth with TanStack Query (fixed response types)
- `src/frontend/src/design/chat.tsx` - LeftRail, Message, Composer, ChatHeader components
- `src/frontend/src/design/screens-a.tsx` - Screen_Home (accepts real messages)
- `src/frontend/src/design/tokens.ts` - Theme tokens, ThemeContext
- `src/frontend/src/stores/chat.ts` - Zustand chat state
- `src/frontend/src/lib/api.ts` - Fetch wrapper (401 redirect skip on /login)
- `src/index.js` - Express SPA routes at line ~150 (BEFORE auth middleware)

### Old Frontend Files (reference for parity)
- `src/routes/pages.js` - Login, admin, settings pages
- `src/routes/chat-page.js` - Chat UI with sidebar, conversation list
- `src/routes/vault-page.js` - Vault file manager
- `src/routes/reports.js` - Reports/tasks page
- `src/routes/mission-control.js` - Mission control (admin)

### Design System
- Inline React styles (NOT Tailwind)
- Theme via `useTheme()` from `@/design/tokens`
- Fonts: Parkinsans (display), body should be Inter (Google Sans unavailable)
- Gold accent: #FFC01C, Dark bg: #0A0A0A

### Build & Deploy
```bash
cd /Users/vineet/ikawn-openbrain
cd src/frontend && npx vite build
cd ../..
git add -f src/frontend/dist/ src/frontend/src/
git commit -m "..."
git push origin main
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only
```

## Recommended Approach
1. Start with P0 chat parity (conversation sidebar + switching + markdown)
2. Then wire Settings with real API calls
3. Then wire Admin with real user CRUD
4. Then wire Vault
5. Polish (user identity, brand switcher, font fix)

Each page can reference its old implementation in `src/routes/` for the exact API calls and UI behavior.
