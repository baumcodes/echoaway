# @echoaway/backend

NestJS + Prisma + SQLite. Mirrors the schema in [`docs/erm.md`](../../docs/erm.md);
seed pipeline lives in [`prisma/seed/README.md`](./prisma/seed/README.md).

## Run

```bash
# from repo root
yarn setup            # install + db:migrate (also runs prisma generate)
yarn seed:demo        # catalog + Barcelona Long Weekend trip
yarn dev:backend      # starts on http://localhost:4000
```

Validation: every JSON request body is parsed through a Zod schema from
`@echoaway/types`; failures return `400` with structured `issues`.

CORS allow-list (configured in `src/main.ts`):
`http://localhost:5173`, `:5174`, `:3000`.

## Endpoints

### `GET /health`

Liveness probe.

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"echoaway-backend","phase":1}
```

### `GET /trips/:tripId`

Returns the full trip with components, bookings (JSON columns parsed),
events, traveler list, and active disruptions.

```bash
curl http://localhost:4000/trips/trip-demo-bcn | jq
```

### `GET /trips/by-phone/:phoneNumber`

Demo's lead lookup. URL-encode the `+` if your shell mangles it.

```bash
curl 'http://localhost:4000/trips/by-phone/+4915112345678' | jq
```

### `GET /trips/:tripId/disruptions`

```bash
curl http://localhost:4000/trips/trip-demo-bcn/disruptions | jq
```

### `POST /trips/:tripId/hotel/check-in/quote-change`

Reads the hotel ComponentBooking + policy, computes a fee against
`policy.modification.freeUntil`, returns a `ChangeQuote` shape (see
`docs/component-data-shapes.md §6`). Marks the booking
`status='pending_change'` for the live UI. If `sessionId` is provided,
persists a `change_suggested` VoiceActionEvent.

```bash
curl -X POST http://localhost:4000/trips/trip-demo-bcn/hotel/check-in/quote-change \
  -H 'Content-Type: application/json' \
  -d '{"newCheckInDate":"2026-05-03"}' | jq
```

### `POST /trips/:tripId/hotel/check-in/confirm-change`

Mutates `ComponentBooking.data` (checkInDate, nights recomputed against
the unchanged checkOutDate, totalPriceCents recomputed), bumps the
check_in `ComponentEvent.startsAt` by the same shift (preserving the
local time-of-day), and sets `Component.status='changed'`. Persists a
`change_confirmed` VoiceActionEvent if `sessionId` is provided.

```bash
curl -X POST http://localhost:4000/trips/trip-demo-bcn/hotel/check-in/confirm-change \
  -H 'Content-Type: application/json' \
  -d '{"newCheckInDate":"2026-05-03"}' | jq
```

### `POST /support-logs`

```bash
curl -X POST http://localhost:4000/support-logs \
  -H 'Content-Type: application/json' \
  -d '{
    "tripId":"trip-demo-bcn",
    "transcript":"User asked to move check-in.",
    "summary":"Hotel check-in shifted by 1 day, no fee.",
    "actions":["confirmHotelCheckInChange"]
  }' | jq
```

### `POST /voice/token`

Mints a LiveKit JWT for the web app to join the voice agent's room.
Reads `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` from the
root `.env`.

```bash
curl -X POST http://localhost:4000/voice/token \
  -H 'Content-Type: application/json' \
  -d '{"identity":"trav-stephan","name":"Stephan"}' | jq
# { token: "eyJhbGc…", url: "wss://…livekit.cloud", room: "echoaway-demo", identity: "trav-stephan" }
```

Body shape (`identity` required, others optional):
```json
{ "identity": "<traveler-id>", "name": "<display name>", "room": "<room-name>" }
```

Default room is `echoaway-demo`. Token TTL is 1h.

### Catalog reads

```bash
curl 'http://localhost:4000/catalog/destinations?countryCode=ES' | jq 'length'
curl 'http://localhost:4000/catalog/accommodations?destinationId=dest-barcelona' | jq 'length'
curl 'http://localhost:4000/catalog/activities?destinationId=dest-barcelona' | jq 'length'
curl 'http://localhost:4000/catalog/flight-routes?fromIata=BER&toIata=BCN' | jq
curl 'http://localhost:4000/catalog/transfers?fromAirportId=air-bcn' | jq
```

## VoiceSession + voice events

Phase 2D writes `VoiceActionEvent` rows when `sessionId` is included on
quote/confirm/support-log requests. The `VoiceSession` row that owns
those events has to exist (FK is required) — Phase 5 (the voice agent)
creates sessions; for now leave `sessionId` off when curl-testing.

The `/events/stream` SSE endpoint that broadcasts these events to the
web UI lands in Phase 4.

## Tests

```bash
yarn test:backend          # ~10s, 24 e2e specs across 6 files
yarn workspace @echoaway/backend test:watch
```

Tests boot the real Nest app via `Test.createTestingModule`, mint
supertest agents against it, and run against a dedicated SQLite DB at
`apps/backend/prisma/test.db` (wiped + migrated + seeded by
`test/global-setup.ts` once per run). Mutation specs call
`resetDemoTrip()` between cases so quote/confirm starts from a known
state every time.

Vitest is configured with `unplugin-swc` so NestJS's
`emitDecoratorMetadata`-based DI works (the default esbuild loader
strips that metadata and breaks injection).

## Round-trip sanity

```bash
yarn seed:demo:reset             # fresh demo trip (43 sanity checks)
curl http://localhost:4000/trips/trip-demo-bcn | jq '.components[] | {id, status, "booking.status": .booking.status, ciDate: .booking.data.checkInDate?}'
curl -X POST http://localhost:4000/trips/trip-demo-bcn/hotel/check-in/confirm-change \
  -H 'Content-Type: application/json' \
  -d '{"newCheckInDate":"2026-05-03"}' | jq '.quote'
yarn sanity                      # all green after the mutation too
```
