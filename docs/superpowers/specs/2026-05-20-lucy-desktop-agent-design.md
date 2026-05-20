# Lucy's Desktop Agent (codename "Hands")

**Status:** Design approved, pending spec review
**Date:** 2026-05-20
**Owner:** V
**Repo:** ikawn-openbrain (Lucy) + new Fly app `lucy-desktop`

---

## 1. Context and goal

Lucy (the OpenBrain reasoning agent) currently acts only through server-side tools (content generation, bash, connectors). She cannot operate software that has no API, the way a person would by looking at a screen and clicking.

The goal is to give Lucy a controllable computer: a persistent Linux desktop she can delegate tasks to, so she can do work like web scraping and using WhatsApp Web. Lucy stays the reasoning brain. A subordinate GUI agent (UI-TARS) owns the desktop and runs the see-think-click loop, then reports structured results back to Lucy.

This is an internal, single-user capability for Lucy (ruhi.ikawn.in). It is explicitly NOT wired into Ruhi OS or any paying brand. It honors the "Lucy first, Ruhi safe" rule.

### The bet, stated honestly

GUI vision agents in 2026 are powerful but imperfect. State of the art succeeds on roughly half of open-ended computer tasks unaided. Narrow, repeatable web tasks (send a known message, scrape a known page, fill a familiar form) are reliable. Long, novel, multi-app workflows stall a meaningful fraction of the time. So this capability is a supervised junior assistant, not an autonomous worker.

The two originally-named tasks (scraping, WhatsApp) each have far simpler dedicated solutions (Serper plus Scrapling for scraping, already in the Leadspark stack; whatsapp-web.js for WhatsApp). The desktop agent earns its cost only as a GENERAL capability: doing arbitrary things across arbitrary apps, including software with no API. V chose to pursue that general capability, but to de-risk it with a minimal v1 that proves the loop before any large investment.

---

## 2. Scope

### v1 mission

Prove that Lucy can harness a controllable desktop, on one real task, built on the real architecture (not a throwaway demo). The expensive-to-change decisions get exercised by a single golden task. If the loop works, v2 is additive, not a rewrite.

**Golden task (v1 acceptance):** Lucy sends a WhatsApp message to V's own number. This forces every hard part to work at least once: persistent login, the live preview panel, the UI-TARS loop, the approval gate, and manual take-control.

**Kill criterion:** if UI-TARS-7B cannot reliably complete the WhatsApp send across a few tries even with take-control as backup, that is the cheap signal to fall back to whatsapp-web.js for that specific task and reserve the desktop agent for genuinely API-less work.

### In scope for v1

- New Fly app `lucy-desktop`: Dockerized Xfce, Chromium, the UI-TARS harness, x11vnc and noVNC, a persistent volume for logins.
- GUI brain: UI-TARS-1.5-7B via OpenRouter, behind a provider-agnostic config.
- Live preview panel: noVNC canvas embedded in the Lucy chat ("Lucy's Computer"), view-only with a take-control toggle.
- App WebSocket session: streams thought, action, awaiting_approval, result, error; carries approve, reject, abort.
- Approval gate: denylist plus Claude-judge fallback; parks before irreversible or outward actions.
- `delegate_to_desktop` tool in OpenBrain, brand-gated to ikawn only.
- Cost cap, max-steps cap, kill switch.

### Deferred (not v1)

- General task routing in Lucy (deciding when a request should go to the desktop vs other tools).
- MCP wrapper over the same contract (the planned v2 integration form).
- Multi-tenant or Ruhi OS productization.
- Provider swap to Volcengine doubao-1.5-ui-tars or a self-hosted GPU model (kept as a one-line config change).

---

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Lucy first, internal, single-user | Removes multi-tenant isolation; one persistent desktop that is genuinely hers |
| Control model | Two-brain delegation: Lucy = brain, UI-TARS = subordinate hands | Keeps "Claude is primary" intact; UI-TARS is a tool she talks to, contains GUI failures |
| GUI brain | UI-TARS-1.5-7B via OpenRouter, provider-agnostic harness | India-friendly, no China account, cheapest; Volcengine and self-host are config swaps |
| Desktop host | New Fly app, Dockerized Linux desktop, persistent volume | Stays in the Fly ecosystem and existing flyctl deploy flow |
| Integration | Live WebSocket session for v1, MCP wrapper later | Watching her work live builds trust; the WS vocabulary becomes the MCP surface |
| Preview UX | noVNC canvas embedded in chat, view-only plus take-control | Manus-style "computer" panel; take-control turns failures into nudges |
| Safety | Autonomous on reads and drafts, approval gate before sends | Machine is wired to real accounts; outward actions are irreversible |
| v1 scope | Minimal slice on the real architecture, one golden task | De-risk the bet cheaply before large investment |

---

## 4. Architecture overview

```
  V --chat--> Lucy (OpenBrain)  --app WebSocket-->  Desktop Agent (Fly app: lucy-desktop)
              Claude = brain      <--events------    Xvfb + Xfce + Chromium (logged-in sessions)
                   |                                 UI-TARS harness (screenshot -> model -> act)
                   |                                 Control server (WS + approval gate)
                   v                                 x11vnc + noVNC  --> embedded live panel in chat
            chat UI:                                 Fly volume: Chromium profile (persistent logins)
            - noVNC live panel                                |
            - activity timeline                               v each step
            - approve / reject                  OpenRouter -> bytedance/ui-tars-1.5-7b (image + text)
```

### Flow

1. V asks Lucy something that needs the desktop.
2. Lucy (Claude) calls `delegate_to_desktop(goal)`.
3. The tool opens a WebSocket to `lucy-desktop` and sends the goal.
4. The control server runs the UI-TARS loop. For each step it captures a screenshot, calls UI-TARS via OpenRouter, parses the chosen action, and executes it with xdotool, then repeats.
5. Two channels reach the chat UI in parallel: the noVNC canvas streams live pixels into the embedded panel, and the app WebSocket streams structured events (thought, action, awaiting_approval, result) into an activity timeline.
6. On a guarded action the loop parks (awaiting_approval) with a screenshot and a plain-English description; Lucy surfaces Approve and Reject; V's answer flows back over the WebSocket; the loop resumes or aborts.
7. On completion the control server returns structured results; Lucy synthesizes the final reply.

---

## 5. Components and interfaces

| Unit | Lives in | One job | Depends on |
|---|---|---|---|
| `delegate_to_desktop.tool.js` | OpenBrain `src/tools/` | Open WS, stream session into chat, return final result. Cost-tier critical, brand-gated to ikawn. | desktop WS client |
| `desktop.js` WS client | OpenBrain `src/connectors/` | Manage the socket, relay events to the chat SSE stream, send approve, reject, abort. | control server |
| Control server | `lucy-desktop` | Own one session at a time; run the harness; enforce the approval gate; expose authenticated WS and noVNC. | harness, classifier |
| UI-TARS harness | `lucy-desktop` | screenshot -> OpenRouter -> parse action -> execute via xdotool -> repeat. | OpenRouter, xdotool |
| Guarded-action classifier | `lucy-desktop` | Decide if the next action is irreversible or outward; if so, park for approval. | optional Claude judge |

### App WebSocket protocol (the contract that later becomes MCP)

Client to server:
- `start { goal, max_steps, cost_cap }`
- `approve { step_id }`
- `reject { step_id, reason }`
- `abort {}`

Server to client:
- `step { thought, action }`
- `screenshot { b64 }` (low-rate, for the timeline; live view comes from noVNC)
- `awaiting_approval { step_id, intent, screenshot }`
- `result { data, artifacts }`
- `error { msg }`

The control server holds exactly one active session (single-user Lucy). The same event vocabulary is delivered over WS in v1 and over MCP later, so the vocabulary is designed once.

### Configuration (provider-agnostic model)

The harness targets an OpenAI-compatible chat-completions endpoint. The model is a config value, not an architectural commitment:

- `MODEL_BASE_URL` (v1: OpenRouter base URL)
- `MODEL_NAME` (v1: `bytedance/ui-tars-1.5-7b`)
- `OPENROUTER_API_KEY` (Fly secret; never committed, never in this doc)

Swapping to Volcengine doubao-1.5-ui-tars or a self-hosted GPU model is a change of these three values.

---

## 6. The approval gate

The harness emits its intended action before executing. The classifier decides guarded vs free.

- **Free (execute immediately):** navigate, scroll, click links, read, type into search or compose fields, screenshot.
- **Guarded (park for approval):** the final commit of an outward or irreversible action. Pressing Send in WhatsApp or email, clicking buttons whose text matches a denylist (send, post, pay, buy, confirm, delete, submit, place order), or pressing Enter inside a messaging composer.

Detection is rule-based denylist first, with a lightweight Claude-judge fallback for ambiguous cases ("is this action irreversible or outward-facing? yes or no").

On a guarded action: emit awaiting_approval with the screenshot and a plain-English description (for example, "About to send 'See you at 5' to Mom on WhatsApp"). Lucy shows Approve and Reject in chat. Approve executes and continues. Reject asks UI-TARS to replan or aborts. Five minutes with no response auto-pauses; it never auto-sends.

---

## 7. Live preview UX

The chat gains a "Lucy's Computer" panel, modeled on the Manus computer panel.

- **Live pixels:** the noVNC canvas streams the desktop at a few frames per second into a resizable panel beside the conversation. This is the live window into the desktop working.
- **Activity timeline:** the app WebSocket feeds narration (opening WhatsApp Web, typing message, waiting for your OK to send) and the Approve and Reject controls, threaded into the chat.
- **Take-control:** noVNC flips from view-only to interactive, so V grabs the mouse, fixes a snag, and hands control back. This converts many "agent failed" outcomes into "agent needed a nudge," which is a large reliability multiplier for v1.

noVNC was already required for V to observe the machine; embedding it in chat is a UI placement decision, not new infrastructure.

---

## 8. Security and isolation

- The machine holds live WhatsApp and Gmail sessions, so it is treated as sensitive.
- Fly private networking (6PN) between ikawn-openbrain and lucy-desktop. The control server is not publicly exposed. Only an auth-token-gated noVNC endpoint is reachable for the embedded panel.
- Single-tenant Lucy only. The tool is brand-gated to ikawn and is not wired into Ruhi OS or any paying brand.
- The model provider (OpenRouter) sees screenshots. This is acceptable for internal Lucy. It is documented as NOT acceptable for regulated clients (Fedfina) without swapping to a self-hosted UI-TARS model.
- Secrets (OPENROUTER_API_KEY, noVNC token) are Fly secrets on lucy-desktop. They are never committed or written into specs. Because the working key was shared in plaintext during design, it should be rotated once the app is provisioned.
- Kill switch: V can abort a session from chat; the control server force-stops the harness.

---

## 9. Error handling and cost control

- Max-steps cap (default 40) and a per-session cost cap (default about 1.5 USD), mirroring the existing executor's cost discipline scaled up because each step is a screenshot plus a model call.
- Stuck detection: the same screenshot N times triggers abort and escalation to V.
- WebSocket disconnect: the control server pauses, holds state on the volume, and Lucy can resume.
- Login expired: a detected WhatsApp QR screen parks the session and pings V to re-scan via the noVNC panel.

---

## 10. Validated facts (de-risked before build)

Checked against the OpenRouter public models endpoint on 2026-05-20:

- `bytedance/ui-tars-1.5-7b` is live.
- Context length 128000 (ample for step history).
- Input modalities: image and text (confirms it accepts screenshots, the core premise).
- Pricing: 0.10 USD per 1M prompt tokens, 0.20 USD per 1M completion tokens (matches the cost estimate).

Outstanding Phase 0 validation: an actual screenshot-to-action call to confirm the 7B produces sensible GUI actions on a real screen, and a key-active check.

---

## 11. Cost summary (always-on, monthly)

| Component | Estimate |
|---|---|
| Fly 4 GB desktop machine | about 21.50 USD |
| Fly volume, 10 GB | 1.50 USD |
| Bandwidth | about 0.20 USD |
| OpenRouter UI-TARS usage, about 200 tasks | about 2 USD |
| **Total** | **about 25 USD per month** |

For contrast, hosting the model itself always-on (a GPU) would run several hundred USD per month and only pays off above millions of tasks per month, so the model stays a pay-per-use API.

---

## 12. Testing strategy (TDD)

- **Classifier unit tests** against a fixture set of actions. This is the riskiest unit; it must never mislabel a Send as free.
- **WebSocket protocol** tested with a mock harness (no real model calls) for the full approve, reject, abort round-trip.
- **`delegate_to_desktop`** tested against a mock WS server, asserting it streams events and handles the approval round-trip.
- **Golden-task manual UAT:** scrape a known value off a public page (deterministic), then draft and send a WhatsApp to V's own number, exercising the approval gate and take-control.

---

## 13. Build sequence (full plan to be produced by writing-plans)

- **Phase 0, prove the loop:** Docker image (Xfce, noVNC, Chromium, harness); run one task manually via OpenRouter; confirm a screenshot-to-action call produces a sensible action. Validate the key is active.
- **Phase 1, desktop app:** control server, WS protocol, classifier, persistent volume; deploy lucy-desktop.
- **Phase 2, Lucy integration:** delegate_to_desktop tool, WS client, the embedded live panel and approve and reject controls in the chat UI.
- **Phase 3, harden:** cost caps, kill switch, login recovery, tests, the two golden UATs.
- **Later:** MCP wrapper over the same contract.

---

## 14. Open risks

- **Model reliability.** UI-TARS-7B is the open release and may be weaker than the Volcengine doubao variant on hard screens. Mitigation: take-control as backup, and the one-line provider swap.
- **Session persistence.** Keeping WhatsApp logged in across restarts depends on the Chromium profile on the Fly volume surviving and not being invalidated by WhatsApp. Mitigation: login-recovery flow via noVNC.
- **Cost runaway.** A looping agent can burn steps. Mitigation: max-steps and per-session cost caps, stuck detection.
- **Real-world side effects.** A wrong message to a real contact. Mitigation: the approval gate on all outward actions, with a no-auto-send timeout.
- **Deploy CWD discipline.** A new Fly app means a new deploy target; deploy from the correct repo and config to avoid wrong-image outages.
