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
    Node or Python worker
    Handles realtime voice session
    ai-coustics audio enhancement
    Gradium voice component
    Gemini LLM tool calling
    Calls backend tools

/packages
  /types
    Shared TypeScript types + Zod schemas for ComponentBookingData,
    ComponentEventLocation, BookingPolicy, VoiceActionEventPayload, …

  /app
    Shared application logic, state machines, API clients, event mapping, demo flow orchestration

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
User voice
  ↓
ai-coustics enhancement
  ↓
Gradium / STT / realtime voice component
  ↓
Gemini agent with tools
  ↓
NestJS tool API
  ↓
Prisma → SQLite (read trip / mutate booking / append event)
  ↓
WebSocket/SSE event
  ↓
Web UI updates live
```

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

- [ ] Add `yarn seed:catalog` script wired through `prisma db seed`
- [ ] Create `apps/backend/prisma/seed/catalog/` with one file per entity
- [ ] Implement helpers in `seed/catalog/shared.ts`:
  - [ ] `inferDestinationType(src)`
  - [ ] `matchDestinationByCity(city)`
  - [ ] `matchSupplier(name)`
  - [ ] `parseCancellationToPolicy(raw)`
  - [ ] `airportByIata(iata)`
- [ ] Insert order per `docs/seed-strategy.md` §2.1
- [ ] Idempotent upserts on source `_id`
- [ ] Sanity script that prints row counts after seeding
- [ ] Commit: `feat(backend): catalog seed from dataset`

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

- [ ] Add `yarn seed:demo-trip` (and `yarn seed:demo --reset`)
- [ ] Create travelers (Stephan with phone, Anna without)
- [ ] Create the "Barcelona Long Weekend" trip + 1 segment
- [ ] Create 5 components (flight, transfer, accommodation, 2 activities)
- [ ] Create 5 ComponentBookings with snapshots per `docs/component-data-shapes.md`
- [ ] Create ~10 ComponentEvents with proper location JSON
- [ ] Create the flight-delay Disruption with 2 suggested actions
- [ ] Hotel ComponentBooking.policy must allow free same-day check-in change (override)
- [ ] Sanity script: `yarn sanity` prints the demo trip and any disruptions
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

- [ ] Implement `GET /health`
- [ ] Implement `GET /trips/:tripId` (with components, segments, bookings, events, traveler list)
- [ ] Implement `GET /trips/by-phone/:phoneNumber`
- [ ] Implement `GET /trips/:tripId/disruptions`
- [ ] Implement `POST /trips/:tripId/hotel/check-in/quote-change`
  - Reads ComponentBooking.policy
  - Computes proposed new check-in date and fee
  - Returns ChangeQuote shape (per docs/component-data-shapes.md §6)
  - Emits VoiceActionEvent { type: 'change_suggested', payload: { quote } }
- [ ] Implement `POST /trips/:tripId/hotel/check-in/confirm-change`
  - Mutates ComponentBooking.data.checkInDate
  - Updates ComponentEvent(check_in).startsAt
  - Updates ComponentBooking.status / Component.status
  - Emits VoiceActionEvent { type: 'change_confirmed', payload: { quote } }
- [ ] Implement `POST /support-logs`
- [ ] Implement catalog read endpoints (5 from §5)
- [ ] Validate all request bodies via Zod from /packages/types
- [ ] OpenAPI / Swagger or curl-based README docs
- [ ] Commit: `feat(backend): tool API on prisma`

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

- [ ] Build EchoAway-style web demo screen in `/apps/web`
- [ ] Wire `/packages/app` API client to backend's GET /trips/:id and /trips/by-phone/:phone
- [ ] Add trip overview card (reads real seeded trip)
- [ ] Add flight delay card (reads disruption + flight component)
- [ ] Add hotel booking card (reads accommodation component + booking)
- [ ] Add "Talk to Away" voice button / browser microphone entry point
- [ ] Add assistant status states: idle, listening, thinking, suggesting, confirmed
- [ ] Add live action card component (renders ChangeQuote)
- [ ] Add confirmation modal/card
- [ ] Add small audio clarity metric display
- [ ] Add polished empty/loading/error states
- [ ] Create reusable feature components in `/packages/ui`
- [ ] Create app orchestration hooks/state machine in `/packages/app`
- [ ] Keep `/apps/mobile` as a thin future shell that can later import the same packages
- [ ] Commit: `feat: build web voice concierge UI`

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

- [ ] Decide: WebSocket or Server-Sent Events
- [ ] Implement backend event stream that broadcasts new VoiceActionEvent rows
- [ ] Web app subscribes to event stream via `/packages/app`
- [ ] UI changes state based on events
- [ ] Trigger quote endpoint from a debug button → see UI update live
- [ ] Trigger confirm endpoint from a debug button → see confirmed screen
- [ ] Add fallback polling on /events with `since` query param
- [ ] Commit: `feat: sync assistant events to web UI`

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

# Phase 5 — Voice-agent skeleton with Gemini tool calling

**Timebox:** Saturday 20:30–22:30

### Checklist

- [ ] Create agent system prompt
- [ ] Define tool schemas mirroring `packages/types`
- [ ] Connect Gemini API
- [ ] Implement tool calls against NestJS backend
- [ ] Add transcript logging via VoiceSession + VoiceActionEvent
- [ ] Add deterministic fallback demo script
- [ ] Add CLI mode for testing typed user messages
- [ ] Commit: `feat: add gemini tool-calling voice agent skeleton`

### Agent prompt

```txt
Build the voice-agent service for EchoAway Voice Concierge.

For now, implement a text-based agent loop first so we can test tool
calling without audio.

Use Gemini as the LLM. The agent has these tools (must match the API in
PLAN.md §5):

- getTripByPhone(phoneNumber)
- getTripDisruptions(tripId)
- quoteHotelCheckInChange(componentId, newCheckInDate)
- confirmHotelCheckInChange(componentId, newCheckInDate)
- createSupportLog(tripId, sessionId, transcript, summary, actions)
- searchTravelContext(query)   ← Phase 8 will plug Tavily; stub for now
- listAccommodations(destinationId)

Agent personality:
- calm, human, concise
- sounds like a premium travel concierge
- ALWAYS asks for confirmation before executing changes
- Never claims a real supplier was changed; this is a demo / mock booking backend

Voice session lifecycle:
- On session start: POST a VoiceSession row, emit `session_started` event
- On every tool call: emit `assistant_thinking` then the tool's resulting event
- On change suggested: emit `change_suggested`
- On user confirmation: emit `confirmation_required` then `change_confirmed`
- On hangup: emit `session_ended` and call createSupportLog

CLI test mode:
- user types text, agent responds, tools fire against the running backend,
  events propagate to the web UI

Acceptance criteria:
- Text input "my flight is delayed, can I move my hotel check-in to tomorrow?" triggers quoteHotelCheckInChange
- Agent asks for confirmation
- Text input "yes confirm" triggers confirmHotelCheckInChange
- Web UI updates live (Phase 4 wiring)
- Support log is created after confirmation
- A deterministic fallback script can replay the same flow without an LLM call (for offline demo backup)
```

---

# Phase 6 — ai-coustics and noisy environment demo

**Timebox:** Saturday 22:30–00:30 (Sunday)

### Checklist

- [ ] Install / test ai-coustics SDK or LiveKit plugin
- [ ] Prepare airport noise audio file
- [ ] Create clean vs noisy test sample
- [ ] Route audio through ai-coustics if possible
- [ ] Show audio enhancement status in UI (read from VoiceSession.audioMetric)
- [ ] Persist AudioIntelligenceMetric on session end
- [ ] Commit: `feat: add noisy audio demo and audio intelligence metric`

### Agent prompt

```txt
Add the noisy-environment demo for the telli & ai-coustics track.

Goal: Show that EchoAway Voice Concierge works in real-world travel
chaos, specifically airport noise.

Tasks:
- integrate ai-coustics SDK or LiveKit ai-coustics plugin if available
- prepare a demo mode with airport background noise
- compute and persist VoiceSession.audioMetric (AudioIntelligenceMetric shape from docs/component-data-shapes.md §5):
  - scenario: 'airport_noise'
  - inputSignalToNoiseRatio
  - enhancedSignalToNoiseRatio
  - transcriptQuality (0..1)
  - taskCompleted, correctTripIdentified, correctActionSuggested, confirmationRequested
  - finalScore (0..100, computed per PLAN §8)

Web UI reads VoiceSession.audioMetric and shows the audio clarity card.

If full realtime integration is too slow, create a credible fallback:
- pre-record one noisy sample
- process/enhance it
- show before/after transcript quality
- still connect the final transcript to the agent

Acceptance criteria:
- Demo visibly references airport noise
- UI shows that noisy audio was enhanced
- VoiceSession.audioMetric is persisted with realistic numbers
- README explains how ai-coustics is used
```

---

# Phase 7 — Gradium integration

**Timebox:** Sunday 00:30–02:00

### Checklist

- [ ] Create Gradium account / org
- [ ] Get API access
- [ ] Use Gradium for voice component where feasible
- [ ] Prefer using Gradium for TTS or realtime voice response
- [ ] Add Gradium usage to README
- [ ] Add environment variables
- [ ] Commit: `feat: integrate gradium voice component`

### Agent prompt

```txt
Integrate Gradium into the EchoAway Voice Concierge demo.

Use Gradium for one meaningful voice-AI component. Prefer:
- TTS response generation for the assistant voice, or
- realtime voice interaction if feasible in time

Keep the integration minimal but real. Add clear README documentation:
- what Gradium is used for
- where the code is located
- how to configure the API key
- how it appears in the demo

Acceptance criteria:
- project genuinely calls Gradium API or SDK
- Gradium usage is visible in code
- README explicitly lists Gradium as a partner technology used
- submission can honestly opt into the Gradium side challenge
```

---

# Phase 8 — Tavily integration

**Timebox:** Sunday 09:00–10:00

### Checklist

- [ ] Add Tavily API key env var
- [ ] Implement `searchTravelContext(query)` in voice-agent (replaces stub from Phase 5)
- [ ] Use Tavily for destination/policy enrichment
- [ ] In demo, agent can say "I also checked local arrival guidance"
- [ ] Add README docs
- [ ] Commit: `feat: add tavily travel context tool`

### Agent prompt

```txt
Add Tavily as a travel context enrichment tool.

Replace the searchTravelContext stub in the voice-agent service with a real Tavily call.

Use Tavily to search for lightweight real-time travel context, such as:
- destination arrival information (e.g., BCN airport arrival hall layout)
- hotel check-in norms in Spain
- airline delay support context for Vueling

Keep it safe and non-critical. Do not make legal or guaranteed claims from
Tavily. Use it as supplementary context only.

In the demo, the agent may say:
"I checked your booking and general arrival context. The actual change
depends on your hotel policy, which allows this mock change for free."

Acceptance criteria:
- Tavily is called from code
- Tavily result can be included in agent context
- README documents Tavily usage
- this counts as one of the 3 partner technologies
```

---

# Phase 9 — Polish, demo script, and submission materials

**Timebox:** Sunday 10:00–13:00

### Checklist

- [ ] Freeze scope
- [ ] Fix only blocking bugs
- [ ] Add final README screenshots / GIFs if possible
- [ ] Add "Partner technologies used" section
- [ ] Add "How to run locally" section (incl. `yarn seed && yarn seed:demo`)
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
  - Google DeepMind / Gemini
  - Gradium
  - Tavily
  - ai-coustics for the track-specific audio layer
- setup instructions including yarn install + yarn seed + yarn seed:demo
- environment variables
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

### Biggest risk: ai-coustics integration unstable

Fallback:

- [ ] Show before/after transcript demo
- [ ] Document integration attempt clearly
- [ ] Use track story around task completion under noise

### Biggest risk: Gradium integration unstable

Fallback:

- [ ] Use Gradium for a small isolated response generation / TTS call
- [ ] Keep main demo stable with text/standard voice

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
