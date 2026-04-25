# EchoAway seed pipeline

Two phases (per [`/docs/seed-strategy.md`](../../../../docs/seed-strategy.md)):

1. **`seed:catalog`** — idempotent load of all reusable inventory. Run as
   often as you like; safe to re-run.
2. **`seed:demo`** — runs catalog (idempotent), then composes the
   "Barcelona Long Weekend" demo trip. The demo-trip step is **not**
   idempotent on its own — re-runs without `--reset` will fail on unique
   constraints. Use `seed:demo:reset` to wipe just the demo trip and
   recreate.

## Layout

```
seed/
  index.ts                  entry; dispatches catalog | demo (+ --reset) by argv
  sanity.ts                 row counts + relational + Zod-shape validator
                            (43+ checks; runnable standalone)
  shared/
    db.ts                   PrismaClient singleton + JSON stringify helper
    dataset.ts              loads /dataset/*.json with typed shapes
  demo-trip/
    index.ts                orchestrates trip → bookings → events → disruption
    constants.ts            stable demo IDs (DEMO_TRIP_ID, COMPONENTS, …)
    dates.ts                anchors the trip to today + 7 days
    travelers.ts            Stephan (phone-keyed) + Anna
    trip.ts                 Trip + TripSegment + TripTraveler
    components.ts           5 Component rows (polymorphic-FK invariant)
    bookings.ts             5 ComponentBooking rows (Zod-validated data + policy)
    events.ts               10 ComponentEvent rows (Zod-validated location)
    disruption.ts           flight_delay disruption + suggestedActions
    load-catalog.ts         pre-loads + asserts every catalog reference
    reset.ts                wipes just the demo trip (cascades take the rest)
  catalog/
    index.ts                orchestrates inserts in FK-safe order
    shared.ts               inferDestinationType, matchSupplier,
                            parseCancellationToPolicy, IATA & city lookups
    types.ts                re-exports of @echoaway/types enums + a local
                            ModificationPolicyParsed shape
    destinations.ts         + synthesises the dest-spain country root
    airports.ts             servesDestinationId via city match
    suppliers.ts            6 synthetic supplier rows
    accommodations.ts       + parses cancellation_terms into a structured
                            modification policy
    activities.ts
    ground-transfers.ts     resolves "from" labels by IATA, "to" labels
                            by accommodation name
    flight-routes.ts        also writes FlightRouteLeg rows
```

## Run order (FK-safe)

```
1. dest-spain (synthesised country root)
2. dataset/destinations.json    → Destination
3. dataset/airports.json        → Airport
4. SUPPLIERS const              → Supplier
5. dataset/accommodations.json  → AccommodationProduct
6. dataset/activities.json      → ActivityProduct
7. dataset/ground_transfers.json → GroundTransferProduct
8. dataset/flight_routes.json    → FlightRouteProduct + FlightRouteLeg
```

## Idempotency

Every catalog step uses `prisma.<model>.upsert({ where: { id: src._id }, … })`
keyed on the source `_id`. Re-running `yarn seed` does not duplicate rows.

The synthetic Spain country root is keyed on the constant
`SPAIN_ROOT_ID = 'dest-spain'`.

FlightRouteLeg ids are derived as `{routeId}-leg-{n}` so reseeding upserts
the same legs in place.

## Expected counts after `yarn seed`

| Model | Expected | Source |
|---|---|---|
| Destination | dataset rows + 1 | dataset rows + Spain root (currently 62) |
| Airport | 22 | 20 dataset + 2 stubs (AMS, OSL) for out-of-corridor flight routes |
| Supplier | 6 | constants in `catalog/shared.ts` |
| AccommodationProduct | 80 | dataset |
| ActivityProduct | 40 | dataset |
| FlightRouteProduct | 3 | dataset |
| FlightRouteLeg | 4 | derived (1+1+2 legs across the 3 routes) |
| GroundTransferProduct | 3 | dataset |

After `yarn seed:demo` you additionally get:

| Model | Expected | Source |
|---|---|---|
| Traveler | 2 | Stephan (phone-keyed) + Anna |
| Trip | 1 | "Barcelona Long Weekend" |
| Component | 5 | flight, transfer, stay, sagrada activity, food activity |
| ComponentBooking | 5 | one per Component |
| ComponentEvent | 10 | departure/arrival, pickup, check-in/out, meeting+start+end ×2 |
| Disruption | 1 | flight_delay with 2 suggestedActions |

`yarn seed` ends by printing these counts. You can also run
`yarn workspace @echoaway/backend sanity` standalone to inspect the DB.

## Unresolved references

Some airports serve cities that aren't in `dataset/destinations.json`
(Madrid, Seville, Málaga, Murcia, Girona, all 10 German cities). Their
`servesDestinationId` is intentionally `null` — the airport still exists
so flight routes can reference it.

`flight_routes.json` references AMS (Amsterdam) and OSL (Oslo), which
aren't in `airports.json`. We synthesise stub Airport rows for them via
`EXTRA_AIRPORTS` in `catalog/shared.ts`. Their `servesDestinationId` is
`null` because we have no matching Destination either.
