# @echoaway/dataset-enrich

Pulls real Spanish hotels and attractions from **OSM Overpass**, enriches the
soft fields with **Gemini**, and merges the result into the JSON files in
`/dataset/*.json`.

The output is committed back to the dataset — the script is a one-shot
data-prep tool, not part of the runtime. Re-running is safe: the merge is
idempotent (existing `_id`s are never touched), so demo-critical rows like
`hotel-bcn-01` ("Hotel Brisa Barcelona") stay pinned.

## Why hybrid (OSM + Gemini)?

| Source | Provides | Why |
| ------ | -------- | --- |
| Curated list | 60 Spanish destinations + coords | We control hierarchy and short codes |
| OSM Overpass | Real hotel/attraction names + coords + addresses | Every result the agent surfaces is googleable |
| Gemini | Description, tags, price, stars, amenities, opening hours | Open data has no policies/marketing copy |

This avoids the worst failure mode (Gemini hallucinating fake hotels at
fake addresses) while still producing demo-rich catalog data.

## Targets

```
~60 destinations, ~600 hotels, ~300 activities, ~50 transfers
```

Defaults are tuned for the demo. Override with `--limit` or
`--per-destination`.

## Run

```sh
# All targets, full output, with Gemini.
yarn workspace @echoaway/dataset-enrich enrich

# Only hotels, capped at 50, no API call to Gemini (synthetic fallback).
yarn workspace @echoaway/dataset-enrich enrich --only hotels --limit 50 --no-gemini

# Dry-run: print summary, don't write files.
yarn workspace @echoaway/dataset-enrich enrich --dry-run

# Force fresh OSM pull (ignores .cache/overpass).
yarn workspace @echoaway/dataset-enrich enrich --refresh-osm
```

Set `GEMINI_API_KEY` in the repo-root `.env`. Without it, the tool warns
and uses synthetic fallback enrichment.

## Tests

```sh
yarn workspace @echoaway/dataset-enrich test
```

Tests cover ID generation, idempotent merge, CLI parsing, Gemini response
extraction, the OSM response parser, and end-to-end candidate build with
stubbed OSM/Gemini.

## Files

```
src/
  destinations.ts          curated 60 Spanish destinations
  enrich/
    destinations.ts        curated → DatasetDestination
    hotels.ts              OSM + Gemini → DatasetAccommodation
    activities.ts          OSM + Gemini → DatasetActivity
    transfers.ts           airports × accommodations → DatasetGroundTransfer
  overpass.ts              OSM Overpass HTTP client (with disk cache)
  gemini.ts                Gemini batch client + JSON extraction
  ids.ts                   stable id helpers
  io.ts                    read/write /dataset/*.json
  merge.ts                 idempotent mergeById
  cli.ts                   argv parsing
  index.ts                 CLI entry
  __test__/run.ts          unit tests (tsx + node:assert)
.cache/overpass/           OSM responses cached per (destination,kind)
```

## Caveats

- Overpass is rate-limited; the runner sleeps 1.5s between calls. A full
  hotels run hits the API ~60 times — about 90 seconds for an empty cache.
- Gemini response variance can cause occasional batch failures; the runner
  falls back to synthetic enrichment for any failed batch and continues.
- The cache is local-only and **not** committed.

## Overpass mirrors / 429s / Apache HTML errors

The public `overpass-api.de` mirror is the busiest of the bunch and
frequently returns Apache HTML error pages (502/504/429). The fetcher
already:

- Sends a proper `User-Agent` per Overpass etiquette.
- Rotates between four public mirrors (`overpass-api.de`,
  `overpass.kumi.systems`, `overpass.private.coffee`, `maps.mail.ru`).
- Retries with exponential backoff on 429/5xx, AbortError, and
  non-JSON responses.

If you hit sustained failures, override the mirror list:

```sh
OVERPASS_ENDPOINTS="https://overpass.kumi.systems/api/interpreter" \
  yarn workspace @echoaway/dataset-enrich enrich --only hotels
```

Cache hits never touch the network, so once a destination has been
fetched successfully you can re-run the enricher freely.
