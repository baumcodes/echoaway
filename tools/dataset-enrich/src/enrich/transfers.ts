// Programmatic transfer generation. No OSM, no Gemini.
//
// For each Spanish airport, pick the closest curated destinations and a
// handful of hotels in those destinations, then emit one
// DatasetGroundTransfer per (airport, hotel) pair. Mode/price/duration
// are derived from haversine distance.

import { CURATED_DESTINATIONS } from '../destinations.js'
import { destinationShortCode, transferId } from '../ids.js'
import type {
  DatasetAccommodation,
  DatasetAirport,
  DatasetGroundTransfer,
  LatLng,
} from '../types.js'

const IBERIA_SUPPLIER = 'Iberia Ground Transfers'

export type BuildTransfersOptions = {
  airports: DatasetAirport[]
  accommodations: DatasetAccommodation[]
  /** How many hotels per (airport, destination) pair. Default 3. */
  hotelsPerPair?: number
  /** Maximum destinations matched per airport. Default 3. */
  destinationsPerAirport?: number
  /** Hard cap on output rows. Default 50. */
  totalLimit?: number
  /** Skip pairs farther than this many km. Default 120. */
  maxDistanceKm?: number
  existing?: DatasetGroundTransfer[]
}

export function buildTransferCandidates(
  opts: BuildTransfersOptions,
): DatasetGroundTransfer[] {
  const hotelsPerPair = opts.hotelsPerPair ?? 3
  const destinationsPerAirport = opts.destinationsPerAirport ?? 3
  const totalLimit = opts.totalLimit ?? 50
  const maxDistanceKm = opts.maxDistanceKm ?? 120
  const existingIds = new Set((opts.existing ?? []).map((t) => t._id))

  const spanishAirports = opts.airports.filter(
    (a) => a.country.toLowerCase().includes('spain') || a.iata.match(/^(BCN|VLC|ALC|MAD|AGP|SVQ|XRY|REU|GRO|RMU|TFN|TFS|LPA|PMI|IBZ|MAH|SCQ|BIO|EAS|SDR|OVD|SVQ)$/i),
  )

  const out: DatasetGroundTransfer[] = []

  for (const airport of spanishAirports) {
    if (out.length >= totalLimit) break
    const ranked = CURATED_DESTINATIONS
      .map((d) => ({ d, km: haversineKm(airport.location, d.location) }))
      .filter((entry) => entry.km <= maxDistanceKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, destinationsPerAirport)

    for (const { d: destination, km } of ranked) {
      if (out.length >= totalLimit) break
      const hotelsInDest = opts.accommodations
        .filter((h) => h.city.toLowerCase() === destination.name.toLowerCase())
        .sort((a, b) => a._id.localeCompare(b._id))
        .slice(0, hotelsPerPair)

      const destShort = destinationShortCode(destination.id)
      let n = countExistingForPair(existingIds, airport.iata, destShort) + 1

      for (const hotel of hotelsInDest) {
        if (out.length >= totalLimit) break
        const id = transferId(airport.iata, destShort, n)
        if (existingIds.has(id)) {
          n += 1
          continue
        }
        existingIds.add(id)
        const durationMin = Math.max(15, Math.round((km / 70) * 60) + 10)
        const price = priceForDuration(durationMin)
        const mode = modeForDistance(km)
        out.push({
          _id: id,
          from: `${airport.city} Airport (${airport.iata})`,
          to: hotel.name,
          mode,
          duration_minutes: durationMin,
          price,
          currency: 'EUR',
          supplier: {
            name: IBERIA_SUPPLIER,
            contract_ref: `TRF-${airport.iata}-${destShort.toUpperCase()}-${String(n).padStart(2, '0')}`,
          },
          schedule: {
            start: '06:00',
            end: '23:30',
            frequency_minutes: durationMin <= 30 ? 20 : 45,
          },
          description: `Door-to-door transfer from ${airport.name} (${airport.iata}) to ${hotel.name} in ${destination.name}.`,
        })
        n += 1
      }
    }
  }

  return out
}

function countExistingForPair(
  existing: Set<string>,
  iata: string,
  destShort: string,
): number {
  const prefix = `trf-${iata.toLowerCase()}-${destShort}-`
  let max = 0
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue
    const tail = id.slice(prefix.length)
    const n = Number.parseInt(tail, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

function modeForDistance(km: number): DatasetGroundTransfer['mode'] {
  if (km < 8) return 'shuttle'
  if (km < 25) return 'bus'
  if (km < 80) return 'private_car'
  return 'private_car'
}

function priceForDuration(min: number): number {
  return Math.max(12, Math.min(95, Math.round(min * 0.6)))
}

const EARTH_KM = 6371
function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}
