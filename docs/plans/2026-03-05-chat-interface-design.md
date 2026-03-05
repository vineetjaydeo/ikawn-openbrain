# OpenBrain Chat Interface Design

## Overview
Full ChatGPT-like chat interface with streaming, conversation history, file uploads, web search, and MCP integration.

## Database (new tables)
- `conversations` — id, user_id, title, created_at, updated_at
- `messages` — id, conversation_id, role, content, attachments (JSONB), model, created_at
- `settings` — key (PK), value (JSONB) — admin config (primary_model, secondary_model)

## Features
- Streaming SSE responses from LLM
- Image paste/upload to R2 (`openbrain/uploads/{userId}/...`), GPT-4o vision
- Document upload (PDF text extraction), text injected into context
- Link content extraction (readability), injected into context
- Web search via Brave Search API (function calling)
- Admin model config: primary (fast/cheap) + secondary (powerful/on-demand)
- Extended MCP server with chat tools

## R2 Storage
- Shared bucket with ikawn-v3, all keys prefixed `openbrain/`
- Pattern: `openbrain/uploads/{userId}/{timestamp}_{filename}`

## New Dependencies
- @aws-sdk/client-s3, @aws-sdk/s3-request-presigner (R2)
- resend (email)
- pdf-parse (doc extraction)
- @mozilla/readability, jsdom (link reading)
- marked (markdown, client CDN)

## New Env Vars
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
- RESEND_API_KEY
- BRAVE_SEARCH_API_KEY (optional)
- ANTHROPIC_API_KEY (later)
