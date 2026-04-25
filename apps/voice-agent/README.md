# @echoaway/voice-agent

Text-mode voice concierge — Phase 5. The LLM driver is
`@livekit/agents-plugin-google` (LiveKit's universal LLM-plugin family),
so swapping providers later (OpenAI, Anthropic, Cerebras…) is one import
change away — tools and prompt stay put. The full LiveKit *room*
connection (audio, STT/TTS) lands in Phase 6/7.

Two modes:

| Mode | When |
|---|---|
| `yarn agent:cli` | Real Gemini conversation through the LiveKit plugin. Type, see assistant replies + tool calls. |
| `yarn agent:script` | Deterministic replay of the canonical demo flow. No API key, no LLM. Same backend / SSE / web UI. |

Both modes:
1. Open a `VoiceSession` for the loaded trip
2. Drive every action through the backend's tool API (`@echoaway/app`'s `apiClient`)
3. The backend persists each `VoiceActionEvent` and broadcasts it via SSE
4. The web UI ([http://localhost:5173](http://localhost:5173)) reflects the change live

## Scope

The hotel-check-in shift is **one** worked example. The agent is meant
to handle any travel request that fits the data model — hotel swaps,
activity reschedules, transfer re-quotes, destination context, future
disruption types. The system prompt explicitly tells the model to
compose tools to fit the request rather than running a fixed script.

When you add a new capability:
1. Extend `@echoaway/app/client.ts` with the matching wrapper if needed.
2. Drop a new file at `@echoaway/app/tools/<toolName>.ts` exporting a `Tool` value, then register it in `@echoaway/app/tools/index.ts`.
3. Mention guardrails in `src/agent/system-prompt.ts` only if the tool mutates state.
4. Write a unit test next to the source: `@echoaway/app/tools/<toolName>.spec.ts`.

The deterministic `demo-script.ts` is a frozen baseline of the canonical
demo — leave it alone when adding new tools; it exists to keep the wow
moment reproducible without a model.

## Three entry points

| Command | What it does | Audio? | Needs |
|---|---|---|---|
| `yarn dev:voice-agent` | LiveKit Agent worker — registers with LK Cloud, joins rooms when participants connect, runs Gemini Live (audio in/out + tools). Source: `src/worker.ts`. | yes (Gemini Live) | `LIVEKIT_*` + `GEMINI_API_KEY` |
| `yarn agent:cli` | Text REPL → Gemini via the LiveKit `LLM` plugin. Tools fire against the running backend. Source: `src/index.ts cli` → `src/cli.ts`. | no | `GEMINI_API_KEY` |
| `yarn agent:script` | Deterministic replay of the canonical demo flow, no LLM. Same backend / SSE / web UI. Source: `src/index.ts script`. | no | nothing |

## Quick start

```bash
# Terminal 1
yarn dev:backend

# Terminal 2
yarn dev:web

# Terminal 3 — pick one
yarn dev:voice-agent  # full audio pipeline; click the mic in the web UI
yarn agent:cli        # text-mode Gemini chat (no audio)
yarn agent:script     # offline replay (no Gemini)
```

For the audio path: click the mic in the phone header (or "New session"
in the side debug panel). The web app opens a fresh `VoiceSession`,
mints a token with `tripId/sessionId` metadata, joins
`echoaway-${sessionId}`. The worker is auto-dispatched into the same
room and brings Gemini Live as its voice.

## Tools

Implementations live in
[`@echoaway/app/tools/`](../../packages/app/src/tools/) — one file per
tool, registered in [`tools/index.ts`](../../packages/app/src/tools/index.ts) —
so the same registry powers the Gemini-driven CLI agent, the
deterministic script, and the web's debug button. Each tool exports a
JSON-schema function declaration plus an `execute()` that calls
`apiClient`. `sessionId` is threaded into every mutation so the
persisted `VoiceActionEvent` reaches the web via SSE.

| Tool | Backend | Mutates |
|---|---|---|
| `getTripByPhone` | `GET /trips/by-phone/:phone` | no |
| `getTripDisruptions` | `GET /trips/:id/disruptions` | no |
| `quoteHotelCheckInChange` | `POST /trips/:id/hotel/check-in/quote-change` | sets booking to `pending_change` |
| `confirmHotelCheckInChange` | `POST /trips/:id/hotel/check-in/confirm-change` | mutates booking + check_in event + component status |
| `createSupportLog` | `POST /support-logs` | persists log + emits `support_log_created` |
| `listAccommodations` | `GET /catalog/accommodations?destinationId=…` | no |
| `searchTravelContext` | (stub — Phase 8 plugs Tavily) | no |

## System prompt

[`src/agent/system-prompt.ts`](./src/agent/system-prompt.ts). Shapes the
persona, the open-ended scope ("compose whatever tools fit the
request"), the conversational arc, and the hard rules (always quote
before confirm; always ask for explicit confirmation).

## Tests

```bash
yarn test:voice-agent
```

Covers the LiveKit-plugin-driven agent loop with the SDK mocked. Tool
wrappers and the deterministic script live in `@echoaway/app` and are
covered there (`yarn test:app`).

## Limits

- **No audio yet.** Phase 6 adds ai-coustics, Phase 7 adds Gradium.
- **No LiveKit room joining yet.** The backend already mints LiveKit
  tokens (`POST /voice/token`) and the web app can join — the agent
  side joins when audio lands.
- **`searchTravelContext` is a stub.** Phase 8 will wire Tavily.
