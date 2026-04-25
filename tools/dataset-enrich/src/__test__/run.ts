// Unit tests for the dataset-enrich tool. Mirrors the packages/types
// pattern: tsx + node:assert. `yarn test` runs this file; non-zero exit
// on any failure.

import { strict as assert } from 'node:assert'

import { parseArgs } from '../cli.js'
import { buildDestinationCandidates } from '../enrich/destinations.js'
import { buildHotelCandidates, synthesizeHotelEnrichment } from '../enrich/hotels.js'
import {
  buildActivityCandidates,
  synthesizeActivityEnrichment,
} from '../enrich/activities.js'
import { buildTransferCandidates } from '../enrich/transfers.js'
import { chunk, extractJsonArray } from '../gemini.js'
import {
  activityIdForOsm,
  destinationShortCode,
  hotelIdForOsm,
  slugify,
  transferId,
} from '../ids.js'
import { mergeById } from '../merge.js'
import { buildQuery, parseOverpassResponse } from '../overpass.js'
import type {
  DatasetAccommodation,
  DatasetAirport,
  DatasetGroundTransfer,
  OsmEntity,
} from '../types.js'

let failed = 0
let passed = 0

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`  ✓ ${name}`)
    })
    .catch((err: unknown) => {
      failed += 1
      console.error(`  ✗ ${name}`)
      console.error(err)
    })
}

async function run() {
  console.log('dataset-enrich tests')

  // --- ids.ts ---
  await test('slugify strips diacritics and lowercases', () => {
    assert.equal(slugify('Málaga'), 'malaga')
    assert.equal(slugify('Jerez de la Frontera'), 'jerez-de-la-frontera')
    assert.equal(slugify('  --weird !!  '), 'weird')
  })

  await test('destinationShortCode prefers curated codes', () => {
    assert.equal(destinationShortCode('dest-barcelona'), 'bcn')
    assert.equal(destinationShortCode('dest-madrid'), 'mad')
    // Fallback: takes first 6 chars of slug after stripping `dest-`
    assert.equal(destinationShortCode('dest-formentera'), 'formen')
  })

  await test('hotel/activity ids are stable for same osmId', () => {
    assert.equal(hotelIdForOsm('bcn', 12345), 'hotel-bcn-osm12345')
    assert.equal(activityIdForOsm('bcn', 12345), 'act-bcn-osm12345')
    assert.equal(transferId('BCN', 'bcn', 7), 'trf-bcn-bcn-07')
  })

  // --- merge.ts ---
  await test('mergeById preserves existing entries verbatim', () => {
    const existing = [
      { _id: 'a', value: 'KEEP' },
      { _id: 'b', value: 'KEEP' },
    ]
    const incoming = [
      { _id: 'a', value: 'OVERRIDE' }, // must be ignored
      { _id: 'c', value: 'NEW' },
    ]
    const { merged, added, kept } = mergeById(existing, incoming)
    assert.equal(kept, 2)
    assert.equal(added, 1)
    assert.equal(merged.length, 3)
    assert.equal(merged[0]!.value, 'KEEP')
    assert.equal(merged[1]!.value, 'KEEP')
    assert.equal(merged[2]!._id, 'c')
  })

  await test('mergeById dedupes within incoming', () => {
    const result = mergeById<{ _id: string }>([], [
      { _id: 'x' },
      { _id: 'x' },
      { _id: 'y' },
    ])
    assert.equal(result.added, 2)
    assert.deepEqual(result.merged.map((r) => r._id), ['x', 'y'])
  })

  // --- cli.ts ---
  await test('parseArgs defaults to all targets', () => {
    const flags = parseArgs([])
    assert.equal(flags.only.size, 4)
    assert.equal(flags.dryRun, false)
    assert.equal(flags.noGemini, false)
  })

  await test('parseArgs --only filters targets', () => {
    const flags = parseArgs(['--only', 'hotels,transfers'])
    assert.deepEqual([...flags.only].sort(), ['hotels', 'transfers'])
  })

  await test('parseArgs --limit and --no-gemini', () => {
    const flags = parseArgs(['--limit=200', '--no-gemini'])
    assert.equal(flags.limit, 200)
    assert.equal(flags.noGemini, true)
  })

  await test('parseArgs rejects unknown flags', () => {
    assert.throws(() => parseArgs(['--bogus']))
    assert.throws(() => parseArgs(['--only', 'flights']))
  })

  // --- gemini.ts helpers ---
  await test('chunk splits into N-sized buckets', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
    assert.deepEqual(chunk<number>([], 10), [])
  })

  await test('extractJsonArray handles plain, fenced, and noisy responses', () => {
    assert.deepEqual(extractJsonArray('[{"x":1}]'), [{ x: 1 }])
    assert.deepEqual(
      extractJsonArray('```json\n[{"x":2}]\n```'),
      [{ x: 2 }],
    )
    assert.deepEqual(
      extractJsonArray('Sure! Here you go:\n[{"x":3},{"y":"hi]"}]\nThanks'),
      [{ x: 3 }, { y: 'hi]' }],
    )
    assert.throws(() => extractJsonArray('no array here'))
  })

  // --- overpass.ts query builder ---
  await test('buildQuery emits a valid Overpass QL regex filter', () => {
    const q = buildQuery({ lat: 41.3851, lng: 2.1734 }, 5000, 'hotels')
    // Regex value MUST be a single quoted string with anchors + alternation;
    // the previous multi-quoted form returned HTTP 400.
    assert.match(
      q,
      /\["tourism"~"\^\(hotel\|hostel\|guest_house\|apartment\|resort\)\$"\]/,
    )
    assert.match(q, /\(around:5000,41\.3851,2\.1734\)/)
    assert.match(q, /\[out:json\]\[timeout:60\];/)
  })

  // --- overpass.ts parser ---
  await test('parseOverpassResponse skips unnamed and missing-coords elements', () => {
    const parsed = parseOverpassResponse({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 41.0,
          lon: 2.0,
          tags: { name: 'Hotel A', tourism: 'hotel' },
        },
        // unnamed → drop
        { type: 'node', id: 2, lat: 41.0, lon: 2.0, tags: { tourism: 'hotel' } },
        // way with center → keep
        {
          type: 'way',
          id: 3,
          center: { lat: 42.0, lon: 3.0 },
          tags: { name: 'Hotel B', tourism: 'hotel' },
        },
        // duplicate id+type → drop
        {
          type: 'node',
          id: 1,
          lat: 41.0,
          lon: 2.0,
          tags: { name: 'Hotel A dup' },
        },
        // no coords at all → drop
        { type: 'node', id: 4, tags: { name: 'Phantom' } },
      ],
    })
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0]!.name, 'Hotel A')
    assert.equal(parsed[1]!.name, 'Hotel B')
  })

  // --- destination enrichment ---
  await test('buildDestinationCandidates emits 60+ Spanish rows', () => {
    const rows = buildDestinationCandidates()
    assert.ok(rows.length >= 60, `expected ≥60 destinations, got ${rows.length}`)
    for (const row of rows) {
      assert.equal(row.country, 'Spain')
      assert.equal(row.iso_country_code, 'ES')
      assert.ok(row._id.startsWith('dest-'))
    }
  })

  // --- hotel/activity synthesis ---
  await test('synthesizeHotelEnrichment fills required fields', () => {
    const out = synthesizeHotelEnrichment({
      index: 0,
      name: 'Hotel Test',
      city: 'Barcelona',
      region: 'Catalonia',
      baseTags: ['city', 'beach', 'culture'],
    })
    assert.ok(out.description.includes('Hotel Test'))
    assert.ok(out.stars >= 2 && out.stars <= 5)
    assert.ok(out.pricePerNight >= 50)
    assert.ok(out.amenities.length >= 3)
  })

  await test('buildHotelCandidates with stub OSM produces deterministic rows', async () => {
    const rows = await buildHotelCandidates({
      perDestination: 1,
      totalLimit: 5,
      gemini: null,
      overpassDelayMs: 0,
      fetchOsmImpl: async (dest) => [
        {
          osmType: 'node',
          osmId: dest.id.length, // deterministic
          name: `${dest.name} Test Hotel`,
          location: dest.location,
          tags: { tourism: 'hotel' },
        } satisfies OsmEntity,
      ],
    })
    assert.equal(rows.length, 5)
    for (const row of rows) {
      assert.ok(row._id.startsWith('hotel-'))
      assert.ok(row._id.includes('-osm'))
      assert.equal(row.country, 'ES')
      assert.ok(row.stars >= 2 && row.stars <= 5)
      assert.ok(row.cancellation_terms.startsWith('free_until_'))
      assert.equal(row.supplier.name, 'Hotelbeds')
    }
  })

  await test('buildHotelCandidates skips dedupes against existing', async () => {
    const existing = [
      {
        _id: 'hotel-bcn-01',
        name: 'Hotel Brisa Barcelona',
        city: 'Barcelona',
        country: 'ES',
        stars: 4,
        price_per_night: 145,
        amenities: [],
        location: { lat: 41.384, lng: 2.185 },
        description: '',
        supplier: { name: 'Hotelbeds', contract_ref: 'HB-BCN-001' },
        cancellation_terms: 'free_until_2025-11-20',
        images: [],
      } satisfies DatasetAccommodation,
    ]
    const rows = await buildHotelCandidates({
      perDestination: 1,
      totalLimit: 200,
      gemini: null,
      overpassDelayMs: 0,
      existing,
      fetchOsmImpl: async (dest) =>
        dest.id === 'dest-barcelona'
          ? [
              {
                osmType: 'node',
                osmId: 999,
                // Same name as existing — must be skipped.
                name: 'Hotel Brisa Barcelona',
                location: dest.location,
                tags: { tourism: 'hotel' },
              } satisfies OsmEntity,
            ]
          : [],
    })
    for (const row of rows) {
      assert.notEqual(row.name.toLowerCase(), 'hotel brisa barcelona')
    }
  })

  await test('synthesizeActivityEnrichment emits opening hours map', () => {
    const out = synthesizeActivityEnrichment({
      index: 0,
      name: 'Some Museum',
      city: 'Madrid',
      rawTags: ['museum'],
    })
    assert.ok(out.openingHours.mon)
    assert.ok(out.durationHours >= 0.5)
    assert.ok(out.price >= 5)
  })

  await test('buildActivityCandidates with stub OSM tags activities correctly', async () => {
    const rows = await buildActivityCandidates({
      perDestination: 1,
      totalLimit: 3,
      gemini: null,
      overpassDelayMs: 0,
      fetchOsmImpl: async (dest) => [
        {
          osmType: 'node',
          osmId: 100 + dest.name.length,
          name: `${dest.name} Museum`,
          location: dest.location,
          tags: { tourism: 'museum', historic: 'yes' },
        } satisfies OsmEntity,
      ],
    })
    assert.equal(rows.length, 3)
    for (const row of rows) {
      assert.ok(row._id.startsWith('act-'))
      assert.ok(row.duration_hours > 0)
      assert.ok(row.price > 0)
      assert.ok(['GetYourGuide', 'Tiqets', 'Viator'].includes(row.supplier.name))
    }
  })

  // --- transfers ---
  await test('buildTransferCandidates pairs Spanish airports with nearby hotels', () => {
    const airports: DatasetAirport[] = [
      {
        _id: 'air-bcn',
        iata: 'BCN',
        icao: 'LEBL',
        name: 'Barcelona El Prat',
        city: 'Barcelona',
        country: 'Spain',
        location: { lat: 41.297, lng: 2.0833 },
      },
    ]
    const accommodations: DatasetAccommodation[] = [
      {
        _id: 'hotel-bcn-osm1',
        name: 'Bcn One',
        city: 'Barcelona',
        country: 'ES',
        stars: 3,
        price_per_night: 100,
        amenities: [],
        location: { lat: 41.385, lng: 2.173 },
        description: '',
        supplier: { name: 'Hotelbeds', contract_ref: 'HB-OSM-1' },
        cancellation_terms: 'free_until_2030-01-01',
        images: [],
      },
      {
        _id: 'hotel-bcn-osm2',
        name: 'Bcn Two',
        city: 'Barcelona',
        country: 'ES',
        stars: 4,
        price_per_night: 200,
        amenities: [],
        location: { lat: 41.384, lng: 2.185 },
        description: '',
        supplier: { name: 'Hotelbeds', contract_ref: 'HB-OSM-2' },
        cancellation_terms: 'free_until_2030-01-01',
        images: [],
      },
    ]
    const rows = buildTransferCandidates({
      airports,
      accommodations,
      hotelsPerPair: 2,
      destinationsPerAirport: 1,
      totalLimit: 5,
    })
    assert.ok(rows.length >= 2)
    for (const row of rows) {
      assert.equal(row.currency, 'EUR')
      assert.equal(row.supplier.name, 'Iberia Ground Transfers')
      assert.ok(row._id.startsWith('trf-bcn-bcn-'))
      assert.ok(row.duration_minutes >= 15)
      assert.ok(row.price >= 12)
    }
  })

  await test('buildTransferCandidates respects existing ids', () => {
    const airports: DatasetAirport[] = [
      {
        _id: 'air-bcn',
        iata: 'BCN',
        icao: 'LEBL',
        name: 'Barcelona El Prat',
        city: 'Barcelona',
        country: 'Spain',
        location: { lat: 41.297, lng: 2.0833 },
      },
    ]
    const accommodations: DatasetAccommodation[] = [
      {
        _id: 'hotel-bcn-osm1',
        name: 'Bcn One',
        city: 'Barcelona',
        country: 'ES',
        stars: 3,
        price_per_night: 100,
        amenities: [],
        location: { lat: 41.385, lng: 2.173 },
        description: '',
        supplier: { name: 'Hotelbeds', contract_ref: 'HB-OSM-1' },
        cancellation_terms: 'free_until_2030-01-01',
        images: [],
      },
    ]
    const existing: DatasetGroundTransfer[] = [
      {
        _id: 'trf-bcn-bcn-01',
        from: 'X',
        to: 'Y',
        mode: 'shuttle',
        duration_minutes: 20,
        price: 15,
        currency: 'EUR',
        supplier: { name: 'Iberia Ground Transfers', contract_ref: 'TRF-BCN-BCN-01' },
        schedule: { start: '06:00', end: '23:00', frequency_minutes: 30 },
        description: '',
      },
    ]
    const rows = buildTransferCandidates({
      airports,
      accommodations,
      existing,
      hotelsPerPair: 1,
      destinationsPerAirport: 1,
      totalLimit: 5,
    })
    for (const row of rows) {
      assert.notEqual(row._id, 'trf-bcn-bcn-01')
    }
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
