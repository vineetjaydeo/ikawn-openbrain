# Handoff: Build /admin/brands panel

**Created:** 2026-04-26 (after Fedfina demo prep session)
**Owner:** V (vineonardo@gmail.com)
**Status:** Ready to start. Demo lands 2026-04-27. Begin work 2026-04-28.
**Repo:** `/Users/vineet/ikawn-openbrain` (deploys: Lucy=`ikawn-openbrain`, Ruhi=`ruhi-os-brain`, Fedfina=`fedfina-openbrain`)

---

## Goal

Build an admin panel so users can manage brand training data without SQL. Today, every new brand requires a developer to write a seed script (see `scripts/seed-fedfina-brand.sql` for the template). That doesn't scale past the first client.

## Why this matters

V's words 2026-04-26: "I hope user will be able to manage the templates and brand material for training from the admin panel." Brand training is currently a black box — colors and fonts get extracted by the analyzer but no UI shows what was extracted, what's missing, or what's actually being injected into the LLM prompt. Every new client onboarding needs guided UX, not a developer with psql access.

---

## What already works (do NOT rebuild)

### DB tables (in `src/db.js`)
- `brand_context` — columns: `brand_id, display_name, industry, tone, tone_of_voice, target_audience, brand_guidelines, preferences (jsonb), system_prompt_override, context_injection, updated_at`. UNIQUE on `brand_id`.
- `brand_knowledge` — columns: `brand_id, doc_type, content, updated_at`. UNIQUE on `(brand_id, doc_type)`.
- `vault_items` — file_type='brand-profile' rows hold extracted profiles from uploaded PPTX templates. Contains `metadata` jsonb with `colors`, `fonts.embedded[]` (R2 URLs of TTF binaries), `logo`.

### Endpoints (in `src/routes/upload.js` and elsewhere)
- `POST /api/upload/brand-asset` — accepts `.pptx`, fires async analysis via `src/services/pptx-template-analyzer.js`. Persists extracted profile to `vault_items`, uploads font binaries to R2 under `brand-assets/fonts/{brandId}/`, uploads logo similarly.
- `requireAuth` and `requireAdmin` middleware in `src/auth.js`.
- `requireBrand` middleware sets `req.brand_id` from session.

### Helper utilities (shipped 2026-04-26)
- `src/utils/brand-context.js` — `getBrandContextForUser(userId, brandId, dbPool)` returns flat `{name, industry, tone, audience, colors, fonts, hasLogo}`. `buildBrandContextBlock(profile, {surface})` renders the BRAND CONTEXT block that gets injected into LLM system prompts. **Reuse this for the "preview prompt" feature.**
- `src/services/pptx-template-analyzer.js` — `analyzeTemplate()` extracts colors, fonts, logos from uploaded PPTX. Has `extractEmbeddedFonts()` for TTF binaries. `saveBrandProfile()` upserts to vault_items + R2.
- `src/services/pptx-font-embedder.js` — `embedFonts(buffer, fonts)` injects font binaries into generated PPTX. `resolveWebSafeFont(name)` maps Google Fonts to Calibri/Georgia/Consolas.

### Routing/auth pattern to follow
- `src/routes/admin-api.js` — existing admin routes pattern. New routes go here OR a new `src/routes/admin-brands.js` mounted before `chatApi` in `src/index.js`.
- Frontend admin pages: check existing pattern for how admin UI is served. Likely either Express+EJS (server-rendered) or a small static route. **Read `src/routes/admin-api.js` and check `src/index.js` route mounting before deciding.**

---

## Scope (MVP, ~4-6 hours)

### Pages

**1. `/admin/brands` — list view**
- Table of all brands (rows from `brand_context` joined with vault_items count)
- Columns: brand_id, display_name, industry, has_template (bool), has_logo (bool), font names, last updated
- Action: "Edit" link per row → goes to `/admin/brands/:brandId`
- Action: "+ New brand" button → `/admin/brands/new`

**2. `/admin/brands/:brandId` — detail/edit view**
Single page split into 4 sections:

**(a) Identity** — editable form
- display_name, industry, tone, tone_of_voice, target_audience, brand_guidelines (textarea)
- Save → PUT /api/admin/brands/:brandId

**(b) Visual** — readonly + actions
- Show extracted colors (swatches), fonts (heading/body names), logo preview
- Source: `vault_items` row with file_type='brand-profile', metadata jsonb
- Action: "Re-run analyzer on uploaded template" button (POST /api/admin/brands/:brandId/reanalyze)
- Action: Override colors/fonts manually (writes to `preferences` jsonb in brand_context — same shape used by Fedfina seed)

**(c) Templates & Assets**
- Upload PPTX template → triggers existing `/api/upload/brand-asset` flow
- List of uploaded templates (vault_items where brand_id matches and file_type='brand-profile' or 'pptx-template')
- Per row: filename, uploaded_at, "Re-analyze", "Delete"
- Upload reference PDFs (brand guidelines, voice docs) → write to `brand_knowledge` with doc_type chosen by user

**(d) System Prompt Preview**
- Render the BRAND CONTEXT block exactly as the LLM will see it
- Use `buildBrandContextBlock(profile, {surface: 'general'})` from `src/utils/brand-context.js`
- Show 4 surface variants in tabs: general / pptx / document / spreadsheet
- Read-only, but includes "Copy" button

**3. `/admin/brands/new` — create flow**
- Form: brand_id (slug), display_name, industry, tone, target_audience
- Save → INSERT brand_context row → redirect to detail view to upload template

### API endpoints to add (in `src/routes/admin-brands.js`)

```
GET    /api/admin/brands                  — list all brands with counts
GET    /api/admin/brands/:brandId         — full profile (brand_context + vault items + brand_knowledge)
POST   /api/admin/brands                  — create new brand_context row
PUT    /api/admin/brands/:brandId         — update brand_context fields
DELETE /api/admin/brands/:brandId/asset/:vaultId — delete a vault_item
POST   /api/admin/brands/:brandId/reanalyze — re-run analyzer on existing uploaded template
GET    /api/admin/brands/:brandId/preview-prompt?surface=pptx — return rendered BRAND CONTEXT block
POST   /api/admin/brands/:brandId/knowledge — add/update brand_knowledge entry (doc_type + content)
DELETE /api/admin/brands/:brandId/knowledge/:docType — remove brand_knowledge row
```

All routes wrapped with `requireAdmin`.

### Frontend stack decision

**Recommendation: Express + EJS + vanilla JS + Tailwind** (matches existing admin pages, no new build pipeline).

Reasons:
- Existing admin pattern in `src/routes/admin-api.js` is server-rendered.
- We already have Tailwind config in the project.
- A React island would require setting up Vite again (we already have one for `/design` — don't add another).
- 4-6hr scope is achievable with EJS + small JS for upload progress and tab switching.

**Alternative if V wants polish:** Mount inside the existing `design-app` Vite SPA as a sub-route. But that adds complexity since design-app is auth-gated by `requireAuth` not `requireAdmin`.

---

## Tech debt / things to watch

1. **Font embedding requires re-uploading templates.** Existing `vault_items` rows from before 2026-04-26 don't have `metadata.fonts.embedded[]` because the `extractEmbeddedFonts` code didn't exist yet. The "re-analyze" action should re-run `pptx-template-analyzer.js` on the existing R2-stored template file (if persisted) OR prompt user to re-upload.

2. **`brand_id` slug rules.** Currently brand_id is a free-text column with UNIQUE constraint. New-brand form should validate: lowercase, alphanumeric + hyphens, no spaces. Suggest auto-generating from display_name (`Fedbank Financial Services Limited` → `fedbank-financial-services` or `fedfina`).

3. **Multi-tenant isolation.** Every API route MUST filter by `req.brand_id` AND check requireAdmin scope. Don't trust the URL `:brandId` param alone — check it matches the admin's allowed brands. See how existing admin routes scope this.

4. **The `preferences` jsonb shape** in `brand_context` is what `buildBrandContextBlock` reads. Confirm shape against `scripts/seed-fedfina-brand.sql` (lines 35-77) — that's the authoritative example.

5. **No staging/preview env.** All deploys go straight to Lucy (ikawn-openbrain) per the repo's `feedback_lucy_first_ruhi_safe` rule. Test on Lucy first, then push to Ruhi (`ruhi-os-brain`) and Fedfina (`fedfina-openbrain`) only after V approves.

---

## Pre-deploy non-negotiables (from /Users/vineet/ikawn-openbrain/CLAUDE.md)

- ALWAYS run `npm run pre-deploy` before deploying (lint + 725-test gate)
- Deploy with `--no-cache` (Depot caches stale src layers)
- Use absolute paths, no emojis, no em-dashes, no OpenAI references
- Bump `package.json` patch version with each deploy

Deploy command for Lucy:
```bash
cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only --no-cache
```

For Fedfina (after Lucy verified):
```bash
cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app fedfina-openbrain --remote-only --no-cache --config fly.fedfina.toml
```

For Ruhi (only with V's explicit approval per `feedback_lucy_first_ruhi_safe.md`):
```bash
cd /Users/vineet/ikawn-openbrain && ~/.fly/bin/flyctl deploy --app ruhi-os-brain --remote-only --no-cache
```

---

## Build sequence (recommended)

**Phase 1 (~1.5hr) — Backend routes**
- Create `src/routes/admin-brands.js` with all 9 endpoints listed above
- Mount in `src/index.js` before chatApi (route order matters per CLAUDE.md hard rule #3)
- Write integration tests in `tests/integration/admin-brands.test.js` (mirror `tests/helpers/` pattern)
- Verify with `npm run pre-deploy`

**Phase 2 (~2hr) — List + Detail pages**
- Create EJS views: `views/admin/brands-list.ejs`, `views/admin/brand-detail.ejs`, `views/admin/brand-new.ejs`
- Create page-routes (separate from API routes) at GET `/admin/brands`, GET `/admin/brands/:brandId`, GET `/admin/brands/new`
- Style with existing Tailwind setup
- Wire upload UX with native `<input type=file>` + progress via fetch with ReadableStream

**Phase 3 (~1hr) — System prompt preview**
- Add tabs (general/pptx/document/spreadsheet) on detail page
- Fetch from GET /api/admin/brands/:brandId/preview-prompt?surface=X
- Server-side render uses `buildBrandContextBlock` from `src/utils/brand-context.js`

**Phase 4 (~1hr) — Test + ship**
- E2E test the flow on Lucy
- Verify with at least 2 brands (Fedfina + a fresh test brand)
- Run pre-deploy gate
- Deploy to Lucy → verify → deploy to Fedfina → verify

---

## Resume instructions for fresh session

1. Read `/Users/vineet/ikawn-openbrain/CLAUDE.md` (codebase rules) and this handoff in full
2. Read `/Users/vineet/.claude/projects/-Users-vineet/memory/MEMORY.md` (relevant: openbrain-admin-brand-panel.md, feedback_lucy_first_ruhi_safe.md, feedback_predeploy_checklist.md)
3. Read existing admin pattern: `/Users/vineet/ikawn-openbrain/src/routes/admin-api.js` and how it's mounted in `src/index.js`
4. Read the brand seed example: `/Users/vineet/ikawn-openbrain/scripts/seed-fedfina-brand.sql` (this shows the canonical preferences jsonb shape)
5. Read the helper that does prompt injection: `/Users/vineet/ikawn-openbrain/src/utils/brand-context.js`
6. Read the analyzer: `/Users/vineet/ikawn-openbrain/src/services/pptx-template-analyzer.js`
7. Confirm current state: `git log --oneline -10` should show `3b81f7a6 feat(fedfina): seed brand profile` and `68a0bc35 feat(brand): inject brand context into LLM`

Starter prompt for fresh session:
```
Read /Users/vineet/ikawn-openbrain/tasks/handoff-2026-04-26-admin-brands.md
in full and start Phase 1 (backend routes). Follow the build sequence
exactly. Use subagents aggressively per /Users/vineet/.claude/CLAUDE.md
operating mode rules. Deploy to Lucy first, never to Ruhi or Fedfina
without my explicit approval.
```

---

## Open questions to confirm with V before starting

1. **Stack:** Confirm Express + EJS, or push for React island in design-app?
2. **Multi-admin scoping:** Should one admin see all brands, or only their own brand_id? (Today's session suggests scope=own-brand for safety.)
3. **Re-analyze flow:** Do we keep the original uploaded `.pptx` in R2 so re-analyze works without re-upload? Or always require a fresh upload? (Storage cost vs UX.)
4. **Brand_knowledge editing:** WYSIWYG textarea, or just plain text? Plain text is faster to ship.

---

## Today's session deltas (context for the fresh agent)

Two commits landed on main (2026-04-26):
- `68a0bc35 feat(brand): inject brand context into LLM + embed brand fonts in PPTX` — Lucy + Fedfina + Ruhi-eligible code change. Currently deployed only to Lucy + Fedfina.
- `3b81f7a6 feat(fedfina): seed brand profile + voice rules from investor PDFs` — data-only artifacts.

Currently deployed:
- Lucy (ikawn-openbrain): v3.0.2, brand context injection live
- Fedfina (fedfina-openbrain): v3.0.2, brand profile seeded, demo 2026-04-27
- Ruhi (ruhi-os-brain): NOT YET DEPLOYED — V must approve before pushing

PRs/branches: none open. All work is on main.

Outstanding before admin panel work begins:
- Verify Fedfina demo lands 2026-04-27
- (Optional) Push 3.0.2 to Ruhi after demo if V approves
- Then begin admin panel build

---

End of handoff.
