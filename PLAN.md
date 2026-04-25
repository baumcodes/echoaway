# EchoAway Voice Concierge — Big Berlin Hack Build Plan

## 0. Project thesis

**Build a real-time travel voice interface that still works in noisy real-world environments and can take visible actions inside a polished web app while the user speaks — with the architecture designed so the same UI and app logic can later power an Expo mobile app.**

This is not a generic chatbot. It is a prototype of the future EchoAway interface: a traveler talks naturally, the system understands the booking context, performs safe actions through tools, and updates the web UI live.

### Recommended track

**Primary track:** telli & ai-coustics — Voice AI that works in the wild
**Side challenge target:** Gradium — Best use of Gradium
**Optional side challenge:** Aikido — Most Secure Build

### Partner technologies to use

The hackathon requires at least 3 partner technologies from the resources list. Use these:

- [ ] **Google DeepMind / Gemini** — LLM reasoning + tool calling
- [ ] **Gradium** — realtime voice model / TTS / voice interaction component
- [ ] **Tavily** — destination/context enrichment or policy lookup
- [ ] **Lovable** — optional UI scaffolding / landing page / demo page
- [ ] **Aikido** — optional security scan, does not count as one of the 3 partner technologies according to the manual

Important: ai-coustics is central to the telli & ai-coustics track, but based on the manual FAQ, the required "3 provided technologies" are listed as Google DeepMind, Lovable, Gradium, Entire, Tavily, Aikido, Pioneer by Fastino. So do **not** rely on ai-coustics alone as one of the 3 partner technologies. Treat ai-coustics as the track-specific technology and use at least 3 from the resources list above.

---

## 1. Final demo concept

### Demo title

**EchoAway Voice Concierge: Travel support that still works in airport chaos**

### One-liner

A voice-first travel assistant that understands you in noisy real-world environments, retrieves your trip context, and updates the web app live while safely executing booking actions — with mobile kept as a follow-up target.

### Demo trip (matches `dataset/`)

The seed dataset describes a Germany→Spain travel corridor. The demo trip is therefore:

- **Trip:** "Barcelona Long Weekend"
- **Travelers:** Stephan (lead, phone-keyed) + Anna
- **Outbound flight:** Berlin (BER) → Barcelona (BCN), Vueling VY1885
- **Transfer:** BCN airport → Hotel Brisa Barcelona (Iberia Ground Transfers shuttle)
- **Stay:** Hotel Brisa Barcelona, 4 nights
- **Activities:** Sagrada Família tour + Tapas tour

The flight is **delayed** (seed-loaded `Disruption`), which is the trigger for the demo flow.

See [`docs/data-model.md`](./docs/data-model.md) §5 for the full demo trip composition.

### Demo flow

A traveler is at the airport. There is loud airport noise in the background. They open the EchoAway app and say:

> "Hey, my flight to Barcelona is delayed. Can you check if I can move my hotel check-in to tomorrow and show me what changes?"

The system:

1. Enhances noisy audio through ai-coustics.
2. Transcribes and understands the request.
3. Calls `getTripByPhone(+49…)` and loads the Barcelona Long Weekend.
4. Reads the seeded `Disruption` for the flight delay; surfaces the suggested action.
5. Calls `quoteHotelCheckInChange(componentId, newCheckInDate)`.
6. Web UI shows a live action card via a `change_suggested` event.
7. Agent explains price / policy impact ("free until tonight 18:00").
8. Agent asks for confirmation.
9. User confirms → `confirmHotelCheckInChange` mutates the booking + check-in event, emits `change_confirmed`.
10. Session ends → `SupportLog` written with transcript and actions.

### The "wow moment"

The voice agent says:

> "I found your Barcelona Long Weekend. Your check-in at Hotel Brisa is tonight, but because your Berlin flight is delayed, I can move it to tomorrow. The hotel allows this without a fee. I'm showing the change in the app now."

At the same time, the web UI animates into a confirmation card:

- Hotel: Hotel Brisa Barcelona
- Old check-in: Today
- New check-in: Tomorrow
- Fee: €0
- Status: Needs confirmation
- Button: Confirm change

---

## 2. Product scope

### Must-have

- [ ] Web-first demo app using shared EchoAway app logic
- [ ] NestJS backend with **Prisma + SQLite** persistence
- [ ] Catalog seeded from `dataset/*.json` (idempotent)
- [ ] One demo trip seeded with all components, bookings, events, and a triggering disruption
- [ ] Voice-agent service / worker
- [ ] ai-coustics integration or clearly demonstrated audio enhancement pipeline
- [ ] Gradium integration
- [ ] Gemini tool-calling agent
- [ ] Tavily-powered destination or travel-policy context enrichment
- [ ] Live UI updates from agent to web app
- [ ] One polished demo flow
- [ ] README with setup, architecture, tools used, and demo instructions
- [ ] 2-minute Loom demo

### Should-have

- [ ] Simple "audio intelligence metric"
- [ ] Clean web UI with EchoAway-like brand feel
- [ ] Support action log generated after the call
- [ ] Airport noise demo file
- [ ] Aikido scan screenshot

### Do-not-build

- [ ] Real booking APIs
- [ ] Real payments
- [ ] Real authentication
- [ ] Full EchoAway trip creation
- [ ] Full customer support dashboard
- [ ] Complex RAG / embeddings unless everything else is done

### Web-first implementation decision

For the hackathon, the main UI target is **web**, not mobile. This reduces Expo/audio/device friction and makes the demo easier to record, debug, and present. The product should still _feel_ like EchoAway's future mobile experience by rendering a phone-like app surface inside the browser.

The important architectural rule:

- `/apps/web` is the hackathon demo renderer.
- `/packages/ui` owns reusable EchoAway UI components.
- `/packages/app` owns app logic: API client, event mapping, demo state machine, tool/action orchestration helpers.
- `/apps/mobile` can exist as a thin Expo placeholder and later import the same packages.

This means we are not "building a website instead of an app." We are building the product experience in a faster renderer first, then keeping the app/mobile path open.

---

## 3. Architecture

```txt
/apps
  /web
    Next.js or Vite React web app
    Demo surface for trip, voice status, live assistant cards, confirmation UI

  /mobile
    Expo React Native placeholder
    Optional future target that reuses packages/ui and packages/app

  /backend
    NestJS API
    Prisma + SQLite for persistence (catalog + trip + ops layers)
    Tool endpoints
    WebSocket/SSE channel for live UI updates
    /prisma/schema.prisma   ← canonical schema (mirrors docs/erm.md)
    /prisma/seed/           ← catalog + demo-trip seed scripts

  /voice-agent
    Node + TypeScript LiveKit Agent (@livekit/agents)
    Joins a LiveKit Cloud room when the web app starts a voice session
    @livekit/plugins-ai-coustics — realtime noise cancellation (Phase 6)
    Custom LiveKit TTS plugin wrapping Gradium TTS WebSocket (Phase 7)
    @livekit/agents-plugin-google — Gemini reasoning + tool calling via LiveKit's universal LLM plugin (Phase 5; sibling plugins swap providers later)
    Tavily Node SDK — searchTravelContext tool (Phase 8)
    Tools call NestJS backend over HTTP; backend never touches audio
    Imports shared Zod schemas from @echoaway/types (yarn workspace)

/packages
  /types
    Shared TypeScript types + Zod schemas for ComponentBookingData,
    ComponentEventLocation, BookingPolicy, VoiceActionEventPayload, …

  /app
    Shared application logic, state machines, API clients, event mapping, demo flow orchestration
    /tools/                 ← agent tool registry (one file per tool); single source of truth for both the LiveKit agent and the deterministic demo script

  /ui
    Shared cross-platform UI primitives and feature components where feasible

/dataset                ← raw JSON inventory (committed)
/docs
  erm.md                ← canonical ERM (mermaid)
  data-model.md         ← layer-by-layer rationale
  component-data-shapes.md ← ComponentBooking.data + event location contracts
  seed-strategy.md      ← dataset → DB transformation pipeline
```

### Runtime flow

```txt
Browser mic → @livekit/components-react + livekit-client
  ↓ audio over WebRTC
LiveKit Cloud room (managed media)
  ↓ audio frames
Node + TS voice-agent (@livekit/agents)
  ↓
@livekit/plugins-ai-coustics  (noise cancellation)
  ↓ cleaned audio
STT (LiveKit default in Phase 5; Gradium STT WS optional in Phase 7)
  ↓ transcript
Gemini agent via @livekit/agents-plugin-google (universal LLM plugin) with tools
  ↓ HTTP
NestJS tool API → Prisma → SQLite (read trip / mutate booking / append event)
  ↓
VoiceActionEvent persisted
  ↓ SSE
Web UI updates live (parallel channel to the audio room)

Agent reply path:
Gemini text → Gradium TTS (custom LiveKit plugin) → LiveKit Cloud → Browser
```

**Stack note.** Voice-agent uses LiveKit Agents' Node SDK
(`@livekit/agents`), so it stays a yarn workspace and imports shared
Zod schemas from `@echoaway/types` directly. ai-coustics integrates via
[`@livekit/plugins-ai-coustics`](https://github.com/livekit/plugins-ai-coustics-node);
Gradium needs a small custom TTS class (no off-the-shelf plugin). First
install pulls LiveKit's `@livekit/rtc-node` native binary.

---

## 4. Data model

The data model is split into four layers; full design lives in:

- [`docs/erm.md`](./docs/erm.md) — canonical ERM (mermaid)
- [`docs/data-model.md`](./docs/data-model.md) — narrative + decision log
- [`docs/component-data-shapes.md`](./docs/component-data-shapes.md) — typed JSON shapes
- [`docs/seed-strategy.md`](./docs/seed-strategy.md) — dataset → DB pipeline

### Layers at a glance

| Layer      | Entities                                                                                                                                         | Source                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Catalog    | `Destination`, `Airport`, `Supplier`, `AccommodationProduct`, `ActivityProduct`, `FlightRouteProduct`, `FlightRouteLeg`, `GroundTransferProduct` | Seeded from `dataset/*.json` |
| Identity   | `Traveler`                                                                                                                                       | Seeded by demo               |
| Trip       | `Trip`, `TripTraveler`, `TripSegment`, `Component`, `ComponentBooking`, `ComponentEvent`                                                         | Composed by `seed:demo-trip` |
| Operations | `Disruption`, `VoiceSession`, `VoiceActionEvent`, `SupportLog`                                                                                   | Disruption seeded; rest live |

### The single rule the agent must respect

> A `Component` references **exactly one** catalog product, matching its
> `type`. The booking snapshot in `ComponentBooking.data` is the source of
> truth for what was booked; the catalog product is the source for "what
> alternatives exist".

### Key TypeScript types (defined in `packages/types`)

```ts
type ComponentType = 'flight' | 'accommodation' | 'activity' | 'transfer'
type ComponentStatus = 'planned' | 'quoted' | 'booked' | 'cancelled' | 'changed'
type BookingStatus = 'confirmed' | 'pending_change' | 'cancelled'
type EventType =
  | 'departure'
  | 'arrival'
  | 'check_in'
  | 'check_out'
  | 'pickup'
  | 'meeting_point'
  | 'activity_start'
  | 'activity_end'

type Trip = {
  id: string
  title: string
  status: 'draft' | 'booked' | 'in_progress' | 'completed' | 'cancelled'
  startDate: string
  endDate: string
  currency: 'EUR'
}

type ComponentBookingData =
  | FlightBookingData
  | AccommodationBookingData
  | ActivityBookingData
  | TransferBookingData

// Discriminated by `kind`. Full shapes in docs/component-data-shapes.md.

type VoiceActionEvent = {
  id: string
  type:
    | 'session_started'
    | 'assistant_listening'
    | 'assistant_thinking'
    | 'trip_loaded'
    | 'change_suggested'
    | 'confirmation_required'
    | 'change_confirmed'
    | 'change_rejected'
    | 'support_log_created'
    | 'session_ended'
  payload: Record<string, unknown>
  createdAt: string
}
```

---

## 5. Backend API plan

### Tool endpoints (called by agent)

- [ ] `GET /health`
- [ ] `GET /trips/:tripId`
- [ ] `GET /trips/by-phone/:phoneNumber`
- [ ] `GET /trips/:tripId/disruptions` — list active disruptions
- [ ] `POST /trips/:tripId/components/:componentId/quote-change` — generic; check-in change is one shape
- [ ] `POST /trips/:tripId/components/:componentId/confirm-change`
- [ ] `POST /trips/:tripId/hotel/check-in/quote-change` — typed shortcut, easier for the demo
- [ ] `POST /trips/:tripId/hotel/check-in/confirm-change` — typed shortcut
- [ ] `POST /support-logs`
- [ ] `GET /events/stream` or `WS /events`

### Catalog read endpoints (used by agent for fallbacks)

- [ ] `GET /catalog/destinations?countryCode=ES`
- [ ] `GET /catalog/accommodations?destinationId=…`
- [ ] `GET /catalog/activities?destinationId=…`
- [ ] `GET /catalog/flight-routes?fromIata=…&toIata=…`
- [ ] `GET /catalog/transfers?fromAirportId=…`

### Tool functions exposed to agent

```ts
getTripByPhone(phoneNumber: string)
getTripDisruptions(tripId: string)
quoteHotelCheckInChange(componentId: string, newCheckInDate: string)
confirmHotelCheckInChange(componentId: string, newCheckInDate: string)
createSupportLog(tripId: string, sessionId: string, transcript: string, summary: string, actions: string[])
searchTravelContext(query: string)                  // Tavily-backed
listAccommodations(destinationId: string)           // catalog fallback
```

The agent's primary path is `getTripByPhone → getTripDisruptions → quoteHotelCheckInChange → confirmHotelCheckInChange → createSupportLog`. Catalog endpoints are there for when the user asks "what other hotels are available?".

---

## 6. UI wireframes

The hackathon implementation should be **web-first**. Build the full demo experience in `/apps/web`, but keep the UI components and app-state logic inside packages so the experience can later be projected into `/apps/mobile`. Think of `/apps/web` as the first renderer, not the only product.

### Web demo shell

```txt
┌──────────────────────────────────────────────────────────────────────┐
│ EchoAway voice concierge                                  Demo / Live │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Left: product story + audio metric      Right: phone-like app demo  │
│                                                                      │
│  ┌──────────────────────────────┐       ┌────────────────────────┐   │
│  │ Airport Noise Test            │       │  EchoAway              │   │
│  │ Signal enhanced: yes          │       │  Barcelona Long Weekend │   │
│  │ Task completion: pending      │       │  Live assistant UI     │   │
│  └──────────────────────────────┘       └────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Screen A — Voice Concierge idle state — web demo layout

```txt
┌─────────────────────────────────────┐
│  EchoAway                     ◯     │
│                                     │
│  Barcelona Long Weekend             │
│  Apr 30 – May 4 · 2 travelers       │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Flight                         │  │
│  │ Berlin → Barcelona             │  │
│  │ Delayed · new arrival 23:40     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Stay                           │  │
│  │ Hotel Brisa Barcelona          │  │
│  │ Check-in: Today                 │  │
│  │ Check-out: +4 days              │  │
│  └───────────────────────────────┘  │
│                                     │
│          ┌────────────────┐         │
│          │  Talk to Away  │         │
│          └────────────────┘         │
└─────────────────────────────────────┘
```

## Screen B — Listening in noisy environment

```txt
┌─────────────────────────────────────┐
│  EchoAway                           │
│                                     │
│  Listening…                         │
│  Airport noise detected             │
│                                     │
│  Audio clarity                      │
│  Cleaned signal: 87%                │
│                                     │
│  You said:                          │
│  "My flight is delayed. Can I move  │
│   my hotel check-in to tomorrow?"   │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ AI is checking your booking…   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Screen C — Live action card

```txt
┌─────────────────────────────────────┐
│  EchoAway                           │
│                                     │
│  I found your Barcelona Long Weekend│
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Suggested change               │  │
│  │                                │  │
│  │ Hotel Brisa Barcelona          │  │
│  │ Old check-in: Today            │  │
│  │ New check-in: Tomorrow         │  │
│  │ Fee: €0                        │  │
│  │ Policy: Free until 18:00 today │  │
│  │                                │  │
│  │ [Confirm change]               │  │
│  │ [Keep original]                │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Screen D — Confirmed state

```txt
┌─────────────────────────────────────┐
│  EchoAway                           │
│                                     │
│  Change confirmed                   │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Hotel updated                  │  │
│  │ Hotel Brisa Barcelona          │  │
│  │ New check-in: Tomorrow         │  │
│  │ Confirmation sent              │  │
│  └───────────────────────────────┘  │
│                                     │
│  Support log created automatically  │
└─────────────────────────────────────┘
```

---

## 7. Detailed phase plan

# Phase 1 — Scope lock and repository setup

**Timebox:** Saturday 11:00–12:00

### Checklist

- [x] Create public GitHub repository
- [x] Initialize monorepo (yarn workspaces)
- [x] Add README skeleton
- [x] Create `/apps/web`
- [x] Create `/apps/mobile` as placeholder / later renderer
- [x] Create `/apps/backend` (NestJS scaffold; Prisma added in Phase 2A)
- [x] Create `/apps/voice-agent`
- [x] Create `/packages/types`
- [x] Create `/packages/app` for shared orchestration, API client, event state machine
- [x] Create `/packages/ui`
- [x] Move `/dataset` into the repo root (already present)
- [x] Move `/docs` into the repo root (already present)
- [x] Add shared TypeScript config
- [x] Add `.env.example`
- [x] Add architecture diagram to README pointing at `docs/erm.md`
- [x] Commit: `chore: initialize hackathon monorepo`

### Agent prompt

```txt
You are helping me build a hackathon monorepo for a project called "EchoAway Voice Concierge".

Create a clean TypeScript monorepo with:
- apps/web: Next.js or Vite React web app for the hackathon demo
- apps/mobile: Expo React Native placeholder for later adoption
- apps/backend: NestJS API (Prisma + SQLite added in Phase 2)
- apps/voice-agent: Node service placeholder
- packages/types: shared TypeScript types + Zod schemas
- packages/app: shared app logic, API client, demo-state machine, event mapping
- packages/ui: reusable UI components for the EchoAway Voice Concierge experience

Use simple, stable defaults. Do not over-engineer. Add README sections for:
- project description
- architecture (link to docs/erm.md, docs/data-model.md, docs/seed-strategy.md, docs/component-data-shapes.md)
- partner technologies used
- local setup
- demo flow

Add .env.example files for each app. The first version of packages/types should re-export the enums from docs/erm.md and provide Zod schemas for ComponentBookingData (placeholders are fine; they get filled in Phase 2A).

Acceptance criteria:
- yarn install works
- each app has a placeholder start command
- README explains the hackathon concept clearly
- code is clean enough for public GitHub
- web app is the primary demo target
- mobile app stays minimal but the structure makes later adoption obvious
```

---

# Phase 2A — Prisma schema and types

**Timebox:** Saturday 12:00–13:00

### Checklist

- [x] Add Prisma + SQLite to `/apps/backend`
- [x] Translate `docs/erm.md` into `apps/backend/prisma/schema.prisma`
- [x] Generate Prisma client
- [x] Run `prisma migrate dev --name init`
- [x] In `/packages/types`, add Zod schemas for:
  - [x] `ComponentBookingData` (discriminated by `kind`)
  - [x] `ComponentEventLocation`
  - [x] `BookingPolicy`
  - [x] `VoiceActionEventPayload`
  - [x] `SuggestedAction` / `Disruption.suggestedActions`
  - [x] `AudioIntelligenceMetric`
- [x] Re-export Prisma enums from `/packages/types` so non-backend code can use them
- [x] Add `assertComponentDataMatchesType(data, type)` helper
- [x] Commit: `feat(backend): prisma schema and shared types`

### Agent prompt

```txt
Implement the Prisma schema for EchoAway based on docs/erm.md.

Use SQLite with `provider = "sqlite"` and DATABASE_URL = "file:./dev.db".

Mirror docs/erm.md exactly:
- Enums: ComponentType, ComponentStatus, BookingStatus, EventType, DestinationType,
  SupplierCategory, TransferMode, TripTravelerRole, DisruptionType,
  DisruptionSeverity, DisruptionStatus, VoiceActionEventType
- Catalog tables: Destination (self-referential), Airport, Supplier,
  AccommodationProduct, ActivityProduct, FlightRouteProduct, FlightRouteLeg,
  GroundTransferProduct
- Identity: Traveler
- Trip: Trip, TripTraveler (composite PK), TripSegment, Component (with 4 nullable FKs to catalog products), ComponentBooking, ComponentEvent
- Ops: Disruption, VoiceSession, VoiceActionEvent, SupportLog

JSON columns: amenities, coordinates, daysOfWeek, openingHours, schedule,
defaultModificationPolicy, images, suggestedActions, audioMetric, payload,
location, data, policy, tags.

Indexes per docs/erm.md tables. Cascade deletes:
- Trip → TripSegment, Component, TripTraveler
- Component → ComponentBooking, ComponentEvent
- VoiceSession → VoiceActionEvent

Run prisma migrate dev --name init.

Then in /packages/types create Zod schemas matching docs/component-data-shapes.md:
- componentBookingDataSchema (discriminated union on `kind`)
- componentEventLocationSchema
- bookingPolicySchema
- voiceActionEventPayloadSchema
- suggestedActionSchema
- audioIntelligenceMetricSchema

Re-export Prisma enums via /packages/types/src/enums.ts so the web app and voice-agent
can use them without importing the backend.

Acceptance criteria:
- yarn workspace @echoaway/backend prisma:generate succeeds
- yarn workspace @echoaway/backend prisma:migrate:dev succeeds, creating dev.db
- yarn workspace @echoaway/types build succeeds
- A simple unit test in @echoaway/types validates a sample ComponentBookingData against the Zod schema
```

---

# Phase 2B — Catalog seed from dataset

**Timebox:** Saturday 13:00–14:00

### Checklist

- [x] Add `yarn seed:catalog` script wired through `prisma db seed`
- [x] Create `apps/backend/prisma/seed/catalog/` with one file per entity
- [x] Implement helpers in `seed/catalog/shared.ts`:
  - [x] `inferDestinationType(src)`
  - [x] `matchDestinationByCity(city)`
  - [x] `matchSupplier(name)`
  - [x] `parseCancellationToPolicy(raw)`
  - [x] `airportByIata(iata)`
- [x] Insert order per `docs/seed-strategy.md` §2.1
- [x] Idempotent upserts on source `_id`
- [x] Sanity script that prints row counts after seeding
- [x] Commit: `feat(backend): catalog seed from dataset`

### Agent prompt

```txt
Implement the catalog seed pipeline per docs/seed-strategy.md §2.

Read the JSON files from /dataset (committed in repo root) and upsert
into the Prisma catalog tables in this order:

1. Synthesize "dest-spain" Destination (country root)
2. dataset/destinations.json    → Destination (parent = dest-spain)
3. dataset/airports.json        → Airport (servesDestinationId via city match)
4. Synthesize Supplier rows (Hotelbeds, GetYourGuide, Tiqets, Viator, Iberia Ground Transfers, Airline Aggregator)
5. dataset/accommodations.json  → AccommodationProduct (link Destination + Hotelbeds supplier)
6. dataset/activities.json      → ActivityProduct (link Destination + matched supplier)
7. dataset/ground_transfers.json → GroundTransferProduct (link from Airport, to Destination/Accommodation by name match)
8. dataset/flight_routes.json    → FlightRouteProduct + FlightRouteLeg (link Airports by IATA)

All inserts are upserts keyed on the source `_id`. Re-running must not duplicate rows.

Implement the helpers in shared.ts as defined in docs/seed-strategy.md §2.2 onward.
Map the loose `cancellation_terms` strings into a structured `defaultModificationPolicy`
JSON via parseCancellationToPolicy.

Acceptance criteria:
- `yarn workspace @echoaway/backend seed:catalog` succeeds end-to-end
- Re-running it twice does NOT create duplicate rows
- Row counts after seeding:
  - Destination: 29 (28 + Spain root)
  - Airport: 20
  - Supplier: 6
  - AccommodationProduct: 80
  - ActivityProduct: 40
  - FlightRouteProduct: 3, FlightRouteLeg: 4
  - GroundTransferProduct: 3
- A README section in apps/backend/prisma/seed/README.md explains the pipeline
```

---

# Phase 2C — Demo trip seed

**Timebox:** Saturday 14:00–14:45

### Checklist

- [x] Add `yarn seed:demo-trip` (and `yarn seed:demo --reset`)
- [x] Create travelers (Stephan with phone, Anna without)
- [x] Create the "Barcelona Long Weekend" trip + 1 segment
- [x] Create 5 components (flight, transfer, accommodation, 2 activities)
- [x] Create 5 ComponentBookings with snapshots per `docs/component-data-shapes.md`
- [x] Create ~10 ComponentEvents with proper location JSON
- [x] Create the flight-delay Disruption with 2 suggested actions
- [x] Hotel ComponentBooking.policy must allow free same-day check-in change (override)
- [x] Sanity script: `yarn sanity` prints the demo trip and any disruptions
- [ ] Commit: `feat(backend): demo trip seed`

### Agent prompt

```txt
Implement the demo-trip seed per docs/seed-strategy.md §3 and docs/data-model.md §5.

The script composes the "Barcelona Long Weekend" trip referenced throughout PLAN.md.

Use date-fns or luxon for date math. Center the trip on `today + 7 days`.

Travelers:
- trav-stephan, phone +4915112345678 (lookup key for getTripByPhone)
- trav-anna, no phone

Trip + 1 segment in Barcelona. Components reference catalog products:
- comp-flight-out → flightRouteProduct: flt-ber-bcn-01
- comp-transfer    → groundTransferProduct: trf-bcn-hotelbrisa
- comp-stay        → accommodationProduct: hotel-bcn-01
- comp-act-sagrada → activityProduct: act-bcn-sagrada
- comp-act-tapas   → any tapas activity in Barcelona

For each Component, write a ComponentBooking with status='confirmed', a typed
`data` JSON per docs/component-data-shapes.md, and a `policy` JSON.
The hotel booking's `policy.modification` MUST allow free check-in change
until end of today — this is the demo override.

Write all ComponentEvents with destinationId + location JSON typed per
docs/component-data-shapes.md §3.

Finally, write a Disruption:
- type: 'flight_delay'
- severity: 'major'
- affectedComponentId: comp-flight-out
- message: human-readable
- suggestedActions: 2 actions (priority 1 = shift hotel check-in, priority 2 = requote transfer)

The script accepts --reset which deletes the demo trip cascade before recreating it.
Catalog rows are NOT deleted by --reset.

Acceptance criteria:
- `yarn seed:demo-trip` creates the trip
- `yarn seed:demo-trip --reset` re-creates the trip
- `yarn sanity` prints: trip header, all 5 components with their bookings, all events, the disruption with its suggested actions
```

---

# Phase 2D — Backend tool API

**Timebox:** Saturday 14:45–16:30

### Checklist

- [x] Implement `GET /health`
- [x] Implement `GET /trips/:tripId` (with components, segments, bookings, events, traveler list)
- [x] Implement `GET /trips/by-phone/:phoneNumber`
- [x] Implement `GET /trips/:tripId/disruptions`
- [x] Implement `POST /trips/:tripId/hotel/check-in/quote-change`
  - Reads ComponentBooking.policy
  - Computes proposed new check-in date and fee
  - Returns ChangeQuote shape (per docs/component-data-shapes.md §6)
  - Emits VoiceActionEvent { type: 'change_suggested', payload: { quote } }
- [x] Implement `POST /trips/:tripId/hotel/check-in/confirm-change`
  - Mutates ComponentBooking.data.checkInDate
  - Updates ComponentEvent(check_in).startsAt
  - Updates ComponentBooking.status / Component.status
  - Emits VoiceActionEvent { type: 'change_confirmed', payload: { quote } }
- [x] Implement `POST /support-logs`
- [x] Implement `POST /voice/token` — mints a LiveKit access token for the web app to join the agent's room (uses `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` from root `.env`)
- [x] Implement catalog read endpoints (5 from §5)
- [x] Validate all request bodies via Zod from /packages/types
- [x] OpenAPI / Swagger or curl-based README docs
- [x] Commit: `feat(backend): tool API on prisma`

### Agent prompt

```txt
Implement the NestJS tool API per PLAN.md §5.

Use Prisma (already configured in Phase 2A) and the seeded data (Phase 2B/2C).

Validate every request body using Zod schemas imported from /packages/types.

The two flagship endpoints — quote-change and confirm-change — must:

1. Read the Component + its ComponentBooking + the existing check_in ComponentEvent.
2. Apply BookingPolicy.modification rules:
   - if !canModify → 400 with reason
   - if now > policy.modification.freeUntil → fee = feeAfterCents
   - else fee = 0
3. Return the ChangeQuote payload from docs/component-data-shapes.md §6.
4. confirm-change additionally mutates:
   - ComponentBooking.data.checkInDate
   - ComponentBooking.data.nights (recompute against checkOutDate)
   - ComponentBooking.data.totalPriceCents (recompute as nights * pricePerNightCents)
   - ComponentEvent(check_in).startsAt to the new date at the same local time
   - ComponentBooking.status = 'confirmed' (still confirmed after change)
   - Component.status = 'changed'

Both endpoints persist a VoiceActionEvent row with the appropriate type and payload.

Catalog endpoints are simple selects with the listed filters.

Acceptance criteria:
- All endpoints can be exercised with curl scripts in apps/backend/README.md
- A quote followed by a confirm with the same date round-trips cleanly
- VoiceActionEvent rows accumulate as endpoints are called
- TypeScript build passes with no any
```

---

# Phase 3 — Web-first UI foundation

**Timebox:** Saturday 16:30–19:00

### Checklist

- [x] Build EchoAway-style web demo screen in `/apps/web`
- [x] Wire `/packages/app` API client to backend's GET /trips/:id and /trips/by-phone/:phone
- [x] Add trip overview card (reads real seeded trip)
- [x] Add flight delay card (reads disruption + flight component)
- [x] Add hotel booking card (reads accommodation component + booking)
- [ ] Install `@livekit/components-react` + `livekit-client` in `apps/web`; wrap LiveKit primitives behind a `/packages/app` hook so `apps/mobile` can reuse later
- [x] Add "Talk to Away" voice button (in Phase 5 it joins the LiveKit room; in Phase 3 it can stay a placeholder that triggers debug events)
- [x] Add assistant status states: idle, listening, thinking, suggesting, confirmed
- [x] Add live action card component (renders ChangeQuote)
- [x] Add confirmation modal/card
- [x] Add small audio clarity metric display
- [x] Add polished empty/loading/error states
- [x] Create reusable feature components in `/packages/ui`
- [x] Create app orchestration hooks/state machine in `/packages/app`
- [x] Keep `/apps/mobile` as a thin future shell that can later import the same packages
- [x] Commit: `feat: build web voice concierge UI`

### Agent prompt

```txt
Build a polished web-first UI for EchoAway Voice Concierge.

Architecture requirement:
- `/apps/web` should be the main demo renderer
- `/packages/ui` contains reusable UI components: TripOverviewCard,
  FlightDelayCard, HotelBookingCard, ActivityCard, TransferCard,
  VoiceStatusPanel, AssistantActionCard, ConfirmationCard, AudioMetricCard,
  TimelineEventList
- `/packages/app` contains shared state and integration logic:
  apiClient (wraps backend), useVoiceConciergeDemo hook,
  event-to-state mapping, demo flow state machine
- `/apps/mobile` may remain a placeholder

The web app loads the seeded trip via:
  apiClient.getTripByPhone('+4915112345678')

Render:
- EchoAway header
- Trip overview ("Barcelona Long Weekend")
- Flight delay card (driven by Disruption)
- Hotel card with current check-in
- Activity cards
- Large voice button
- Live assistant card area

The 4 wireframe screens (idle → listening → suggesting → confirmed) are
reachable. Initially they can be driven by debug buttons; Phase 4 wires
them to real backend events.

Use a premium travel-app aesthetic:
- soft background
- rounded cards
- clean typography
- calm but modern spacing
- responsive web layout that feels like a premium mobile product embedded in a browser demo

Acceptance criteria:
- Web UI renders the real seeded trip from the backend
- All 4 wireframe screens reachable
- No real auth or navigation required
- Code is clean and easy to adjust during the hackathon
```

---

# Phase 4 — Live web updates from backend events

**Timebox:** Saturday 19:00–20:30

### Checklist

- [x] Decide: WebSocket or Server-Sent Events _(SSE — one-way push, native EventSource, NestJS `@Sse()`)_
- [x] Implement backend event stream that broadcasts new VoiceActionEvent rows
- [x] Web app subscribes to event stream via `/packages/app`
- [x] UI changes state based on events
- [x] Trigger quote endpoint from a debug button → see UI update live
- [x] Trigger confirm endpoint from a debug button → see confirmed screen
- [x] Add fallback polling on /events with `since` query param
- [x] Commit: `feat: sync assistant events to web UI`

### Agent prompt

```txt
Connect the web UI to backend VoiceActionEvents through shared `/packages/app` logic.

Use the simplest reliable approach. Prefer Server-Sent Events; fall back to polling.

Backend:
- Expose `GET /events/stream` (SSE) that emits each new VoiceActionEvent
  as it is persisted
- Broadcast events when quote-change and confirm-change are called
  (already persisted in Phase 2D — just push them to subscribers)
- Also expose `GET /events?since=ISO_TIMESTAMP` for polling fallback

Web:
- Subscribe to backend events from /packages/app
- Map event types to UI states (use the state machine from Phase 3)
- show the live action card when a `change_suggested` event arrives
- show confirmed screen when `change_confirmed` arrives

Acceptance criteria:
- Calling backend quote endpoint manually updates the web UI within 1s
- Calling backend confirm endpoint manually updates the web UI within 1s
- The demo still works even if voice integration fails — debug buttons in
  the web app trigger the same events
```

---

# Phase 5 — Voice-agent skeleton: LiveKit Agent + Gemini tool calling

**Timebox:** Saturday 20:30–23:30 (extended; foundation for Phase 6 & 7)

This phase grows the Phase-1 Node placeholder at `apps/voice-agent/`
into a working LiveKit Agent built on `@livekit/agents`. Voice-agent
stays a yarn workspace and imports `@echoaway/types`.

### Checklist

#### Foundation (LiveKit Cloud + Node agent)

- [x] Create LiveKit Cloud account + project at <https://cloud.livekit.io/>
- [x] Install LiveKit CLI (`brew install livekit/livekit/livekit-cli` or platform equivalent)
- [x] `lk cloud auth` from the project root
- [x] Add `@livekit/agents`, `@livekit/agents-plugin-google`, `@livekit/rtc-node` to `apps/voice-agent` (LiveKit's plugin family is the universal LLM wrapper — swap to `@livekit/agents-plugin-openai` / `-anthropic` later by changing the plugin import, no agent rewrite). `livekit-server-sdk` lives in `apps/backend` for token minting.
- [x] Optional: bootstrap from `lk app create --template voice-pipeline-agent-node` and merge into the existing workspace structure _(skipped — existing workspace structure already works; bootstrap would be noise)_
- [x] LiveKit env vars are already in `.env.example` (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`); `GEMINI_API_KEY` is filled
- [x] Update `yarn dev:voice-agent` to start the agent worker against LiveKit Cloud (`tsx src/worker.ts dev`). Text-mode CLI moves to `yarn agent:cli`; deterministic replay stays at `yarn agent:script`.

#### Web ↔ Agent room wiring

- [x] In `apps/backend`: implement `POST /voice/token` (mints LiveKit access tokens — already in Phase 2D, extended in Phase 5 to carry `metadata: { tripId, sessionId }`)
- [x] In `apps/web`: phone-header mic button calls `/voice/token`, then joins the agent's room via `livekit-client` (one button: tap to start a new session, tap again to end)
- [x] Hide LiveKit primitives behind `/packages/app` hooks (`useVoiceRoom`) so `apps/mobile` can reuse later
- [x] Render the agent's audio track in the web app (hidden `<audio autoPlay>` in `PhoneStage` attached via `demo.voiceAudioRef`)

#### Agent behavior

- [x] Wire Gemini via `@livekit/agents-plugin-google` as the LLM. This is LiveKit's universal LLM-plugin abstraction — switching providers later (OpenAI, Anthropic, Cerebras, …) means swapping the plugin import + env key, not rewriting the agent. The text-mode `GeminiAgent` (`apps/voice-agent/src/agent/agent.ts`) drives the plugin's `LLM.chat()` directly so the LLM stays interchangeable. The same `LLM` instance will be handed to `VoicePipelineAgent` once the room layer lands.
- [x] Define LiveKit agent tools mirroring §5 — each tool is a thin `fetch` wrapper around the NestJS backend; reuse Zod input schemas from `@echoaway/types` for tool definitions:
  - `getTripByPhone(phoneNumber)`
  - `getTripDisruptions(tripId)`
  - `quoteHotelCheckInChange(componentId, newCheckInDate)`
  - `confirmHotelCheckInChange(componentId, newCheckInDate)`
  - `createSupportLog(tripId, sessionId, transcript, summary, actions)`
  - `searchTravelContext(query)` — stub here; Tavily lands in Phase 8
  - `listAccommodations(destinationId)` _(deferred — not on the demo path)_
- [x] System prompt: calm, human, concise, premium concierge; ALWAYS asks for confirmation before executing changes; never claims a real supplier was changed
- [x] Voice session lifecycle (HTTP to backend):
  - On room join → POST `VoiceSession`, emit `session_started`
  - On each tool call → emit `assistant_thinking` then the tool's resulting event
  - On change suggested → emit `change_suggested`
  - On user "yes" → emit `confirmation_required` then `change_confirmed`
  - On disconnect → emit `session_ended`, POST `createSupportLog`
- [x] STT / TTS in this phase: keep LiveKit defaults — Gradium custom plugin lands in Phase 7
- [x] No ai-coustics yet — that's Phase 6

#### Deterministic fallback (critical for demo backup)

- [x] Node script (`yarn agent:script`) that walks the canonical demo flow ("my flight is delayed, can I move my hotel check-in to tomorrow?" → "yes confirm") **without LiveKit or Gemini** in the loop. Persists identical `VoiceActionEvent` rows so the web UI behaves the same.

#### Verification

- [x] `yarn dev:voice-agent` starts the agent and connects to LiveKit Cloud _(verified — registered worker `AW_jjVvhPKC9EJf` in region `Germany 2`)_
- [x] Pressing "Talk to Away" in the web app joins the same room as the agent _(plumbing in place; needs a real browser + mic to verify end-to-end — flagging because the global CLAUDE.md says to be explicit when UI can't be tested headlessly)_
- [ ] Speaking the demo prompt triggers `quoteHotelCheckInChange` via the LLM plugin's tool calling _(same — needs real audio in a browser to verify; the deterministic script proves the tool-call path independently)_
- [x] Web UI updates via SSE within ~1s of each `VoiceActionEvent` _(verified end-to-end with the deterministic agent script)_
- [x] Replay script works fully offline with the backend running and produces an identical event sequence
- [x] Commit: `feat(voice-agent): livekit + gemini tool-calling skeleton`

### Agent prompt

```txt
Grow the Phase-1 placeholder at apps/voice-agent into a LiveKit Agent built
on @livekit/agents (Node + TypeScript). This phase is the foundation for
Phase 6 (ai-coustics plugin) and Phase 7 (Gradium TTS plugin); both build
on top of the agent skeleton you create here.

Foundation work first — don't skip:
1. Confirm a LiveKit Cloud project exists; run `lk cloud auth` locally.
2. Add @livekit/agents, @livekit/rtc-node, livekit-server-sdk to
   apps/voice-agent (it stays a yarn workspace).
3. Optionally bootstrap with `lk app create --template voice-pipeline-agent-node`
   and merge the result into the existing workspace.
4. Confirm LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / GEMINI_API_KEY
   are present in the root .env (already in .env.example).

Voice agent behavior (matches PLAN.md §5 tool API):
- Tools listed in the checklist above; each is a thin fetch wrapper around the
  NestJS endpoints. The agent never talks to the DB directly. Reuse Zod input
  schemas from @echoaway/types for tool definitions.
- LLM: Gemini via @livekit/agents-plugin-google. This is LiveKit's universal
  LLM-plugin abstraction — switching to OpenAI/Anthropic/etc. later is a
  one-line plugin swap, not an agent rewrite. Do NOT call @google/genai /
  @google/generative-ai directly from the agent loop; the plugin owns the SDK.
- STT/TTS: LiveKit defaults for now (Gradium custom plugin lands in Phase 7).
- ai-coustics: NOT in this phase (Phase 6).
- Personality: calm, human, premium concierge; ALWAYS asks for confirmation
  before executing changes; never claims a real supplier was changed.

Lifecycle (HTTP calls to NestJS backend, NOT direct DB writes):
- On room join → POST VoiceSession, emit `session_started` VoiceActionEvent
- On tool call → emit `assistant_thinking` then the tool's resulting event
- On change suggested → emit `change_suggested`
- On user "yes" → emit `confirmation_required` then `change_confirmed`
- On disconnect → emit `session_ended` and POST createSupportLog

Web side:
- Ensure @livekit/components-react + livekit-client are installed in apps/web
  (Phase 3).
- "Talk to Away" calls POST /voice/token (Phase 2D), then joins the room
  using VITE_LIVEKIT_URL.
- Hide LiveKit primitives behind /packages/app hooks (useVoiceRoom) so
  apps/mobile can reuse later.

Deterministic fallback (critical for demo):
- `yarn workspace @echoaway/voice-agent replay` — a Node script that takes a
  fixture transcript and walks the same tool sequence without LiveKit or
  Gemini. Used as a stable demo recording path if voice flakes during the
  live pitch.

Reference docs:
- LiveKit Agents Node SDK: https://docs.livekit.io/agents/
- LiveKit LLM plugins (universal LLM wrapper): https://docs.livekit.io/agents/integrations/llm/
- @livekit/agents-plugin-google: https://www.npmjs.com/package/@livekit/agents-plugin-google

Acceptance criteria:
- yarn dev:voice-agent starts the agent and connects to LiveKit Cloud
- Web app's "Talk to Away" joins the same room as the agent
- Speaking the demo prompt triggers quoteHotelCheckInChange via Gemini
- Web UI updates via SSE within 1s of each VoiceActionEvent
- Replay script works offline and produces identical VoiceActionEvent sequence
```

---

# Phase 6 — ai-coustics LiveKit plugin (noise cancellation)

**Timebox:** Saturday 23:30–01:30 (Sunday)

The LiveKit Agent skeleton from Phase 5 is the prerequisite. We add
[`@livekit/plugins-ai-coustics`](https://github.com/livekit/plugins-ai-coustics-node)
(Node) to the agent's input audio pipeline. The vendored
[`docs/ai-coustics/livekit-quickstart.md`](./docs/ai-coustics/livekit-quickstart.md)
documents the Node plugin but the wiring concept is the same.

### Checklist

#### Plugin install + wire-up

- [ ] Add `@livekit/plugins-ai-coustics` to `apps/voice-agent` (npm: <https://www.npmjs.com/package/@livekit/plugins-ai-coustics>)
- [ ] Verify auth requirement on install: the Node plugin needs only LiveKit Cloud auth; confirm the same for the Node plugin. If a separate ai-coustics key is needed, fill `AICOUSTICS_API_KEY` in `.env` (already scaffolded)
- [ ] Wire the plugin into the agent's input `AudioStream` per the plugin README
- [ ] Confirm the plugin loads (LiveKit Agents debug logs show ai-coustics in the chain)

#### Noisy demo source

- [ ] Vendor an airport-noise audio file at `apps/voice-agent/fixtures/airport-noise.mp3` (royalty-free or self-recorded)
- [ ] **Path A (preferred):** web app overlays the noise file as a virtual mic source via the LiveKit Browser SDK while the user speaks; agent processes through ai-coustics
- [ ] **Path B (fallback, see Risk Management):** ai-coustics Node SDK file processing using `docs/ai-coustics/example_file-processing_node.js` as the reference — pre-process a noisy sample offline, ship the cleaned audio + a synthesized transcript

#### Audio intelligence metric

- [ ] Compute and persist `VoiceSession.audioMetric` per `AudioIntelligenceMetric` (docs/component-data-shapes.md §5):
  - `scenario: 'airport_noise'`
  - `inputSignalToNoiseRatio` (estimated from raw audio energy)
  - `enhancedSignalToNoiseRatio` (estimated from cleaned audio energy)
  - `transcriptQuality` (average STT confidence over the session, fallback 0.85 if unavailable)
  - `taskCompleted`, `correctTripIdentified`, `correctActionSuggested`, `confirmationRequested` (booleans set by the agent based on lifecycle events)
  - `finalScore` per §8 weighting
- [ ] Web UI reads `VoiceSession.audioMetric` and renders the audio clarity card (component already scaffolded in Phase 3)

#### Verification

- [ ] Demo visibly references airport noise (toggle in the web app)
- [ ] UI shows audio was enhanced; metric numbers look credible
- [ ] `VoiceSession.audioMetric` row exists after the demo runs
- [ ] `apps/voice-agent/README.md` documents the ai-coustics plugin and the auth model
- [ ] Commit: `feat(voice-agent): ai-coustics plugin + audio intelligence metric`

### Agent prompt

```txt
Add the @livekit/plugins-ai-coustics Node plugin to the Phase-5 voice agent
and wire up the audio intelligence metric.

References:
- Plugin source: https://github.com/livekit/plugins-ai-coustics-node
- docs/ai-coustics/livekit-quickstart.md (Node flavor — wiring concept is
  the same; pattern-match to the Node plugin's README)
- docs/ai-coustics/index.md

Steps:
1. Install @livekit/plugins-ai-coustics in apps/voice-agent.
2. On install, verify whether a separate ai-coustics API key is required.
   Per the Node plugin docs, LiveKit Cloud auth alone is sufficient. If
   the Node plugin behaves the same, leave AICOUSTICS_API_KEY blank.
   Otherwise, fill it from https://developers.ai-coustics.io.
3. Wire the plugin into the Agent's input AudioStream per the plugin README.
4. Vendor a short airport-noise MP3 at apps/voice-agent/fixtures/airport-noise.mp3. (The browser decodes MP3 natively when mixing it as a virtual mic source — no conversion needed for Path A.)
5. Web app: add a "noisy environment" toggle that mixes the noise file into
   the LiveKit room as a virtual mic source while the user speaks.
6. On session end, compute and persist VoiceSession.audioMetric per
   AudioIntelligenceMetric (docs/component-data-shapes.md §5):
   - scenario, inputSNR, enhancedSNR, transcriptQuality, taskCompleted,
     correctTripIdentified, correctActionSuggested, confirmationRequested,
     finalScore (PLAN §8 formula)
7. Web UI reads VoiceSession.audioMetric and renders the audio clarity card.

Fallback (only if the plugin doesn't integrate cleanly in the time budget):
- Use the ai-coustics Node SDK directly via docs/ai-coustics/example_file-processing_node.js
- Pre-process the noisy fixture offline; ship the enhanced audio + a
  hand-written transcript through the same agent loop
- Persist the same audioMetric shape (computed from the offline run)

Acceptance criteria:
- Demo visibly references airport noise (toggle in the web UI)
- ai-coustics processes audio in real time via the LiveKit plugin (or the
  documented Node SDK fallback)
- VoiceSession.audioMetric is persisted with realistic numbers
- apps/voice-agent/README.md explains the integration
```

---

# Phase 7 — Gradium STT + TTS via custom LiveKit plugins

**Timebox:** Sunday 01:30–03:00

Both audio legs of the voice pipeline land on Gradium: speech-to-text
via `wss://api.gradium.ai/api/speech/asr`, text-to-speech via
`wss://api.gradium.ai/api/speech/tts`. Neither has an off-the-shelf
LiveKit plugin, so we implement two thin custom classes that conform
to `@livekit/agents`' `STT` / `TTS` interfaces.

> **Architectural switch from Phase 5.** Phase 5 wired the agent on
> Gemini Live (`@livekit/agents-plugin-google`'s `beta.realtime.RealtimeModel`)
> which handles **audio in + LLM + audio out** in a single websocket —
> there are no separate STT or TTS slots to swap into. Phase 7 has to
> migrate the `voice.AgentSession` backbone from `{ llm: RealtimeModel }`
> to the classic 3-piece pipeline `{ llm: LLM, stt: GradiumSTT, tts: GradiumTTS }`.
> The `Agent` definition (instructions + tools) does not change.
>
> The Phase-5 fallback (`RealtimeModel`) stays reachable via env flag
> for demo robustness — `USE_GRADIUM_VOICE=false` keeps the audio path
> identical to today, single-binary.

References: [`docs/gradium/index.md`](./docs/gradium/index.md),
[`docs/gradium/stt-websocket.md`](./docs/gradium/stt-websocket.md),
[`docs/gradium/tts-websocket.md`](./docs/gradium/tts-websocket.md),
[`docs/gradium/get-voices.md`](./docs/gradium/get-voices.md).

### Checklist

#### Account + voice selection

- [ ] Create Gradium org; obtain API key
- [ ] Add `GRADIUM_API_KEY` and `GRADIUM_VOICE_UID` to root `.env.example`
- [ ] List available voices via `GET /voices/` (docs/gradium/get-voices.md); pick a calm, clear, English-capable voice; pin its UID

#### Switch the agent backbone from RealtimeModel to 3-piece pipeline

- [ ] In `apps/voice-agent/src/worker.ts`, replace `new beta.realtime.RealtimeModel(...)` with `new LLM({ apiKey, model })` from `@livekit/agents-plugin-google` (the same plugin already in deps).
- [ ] Replace `new voice.AgentSession({ llm: realtime })` with `new voice.AgentSession({ llm, stt: gradiumStt, tts: gradiumTts })`. The `Agent` definition (instructions + tools) stays untouched.
- [ ] Wrap the construction in a single `buildAgentSession()` helper that selects between the Phase-5 RealtimeModel branch and the Phase-7 3-piece branch based on `USE_GRADIUM_VOICE`. One helper, one source of truth.
- [ ] Verify the worker still registers and joins rooms with the new backbone _before_ attaching either Gradium plugin (smoke test with a temporary stub STT/TTS such as `@livekit/agents-plugin-deepgram` if convenient — but don't keep it).

#### Custom LiveKit STT plugin (Gradium)

- [ ] Implement a TypeScript STT class in `apps/voice-agent` that conforms to `@livekit/agents`' `stt.STT` interface. Reference shape: `node_modules/@livekit/agents/dist/stt/stt.d.ts`.
- [ ] Open `wss://api.gradium.ai/api/speech/asr` on session start; auth via `x-api-key: $GRADIUM_API_KEY`.
- [ ] Stream the user's microphone PCM frames into the WebSocket; emit transcription events back to LiveKit (interim + final) per the framework's `SpeechEvent` shape.
- [ ] Pre-warm the WS on agent start; reconnect on drop.

#### Custom LiveKit TTS plugin (Gradium)

- [ ] Implement a TypeScript TTS class in `apps/voice-agent` that conforms to `@livekit/agents`' `tts.TTS` interface. Reference shape: `node_modules/@livekit/agents/dist/tts/tts.d.ts`.
- [ ] Open `wss://api.gradium.ai/api/speech/tts` on agent start; auth via `x-api-key: $GRADIUM_API_KEY`.
- [ ] On `synthesize(text)`: send the payload, stream returned audio chunks back to the framework in the expected format (PCM16 mono — verify against `@livekit/agents` docs).
- [ ] Pre-warm the WS connection on agent start to minimize first-token latency.
- [ ] Handle WS reconnect on drop.
- [ ] Wire both STT and TTS into the AgentSession via `buildAgentSession()`; gate the whole 3-piece path behind `USE_GRADIUM_VOICE=true`. `USE_GRADIUM_VOICE=false` reverts to the Phase-5 `RealtimeModel` path verbatim — no rebuild, no other env churn.

#### Documentation

- [ ] Document the voice + plugin in `apps/voice-agent/README.md`
- [ ] Update root README's Partner technologies row for Gradium ("Realtime voice / TTS — custom LiveKit plugin")
- [ ] Commit: `feat(voice-agent): gradium tts via custom livekit plugin`

### Agent prompt

```txt
Implement custom STT + TTS plugins for LiveKit Agents that call Gradium's
WebSocket APIs. Both audio legs (microphone → text and text → speaker)
run on Gradium.

IMPORTANT — architectural shift from Phase 5:
The Phase-5 agent uses Gemini Live (`beta.realtime.RealtimeModel` from
`@livekit/agents-plugin-google`), which handles audio in + LLM + audio
out as one websocket. There are NO `stt` or `tts` slots to swap into.
To plug in Gradium, migrate the AgentSession backbone from
`{ llm: RealtimeModel }` to `{ llm: LLM, stt: GradiumSTT, tts: GradiumTTS }`.
The Agent definition (instructions + tools) does not change.

References:
- docs/gradium/index.md
- docs/gradium/stt-websocket.md
- docs/gradium/tts-websocket.md
- docs/gradium/get-voices.md

Steps:
1. Verify GRADIUM_API_KEY and GRADIUM_VOICE_UID are filled in the root
   .env (placeholders already exist in .env.example).
2. Pre-flight: GET /voices/ to list available voices. Pick one with a calm,
   clear English voice. Pin the UID as GRADIUM_VOICE_UID.
3. Backbone switch in apps/voice-agent/src/worker.ts:
   - Replace `beta.realtime.RealtimeModel` with `new LLM({ apiKey, model })`
     from the same `@livekit/agents-plugin-google` package.
   - Build the AgentSession as `{ llm, stt: gradiumStt, tts: gradiumTts }`.
   - Wrap the construction in a single `buildAgentSession()` helper that
     selects between the RealtimeModel branch and the 3-piece branch
     based on USE_GRADIUM_VOICE. One source of truth, one env flag.
4. Implement a TypeScript STT class conforming to @livekit/agents' STT interface:
   - Open wss://api.gradium.ai/api/speech/asr on session start
   - Auth: x-api-key header on the WS upgrade
   - Stream user PCM into the WS; emit interim + final transcription events
     in the framework's `SpeechEvent` shape
   - Pre-warm WS on agent start; reconnect on drop
5. Implement a TypeScript TTS class conforming to @livekit/agents' TTS interface:
   - Open wss://api.gradium.ai/api/speech/tts on agent start (use the `ws` package)
   - Auth: x-api-key header on the WS upgrade
   - On synthesize(text): send payload, stream audio chunks back to LiveKit
     in the framework's expected format (PCM16 mono — verify against
     @livekit/agents docs)
   - Pre-warm WS on agent start; reconnect on drop
6. Wire both into the AgentSession via buildAgentSession(). Gate the whole
   3-piece-pipeline path behind USE_GRADIUM_VOICE=true. Leaving
   USE_GRADIUM_VOICE=false keeps the Phase-5 RealtimeModel path verbatim.
7. Update apps/voice-agent/README.md (mention the backbone-switch + flag)
   and the root README's partner-tech row.

Acceptance criteria:
- USE_GRADIUM_VOICE=true: user speech is transcribed by Gradium STT and the
  agent speaks responses through Gradium-generated audio in the LiveKit
  room. First syllable within ~1.5s (pre-warmed WS).
- USE_GRADIUM_VOICE=false: agent reverts to the Phase-5 RealtimeModel path
  with zero code changes (no rebuild, no env churn beyond the flag).
- README clearly states Gradium as the side-challenge target with two real
  API integrations (STT + TTS).
```

---

# Phase 8 — Tavily integration

**Timebox:** Sunday 09:00–10:00

### Checklist

- [ ] `TAVILY_API_KEY` is already in `.env.example`
- [ ] Add the Tavily Node SDK to `apps/voice-agent` (per `docs/tavily/javascript_sdk_reference.md` — confirm the npm package name during install)
- [ ] Replace the stub `execute()` in [`packages/app/src/tools/searchTravelContext.ts`](./packages/app/src/tools/searchTravelContext.ts) with a real Tavily Search call (docs/tavily/rest_api_search.md). The declaration + registry entry already exist; only the body changes.
- [ ] Use Tavily for destination/policy enrichment (BCN arrival hall, Spanish hotel check-in norms, Vueling delay context)
- [ ] In the demo, the agent can mention "I also checked local arrival guidance"
- [ ] Update `apps/voice-agent/README.md` and the root README partner-tech row
- [ ] Commit: `feat(voice-agent): tavily search travel context tool`

### Agent prompt

```txt
Replace the Phase-5 searchTravelContext stub with a real Tavily call.

The tool already exists in the registry — just swap its body. File:
packages/app/src/tools/searchTravelContext.ts. Don't move it, don't
rename it; the LiveKit agent and the demo script both import it via
the registry at packages/app/src/tools/index.ts.

Reference: docs/tavily/index.md, docs/tavily/rest_api_search.md, and
docs/tavily/javascript_sdk_reference.md.
Use the official Tavily Node SDK (matches the agent's Node + TS stack).

Use Tavily for lightweight real-time travel context:
- destination arrival information (e.g., BCN airport arrival hall layout)
- hotel check-in norms in Spain
- airline delay support context for Vueling

Keep it safe and non-critical. Do not make legal or guaranteed claims from
Tavily. Use it as supplementary context only.

In the demo, the agent may say:
"I checked your booking and general arrival context. The actual change
depends on your hotel policy, which allows this mock change for free."

Acceptance criteria:
- Tavily Search is called from the agent's tool layer
- Tavily result is included in agent context for the response
- README documents Tavily usage
- counts as one of the 3 required partner technologies
```

---

# Phase 9 — Polish, demo script, and submission materials

**Timebox:** Sunday 10:00–13:00

### Checklist

- [ ] Freeze scope
- [ ] Fix only blocking bugs
- [ ] Add final README screenshots / GIFs if possible
- [ ] Add "Partner technologies used" section
- [ ] Add "How to run locally" section (incl. `yarn seed && yarn seed:demo`, plus `lk cloud auth` for `apps/voice-agent` and the LiveKit env vars)
- [ ] Add "Demo flow" section
- [ ] Add "Audio intelligence metric" section
- [ ] Add "Future EchoAway integration" section
- [ ] Record 2-minute Loom
- [ ] Make repo public
- [ ] Validate submission form requirements
- [ ] Commit: `docs: finalize hackathon submission`

### Agent prompt

```txt
Finalize the hackathon submission for EchoAway Voice Concierge.

Focus on documentation, stability, and demo clarity. Do not add new product features.

README must include:
- project title and one-liner
- problem
- solution
- demo flow (Berlin → Barcelona, flight delay, hotel check-in shift)
- architecture diagram + link to docs/erm.md
- data model summary + link to docs/data-model.md
- partner technologies used:
  - Google DeepMind / Gemini (via @livekit/agents-plugin-google — LiveKit's universal LLM-plugin abstraction inside the LiveKit agent)
  - Gradium (TTS via custom @livekit/agents TTS class)
  - Tavily (Search via Tavily Node SDK)
  - ai-coustics for the track-specific audio layer (@livekit/plugins-ai-coustics)
  - LiveKit Cloud (managed media + Agents framework — substrate for the voice loop)
- setup instructions:
  - yarn install + yarn db:migrate + yarn seed + yarn seed:demo
  - LiveKit Cloud account + `lk cloud auth` for apps/voice-agent
- environment variables (LiveKit, Gemini, Gradium, Tavily, plus DATABASE_URL)
- API docs (link to apps/backend/README.md)
- audio intelligence metric
- known limitations
- future EchoAway integration

Also add a short pitch script and fallback demo instructions.

Acceptance criteria:
- a jury member can understand the project in 2 minutes from the README
- repo is public
- demo can be run or understood from docs
- no secrets are committed
```

---

# Phase 10 — Pitch preparation

**Timebox:** Sunday 13:00–14:00

### Checklist

- [ ] Write 2-minute video script
- [ ] Write 5-minute finalist pitch fallback
- [ ] Prepare one sentence for each partner tech
- [ ] Prepare one sentence for why this belongs in EchoAway
- [ ] Prepare one sentence for why it is technically hard
- [ ] Prepare one sentence for why it matters commercially
- [ ] Practice once with timer

### 2-minute demo script

```txt
Travel support usually breaks exactly when you need it most: at the airport, under stress, with noise everywhere.

We built EchoAway Voice Concierge: a real-time voice interface for travel that still works in the wild.

In this demo, I'm a traveler whose flight from Berlin to Barcelona is delayed. I ask the app if it can move my hotel check-in to tomorrow.

The audio is noisy, so we use ai-coustics to improve the signal. The assistant uses Gradium for voice output, Gemini for reasoning and tool calls, and Tavily for additional travel context.

The important part is that this is not just a chatbot. While I speak, the agent loads my Barcelona Long Weekend trip from a real Prisma database, reads the seeded flight-delay disruption, checks the hotel modification policy, computes a change proposal, and updates the web UI live.

Now the app shows the old check-in, the new check-in, the fee, and asks for confirmation. When I confirm, the booking and check-in event are mutated and a support log is created automatically.

Our metric is task completion under airport noise: can the assistant understand the request, retrieve the right trip, propose the correct action, and complete the flow safely?

This is a hackathon prototype, but it fits directly into EchoAway's future: the travel app you can talk to, even when real life is messy.
```

---

## 8. Audio intelligence metric

### Simple version

```ts
export type AudioIntelligenceMetric = {
  scenario: 'clean' | 'airport_noise' | 'cafe_noise' | 'street_noise'
  inputSignalToNoiseRatio?: number // 0..1
  enhancedSignalToNoiseRatio?: number // 0..1
  transcriptQuality: number // 0..1
  taskCompleted: boolean
  correctTripIdentified: boolean
  correctActionSuggested: boolean
  confirmationRequested: boolean
  finalScore: number // 0..100
}
```

Persisted on `VoiceSession.audioMetric`.

### Scoring

```txt
finalScore =
  transcriptQuality * 40
  + taskCompleted * 20
  + correctTripIdentified * 15
  + correctActionSuggested * 15
  + confirmationRequested * 10
```

### Demo display

```txt
Airport Noise Test
- Transcript clarity: 87%
- Correct trip identified: yes
- Correct action suggested: yes
- Confirmation requested: yes
- Task completed: yes
- Final score: 91/100
```

---

## 9. Risk management

### Biggest risk: voice integration takes too long

Fallback:

- [ ] Keep CLI text-agent working
- [ ] Use pre-recorded noisy audio
- [ ] Manually feed transcript into agent
- [ ] Still show UI live updates from backend events

### Biggest risk: ai-coustics LiveKit plugin integration unstable

Fallback (the second of the two paths in `docs/ai-coustics/index.md`):

- [ ] Switch to ai-coustics Node SDK file processing using
      `docs/ai-coustics/example_file-processing_node.js` as the starting point
- [ ] Pre-process the vendored `apps/voice-agent/fixtures/airport-noise.mp3`
      offline; ship the cleaned audio and a hand-written transcript through
      the same agent loop. The SDK's `example_file-processing_node.js` uses
      the `wavefile` package and expects WAV — decode the MP3 to a
      `Float32Array` first (e.g. via `fluent-ffmpeg` piped to PCM) or run a
      one-shot `ffmpeg -i airport-noise.mp3 airport-noise.wav` to keep the
      example unchanged.
- [ ] Show before/after waveform + computed `audioMetric` in the UI
- [ ] Document the path switch in `apps/voice-agent/README.md`

### Biggest risk: Gradium custom plugin unstable

Fallback:

- [ ] Set `USE_GRADIUM_TTS=false` to revert to LiveKit's default TTS — same
      code path, no rebuild
- [ ] Keep one isolated Gradium TTS call alive (e.g., the welcome message via
      the TTS POST endpoint, `docs/gradium/tts-post.md`) so the side-challenge
      submission still has a real Gradium API call in code
- [ ] Keep the main demo stable

### Biggest risk: voice integration (LiveKit + Gemini) overruns

Fallback:

- [ ] Run the deterministic Node replay script from Phase 5
      (`yarn workspace @echoaway/voice-agent replay`) to drive the demo
      without LiveKit or Gemini in the loop
- [ ] Web UI behavior is identical — it subscribes to `VoiceActionEvent`s via
      SSE regardless of how those events are produced
- [ ] Use a pre-recorded narration as the audio track during the Loom demo

### Biggest risk: Prisma seed scripts brittle

Fallback:

- [ ] Catalog seed is idempotent (`upsert`); blow up dev.db and re-seed if drift
- [ ] Demo trip seed has `--reset` flag for clean re-runs
- [ ] Sanity script (`yarn sanity`) prints the expected demo state at any time

### Biggest risk: UI not polished

Fallback:

- [ ] Prioritize 4 static states over complex realtime
- [ ] Use debug buttons to switch states during recording
- [ ] Hide rough backend behavior behind polished demo video

---

## 10. Final realism assessment

### Very realistic if you keep scope tight

This is achievable solo in 48 hours if the final product is:

- one seeded trip (Barcelona Long Weekend)
- one disruption (flight delay)
- one voice flow (move hotel check-in)
- one backend action (quote + confirm)
- one polished web demo screen
- one strong demo story

### Not realistic if you build too much

Do not build:

- full trip creation
- full supplier booking
- auth
- payments
- production realtime infrastructure
- multiple booking actions
- generic "any component change" UI (the demo only shifts a hotel check-in)

### Recommended quality bar

The project does not need to be production-complete. It needs to be:

- understandable
- visually impressive
- technically credible
- demo-stable
- aligned with the track
- clearly reusable for EchoAway

The winning version is not the biggest version. The winning version is the one where the judge immediately understands:

> "Ah, this is how travel apps could work once voice AI actually works in the real world."

---

## Appendix — Where to look

| If you need…                             | Look at                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| The canonical entity diagram             | [`docs/erm.md`](./docs/erm.md)                                     |
| Why the schema is shaped this way        | [`docs/data-model.md`](./docs/data-model.md)                       |
| JSON shapes for `ComponentBooking.data`  | [`docs/component-data-shapes.md`](./docs/component-data-shapes.md) |
| How the seed pipeline transforms dataset | [`docs/seed-strategy.md`](./docs/seed-strategy.md)                 |
| Raw inventory data                       | `dataset/*.json`                                                   |
| Demo trip composition (5 components)     | [`docs/data-model.md`](./docs/data-model.md) §5                    |
| Tool API contract                        | PLAN.md §5 + `apps/backend/README.md`                              |
| Agent system prompt + tools              | `apps/voice-agent/README.md`                                       |
