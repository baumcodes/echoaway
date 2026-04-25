# EchoAway seed pipeline

Two phases (per [`/docs/seed-strategy.md`](../../../../docs/seed-strategy.md)):

1. **`seed:catalog`** — idempotent load of all reusable inventory. Run as
   often as you like; safe to re-run.
2. **`seed:demo`** — composes the "Barcelona Long Weekend" demo trip.
   Phase 2C (not yet implemented). Will accept `--reset` for clean re-runs.

## Layout

```
seed/
  index.ts                  entry; dispatches catalog | demo by argv
  sanity.ts                 prints row counts (also runnable standalone)
  shared/
    db.ts                   PrismaClient singleton + JSON stringify helper
    dataset.ts              loads /dataset/*.json with typed shapes
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
| Destination | 29 | 28 dataset + Spain root |
| Airport | 22 | 20 dataset + 2 stubs (AMS, OSL) for out-of-corridor flight routes |
| Supplier | 6 | constants in `catalog/shared.ts` |
| AccommodationProduct | 80 | dataset |
| ActivityProduct | 40 | dataset |
| FlightRouteProduct | 3 | dataset |
| FlightRouteLeg | 4 | derived (1+1+2 legs across the 3 routes) |
| GroundTransferProduct | 3 | dataset |

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
