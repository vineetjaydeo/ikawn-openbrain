# OpenBrain v2 — Remaining TODO

## Next Session

- [x] **Connect OpenClaw to Ruhi** — DONE (commit b5dbfb7, deployed 2026-03-05)
  - Telegram webhook captures all OpenClaw conversations automatically
  - Rich media: images/docs → R2, voice → Whisper transcription, video → R2
  - 30-min conversation grouping, auto-hashtags, dedup by source_ref
  - Self-report endpoint: POST /api/ingest/openclaw (API key auth)
  - Fly secrets: TELEGRAM_BOT_TOKEN, OPENBRAIN_API_KEY

- [x] **Fix OpenClaw sync timeout** — MOOT (OpenClaw via Telegram replaces local OpenClaw sync)

- [ ] **GitHub webhook setup** — Register webhooks on vineonardo/ikawn-visual-os-v1 and ikawn-openbrain repos pointing to `https://ikawn-openbrain.fly.dev/webhooks/github` for real-time ingestion

- [ ] **Google Calendar connector** — Needs `GOOGLE_CALENDAR_CREDENTIALS` (service account JSON, base64) set on Fly

- [ ] **Anthropic Claude upgrade** — Optional: switch Ruhi from GPT-4o to Claude Sonnet for better persona adherence

## Completed (this session)
- [x] All 14 v2 brief steps — schema, connectors, Ruhi persona, MCP, deploy, verify
- [x] GitHub sync working (120 memories ingested)
- [x] Ruhi chat working with RAG
- [x] Claude Code MCP integration (openbrain server in ~/.claude.json)
- [x] CLAUDE.md rule for auto-capture
- [x] OpenClaw sync script (works but machine timeout issue)
