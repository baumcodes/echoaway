// OSM attractions → DatasetActivity rows. Same shape as hotels.ts but
// for activities/POIs.

import { CURATED_DESTINATIONS, type CuratedDestination } from '../destinations.js'
import {
  chunk,
  DEFAULT_BATCH_SIZE,
  type ActivityEnrichmentRequest,
  type ActivityEnrichmentResult,
  type GeminiClient,
} from '../gemini.js'
import { activityIdForOsm, destinationShortCode } from '../ids.js'
import { fetchOsm, sleep } from '../overpass.js'
import type { DatasetActivity, OsmEntity } from '../types.js'

const ACTIVITY_SUPPLIERS = ['GetYourGuide', 'Tiqets', 'Viator'] as const

const FALLBACK_OPENING: Record<string, string> = {
  mon: '09:00-18:00',
  tue: '09:00-18:00',
  wed: '09:00-18:00',
  thu: '09:00-18:00',
  fri: '09:00-18:00',
  sat: '09:00-19:00',
  sun: '09:00-15:00',
}

export function synthesizeActivityEnrichment(
  req: ActivityEnrichmentRequest,
): ActivityEnrichmentResult {
  const seed = (req.name.length + req.city.length) % 5
  return {
    index: req.index,
    description: `Guided experience around ${req.name} in ${req.city}, suitable for first-time visitors.`,
    tags: req.rawTags.slice(0, 3),
    durationHours: 1.5 + (seed % 3) * 0.5,
    price: 20 + seed * 8,
    openingHours: FALLBACK_OPENING,
  }
}

export type BuildActivitiesOptions = {
  perDestination?: number
  totalLimit?: number
  gemini?: GeminiClient | null
  overpassDelayMs?: number
  fetchOsmImpl?: typeof fetchOsm
  existing?: DatasetActivity[]
  onProgress?: (info: { destinationId: string; fetched: number }) => void
}

export async function buildActivityCandidates(
  opts: BuildActivitiesOptions = {},
): Promise<DatasetActivity[]> {
  const perDestination = opts.perDestination ?? 6
  const totalLimit = opts.totalLimit ?? 300
  const fetchImpl = opts.fetchOsmImpl ?? fetchOsm
  const existingByKey = new Set(
    (opts.existing ?? []).map(
      (a) => `${a.city.toLowerCase()}::${a.name.toLowerCase()}`,
    ),
  )

  const candidates: DatasetActivity[] = []
  const requests: ActivityEnrichmentRequest[] = []
  const requestSource: Array<{
    destination: CuratedDestination
    osm: OsmEntity
  }> = []

  for (const destination of CURATED_DESTINATIONS) {
    if (candidates.length + requests.length >= totalLimit) break
    let fetched: OsmEntity[] = []
    try {
      fetched = await fetchImpl(destination, 'attractions')
    } catch (err) {
      console.warn(`overpass attractions failed for ${destination.id}:`, err)
      continue
    }
    opts.onProgress?.({ destinationId: destination.id, fetched: fetched.length })

    let kept = 0
    for (const osm of fetched) {
      if (kept >= perDestination) break
      if (candidates.length + requests.length >= totalLimit) break
      const dedupeKey = `${destination.name.toLowerCase()}::${osm.name.toLowerCase()}`
      if (existingByKey.has(dedupeKey)) continue
      existingByKey.add(dedupeKey)

      const index = requests.length
      const rawTags = inferRawTags(osm)
      requests.push({ index, name: osm.name, city: destination.name, rawTags })
      requestSource.push({ destination, osm })
      kept += 1
    }

    if (opts.overpassDelayMs && opts.overpassDelayMs > 0) {
      await sleep(opts.overpassDelayMs)
    }
  }

  const enrichments = await runActivityEnrichment(requests, opts.gemini ?? null)
  const enrichmentByIndex = new Map(enrichments.map((e) => [e.index, e]))

  for (let i = 0; i < requestSource.length; i += 1) {
    const src = requestSource[i]!
    const enrichment =
      enrichmentByIndex.get(i) ?? synthesizeActivityEnrichment(requests[i]!)
    const destShort = destinationShortCode(src.destination.id)
    const id = activityIdForOsm(destShort, src.osm.osmId)
    const supplier = ACTIVITY_SUPPLIERS[src.osm.osmId % ACTIVITY_SUPPLIERS.length]!
    candidates.push({
      _id: id,
      name: src.osm.name,
      city: src.destination.name,
      tags: enrichment.tags,
      duration_hours: clampNumber(enrichment.durationHours, 0.5, 8),
      opening_hours: enrichment.openingHours,
      price: clampInt(enrichment.price, 5, 200),
      supplier: {
        name: supplier,
        contract_ref: `${supplier.toUpperCase().slice(0, 3)}-${destShort.toUpperCase()}-${src.osm.osmId}`,
      },
      description: enrichment.description,
    })
  }

  return candidates
}

function inferRawTags(osm: OsmEntity): string[] {
  const t: string[] = []
  if (osm.tags.tourism) t.push(osm.tags.tourism)
  if (osm.tags.historic) t.push('history')
  if (osm.tags.museum) t.push('museum')
  if (osm.tags.amenity) t.push(osm.tags.amenity)
  return t.filter(Boolean)
}

async function runActivityEnrichment(
  requests: ActivityEnrichmentRequest[],
  gemini: GeminiClient | null,
): Promise<ActivityEnrichmentResult[]> {
  if (!gemini || requests.length === 0) {
    return requests.map(synthesizeActivityEnrichment)
  }
  const results: ActivityEnrichmentResult[] = []
  for (const batch of chunk(requests, DEFAULT_BATCH_SIZE)) {
    try {
      results.push(...(await gemini.enrichActivities(batch)))
    } catch (err) {
      console.warn(
        `gemini activity batch (${batch.length}) failed, falling back:`,
        err,
      )
      results.push(...batch.map(synthesizeActivityEnrichment))
    }
  }
  return results
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
