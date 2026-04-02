# Handoff: Mobile Sidebar Touch Fixes

## Context
Lucy (OpenBrain) v2.5.0 was just deployed with mobile UI overhaul. Two remaining issues on the sidebar:

## Issue 1: Double-tap on sidebar items
`:hover` CSS on `.conv-item` and `.panel-nav-item` causes first tap to trigger hover state on mobile, requiring a second tap to actually navigate. Fix by scoping hover effects to hover-capable devices only.

## Issue 2: Sidebar text too small / not touch-friendly
`.conv-item` currently uses `font-size: 0.78rem; padding: 7px 10px` — too small for touch targets. Apple HIG recommends minimum 44px touch targets.

## Files to edit
- `src/routes/chat-page.js` — single monolithic file with all CSS + JS + HTML

## Key CSS locations (line numbers approximate after recent edits)
- `.conv-item` base styles — search for `.conv-item {` (~line 296)
- `.conv-item:hover` — immediately after
- `.panel-nav-item` — search for `.panel-nav-item` (~line 230)
- Mobile `@media (max-width: 768px)` block — search for `RESPONSIVE` (~line 1455)

## Recommended fix

### 1. Wrap hover effects in `@media (hover: hover)`
Find:
```css
.conv-item:hover { background: var(--bg-hover); color: var(--text); }
```
Replace with:
```css
@media (hover: hover) {
  .conv-item:hover { background: var(--bg-hover); color: var(--text); }
}
```
Do the same for `.panel-nav-item:hover` and any other sidebar hover styles.

### 2. Add touch-friendly sizes in mobile breakpoint
Inside `@media (max-width: 768px)`:
```css
.conv-item {
  font-size: 0.88rem;
  padding: 12px 12px;
  min-height: 44px;
}
.panel-nav-item {
  font-size: 0.88rem;
  padding: 10px 12px;
  min-height: 44px;
}
.conv-group-label { font-size: 0.72rem; }
.conv-item-actions { display: none; } /* show on long-press or swipe instead */
```

## Deploy
```bash
npm run pre-deploy
~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --build-arg "CACHE_BUST=$(date +%s)"
~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only --build-arg "CACHE_BUST=$(date +%s)"
```

## Issue 3: Remove V & L avatar letters in chat
The chat conversation UI shows "V" for user messages and "L" for Lucy's replies as circle avatars. Remove these — they add clutter. Search for `msg-avatar` in `chat-page.js` — both the CSS and the JS that creates avatar elements (`assistantRow`, `createMessageElement`). Either hide them with `display: none` or remove the DOM creation entirely.

## Verify with Playwright
Resize to 375x812, navigate to ruhi.ikawn.in, open sidebar, check that:
- Single tap navigates to conversation (no double-tap needed)
- Font size is readable
- Touch targets are at least 44px tall
