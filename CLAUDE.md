# EchoAway — agent onboarding

EchoAway Voice Concierge is a **Big Berlin Hack** prototype: a real-time travel voice interface that still works in noisy environments, takes visible actions inside a polished web app while the user speaks, and is structured so the same logic can later power an Expo mobile app.

This file is read on every session. Skim it, then pull in the linked docs only when you need their detail.

---

## Documentation map

The four files under `docs/` are the **canonical** source of truth for the data model. `PLAN.md` drives the build. `dataset/` is the raw inventory.

- **@docs/erm.md** — canonical entity-relationship model (mermaid). 17 entities across 4 layers. Read first when designing schema, queries, or migrations.
- **@docs/data-model.md** — narrative + decision log. Explains _why_ the schema looks the way it does, layer-by-layer rationale, the demo trip composition (§5), and what we deliberately don't model.
- **@docs/component-data-shapes.md** — typed JSON contracts for `ComponentBooking.data`, `ComponentEvent.location`, `BookingPolicy`, `Disruption.suggestedActions`, `VoiceActionEvent.payload`, `VoiceSession.audioMetric`. Use these shapes verbatim in code.
- **@docs/seed-strategy.md** — pipeline that turns `dataset/*.json` into the DB. Order of inserts, helpers (`matchDestinationByCity`, `parseCancellationToPolicy`, …), idempotency rules, demo-trip composition.
- **@PLAN.md** — phased build plan (Phase 1 setup → Phase 10 pitch). Each phase has a checklist and an agent prompt.
- `dataset/*.json` — raw inventory: 28 destinations (Spain), 20 airports (10 DE / 10 ES), 80 hotels, 40 activities, 3 flight routes, 3 transfers.

---

## What this product is

- **Demo flow:** A traveler whose Berlin → Barcelona flight is delayed asks the voice agent to move their hotel check-in to tomorrow. The agent loads the trip, reads the seeded `Disruption`, quotes a change against the hotel policy, asks for confirmation, and updates the web UI live.
- **Primary track:** telli & ai-coustics (voice AI in the wild). Side challenge: Gradium.
- **Partner techs in code:** Gemini (reasoning + tool calling), Gradium (voice), Tavily (context enrichment), ai-coustics (audio enhancement).

---

## Architecture (planned)

```
/apps
  /web         Next/Vite React — primary demo renderer
  /mobile      Expo placeholder — reuses /packages
  /backend     NestJS + Prisma + SQLite
               /prisma/schema.prisma     ← mirrors docs/erm.md
               /prisma/seed/             ← catalog + demo-trip
  /voice-agent Node worker — Gemini + Gradium + ai-coustics
/packages
  /types       Shared TS types + Zod schemas (validates Prisma JSON)
  /app         Shared API client, demo state machine, event mapping
  /ui          Shared cross-platform UI
/dataset       Raw inventory JSON (committed, source-of-truth for catalog)
/docs          Canonical design docs (this file's siblings above)
```

The repo is currently in **pre-Phase-1** state: only `dataset/`, `docs/`, `CLAUDE.md`, and `PLAN.md` exist. The monorepo apps will be created in Phase 1 of `PLAN.md`.

---

## The data model in one paragraph

Four layers: **Catalog** (reusable inventory seeded from `dataset/`), **Identity** (Travelers), **Trip** (Trip → TripSegment → Component → ComponentBooking + ComponentEvent), **Operations** (Disruption, VoiceSession, VoiceActionEvent, SupportLog). A `Component` references **exactly one** catalog product via 4 nullable FKs (`accommodationProductId`, `activityProductId`, `flightRouteProductId`, `groundTransferProductId`) matching its `type`. `ComponentBooking.data` is a typed JSON snapshot (discriminated by `kind`) frozen at booking time — the catalog can mutate without breaking bookings. See @docs/erm.md for the full picture and @docs/data-model.md for the rationale.

---

## Conventions and quirks future agents must respect

1. **Demo geography is Spain, not Bali.** An earlier draft of the plan referenced a Bali trip. The seeded dataset is a Germany→Spain corridor (Vueling BER→BCN, Hotel Brisa Barcelona). Don't reintroduce Bali. The canonical demo trip is "Barcelona Long Weekend" — see @docs/data-model.md §5.
2. **The Prisma schema lives at `apps/backend/prisma/schema.prisma`** (once Phase 2A is done). It mirrors @docs/erm.md exactly. If they ever drift, fix the docs first, then regenerate the schema — docs are the source of truth.
3. **Money is in cents.** All `*Cents` columns store minor units. Currency is captured next to it; default is `EUR`.
4. **Money snapshots are frozen.** Once a `ComponentBooking` exists, do not recompute its price from the catalog. Mutate only when the agent confirms a change.
5. **Component → catalog FK is polymorphic-by-nullable-FK.** Exactly one of the 4 catalog FKs is non-null per Component, matching `Component.type`. Validated at app level (Zod), not by SQLite.
6. **Hotel demo policy override.** The seeded hotel `ComponentBooking.policy.modification.freeUntil` is set to end-of-today so the demo always succeeds. This is intentional — see @docs/seed-strategy.md §3.3.
7. **Catalog seed is idempotent; demo seed is not.** Re-running `seed:catalog` is safe (upsert by source `_id`). Re-running `seed:demo-trip` requires `--reset`.
8. **`VoiceActionEvent` is persisted _and_ streamed.** Don't treat it as in-memory only. Web UI subscribes to a stream backed by the table.
9. **All JSON columns are validated with Zod from `packages/types`.** Don't write raw `Json` without a schema. Shapes are in @docs/component-data-shapes.md.
10. **Web is the primary demo renderer.** Mobile is a placeholder. UI components live in `packages/ui`; orchestration in `packages/app`. Don't put feature logic in `apps/web` directly.

---

## Where to look for…

| Question                                          | Look at                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| What entities exist and how they relate           | @docs/erm.md                                    |
| Why a layer or relationship is shaped this way    | @docs/data-model.md                             |
| What JSON shape goes into `ComponentBooking.data` | @docs/component-data-shapes.md                  |
| How a `dataset/*.json` row maps to a DB row       | @docs/seed-strategy.md                          |
| What to build next (phased plan)                  | @PLAN.md                                        |
| The canonical demo trip composition               | @docs/data-model.md §5                          |
| The demo's flight delay disruption                | @docs/seed-strategy.md §3.5                     |
| The tool API the voice agent calls                | @PLAN.md §5                                     |
| Audio intelligence metric definition              | @PLAN.md §8 + @docs/component-data-shapes.md §5 |

---

## Working with this repo

- **Package manager: yarn.** Use `yarn install`, `yarn workspace <pkg> <script>`, `yarn seed`, `yarn seed:demo`, etc. Do not introduce `pnpm` or `npm` lockfiles or commands.
- The user has set effort to max and auto mode is the default operating style — execute, don't plan-then-ask, but flag risky/destructive actions.
- `docs/` is the canonical source of truth for design. Update those files when the data model evolves; don't let the schema, types, or PLAN.md drift from them.
- When adding components, hotels, flights, etc., source from `dataset/*.json` rather than inventing data.
- The hackathon is solo and time-boxed (~48 hours) — keep scope tight per @PLAN.md §10.
