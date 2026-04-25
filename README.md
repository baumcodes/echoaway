# EchoAway Voice Concierge

> A voice-first travel assistant that understands you in noisy real-world
> environments, retrieves your trip context, and updates the web app live
> while safely executing booking actions.

Big Berlin Hack prototype for the **telli & ai-coustics** track ("Voice AI
that works in the wild") with side-challenge targets at **Gradium** and
**Aikido**.

> The traveler is at the airport. Their flight from Berlin to Barcelona is
> delayed. They open EchoAway and say: "Can you move my hotel check-in to
> tomorrow?" The agent loads their trip from Prisma, reads the seeded
> disruption, checks the hotel modification policy, computes a change
> proposal, and updates the web UI live. They confirm. The booking and
> check-in event are mutated. A support log is created.

---

## Architecture

```
/apps
  /web          Vite + React — primary demo renderer
  /mobile       Expo placeholder — reuses /packages later
  /backend      NestJS + Prisma + SQLite
  /voice-agent  Node worker — Gemini + Gradium + ai-coustics

/packages
  /types        Shared TS types + Zod schemas
  /app          Shared API client, demo state machine, event mapping
  /ui           Shared cross-platform UI components

/dataset        Raw inventory JSON (28 destinations, 20 airports, 80 hotels…)
/docs           Canonical design docs
```

Design docs (canonical):

- [`docs/erm.md`](./docs/erm.md) — entity-relationship model (mermaid).
- [`docs/data-model.md`](./docs/data-model.md) — narrative + decision log.
- [`docs/component-data-shapes.md`](./docs/component-data-shapes.md) — typed
  JSON contracts for `ComponentBooking.data`, `ComponentEvent.location`,
  `BookingPolicy`, `Disruption.suggestedActions`, etc.
- [`docs/seed-strategy.md`](./docs/seed-strategy.md) — `dataset/*.json` →
  Prisma pipeline.
- [`docs/seed-setup.md`](./docs/seed-setup.md) — exact commands and order
  to seed a fresh checkout (catalog → demo trip → sanity).
- [`docs/runtime-flow.md`](./docs/runtime-flow.md) — mermaid diagrams of
  the realtime audio + control loop and the demo conversation sequence.

Build plan: [`PLAN.md`](./PLAN.md). Phase 1 sets up the monorepo
skeleton; Phase 2 adds Prisma + seeds; Phase 3+ build UI, voice, and
partner integrations.

---

## Resource docs

Vendored third-party API references (so agents can work offline).

- [`docs/gradium/`](./docs/gradium/) — Gradium voice API (TTS/STT,
  voices, pronunciation dictionaries). Start at
  [`docs/gradium/index.md`](./docs/gradium/index.md).
- [`docs/tavily/`](./docs/tavily/) — Tavily API (Search, Extract, Map,
  Crawl, JS SDK). Start at
  [`docs/tavily/index.md`](./docs/tavily/index.md).
- [`docs/ai-coustics/`](./docs/ai-coustics/) — ai-coustics speech
  enhancement (LiveKit plugin + Node SDK examples). Start at
  [`docs/ai-coustics/index.md`](./docs/ai-coustics/index.md).

---

## Partner technologies

The hackathon requires at least three. Used here:

| Tech                | Role                                              | Wired in |
|---------------------|---------------------------------------------------|----------|
| Google DeepMind / Gemini | LLM reasoning + tool calling for the agent  | Phase 5  |
| Gradium             | Realtime STT + TTS (custom LiveKit plugins)       | Phase 7  |
| Tavily              | Travel context enrichment                         | Phase 8  |
| ai-coustics         | Audio enhancement (track-specific)                | Phase 6  |
| Aikido              | Optional security scan on the repo                | Phase 9  |

---

## Local setup

Requires Node 20+ and Yarn 1 (classic).

### First-time setup

```bash
cp .env.example .env       # single root env, all apps read from here
yarn setup                 # install + run prisma migrate dev (creates dev.db)
```

`yarn setup` is shorthand for `yarn install && yarn db:migrate`. The
migrate step also runs `prisma generate`, which produces the typed Prisma
Client into `node_modules/@prisma/client`. Without it, the backend can't
import a working `PrismaClient`.

### Daily commands (all from repo root)

```bash
# dev servers
yarn dev:web          # Vite, http://localhost:5173
yarn dev:backend      # NestJS, http://localhost:4000
yarn dev:voice-agent  # Node worker placeholder
yarn dev:mobile       # Expo placeholder

# database (Prisma + SQLite at apps/backend/prisma/dev.db)
yarn db:generate      # regenerate Prisma Client (after schema change)
yarn db:migrate       # apply pending migrations (creates one if schema drifted)
yarn db:reset         # nuke dev.db + replay migrations + reseed
yarn db:studio        # open Prisma Studio in the browser

# seeds — full chain documented in docs/seed-setup.md
yarn seed             # catalog from /dataset (idempotent, ~80 hotels etc.)
yarn seed:demo        # catalog + demo trip (demo-trip step lands in Phase 2C)

# checks
yarn typecheck        # tsc --noEmit across every workspace
yarn test             # types Zod round-trip + backend e2e (~10s)
yarn test:backend     # backend e2e only (vitest + supertest on a separate test.db)
yarn test:types       # types Zod round-trip only
yarn build            # build every workspace
```

### Environment

There is **one** env file at the repo root: `/.env` (copied from
`/.env.example`, gitignored). All apps read from it:

- `apps/web` — Vite is configured with `envDir: '../..'`
- `apps/backend` — `dotenv` loads `../../.env` in `src/main.ts`; Prisma
  scripts go through `dotenv-cli -e ../../.env` so `DATABASE_URL`
  resolves at migrate time
- `apps/voice-agent` — `dotenv` loads `../../.env` in `src/index.ts`

Don't create per-app `.env` files; that defeats the single-source rule.

---

## Demo flow

The seeded demo is the **Barcelona Long Weekend** trip — Stephan + Anna,
Berlin → Barcelona on Vueling VY1885, Hotel Brisa Barcelona for 4 nights,
Sagrada Família + Tapas tours. The flight is pre-loaded with a
`flight_delay` disruption that drives the voice flow.

Full composition: [`docs/data-model.md`](./docs/data-model.md) §5.
Demo trip seed: [`docs/seed-strategy.md`](./docs/seed-strategy.md) §3.

---

## Status

- **Phase 1 — Scope lock and repository setup**: complete. Monorepo
  installs cleanly; `@echoaway/types` exposes the canonical enums + Zod
  schemas from the design docs.
- **Phase 2A — Prisma schema and types**: complete. `apps/backend/prisma/schema.prisma`
  mirrors `docs/erm.md`. Migration `init` is applied.
- **Phase 2B — Catalog seed from dataset**: complete. `yarn seed` loads
  ~180 catalog rows idempotently. See
  [`apps/backend/prisma/seed/README.md`](./apps/backend/prisma/seed/README.md).

Next: **Phase 2C — Demo trip seed**.
