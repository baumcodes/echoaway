# EchoAway — Component JSON Shapes

`ComponentBooking.data` is a typed JSON column. Its shape depends on
the parent `Component.type`. This file is the canonical contract for
what each shape looks like — both the seed script and the voice agent
must match these types.

`ComponentEvent.location` is also a typed JSON. Its shape depends on
event type (mostly: airport, hotel, point of interest).

All money is stored in **minor units** (cents). Currency is always
captured next to it.

---

## 1. `ComponentBooking.data`

### 1.1 `type === 'flight'` — `FlightBookingData`

```ts
type FlightBookingData = {
  kind: 'flight'
  /** Snapshot of FlightRouteProduct at booking time */
  routeSnapshot: {
    routeId: string                  // catalog id, for re-search
    fromIata: string
    toIata: string
    stops: number
    durationHours: number
    fareConditions: 'non_refundable' | 'changeable_fee' | 'flexible'
    daysOfWeek: number[]             // 1..7, ISO weekday
  }
  /** Each leg of the booked itinerary, frozen */
  legs: Array<{
    order: number
    fromIata: string
    toIata: string
    flightNo: string
    airline: string
    /** ISO-8601 datetime in the airport's local zone */
    scheduledDeparture: string
    scheduledArrival: string
    /** Updated by Disruption; null if no delay */
    actualDeparture?: string | null
    actualArrival?: string | null
  }>
  passengers: Array<{
    travelerId: string
    seat?: string
    fareClass?: 'economy' | 'premium_economy' | 'business' | 'first'
  }>
  /** PNR */
  pnr?: string
}
```

### 1.2 `type === 'accommodation'` — `AccommodationBookingData`

```ts
type AccommodationBookingData = {
  kind: 'accommodation'
  productSnapshot: {
    productId: string
    name: string
    stars: number
    pricePerNightCents: number
    currency: 'EUR'
    coordinates: { lat: number, lng: number }
    amenities: string[]
    images: string[]
  }
  /** ISO date (no time) */
  checkInDate: string
  checkOutDate: string
  nights: number
  /** Frozen — do not recalculate from product after booking */
  totalPriceCents: number
  guests: Array<{
    travelerId: string
    role: 'lead' | 'companion' | 'child'
  }>
  roomCategory?: string
  notes?: string
}
```

### 1.3 `type === 'activity'` — `ActivityBookingData`

```ts
type ActivityBookingData = {
  kind: 'activity'
  productSnapshot: {
    productId: string
    name: string
    durationHours: number
    priceCents: number
    currency: 'EUR'
    tags: string[]
  }
  /** ISO datetime in destination local time */
  scheduledStart: string
  participants: Array<{
    travelerId: string
    /** For activity-specific data like dietary restrictions */
    notes?: string
  }>
  totalPriceCents: number
  meetingPoint?: {
    name: string
    address?: string
    coordinates?: { lat: number, lng: number }
  }
  /** e.g., "Adult x2, Child x1" */
  ticketBreakdown?: string
}
```

### 1.4 `type === 'transfer'` — `TransferBookingData`

```ts
type TransferBookingData = {
  kind: 'transfer'
  productSnapshot: {
    productId: string
    fromLabel: string
    toLabel: string
    mode: 'bus' | 'shuttle' | 'private_car' | 'train' | 'taxi'
    durationMinutes: number
    priceCents: number
    currency: 'EUR'
  }
  /** ISO datetime in pickup local time */
  scheduledPickup: string
  /** ISO datetime in destination local time */
  scheduledDropoff: string
  passengers: Array<{
    travelerId: string
    luggageCount?: number
  }>
  totalPriceCents: number
  /** Resolved coordinates for live UI */
  pickupLocation?: {
    name: string
    address?: string
    coordinates?: { lat: number, lng: number }
  }
  dropoffLocation?: {
    name: string
    address?: string
    coordinates?: { lat: number, lng: number }
  }
}
```

### 1.5 Discriminated union

```ts
export type ComponentBookingData =
  | FlightBookingData
  | AccommodationBookingData
  | ActivityBookingData
  | TransferBookingData
```

The `kind` field is the discriminator. The seed script validates it
matches the parent `Component.type`. The agent reads the union and
narrows by `kind` in the relevant tools.

---

## 2. `ComponentBooking.policy`

The policy applied to *this* booking. Captured at booking time, modified
when the agent confirms a change.

```ts
type BookingPolicy = {
  cancellation: {
    canCancel: boolean
    /** Free until this datetime; after, fee applies */
    freeUntil?: string             // ISO 8601
    feeAfterCents?: number
    currency?: 'EUR'
    notes?: string                 // raw supplier text, kept for audit
  }
  modification: {
    canModify: boolean
    /** Free until this datetime; after, fee applies */
    freeUntil?: string
    feeAfterCents?: number
    currency?: 'EUR'
    /** Which fields can be changed */
    allowedFields?: Array<
      | 'check_in_date'
      | 'check_out_date'
      | 'guests'
      | 'pickup_time'
      | 'departure_date'
      | 'date'
    >
    notes?: string
  }
  /** Raw text from supplier, kept verbatim for support log */
  rawText?: string
}
```

The dataset's loose `cancellation_terms` strings (e.g.,
`"free_until_2025-11-20"`) are parsed into this shape during seeding. See
[`./seed-strategy.md`](./seed-strategy.md) §2.4.

---

## 3. `ComponentEvent.location`

Most events have a destination FK *plus* a location JSON for the precise
spot inside the destination. Location shape varies by event type.

```ts
type ComponentEventLocation =
  | AirportLocation
  | AccommodationLocation
  | ActivityLocation
  | AddressLocation

type AirportLocation = {
  kind: 'airport'
  iataCode: string
  airportId: string                // FK
  terminal?: string
  gate?: string
}

type AccommodationLocation = {
  kind: 'accommodation'
  accommodationProductId: string   // FK
  name: string
  coordinates?: { lat: number, lng: number }
}

type ActivityLocation = {
  kind: 'activity'
  meetingPointName: string
  address?: string
  coordinates?: { lat: number, lng: number }
}

type AddressLocation = {
  kind: 'address'
  label: string
  address?: string
  coordinates?: { lat: number, lng: number }
}
```

Event-type → location-kind defaults:

| EventType         | Default location.kind        | Notes                                |
|-------------------|------------------------------|--------------------------------------|
| `departure`       | `airport`                    | Origin airport                       |
| `arrival`         | `airport`                    | Destination airport                  |
| `check_in`        | `accommodation`              | The hotel                            |
| `check_out`       | `accommodation`              | Same hotel                           |
| `pickup`          | `airport` or `address`       | Wherever the transfer starts         |
| `meeting_point`   | `activity` or `address`      | Tour rendezvous                      |
| `activity_start`  | `activity`                   | Often same as meeting_point          |
| `activity_end`    | `activity` or `address`      | Sometimes a different drop spot      |

---

## 4. `Disruption.suggestedActions`

```ts
type SuggestedAction = {
  id: string                       // stable id within the disruption
  /** What the agent will tell the user */
  description: string
  /** Which tool the agent should call to execute */
  toolCall: {
    tool: 'quoteHotelCheckInChange'
         | 'confirmHotelCheckInChange'
         | 'cancelComponent'
         | 'rescheduleActivity'
         | 'requoteTransfer'
    arguments: Record<string, unknown>
  }
  /** Heuristic priority 1..5; demo trigger is priority 1 */
  priority: number
}
```

The seed pre-fills the demo Disruption with a `priority: 1` suggested
action that *exactly* matches what the demo flow needs the agent to
propose. This guarantees a clean demo path even if Gemini hallucinates.

---

## 5. `VoiceSession.audioMetric`

```ts
type AudioIntelligenceMetric = {
  scenario: 'clean' | 'airport_noise' | 'cafe_noise' | 'street_noise'
  /** 0..1 */
  inputSignalToNoiseRatio?: number
  enhancedSignalToNoiseRatio?: number
  /** 0..1 */
  transcriptQuality: number
  taskCompleted: boolean
  correctTripIdentified: boolean
  correctActionSuggested: boolean
  confirmationRequested: boolean
  /** 0..100 */
  finalScore: number
}
```

Mirrors PLAN.md §8 — kept as a JSON field rather than its own table since
there is at most one metric per session and we want to evolve it freely.

---

## 6. `VoiceActionEvent.payload`

The `type` enum determines the payload shape. Listing the most important:

```ts
type VoiceActionEventPayload =
  | { type: 'session_started';        sessionId: string; tripId: string; phone: string }
  | { type: 'assistant_listening';    sessionId: string; audioMetric?: Partial<AudioIntelligenceMetric> }
  | { type: 'assistant_thinking';     sessionId: string; intent?: string }
  | { type: 'trip_loaded';            sessionId: string; tripId: string; tripSummary: string }
  | { type: 'change_suggested';       sessionId: string; componentId: string; quote: ChangeQuote }
  | { type: 'confirmation_required';  sessionId: string; quote: ChangeQuote }
  | { type: 'change_confirmed';       sessionId: string; componentId: string; bookingId: string; quote: ChangeQuote }
  | { type: 'change_rejected';        sessionId: string; componentId: string; reason?: string }
  | { type: 'support_log_created';    sessionId: string; supportLogId: string }
  | { type: 'session_ended';          sessionId: string; reason: string }

type ChangeQuote = {
  componentId: string
  changeType: 'check_in_date' | 'check_out_date' | 'departure' | 'pickup' | 'date'
  oldValue: string
  newValue: string
  feeCents: number
  currency: 'EUR'
  policySummary: string
  /** ISO 8601 — quote expires after this */
  validUntil: string
}
```

The web UI subscribes to events and renders the appropriate state via
`packages/app`'s state machine. See PLAN.md §6.

---

## 7. Validation strategy

All JSON shapes above live as **Zod schemas** in `packages/types/src/`.
Both the seed script and the voice-agent tool layer import the same
Zod types and validate on read/write. This catches schema drift before
the agent calls a malformed tool.

The Prisma client returns `Json` as `unknown`; everywhere we use it we
narrow with Zod first.
