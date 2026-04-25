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
  /backend      NestJS + Prisma + SQLite (Prisma added in Phase 2A)
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

Build plan: [`PLAN.md`](./PLAN.md). Phase 1 (this commit) sets up the
monorepo skeleton; Phase 2 adds Prisma + seeds; Phase 3+ build UI, voice,
and partner integrations.

---

## Partner technologies

The hackathon requires at least three. Used here:

| Tech                | Role                                              | Wired in |
|---------------------|---------------------------------------------------|----------|
| Google DeepMind / Gemini | LLM reasoning + tool calling for the agent  | Phase 5  |
| Gradium             | Realtime voice / TTS                              | Phase 7  |
| Tavily              | Travel context enrichment                         | Phase 8  |
| ai-coustics         | Audio enhancement (track-specific)                | Phase 6  |
| Aikido              | Optional security scan on the repo                | Phase 9  |

---

## Local setup

Requires Node 20+ and Yarn 1 (classic).

```bash
yarn install
```

Each app exposes a placeholder dev command from the repo root:

```bash
yarn dev:web          # Vite dev server, http://localhost:5173
yarn dev:backend      # NestJS, http://localhost:4000
yarn dev:voice-agent  # Node worker placeholder
yarn dev:mobile       # Expo placeholder (prints a message in Phase 1)
```

`.env.example` files live at the repo root and inside each app — copy each
to `.env` and fill in API keys when you reach the relevant phase.

Database seeding (added in Phase 2):

```bash
yarn seed       # catalog (idempotent)
yarn seed:demo  # catalog + demo trip ("Barcelona Long Weekend")
```

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

**Phase 1 — Scope lock and repository setup** is complete. The monorepo
installs cleanly and each workspace has a placeholder start command. The
shared `@echoaway/types` package already exposes the canonical enums and
Zod schemas from the design docs so subsequent phases can import them
without churn.

Next: **Phase 2A — Prisma schema and types**.
