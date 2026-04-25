// Stable ID generation for newly enriched dataset rows.
//
// Existing /dataset/*.json IDs (e.g. `hotel-bcn-01`) MUST be preserved
// because the demo seed (`apps/backend/prisma/seed/demo-trip`) hardcodes
// them. New entries get a deterministic suffix derived from the source
// (OSM id) so re-running the enricher does not duplicate rows.

export const SLUG_FALLBACK_LENGTH = 24

/**
 * URL-style slug. Accent-stripped, lowercase, alphanumerics + hyphens.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_FALLBACK_LENGTH)
}

/**
 * Hotel id is `hotel-<dest-short>-osm<osmId>` so the link to OSM stays
 * traceable. Curated existing rows use `hotel-bcn-NN`; the new namespace
 * (`-osm` infix) avoids collisions.
 */
export function hotelIdForOsm(destShort: string, osmId: number): string {
  return `hotel-${destShort}-osm${osmId}`
}

export function activityIdForOsm(destShort: string, osmId: number): string {
  return `act-${destShort}-osm${osmId}`
}

/** Transfer ids encode airport + destination short codes. */
export function transferId(
  airportIata: string,
  destShort: string,
  n: number,
): string {
  return `trf-${airportIata.toLowerCase()}-${destShort}-${String(n).padStart(2, '0')}`
}

/**
 * Map a long destination id to a short code suitable for nesting inside
 * other ids. Uses a curated table for the most common cities, falls back
 * to the first 6 alphanumerics of the slug.
 */
const DESTINATION_SHORT_CODES: Record<string, string> = {
  'dest-barcelona': 'bcn',
  'dest-madrid': 'mad',
  'dest-valencia': 'vlc',
  'dest-seville': 'svq',
  'dest-malaga': 'agp',
  'dest-bilbao': 'bio',
  'dest-sansebastian': 'eas',
  'dest-alicante': 'alc',
  'dest-mallorca-palma': 'pmi',
  'dest-tenerife-santacruz': 'tfn',
  'dest-graancanaria-laspalmas': 'lpa',
  'dest-ibiza-town': 'ibz',
  'dest-santiago': 'scq',
  'dest-zaragoza': 'zaz',
  'dest-granada': 'grx',
  'dest-cadiz': 'cdz',
  'dest-jerez': 'xry',
  'dest-cordoba': 'cor',
  'dest-toledo': 'tol',
  'dest-segovia': 'seg',
  'dest-salamanca': 'slk',
}

export function destinationShortCode(destinationId: string): string {
  const known = DESTINATION_SHORT_CODES[destinationId]
  if (known) return known
  return slugify(destinationId.replace(/^dest-/, '')).slice(0, 6) || 'xxx'
}
