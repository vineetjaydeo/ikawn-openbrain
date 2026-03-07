# OpenClaw + OpenBrain + ikawn-v3 Integration Design

**Date**: 2026-03-06
**Status**: Approved

## Architecture

```
Telegram User
    |
OpenClaw (Hostinger VPS, port 46533) - Telegram bot @ruhi_assistbot
    | REST API (X-Api-Key)
OpenBrain/Ruhi (Fly.io, ikawn-openbrain.fly.dev) - Memory & knowledge
    | REST API (Authorization: Bearer ik_xxx)
ikawn-v3 (Fly.io, os.ikawn.com) - Image/video generation
```

## Data Flows

1. Every OpenClaw conversation -> POST /capture to OpenBrain
2. Before OpenClaw responds -> GET /search from OpenBrain for context
3. OpenBrain/Ruhi -> Telegram via OpenClaw gateway webhook
4. OpenClaw -> ikawn-v3 via POST /api/external/generate (API key auth)

## Component 1: OpenBrain API Key Auth

Add X-Api-Key header check to /capture, /search, /recent, /stats, /decisions.
Reuse existing /api/ingest/openclaw pattern. Single env var OPENBRAIN_API_KEY.

## Component 2: OpenBrain Telegram Notify

POST /api/notify/telegram — internal endpoint.
Calls OpenClaw gateway to deliver message to Telegram.
Request: { message, urgency? }

## Component 3: ikawn-v3 Per-User API Key

- api_key column on users table (nullable, unique, indexed)
- Migration: 0010_api_keys.sql
- GET /api/settings/api-key — view masked key
- POST /api/settings/api-key/regenerate — generate new ik_xxxx key
- validateApiKey() middleware for external endpoints

## Component 4: ikawn-v3 External Generate

- POST /api/external/generate — API key auth
- Request: { agent, prompt, aspectRatio?, quality?, images? }
- Returns: { generationId, creditCost, status }
- GET /api/external/generations/:id — poll results (API key auth)

## Component 5: OpenClaw Skill

Custom skill in workspace:
- After AI response: capture to OpenBrain
- Before AI response: search OpenBrain for context
- /generate command: trigger ikawn-v3, poll, send image to Telegram

## Component 6: Notify Flow

OpenBrain -> OpenClaw gateway webhook -> Telegram delivery -> user sees message from @ruhi_assistbot
