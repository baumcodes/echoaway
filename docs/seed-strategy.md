# EchoAway — Seed Strategy

How `dataset/*.json` becomes a SQLite database the voice agent can
reason over. Two-phase pipeline:

1. **`seed:catalog`** — idempotent load of all reusable inventory.
2. **`seed:demo-trip`** — composes the one demo trip the prototype showcases.

Both are runnable from `apps/backend` via `yarn seed` (catalog only) and
`yarn seed:demo` (catalog + demo trip).

---

## 1. Why a transformation step

The dataset is *good*, not *final*. Loading it raw into Prisma would:

- Drop the German→Spain corridor implied by the airport mix.
- Lose the supplier→product link (suppliers appear as inline JSON).
- Force every booking to be a hotel (the dataset has no flight bookings).
- Tie ID prefixes (`hotel-bcn-01`) to schema choices forever.

The seed pipeline keeps source-of-truth IDs (`hotel-bcn-01` becomes
`AccommodationProduct.id = "hotel-bcn-01"`) but reshapes everything else
into the four-layer model from [`./data-model.md`](./data-model.md).

---

## 2. Phase 1: `seed:catalog`

### 2.1 Order of inserts (respects FK constraints)

```
1.  Country                    →  synthesize "Spain" (id: dest-spain)
2.  Destination (countries)    →  Spain root only
3.  Destination (cities/parks) →  28 from destinations.json, parent = dest-spain
4.  Airport                    →  20 from airports.json, link to Destination by city
5.  Supplier                   →  derived from accommodations + activities + transfers
6.  AccommodationProduct       →  80 from accommodations.json
7.  ActivityProduct            →  40 from activities.json
8.  GroundTransferProduct      →  3 from ground_transfers.json
9.  FlightRouteProduct + legs  →  3 from flight_routes.json (1 supplier added: airline-aggregator)
```

Idempotent via `upsert` keyed on the source `_id`.

### 2.2 Destinations

Source: `dataset/destinations.json`.

Transform per record:

```ts
{
  id: src._id,                                    // "dest-barcelona"
  parentDestinationId: 'dest-spain',
  type: inferDestinationType(src),                // city|park|village
  name: src.name,
  countryCode: src.iso_country_code,              // "ES"
  countryName: src.country,                       // "Spain"
  timezone: 'Europe/Madrid',                      // hardcoded for ES; lookup table later
  coordinates: src.location,                      // {lat, lng}
  summary: src.description,
  tags: src.tags,
}
```

`inferDestinationType` heuristic:

```ts
function inferDestinationType(src) {
  if (src.tags.includes('mountain') || src.tags.includes('monastery')) return 'park'
  if (src.tags.includes('village') || src.tags.includes('whitewashed')) return 'city_area'
  if (src.tags.includes('park') || src.name.toLowerCase().includes('park')) return 'park'
  return 'city'
}
```

The synthetic Spain root is added before the loop:

```ts
{
  id: 'dest-spain',
  parentDestinationId: null,
  type: 'country',
  name: 'Spain',
  countryCode: 'ES',
  countryName: 'Spain',
  timezone: 'Europe/Madrid',
  coordinates: null,
  summary: 'Country root used for hierarchy.',
}
```

### 2.3 Airports

Source: `dataset/airports.json`.

Transform per record:

```ts
{
  id: src._id,                                    // "air-fra"
  iataCode: src.iata,                             // "FRA"
  icaoCode: src.icao,                             // "EDDF"
  name: src.name,
  city: src.city,
  country: src.country,
  servesDestinationId: matchDestinationByCity(src.city),
  coordinates: src.location,
}
```

`matchDestinationByCity` resolution (rough, with fallbacks):

| Airport city                      | Resolved destination     |
|-----------------------------------|--------------------------|
| Barcelona                         | dest-barcelona           |
| Valencia                          | dest-valencia            |
| Alicante                          | dest-alicante            |
| Jerez de la Frontera (Cádiz)      | dest-jerez               |
| Tarragona (near Barcelona)        | dest-tarragona           |
| Girona (near Barcelona)           | null (not in dataset)    |
| Madrid / Seville / Málaga / Murcia| null (not in dataset)    |
| All German cities                 | null                     |

Unresolved airports (e.g., Madrid, German cities) get `servesDestinationId = null`. They exist for flight routes but don't have a destination card.

### 2.4 Suppliers

Built by union of unique `supplier.name` values across:

- accommodations.json (`Hotelbeds` only)
- activities.json (`GetYourGuide`, `Tiqets`, `Viator`)
- ground_transfers.json (`Iberia Ground Transfers` only)
- + a synthetic `airline-aggregator` for FlightRouteProducts (since the dataset has airlines per leg but no booking aggregator)

```ts
type SupplierSeed = { id: string, name: string, category: SupplierCategory }

const suppliers: SupplierSeed[] = [
  { id: 'sup-hotelbeds',         name: 'Hotelbeds',         category: 'accommodation' },
  { id: 'sup-getyourguide',      name: 'GetYourGuide',      category: 'activity' },
  { id: 'sup-tiqets',            name: 'Tiqets',            category: 'activity' },
  { id: 'sup-viator',            name: 'Viator',            category: 'activity' },
  { id: 'sup-iberia-ground', name: 'Iberia Ground Transfers', category: 'transfer' },
  { id: 'sup-airline-aggregator', name: 'Airline Aggregator', category: 'flight' },
]
```

### 2.5 AccommodationProduct

Source: `dataset/accommodations.json`. 80 rows.

```ts
{
  id: src._id,
  destinationId: matchDestinationByCity(src.city),       // hotel-bcn-* → dest-barcelona
  supplierId: 'sup-hotelbeds',
  name: src.name,
  stars: src.stars,
  pricePerNightCents: src.price_per_night * 100,
  currency: 'EUR',
  amenities: src.amenities,
  coordinates: src.location,
  description: src.description,
  defaultCancellationTerms: src.cancellation_terms,
  defaultModificationPolicy: parseCancellationToPolicy(src.cancellation_terms),
  images: src.images,
  contractRef: src.supplier.contract_ref,
}
```

`parseCancellationToPolicy` parses dataset strings:

```ts
function parseCancellationToPolicy(raw: string): ModificationPolicy {
  // Examples: "free_until_2025-11-20"
  const m = /free_until_(\d{4}-\d{2}-\d{2})/.exec(raw)
  if (m) {
    return {
      canModify: true,
      feeAmount: 0,
      currency: 'EUR',
      latestModificationTime: `${m[1]}T18:00:00.000Z`,
      notes: raw,
    }
  }
  return {
    canModify: false,
    feeAmount: 0,
    currency: 'EUR',
    latestModificationTime: null,
    notes: raw,
  }
}
```

### 2.6 ActivityProduct

Source: `dataset/activities.json`. 40 rows.

```ts
{
  id: src._id,
  destinationId: matchDestinationByCity(src.city),
  supplierId: matchSupplier(src.supplier.name),          // 'sup-getyourguide' etc.
  name: src.name,
  tags: src.tags,
  durationHours: src.duration_hours,
  openingHours: src.opening_hours,                       // JSON as-is
  priceCents: src.price * 100,
  currency: 'EUR',
  description: src.description,
  contractRef: src.supplier.contract_ref,
}
```

### 2.7 GroundTransferProduct

Source: `dataset/ground_transfers.json`. 3 rows.

```ts
{
  id: src._id,
  fromAirportId: resolveAirportFromLabel(src.from),       // "BCN Airport" → "air-bcn"
  toDestinationId: resolveDestinationFromLabel(src.to),   // null if hotel-specific
  toAccommodationProductId: resolveAccommodationFromLabel(src.to),
  supplierId: 'sup-iberia-ground',
  fromLabel: src.from,
  toLabel: src.to,
  mode: src.mode,
  durationMinutes: src.duration_minutes,
  priceCents: src.price * 100,
  currency: src.currency,
  schedule: src.schedule,
  description: src.description,
  contractRef: src.supplier.contract_ref,
}
```

The label resolvers do best-effort string matching (`BCN Airport` → IATA
`BCN` → `air-bcn`; `Hotel Brisa Barcelona` → exact match on
`AccommodationProduct.name`). Unresolved → null FK; the label still
renders.

### 2.8 FlightRouteProduct + FlightRouteLeg

Source: `dataset/flight_routes.json`. 3 rows.

```ts
const product = {
  id: src._id,                                            // "flt-ber-bcn-01"
  fromAirportId: airportByIata(src.from),                 // air-ber
  toAirportId: airportByIata(src.to),                     // air-bcn
  supplierId: 'sup-airline-aggregator',
  stops: src.stops,
  daysOfWeek: src.days_of_week,
  priceAvgCents: src.price_avg * 100,
  currency: src.currency,
  fareConditions: src.fare_conditions,
  durationHours: src.duration_hours,
}

const legs = src.legs.map((leg, i) => ({
  id: `${src._id}-leg-${i + 1}`,
  flightRouteProductId: src._id,
  order: i + 1,
  fromAirportId: airportByIata(leg.from),
  toAirportId: airportByIata(leg.to),
  flightNo: leg.flight_no,
  airline: leg.airline,
  depTime: leg.dep_time,                                  // "07:00" (local)
  arrTime: leg.arr_time,
}))
```

---

## 3. Phase 2: `seed:demo-trip`

Composes the demo trip referenced in [`./data-model.md`](./data-model.md) §5.
Runs after `seed:catalog`. **Not idempotent** by default — running it
twice creates two trips. There's a `--reset` flag that deletes the
demo trip first.

### 3.1 Travelers

```ts
[
  { id: 'trav-stephan', fullName: 'Stephan Rüschenbaum', email: 'big-berlin-hack-april-26@planaway.com', phone: '+4915112345678', locale: 'en-DE' },
  { id: 'trav-anna',    fullName: 'Anna Müller',         email: null,                    phone: null,            locale: 'en-DE' },
]
```

The phone number on Stephan is the lookup key for the voice agent's
`getTripByPhone` tool.

### 3.2 Trip + segment + components

A relative-date helper centers everything around `today + 7 days` so the
demo always feels current:

```ts
const TRIP_START = startOfDay(addDays(now, 7))   // a week from now
const TRIP_END   = startOfDay(addDays(now, 11))  // 4 nights
```

**Trip:**

```ts
{
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  status: 'booked',
  startDate: TRIP_START,
  endDate: TRIP_END,
  currency: 'EUR',
}
```

**TripSegment 1:**

```ts
{
  id: 'seg-1',
  tripId: 'trip-demo-bcn',
  destinationId: 'dest-barcelona',
  startDate: TRIP_START,
  endDate: TRIP_END,
  order: 1,
  title: 'Barcelona',
}
```

**Components (referencing catalog products):**

| id              | type           | references                       | bookingPriceCents (EUR) |
|-----------------|----------------|----------------------------------|-------------------------|
| `comp-flight-out` | `flight`       | `flightRouteProduct: flt-ber-bcn-01` | 24000 (2 pax × 120)     |
| `comp-transfer`   | `transfer`     | `groundTransferProduct: trf-bcn-hotelbrisa` | 3600 (2 pax × 18)       |
| `comp-stay`       | `accommodation`| `accommodationProduct: hotel-bcn-01` | 58000 (4 nights × 145)  |
| `comp-act-sagrada`| `activity`     | `activityProduct: act-bcn-sagrada`   | 8400 (2 pax × 42)       |
| `comp-act-tapas`  | `activity`     | `activityProduct: act-bcn-tapas` (or any tapas activity) | 10400 (2 pax × 52) |

(Return flight intentionally omitted to keep the demo focused. Add later if time allows.)

### 3.3 ComponentBookings

For each component, write a `ComponentBooking` with:

- `status: 'confirmed'`
- `supplierId: <from product>`
- `supplierBookingReference: 'DEMO-{COMP_ID}-001'`
- `priceCents: <as above>`
- `currency: 'EUR'`
- `policy: <from product, with demo override for hotel>`
- `data: <typed JSON per component-data-shapes.md>`

**Hotel booking policy override (critical for demo):**

The demo voice flow needs the hotel's modification policy to allow free
check-in change *today*. Override the parsed default:

```ts
const HOTEL_POLICY: BookingPolicy = {
  cancellation: { canCancel: true, freeUntil: TRIP_START.minus({ hours: 24 }), notes: 'Free until 24h before arrival' },
  modification:  {
    canModify: true,
    freeUntil: endOfDay(now).toISO(),               // today, 23:59 local
    feeAfterCents: 0,
    currency: 'EUR',
    allowedFields: ['check_in_date', 'check_out_date'],
    notes: 'Free same-day check-in adjustment for demo.',
  },
}
```

### 3.4 ComponentEvents

| Component         | Events                                    |
|-------------------|-------------------------------------------|
| `comp-flight-out` | `departure` (BER 18:00 local), `arrival` (BCN 20:40 local) |
| `comp-transfer`   | `pickup` (BCN airport, 21:30 local)        |
| `comp-stay`       | `check_in` (TRIP_START 22:00), `check_out` (TRIP_END 11:00) |
| `comp-act-sagrada`| `meeting_point` (Sagrada plaza, day 2 10:00), `activity_start` (10:30), `activity_end` (12:00) |
| `comp-act-tapas`  | `activity_start` (day 3 18:00), `activity_end` (21:00) |

Each event references its destination via `destinationId` and stores its
precise location in `location` JSON (per
[`./component-data-shapes.md`](./component-data-shapes.md) §3).

### 3.5 Disruption (the demo trigger)

```ts
{
  id: 'disrupt-flight-delay',
  tripId: 'trip-demo-bcn',
  affectedComponentId: 'comp-flight-out',
  type: 'flight_delay',
  severity: 'major',
  message: 'Vueling VY1885 BER → BCN is delayed by 3h. Estimated arrival: 23:40 local.',
  status: 'open',
  detectedAt: now,
  suggestedActions: [
    {
      id: 'shift-checkin',
      description: 'Move hotel check-in from tonight to tomorrow.',
      toolCall: {
        tool: 'quoteHotelCheckInChange',
        arguments: {
          componentId: 'comp-stay',
          newCheckInDate: TRIP_START.plus({ days: 1 }).toISODate(),
        },
      },
      priority: 1,
    },
    {
      id: 'requote-transfer',
      description: 'Reschedule airport transfer to match new arrival.',
      toolCall: {
        tool: 'requoteTransfer',
        arguments: {
          componentId: 'comp-transfer',
          newPickup: '23:50',
        },
      },
      priority: 2,
    },
  ],
}
```

### 3.6 Empty operations rows

`VoiceSession`, `VoiceActionEvent`, `SupportLog` are **not** seeded —
they are created during the live demo. The demo script can optionally
seed a "previous session" for screenshots, but that's a polish task.

---

## 4. Re-runnability matrix

| Script              | Idempotent on tables                                      |
|---------------------|-----------------------------------------------------------|
| `seed:catalog`      | Yes — upsert on source IDs across all 8 catalog tables    |
| `seed:demo-trip`    | No — creates new IDs each run unless `--reset` flag       |
| `seed:demo-trip --reset` | Deletes `trip-demo-bcn` cascade, then recreates       |
| `seed:reset`        | `prisma migrate reset` + both seeds in order              |

Everything is keyed off stable string IDs (no autoincrement), so reseeding
never breaks references in `Component → catalog`.

---

## 5. Implementation outline

`apps/backend/prisma/seed/`:

```
index.ts                  // entry, dispatches based on env or argv
catalog/
  destinations.ts
  airports.ts
  suppliers.ts
  accommodations.ts
  activities.ts
  ground-transfers.ts
  flight-routes.ts
  shared.ts               // matchDestinationByCity, parseCancellationToPolicy, etc.
demo-trip/
  travelers.ts
  trip.ts
  components.ts
  bookings.ts
  events.ts
  disruption.ts
  index.ts
```

Each catalog file exports a default async function `(prisma) => Promise<void>`.
The order in §2.1 is enforced by `index.ts`.

---

## 6. What lives in `packages/types`

- All enums from [`./erm.md`](./erm.md) §2 (mirrored from `prisma/schema.prisma`)
- All JSON shapes from [`./component-data-shapes.md`](./component-data-shapes.md), as Zod schemas
- A `parseCancellationToPolicy` helper used both by seed and at runtime
- Discriminator helpers: `assertComponentDataMatchesType(data, type)`

The voice-agent service and the web app consume these via the workspace
import; nothing else gets to invent JSON shapes.
