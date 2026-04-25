// OSM hotels → DatasetAccommodation rows.
//
// Gemini fills the soft fields (description, tags, stars, price, amenities).
// When --no-gemini is set, deterministic fallbacks are used so the tool
// still produces output (and tests can run without an API key).

import { CURATED_DESTINATIONS, type CuratedDestination } from '../destinations.js'
import {
  chunk,
  DEFAULT_BATCH_SIZE,
  type GeminiClient,
  type HotelEnrichmentRequest,
  type HotelEnrichmentResult,
} from '../gemini.js'
import { destinationShortCode, hotelIdForOsm } from '../ids.js'
import { fetchOsm, sleep } from '../overpass.js'
import type { DatasetAccommodation, OsmEntity } from '../types.js'

const FALLBACK_AMENITY_BANK = [
  'wifi',
  'ac',
  'breakfast_included',
  'terrace',
  'pool',
  'gym',
  'restaurant',
]

/** Deterministic synthetic enrichment used when Gemini is unavailable. */
export function synthesizeHotelEnrichment(
  req: HotelEnrichmentRequest,
): HotelEnrichmentResult {
  const seed = (req.name.length + req.city.length) % 5
  return {
    index: req.index,
    description: `${req.name} is a hotel in ${req.city}, well placed for ${req.region} travellers.`,
    tags: req.baseTags.slice(0, 3),
    stars: 3 + (seed % 3),
    pricePerNight: 90 + seed * 25,
    amenities: FALLBACK_AMENITY_BANK.slice(0, 3 + (seed % 3)),
  }
}

export type BuildHotelsOptions = {
  /** Maximum new hotel rows per destination (after dedupe). */
  perDestination?: number
  /** Hard cap across all destinations. */
  totalLimit?: number
  /** Optional Gemini client — omit to use synthetic fallback. */
  gemini?: GeminiClient | null
  /** Pause between Overpass calls in ms (default 1500). */
  overpassDelayMs?: number
  /** Test stub for OSM fetcher. */
  fetchOsmImpl?: typeof fetchOsm
  /** Existing dataset for collision-skipping by name+city. */
  existing?: DatasetAccommodation[]
  /** Hook so the CLI can stream progress. */
  onProgress?: (info: { destinationId: string; fetched: number }) => void
}

const HOTELBEDS_SUPPLIER = {
  name: 'Hotelbeds',
  contract_ref_prefix: 'HB-OSM',
}

export async function buildHotelCandidates(
  opts: BuildHotelsOptions = {},
): Promise<DatasetAccommodation[]> {
  const perDestination = opts.perDestination ?? 12
  const totalLimit = opts.totalLimit ?? 600
  const fetchImpl = opts.fetchOsmImpl ?? fetchOsm
  const existingByKey = new Set(
    (opts.existing ?? []).map((h) => `${h.city.toLowerCase()}::${h.name.toLowerCase()}`),
  )

  const allCandidates: DatasetAccommodation[] = []
  const requests: HotelEnrichmentRequest[] = []
  const requestSource: Array<{
    destination: CuratedDestination
    osm: OsmEntity
  }> = []

  for (const destination of CURATED_DESTINATIONS) {
    if (allCandidates.length + requests.length >= totalLimit) break
    let fetched: OsmEntity[] = []
    try {
      fetched = await fetchImpl(destination, 'hotels')
    } catch (err) {
      console.warn(`overpass hotels failed for ${destination.id}:`, err)
      continue
    }
    opts.onProgress?.({ destinationId: destination.id, fetched: fetched.length })

    let kept = 0
    for (const osm of fetched) {
      if (kept >= perDestination) break
      if (allCandidates.length + requests.length >= totalLimit) break
      const dedupeKey = `${destination.name.toLowerCase()}::${osm.name.toLowerCase()}`
      if (existingByKey.has(dedupeKey)) continue
      existingByKey.add(dedupeKey)

      const index = requests.length
      requests.push({
        index,
        name: osm.name,
        city: destination.name,
        region: destination.region,
        baseTags: destination.baseTags.slice(0, 3),
      })
      requestSource.push({ destination, osm })
      kept += 1
    }

    if (opts.overpassDelayMs && opts.overpassDelayMs > 0) {
      await sleep(opts.overpassDelayMs)
    }
  }

  const enrichments = await runHotelEnrichment(requests, opts.gemini ?? null)
  const enrichmentByIndex = new Map(enrichments.map((e) => [e.index, e]))

  for (let i = 0; i < requestSource.length; i += 1) {
    const src = requestSource[i]!
    const enrichment =
      enrichmentByIndex.get(i) ?? synthesizeHotelEnrichment(requests[i]!)
    const destShort = destinationShortCode(src.destination.id)
    const id = hotelIdForOsm(destShort, src.osm.osmId)
    allCandidates.push({
      _id: id,
      name: src.osm.name,
      city: src.destination.name,
      country: 'ES',
      stars: clampInt(enrichment.stars, 2, 5),
      price_per_night: clampInt(enrichment.pricePerNight, 50, 800),
      amenities: enrichment.amenities,
      location: src.osm.location,
      description: enrichment.description,
      supplier: {
        name: HOTELBEDS_SUPPLIER.name,
        contract_ref: `${HOTELBEDS_SUPPLIER.contract_ref_prefix}-${destShort.toUpperCase()}-${src.osm.osmId}`,
      },
      cancellation_terms: defaultCancellationTerms(),
      images: [],
    })
  }

  return allCandidates
}

async function runHotelEnrichment(
  requests: HotelEnrichmentRequest[],
  gemini: GeminiClient | null,
): Promise<HotelEnrichmentResult[]> {
  if (!gemini || requests.length === 0) {
    return requests.map(synthesizeHotelEnrichment)
  }
  const results: HotelEnrichmentResult[] = []
  for (const batch of chunk(requests, DEFAULT_BATCH_SIZE)) {
    try {
      const enriched = await gemini.enrichHotels(batch)
      results.push(...enriched)
    } catch (err) {
      console.warn(
        `gemini hotel batch (${batch.length}) failed, falling back to synthetic:`,
        err,
      )
      results.push(...batch.map(synthesizeHotelEnrichment))
    }
  }
  return results
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function defaultCancellationTerms(): string {
  // 90 days from now → permissive, deterministic-ish.
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 90)
  return `free_until_${d.toISOString().slice(0, 10)}`
}
