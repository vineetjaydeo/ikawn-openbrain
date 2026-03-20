# OpenBrain Architecture Rules

## Core Architecture

ONE intelligence codebase: OpenBrain.

Deployed in two environments:
- **Lucy** (ruhi.ikawn.in) — experimental, fast-moving (`RELEASE_CHANNEL=lucy`)
- **Ruhi** (ruhi-os-brain) — stable, enterprise-safe (`RELEASE_CHANNEL=ruhi`)

ikawn-v3 (OS frontend/backend) is NOT a brain. It is ONLY a thin proxy + UI layer.

---

## Non-Negotiable Rules

### 1. DO NOT duplicate intelligence outside OpenBrain

"Intelligence" includes:
- RAG / memory retrieval
- Prompt construction
- Persona logic
- Tool selection or execution decisions
- Agent routing

These MUST exist ONLY in OpenBrain.

### 2. ikawn-v3 must remain thin

**Allowed in ikawn-v3:**
- Authentication / session
- Extracting brand_id and user context
- API proxying to OpenBrain
- SSE streaming to client
- UI state and rendering
- Error handling / retries

**NOT allowed in ikawn-v3:**
- Building prompts
- Fetching or ranking memory
- Calling tools directly
- Reproducing agent logic

If you find yourself doing any of the above — STOP and move it to OpenBrain.

### 3. Single codebase, dual deployment

Lucy and Ruhi use the SAME codebase.

**DO NOT:**
- Fork logic into separate files for Lucy vs Ruhi
- Create parallel implementations

**ONLY use:** `process.env.RELEASE_CHANNEL`

This flag can:
- Enable/disable tools
- Adjust thresholds
- Tweak behavior slightly

This flag CANNOT:
- Create different architectures
- Fork core logic paths

### 4. BrandContext is mandatory

All requests must be wrapped in a structured context object:

```javascript
BrandContext {
  brand_id,
  user_id,
  user_name,
  conversation_id
}
```

This context must be passed through:
- RAG
- Persona builder
- Tools
- Agents
- Memory capture

NEVER pass raw brand_id manually across layers.

### 5. OpenBrain is the source of truth

All intelligence improvements must:
- Be implemented in OpenBrain
- Work in Lucy first
- Then be deployed to Ruhi

DO NOT implement logic directly in ikawn-v3 as a shortcut.

### 6. No "temporary duplication"

Do NOT say:
- "we'll duplicate this for now"
- "we can inline this logic here"
- "quick workaround in frontend"

Temporary duplication becomes permanent. Avoid it completely.

---

## Principle

If a change creates TWO systems instead of ONE system with flags, it is WRONG.
