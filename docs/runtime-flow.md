# EchoAway — Runtime flow (visual)

Visual companion to [`../PLAN.md`](../PLAN.md) §3 and the architecture
summary in [`../CLAUDE.md`](../CLAUDE.md). Two diagrams:

1. **Realtime audio + control loop** — what happens during a live voice
   conversation with the agent.
2. **Demo conversation sequence** — the seeded "move my hotel check-in"
   flow, end-to-end.

---

## 1. Realtime audio + control loop

```mermaid
flowchart TB
    subgraph Browser["apps/web (browser)"]
        direction TB
        Mic["Mic"]
        UI["Voice UI (packages/ui)"]
        LKClient["livekit-client"]
        Speaker["Speaker"]
    end

    LKCloud["LiveKit Cloud<br/>(managed media room)"]

    subgraph VoiceAgent["apps/voice-agent (Node + TS, @livekit/agents)"]
        direction TB
        AIC["@livekit/plugins-ai-coustics<br/>(noise cancellation)"]
        STT["STT<br/>(LiveKit default;<br/>optional Gradium STT WS)"]
        Gemini["Gemini reasoning<br/>(Google Gen AI Node SDK)"]
        Tools["Tool layer (HTTP fetch)"]
        TTS["Gradium TTS<br/>(custom @livekit/agents plugin)"]
    end

    subgraph Backend["apps/backend (NestJS + Prisma + SQLite)"]
        direction TB
        TokenAPI["POST /voice/token"]
        TripAPI["Trip + booking API<br/>(quote-change /<br/>confirm-change)"]
        Events[("VoiceActionEvent rows")]
        SSE["GET /events/stream"]
    end

    Tavily["Tavily Search<br/>(searchTravelContext tool)"]

    %% Control plane: token mint
    UI -->|1. POST /voice/token| TokenAPI
    TokenAPI -->|access token| UI

    %% Audio path: user -> agent
    Mic --> LKClient
    LKClient -->|2. WebRTC publish| LKCloud
    LKCloud -->|audio frames| AIC
    AIC -->|cleaned| STT
    STT -->|transcript| Gemini

    %% Reasoning + tool calls
    Gemini -->|3. select tool| Tools
    Tools -->|4. HTTP| TripAPI
    TripAPI -->|persist| Events
    Tools -.->|searchTravelContext| Tavily
    Tavily -.->|context| Gemini

    %% Live UI updates
    Events --> SSE
    SSE -->|5. SSE push| UI

    %% Audio path: agent -> user
    Gemini -->|6. response text| TTS
    TTS -->|PCM16| LKCloud
    LKCloud -->|7. WebRTC subscribe| LKClient
    LKClient --> Speaker
```

The numbered edges are the typical request order during a single
conversational turn. The two audio paths run in parallel with the SSE
channel.

**Why two channels (audio + SSE).** LiveKit carries the realtime audio
between user and agent. SSE carries structured events
(`change_suggested`, `change_confirmed`, …) from backend to UI, so the
web app can render action cards in lock-step with what the agent is
saying. Both flows originate from the same agent loop but travel over
different transports.

---

## 2. Demo conversation sequence

The seeded **Barcelona Long Weekend** demo. The outbound flight is
pre-loaded with a `flight_delay` `Disruption`; the hotel
`ComponentBooking.policy` is overridden to allow free same-day check-in
change ([`./seed-strategy.md`](./seed-strategy.md) §3.3).

```mermaid
sequenceDiagram
    actor User
    participant Web as apps/web
    participant Backend as apps/backend
    participant LK as LiveKit Cloud
    participant Agent as voice-agent
    participant DB as SQLite

    User->>Web: Press "Talk to Away"
    Web->>Backend: POST /voice/token
    Backend-->>Web: access token
    Web->>LK: join room (WebRTC)
    Agent->>LK: join room
    Agent->>Backend: create VoiceSession
    Agent->>Backend: VoiceActionEvent: session_started
    Backend-->>Web: SSE: session_started

    User->>LK: "my flight is delayed,<br/>can I move my hotel<br/>check-in to tomorrow?"
    Note over Agent: ai-coustics cleans audio<br/>STT -> transcript<br/>Gemini reasons

    Agent->>Backend: getTripByPhone(+49...)
    Backend-->>Agent: trip + components + bookings
    Agent->>Backend: getTripDisruptions(tripId)
    Backend-->>Agent: flight_delay + suggestedActions
    Agent->>Backend: quoteHotelCheckInChange(comp-stay, tomorrow)
    Backend->>DB: read ComponentBooking.policy
    Backend-->>Agent: ChangeQuote (fee=EUR 0)
    Agent->>Backend: VoiceActionEvent: change_suggested
    Backend-->>Web: SSE: change_suggested -> action card

    Agent->>LK: TTS "I can move it free of charge - confirm?"
    LK-->>User: audio

    User->>LK: "yes confirm"
    Agent->>Backend: confirmHotelCheckInChange(comp-stay, tomorrow)
    Backend->>DB: mutate booking.data + check_in event
    Backend-->>Agent: updated booking
    Agent->>Backend: VoiceActionEvent: change_confirmed
    Backend-->>Web: SSE: change_confirmed -> confirmed card

    User->>Web: hang up
    Agent->>Backend: POST /support-logs
    Agent->>Backend: VoiceActionEvent: session_ended
    Backend-->>Web: SSE: session_ended
```

The deterministic replay script (Phase 5) drives the same backend ↔
web sequence without LiveKit or Gemini in the loop — the SSE channel
emits the same events, so the UI can't tell the difference. This is
the demo backup if voice flakes during the live pitch.

---

## See also

- [`./erm.md`](./erm.md) — entity-relationship model (the entities flowing through these paths)
- [`./data-model.md`](./data-model.md) — layer rationale (especially §5 demo trip)
- [`./component-data-shapes.md`](./component-data-shapes.md) — `VoiceActionEvent.payload` and `ChangeQuote` shapes
- [`../PLAN.md`](../PLAN.md) — §3 architecture, §5 backend API, §7 phase plan
