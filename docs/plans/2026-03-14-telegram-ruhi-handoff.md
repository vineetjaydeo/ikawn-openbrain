# Handoff: Telegram as Primary Ruhi Channel

**Date:** 2026-03-14
**Status:** Ready to implement in fresh session

## What was just built
- Intelligence Phase C deployed — cohort analysis, dashboard, Telegram alerts
- Bot: @OpenBrain_Ruhi_bot (token in Fly secret `INTELLIGENCE_TELEGRAM_BOT_TOKEN`)
- Currently: bot sends alerts only, does NOT respond to messages

## What needs to happen
Make @OpenBrain_Ruhi_bot a **bidirectional Ruhi interface** — when V messages the bot, Ruhi responds with full intelligence context + RAG memory search.

## Key decisions needed
1. Should this bot REPLACE the existing OpenClaw Telegram flow (@ruhi_assistbot) or coexist?
2. Should it use the same Ruhi chat pipeline as ruhi-chat.js (Anthropic Claude streaming) or a lighter model?
3. Conversation history — store in ob_conversations (like web chat) or memories table?

## Implementation approach
1. Register webhook: `POST https://api.telegram.org/bot{TOKEN}/setWebhook` → `https://ikawn-openbrain.fly.dev/webhooks/intelligence-telegram/{TOKEN}`
2. Add route handler in `src/routes/webhooks.js` (or new file) that:
   - Receives incoming message
   - Searches memory (RAG) for context
   - Injects latest intelligence snapshot
   - Calls Ruhi chat pipeline (streamChatAnthropic or non-streaming variant)
   - Responds via `sendTelegramMessage()` from `src/utils/telegram.js`
3. Handle long responses — Telegram has 4096 char limit, may need to split

## Existing infrastructure to reuse
- `src/utils/telegram.js` — sendTelegramMessage() already built
- `src/routes/ruhi-chat.js` — Ruhi chat pipeline (RAG + intelligence injection + Claude streaming)
- `src/routes/webhooks.js` — existing webhook handling pattern (GitHub + OpenClaw Telegram)
- `src/ruhi/persona.js` — buildSystemPrompt()

## Fly secrets already set
- `INTELLIGENCE_TELEGRAM_BOT_TOKEN` = 8640927883:AAGHZ6Yaas3CJbk3w9sG3BmYX6YCyOOyzPQ
- `INTELLIGENCE_TELEGRAM_CHAT_ID` = 534771402

## Files to read first
- `src/routes/webhooks.js` — see existing Telegram webhook pattern
- `src/routes/ruhi-chat.js` — Ruhi chat pipeline to reuse
- `src/utils/telegram.js` — already supports reply_markup, extend for general responses
