import {
  DestinationType,
  type ModificationPolicyParsed,
  TransferMode,
} from './types.js'
import type { DestinationSrc } from '../shared/dataset.js'

export const SPAIN_ROOT_ID = 'dest-spain'

/**
 * Airports referenced by flight routes but not present in `airports.json`.
 * We synthesise minimal stub rows so the FlightRouteProduct FKs resolve.
 * `servesDestinationId` is left null — these are out-of-corridor airports
 * (Amsterdam, Oslo) that don't have a matching Destination either.
 */
export const EXTRA_AIRPORTS = [
  {
    id: 'air-ams',
    iata: 'AMS',
    icao: 'EHAM',
    name: 'Amsterdam Schiphol Airport',
    city: 'Amsterdam',
    country: 'Netherlands',
    location: { lat: 52.3105, lng: 4.7683 },
  },
  {
    id: 'air-osl',
    iata: 'OSL',
    icao: 'ENGM',
    name: 'Oslo Gardermoen Airport',
    city: 'Oslo',
    country: 'Norway',
    location: { lat: 60.1939, lng: 11.1004 },
  },
] as const

export const SUPPLIERS = [
  { id: 'sup-hotelbeds', name: 'Hotelbeds', category: 'accommodation' },
  { id: 'sup-getyourguide', name: 'GetYourGuide', category: 'activity' },
  { id: 'sup-tiqets', name: 'Tiqets', category: 'activity' },
  { id: 'sup-viator', name: 'Viator', category: 'activity' },
  {
    id: 'sup-iberia-ground',
    name: 'Iberia Ground Transfers',
    category: 'transfer',
  },
  {
    id: 'sup-airline-aggregator',
    name: 'Airline Aggregator',
    category: 'flight',
  },
] as const

export function inferDestinationType(src: DestinationSrc): DestinationType {
  const tags = new Set(src.tags ?? [])
  const name = src.name.toLowerCase()
  if (tags.has('mountain') || tags.has('monastery')) return 'park'
  if (tags.has('park') || name.includes('park')) return 'park'
  if (tags.has('village') || tags.has('whitewashed')) return 'city_area'
  return 'city'
}

/**
 * Best-effort match airport.city or transfer label → destination id from the
 * dataset. Anything not in the seed (Madrid, Seville, German cities, …)
 * resolves to null — caller must accept null.
 */
export function makeDestinationByCityMatcher(
  destinations: { id: string; name: string }[],
): (city: string | null | undefined) => string | null {
  // Build a normalized lookup. The airport `city` field sometimes carries
  // parentheticals like "Jerez de la Frontera (Cádiz)" or "Tarragona (near
  // Barcelona)" — we strip those before matching.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .trim()

  const byName = new Map<string, string>()
  for (const d of destinations) byName.set(norm(d.name), d.id)

  return (city) => {
    if (!city) return null
    return byName.get(norm(city)) ?? null
  }
}

export function makeAirportByIataLookup(
  airports: { id: string; iataCode: string }[],
): (iata: string) => string | null {
  const byIata = new Map(airports.map((a) => [a.iataCode.toUpperCase(), a.id]))
  return (iata) => byIata.get(iata.toUpperCase()) ?? null
}

export function matchSupplier(name: string): string | null {
  const found = SUPPLIERS.find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  )
  return found?.id ?? null
}

export function matchTransferMode(mode: string): TransferMode {
  const valid: TransferMode[] = [
    'bus',
    'shuttle',
    'private_car',
    'train',
    'taxi',
  ]
  return valid.includes(mode as TransferMode) ? (mode as TransferMode) : 'bus'
}

/**
 * Dataset cancellation_terms is a free-text string. Currently every row uses
 * the shape `free_until_YYYY-MM-DD`; we parse it into a structured
 * ModificationPolicy snapshot. Anything else falls back to `canModify=false`.
 *
 * The hour `18:00` is an arbitrary cutoff inside the cancellation date so the
 * modification window has a real datetime instead of a bare date. The demo
 * trip's hotel booking overrides this anyway (see seed-strategy.md §3.3).
 */
export function parseCancellationToPolicy(raw: string): ModificationPolicyParsed {
  const m = /^free_until_(\d{4}-\d{2}-\d{2})$/.exec(raw)
  if (m) {
    return {
      canModify: true,
      feeAmount: 0,
      currency: 'EUR',
      latestModificationTime: `${m[1]}T18:00:00.000Z`,
      notes: raw,
    }
  }
  return {
    canModify: false,
    feeAmount: 0,
    currency: 'EUR',
    latestModificationTime: null,
    notes: raw,
  }
}

/**
 * Pull a 3-letter IATA code out of a free-text label like "BCN Airport" or
 * "Valencia Airport (VLC)". Returns null if no obvious code is present.
 */
export function iataFromLabel(label: string): string | null {
  const direct = /\b([A-Z]{3})\b/.exec(label)
  if (direct) return direct[1]
  return null
}
