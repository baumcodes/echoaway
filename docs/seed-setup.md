# EchoAway — Seed Setup

The exact commands to take a fresh checkout to a fully seeded database
ready for the demo. Run everything from the **repo root**.

For the design behind the pipeline, see
[`./seed-strategy.md`](./seed-strategy.md). For implementation details,
see [`apps/backend/prisma/seed/README.md`](../apps/backend/prisma/seed/README.md).

---

## TL;DR — first-time setup

```bash
cp .env.example .env       # single root env, all apps read from here
yarn setup                 # yarn install + yarn db:migrate (creates dev.db)
yarn seed                  # catalog from /dataset (idempotent)
yarn seed:demo             # composes the Barcelona Long Weekend trip
yarn workspace @echoaway/backend sanity   # prints row counts
```

After this you have:

- `apps/backend/prisma/dev.db` (SQLite)
- ~180 catalog rows (destinations, airports, suppliers, hotels, activities, transfers, flight routes)
- The seeded demo trip + flight-delay disruption ready to drive the voice flow

---

## The chain in detail

### 1. Environment

```bash
cp .env.example .env
```

One file at the repo root drives every app. `DATABASE_URL` defaults to
`file:./dev.db`, which Prisma resolves relative to
`apps/backend/prisma/`. Don't create per-app `.env` files.

### 2. Install + migrate

```bash
yarn setup
```

Equivalent to `yarn install && yarn db:migrate`. The migrate step:

1. Applies any pending Prisma migrations to `apps/backend/prisma/dev.db`.
2. Runs `prisma generate`, which writes the typed Prisma Client into
   `node_modules/@prisma/client`. The backend imports `PrismaClient` from
   there — without this step the import resolves to nothing.

If you ever change `apps/backend/prisma/schema.prisma`, run
`yarn db:migrate` again to create the next migration.

### 3. Catalog seed (idempotent)

```bash
yarn seed
```

Loads `/dataset/*.json` into the catalog tables in FK-safe order
(per [`./seed-strategy.md`](./seed-strategy.md) §2.1):

```
1. Synthetic Spain country root         → Destination(dest-spain)
2. dataset/destinations.json            → Destination
3. dataset/airports.json (+ AMS, OSL stubs) → Airport
4. SUPPLIERS constant                   → Supplier
5. dataset/accommodations.json          → AccommodationProduct
6. dataset/activities.json              → ActivityProduct
7. dataset/ground_transfers.json        → GroundTransferProduct
8. dataset/flight_routes.json           → FlightRouteProduct + FlightRouteLeg
```

Every step is `upsert` keyed on the source `_id`, so re-running is safe
and produces no duplicates.

#### Expected row counts (out of the box)

| Model | Count | Notes |
|---|---|---|
| Destination | 29 | 28 dataset + Spain root |
| Airport | 22 | 20 dataset + 2 stubs (AMS, OSL) |
| Supplier | 6 | constants |
| AccommodationProduct | 80 | dataset |
| ActivityProduct | 40 | dataset |
| FlightRouteProduct | 3 | dataset |
| FlightRouteLeg | 4 | derived |
| GroundTransferProduct | 3 | dataset |

`yarn seed` prints the counts at the end.

### 4. Demo-trip seed

```bash
yarn seed:demo
```

Composes the **Barcelona Long Weekend** trip (travelers, segment, 5
components, 5 bookings, 10 events, 1 flight-delay disruption) per
[`./data-model.md`](./data-model.md) §5 and
[`./seed-strategy.md`](./seed-strategy.md) §3.

**Re-runnable.** The script wipes `trip-demo-bcn` (cascade) before
recreating, so calling it twice in a row is safe. Only the demo trip is
touched — catalog rows, travelers, and any other trips are left alone.
`yarn seed:demo:reset` is kept as an explicit alias for the same
behavior.

### 5. Sanity check

```bash
yarn workspace @echoaway/backend sanity
```

Prints the actual row counts in the database. Use it after any seed step
to confirm the DB matches the expected counts above and that the demo
trip is wired correctly.

---

## Common workflows

### Daily — the catalog already exists

You usually don't need to reseed. The catalog is on disk and committed
data hasn't changed. Just:

```bash
yarn dev:backend
```

If you've pulled new commits that modified `/dataset/*.json` or the
schema, run:

```bash
yarn db:migrate     # only if schema changed
yarn seed           # always safe; idempotent
yarn seed:demo      # always safe; self-resets the demo trip first
```

### Nuke and reseed from zero

```bash
yarn db:reset
```

Wipes `dev.db`, replays migrations, and re-runs the seeds Prisma is
configured to call (currently catalog only — `seed:demo` is invoked
manually after).

```bash
yarn db:reset
yarn seed:demo
```

### After enriching the dataset

The dataset is enriched via the
[`@echoaway/dataset-enrich`](../tools/dataset-enrich/README.md) tool,
which writes new rows directly into `/dataset/*.json` (preserving
existing IDs). After running it, the runtime DB is stale. Reseed:

```bash
# 1. Pull / generate more catalog rows (writes JSON in-place)
yarn workspace @echoaway/dataset-enrich enrich

# 2. Re-run the catalog seed (idempotent — only adds the new rows)
yarn seed

# 3. (Optional) reset the demo trip if anything it references moved
yarn seed:demo --reset
```

`yarn seed` does NOT wipe — it upserts. Existing rows stay, new ones get
added.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | Missing `.env` at repo root | `cp .env.example .env` |
| `Cannot find module '@prisma/client'` | `prisma generate` never ran | `yarn db:generate` (or `yarn setup`) |
| Seed fails on FK violation | Catalog rows missing (e.g., `seed:demo` before `seed`) | Run `yarn seed` first |
| Sanity script reports 0 rows | DB was reset but catalog seed didn't re-run | `yarn seed && yarn seed:demo` |
| `Unique constraint failed (id)` on `seed:demo` | Stale code — `seed:demo` now self-resets | Pull latest and retry; or run `yarn db:reset && yarn seed && yarn seed:demo` |

---

## File map

```
apps/backend/prisma/
  schema.prisma              # canonical schema (mirrors docs/erm.md)
  migrations/                # checked-in migrations
  seed/
    index.ts                 # `tsx ... catalog | demo` dispatcher
    sanity.ts                # row-count printer
    catalog/                 # 8-step catalog pipeline (per §3 above)
    shared/db.ts             # PrismaClient singleton
    shared/dataset.ts        # typed loaders for /dataset/*.json
  dev.db                     # SQLite — gitignored, created by db:migrate
```
