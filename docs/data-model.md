# EchoAway — Data Model Design

**Companion to** [`./erm.md`](./erm.md).
This doc explains *why* the schema looks the way it does and how the
existing dataset (`dataset/*.json`) fits in without dictating the design.

---

## 1. The problem

We have three independent inputs to reconcile:

1. **Product brief** — a voice-driven travel concierge that needs to load a
   trip, propose changes, and update the UI live during a phone call.
2. **Existing dataset** — six JSON files describing 28 destinations,
   20 airports, 80 hotels, 40 activities, 3 flight routes, 3 transfers.
   All Spanish destinations, German + Spanish airports, German→Spain corridor.
3. **Existing draft schema** — a Trip / Segment / Component / Booking / Event
   model that captures the *trip layer* but **does not** model the catalog
   products that bookings reference.

The dataset is **catalog**, not trips. If we dump it into `Component` rows
we'd conflate "a hotel that exists in the world" with "a hotel I booked on
my Bali trip", and we'd duplicate hotel records every time someone books one.

---

## 2. The four-layer split

### 2.1 Catalog layer — the inventory

Owns all reusable, mostly-read-only data: **`Destination`, `Airport`,
`Supplier`, `AccommodationProduct`, `ActivityProduct`, `FlightRouteProduct`
(+ `FlightRouteLeg`), `GroundTransferProduct`**.

- One catalog row per real-world product (e.g., one row for "Hotel Brisa
  Barcelona", regardless of how many people book it).
- Loaded by `seed:catalog` (idempotent, re-runnable).
- Indexed for the agent's search tools (`searchAccommodations(destinationId)`,
  `findFlightRoute(fromIata, toIata)`, etc.).

### 2.2 Identity layer — people

Just **`Traveler`**. Created on demand for the demo.

### 2.3 Trip layer — the journey

**`Trip`, `TripTraveler`, `TripSegment`, `Component`, `ComponentBooking`,
`ComponentEvent`**.

This is the only layer the agent actively *mutates* during the demo. A
`Component` is a planned service inside a trip; it has nullable foreign
keys to catalog products that capture **which** product it realizes (so
the agent can say "swap to a different hotel in Barceloneta" by querying
`AccommodationProduct WHERE destinationId = Barceloneta`).

### 2.4 Operations layer — the voice loop

**`Disruption`, `VoiceSession`, `VoiceActionEvent`, `SupportLog`**.

Disruption is the *trigger* of the demo. The voice session captures the
conversation, the events stream to the web UI live, and the support log
is the artifact left behind when the call ends.

---

## 3. Key design decisions and their reasons

### 3.1 Catalog and trip are separate tables

**Decision:** A booked hotel lives in `Component` + `ComponentBooking`,
*not* in `AccommodationProduct`.

**Why:** The catalog has its own lifecycle (price updates, policy changes,
deactivation). Bookings are an immutable record of "what was true at the
moment we booked". If both share a row, mutating one breaks the other.

**Cost:** Two extra joins to render a booked hotel. Acceptable.

### 3.2 Component is one table for all 4 types

**Decision:** A single `Component` table with a `type` enum and four
nullable FKs to catalog product tables.

**Why we considered alternatives:**

- **Table per type** (`FlightComponent`, `HotelComponent`, …) would force
  the agent's "list all components in trip" query into a UNION across 4
  tables. Painful for an LLM tool that just wants `getTrip(tripId)`.
- **Discriminated JSON** (no FK at all, just a JSON blob with a product
  id) loses referential integrity and makes "find another hotel in
  Barceloneta" require parsing JSON in the agent layer.

**Decision rule:** `Component.type === 'accommodation'` ⇒ exactly
`accommodationProductId` is non-null and the other three are null.
Validated at the seed and tool layer (SQLite has no discriminator
constraints). Enforced via a Zod schema in `packages/types`.

### 3.3 ComponentBooking.data is a typed JSON snapshot

**Decision:** `ComponentBooking.data` is JSON whose shape is determined
by `Component.type`. Captured at booking time. Includes a snapshot of
price, policy text, and any type-specific extras (flight legs, hotel
room category, activity meeting point).

**Why:** The booking must remain stable when catalog changes. Storing
the full snapshot avoids "ghost" bookings whose displayed details no
longer match what was sold.

**Where it lives:** `docs/component-data-shapes.md` defines the exact
TypeScript types. Voice-agent tools use those types directly; the seed
script writes them on trip composition.

### 3.4 Modification policy lives twice

**Decision:**

- `AccommodationProduct.defaultModificationPolicy` — the policy that
  applies *by default* when the product is freshly booked.
- `ComponentBooking.policy` — the actual policy that applies to **this**
  booking, captured at booking time.

The seed script copies the default into the booking; the agent reads
from the booking. Real systems would re-fetch from the supplier API at
booking time; for the hackathon, the catalog default is the only source.

The dataset's `cancellation_terms` strings (e.g., `"free_until_2025-11-20"`)
get parsed during seeding into a structured shape:

```ts
type ModificationPolicy = {
  canModify: boolean
  feeAmount: number       // in minor units (cents)
  currency: 'EUR'
  latestModificationTime: string  // ISO 8601
  notes?: string
}
```

The demo accommodation (Hotel Brisa Barcelona, Hotel Amaya equivalent)
gets a deliberately permissive policy so the demo flow always succeeds.

### 3.5 Destination is hierarchical, Airport is not

**Decision:** `Destination` self-references via `parentDestinationId`.
`Airport` is flat and refers to a `Destination` it serves.

**Why:** Destinations have natural hierarchy (Spain → Catalonia → Barcelona
→ Barceloneta). Airports are infrastructure with no hierarchy — but they
*serve* a destination, which the agent uses for queries like "find me a
flight to Barcelona" → "Barcelona's airport is BCN".

The seed script builds the hierarchy by:

1. Inserting `Spain` as a `country`-typed root (not in dataset).
2. Inserting all 28 dataset destinations as `city`-typed children of Spain
   (or `park`/`village` where the description suggests so).
3. (Optional) inserting accommodation-area children where useful.

### 3.6 Airports are a first-class catalog entity

**Decision:** Airports are not Destinations. Different schema, different
purpose, different ID space (`air-fra` vs `dest-frankfurt`).

**Why:** Airports have IATA/ICAO codes, no description, no tags, no
hierarchy. Modeling them as `Destination(type='airport')` would either
explode the Destination schema with airport-only fields or force `null`
on tags/description for half the rows.

**Cost:** A second lookup for "where is BCN?" — but that's a single
`Airport.servesDestinationId` join.

### 3.7 Supplier is its own entity

**Decision:** A `Supplier` table with category, separate from products.

**Why:** Suppliers appear in 4 product types and on every booking. The
contract reference patterns (`HB-BCN-001`, `GYG-BCN-SAGRADA`,
`TRF-BCN-HB001`) suggest each supplier owns a numbering scheme — modeling
the supplier explicitly lets us validate references and surface them in
the support log.

**Reality check:** The dataset has only 5 unique suppliers (Hotelbeds,
GetYourGuide, Tiqets, Viator, Iberia Ground Transfers). Tiny table, but the
agent will need to mention supplier names in spoken responses ("Your
Hotelbeds reservation…"), so a clean lookup is worth it.

### 3.8 FlightRouteProduct has FlightRouteLeg children

**Decision:** Multi-leg flights get a separate `FlightRouteLeg` table
ordered by `order`.

**Why:** The dataset has both direct (1 leg) and connecting (2 legs)
routes. The agent needs to reason about each leg ("the connection at
BCN takes 1h45m"). Storing legs as JSON works but loses queryability —
e.g., "find all routes that pass through BCN" is harder.

**Acceptable alternative:** Store legs as JSON if simplicity matters
more than querying. Recommendation: separate table, since it's only one
extra join and 6 columns.

### 3.9 Trip has explicit start/end dates

**Decision:** `Trip.startDate` and `Trip.endDate` are denormalized from
the segments' dates.

**Why:** The voice agent's first action is `getTripByPhone(phone)` →
the response needs the trip header (title, dates, status) without
joining to segments. Computing them on every read is wasteful; we
recompute them on segment mutations.

### 3.10 VoiceActionEvent is persisted, not just streamed

**Decision:** Events are stored in SQLite *and* streamed to the web UI.

**Why:** The PLAN.md treats events as in-memory only, but persistence
gives us:

- Demo replay (rewind the call to a specific point)
- Multiple subscribers (Loom recording, future mobile app)
- Audit trail in the support log

**Cost:** A few hundred extra rows per demo run. Trivial.

### 3.11 SupportLog references both Trip and VoiceSession

**Decision:** `SupportLog.tripId` is required, `sessionId` is optional.

**Why:** A support log can be created from a session (the normal case) or
manually (e.g., escalation by a human). Keeping `sessionId` nullable
allows non-voice paths.

---

## 4. What we deliberately *don't* model

| Feature                         | Reason                                                        |
|---------------------------------|---------------------------------------------------------------|
| Authentication / accounts       | Out of scope for the hackathon (PLAN.md §2)                   |
| Real payment / pricing engine   | Out of scope; bookings carry frozen prices                    |
| Inventory / availability checks | Out of scope; catalog is treated as always-available          |
| Loyalty / membership tiers      | Not in dataset                                                |
| Currency conversion             | Single currency (EUR) per booking, no conversion              |
| Multi-tenant ops                | Single demo tenant                                            |
| Soft deletes                    | Use `status` enums where it matters; otherwise hard delete    |
| Audit log of catalog edits      | Catalog is reseeded, not edited                               |

---

## 5. Demo trip — concrete shape

The demo trip exercises every entity in the trip and operations layers.

```
Trip "Barcelona Long Weekend"
├─ TripTraveler(Stephan, lead)
├─ TripTraveler(Anna, companion)
├─ TripSegment 1: Barcelona, day 1–4
│   ├─ Component(flight, BER→BCN)             →  flightRouteProduct: flt-ber-bcn-01
│   │   ├─ ComponentBooking(confirmed, EUR 240, fare snapshot)
│   │   ├─ ComponentEvent(departure, BER, 18:00)
│   │   ├─ ComponentEvent(arrival, BCN, 20:40)
│   │   └─ Disruption(flight_delay, severity=major)        ← demo trigger
│   ├─ Component(transfer, BCN airport → Hotel Brisa) → groundTransferProduct: trf-bcn-hotelbrisa
│   │   ├─ ComponentBooking(confirmed, EUR 18)
│   │   └─ ComponentEvent(pickup, BCN airport, 21:30)
│   ├─ Component(accommodation, Hotel Brisa Barcelona) → accommodationProduct: hotel-bcn-01
│   │   ├─ ComponentBooking(confirmed, EUR 580 = 4×145, modificationPolicy: free until tonight 18:00)
│   │   ├─ ComponentEvent(check_in, hotel, day 1, 22:00)
│   │   └─ ComponentEvent(check_out, hotel, day 4, 11:00)
│   ├─ Component(activity, Sagrada Família tour) → activityProduct: act-bcn-sagrada
│   │   ├─ ComponentBooking(confirmed, EUR 84 = 2×42)
│   │   ├─ ComponentEvent(meeting_point, plaza, day 2, 10:00)
│   │   └─ ComponentEvent(activity_start, plaza, day 2, 10:30)
│   └─ Component(activity, Tapas Tour) → activityProduct: act-bcn-tapas
│       └─ …
└─ TripSegment 2 (optional): Sitges day-trip OR Valencia 2nd leg
```

The demo voice flow:

1. Agent loads trip via `Traveler.phone`.
2. Disruption surfaces flight delay → suggested action: "shift hotel
   check-in by 1 day".
3. Agent calls `quoteHotelCheckInChange(componentId, newDate)` →
   reads `ComponentBooking.policy`, computes fee = 0 EUR, returns quote.
4. UI shows live action card via `VoiceActionEvent(change_suggested)`.
5. User confirms → `confirmHotelCheckInChange` mutates
   `ComponentBooking` and the corresponding `ComponentEvent(check_in)`,
   emits `change_confirmed`.
6. Session ends → `SupportLog` written with transcript and action list.

---

## 6. From dataset to schema — quick map

| Dataset file                       | Catalog table                             | Notes                                           |
|------------------------------------|-------------------------------------------|-------------------------------------------------|
| `dataset/destinations.json`        | `Destination`                             | Plus a synthetic Spain country parent           |
| `dataset/airports.json`            | `Airport`                                 | `servesDestinationId` resolved by city match    |
| `dataset/accommodations.json`      | `AccommodationProduct` + `Supplier`       | One Hotelbeds row + 80 product rows             |
| `dataset/activities.json`          | `ActivityProduct` + `Supplier`            | 3 supplier rows (GetYourGuide/Tiqets/Viator)    |
| `dataset/flight_routes.json`       | `FlightRouteProduct` + `FlightRouteLeg`   | Synthetic supplier "airline-aggregator"         |
| `dataset/ground_transfers.json`    | `GroundTransferProduct` + `Supplier`      | "Iberia Ground Transfers"                            |
| (none — code only)                 | `Traveler`, `Trip*`, `Component*`         | Composed in `seed:demo-trip`                    |
| (none — code only)                 | `Disruption`, `VoiceSession`, …           | Composed in `seed:demo-trip`                    |

For the full transformation pipeline, see [`./seed-strategy.md`](./seed-strategy.md).
