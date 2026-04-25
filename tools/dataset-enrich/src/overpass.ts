// Tiny OSM Overpass client. Fetches `tourism=hotel` and `tourism=attraction`
// elements within a radius of a destination centroid, normalises the
// response to OsmEntity, and caches raw responses on disk so re-runs are
// fast and offline-friendly.
//
// Resilience: rotates between Overpass mirrors (the public endpoint
// rate-limits aggressively), retries 429/5xx with backoff, and sends a
// proper User-Agent per Overpass etiquette.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CuratedDestination } from './destinations.js'
import type { LatLng, OsmEntity } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Public Overpass mirrors — rotated per-call to spread load. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const

/** Override via OVERPASS_ENDPOINTS env var (comma-separated). */
function configuredMirrors(): string[] {
  const fromEnv = process.env.OVERPASS_ENDPOINTS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv && fromEnv.length > 0) return fromEnv
  return [...OVERPASS_MIRRORS]
}

export const OVERPASS_ENDPOINT = OVERPASS_MIRRORS[0]
export const CACHE_DIR = resolve(__dirname, '..', '.cache', 'overpass')

const USER_AGENT =
  'echoaway-dataset-enrich/0.1 (+https://github.com/echoaway; hackathon prototype)'

export type OverpassKind = 'hotels' | 'attractions'

type OverpassRawElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

type OverpassRawResponse = {
  elements?: OverpassRawElement[]
}

// Overpass QL regex match: the `~` operator takes a single regex literal.
// `["tourism"~"^(hotel|hostel|...)$"]` is the correct form for an OR
// across enum values; the multi-quoted form returns HTTP 400.
const KIND_REGEX: Record<OverpassKind, string> = {
  hotels: '^(hotel|hostel|guest_house|apartment|resort)$',
  attractions: '^(attraction|museum|viewpoint|gallery|theme_park|zoo|aquarium)$',
}

export function buildQuery(
  center: LatLng,
  radius: number,
  kind: OverpassKind,
): string {
  const around = `(around:${radius},${center.lat},${center.lng})`
  const filter = `["tourism"~"${KIND_REGEX[kind]}"]`
  return `
[out:json][timeout:60];
(
  node${filter}${around};
  way${filter}${around};
  relation${filter}${around};
);
out center tags;
`.trim()
}

function elementCenter(el: OverpassRawElement): LatLng | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    return { lat: el.lat, lng: el.lon }
  }
  if (el.center) return { lat: el.center.lat, lng: el.center.lon }
  return null
}

export function parseOverpassResponse(raw: OverpassRawResponse): OsmEntity[] {
  const out: OsmEntity[] = []
  const seen = new Set<string>()
  for (const el of raw.elements ?? []) {
    const tags = el.tags ?? {}
    const name = tags.name?.trim()
    if (!name) continue
    const center = elementCenter(el)
    if (!center) continue
    const key = `${el.type}:${el.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      osmType: el.type,
      osmId: el.id,
      name,
      location: center,
      tags,
    })
  }
  return out
}

async function readCache(file: string): Promise<OverpassRawResponse | null> {
  if (!existsSync(file)) return null
  const raw = await readFile(file, 'utf-8')
  try {
    return JSON.parse(raw) as OverpassRawResponse
  } catch {
    return null
  }
}

async function writeCache(file: string, value: unknown): Promise<void> {
  if (!existsSync(dirname(file))) {
    await mkdir(dirname(file), { recursive: true })
  }
  await writeFile(file, JSON.stringify(value), 'utf-8')
}

export type FetchOptions = {
  /** Force a network fetch even if a cache file exists. */
  refresh?: boolean
  /** Override endpoint list (tests / CI). Bypasses env + defaults. */
  endpoints?: string[]
  /** Pluggable fetch (test stub). */
  fetchImpl?: typeof fetch
  /** Per-attempt timeout in ms. Default 75 000. */
  timeoutMs?: number
}

class TransientOverpassError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'TransientOverpassError'
  }
}

async function fetchOnce(
  endpoint: string,
  body: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<OverpassRawResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      body,
      signal: controller.signal,
    })

    if (response.status === 429 || response.status >= 500) {
      const text = await response.text().catch(() => '')
      throw new TransientOverpassError(
        response.status,
        `Overpass ${response.status} from ${endpoint}: ${text.slice(0, 200)}`,
      )
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `Overpass ${response.status} from ${endpoint}: ${text.slice(0, 200)}`,
      )
    }

    const ct = response.headers.get('content-type') ?? ''
    if (!ct.includes('json')) {
      const text = await response.text().catch(() => '')
      // HTML error pages from Apache load-balancers count as transient.
      throw new TransientOverpassError(
        response.status,
        `Overpass non-JSON from ${endpoint} (${ct}): ${text.slice(0, 200)}`,
      )
    }

    return (await response.json()) as OverpassRawResponse
  } finally {
    clearTimeout(timer)
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

/**
 * Fetch one (destination, kind) tuple. Cached on disk; rotates mirrors
 * and retries with exponential backoff on transient errors.
 */
export async function fetchOsm(
  destination: CuratedDestination,
  kind: OverpassKind,
  opts: FetchOptions = {},
): Promise<OsmEntity[]> {
  const cacheFile = resolve(CACHE_DIR, `${destination.id}.${kind}.json`)
  if (!opts.refresh) {
    const cached = await readCache(cacheFile)
    if (cached) return parseOverpassResponse(cached)
  }

  const fetchFn = opts.fetchImpl ?? fetch
  const endpoints = opts.endpoints ?? configuredMirrors()
  const timeoutMs = opts.timeoutMs ?? 75_000
  const query = buildQuery(destination.location, destination.searchRadiusM, kind)
  const body = 'data=' + encodeURIComponent(query)

  // Try each endpoint with up to 3 attempts each (backoff between attempts
  // on the same endpoint; immediate failover to the next mirror on the
  // first transient error).
  const lastErrors: string[] = []
  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const json = await fetchOnce(endpoint, body, fetchFn, timeoutMs)
        await writeCache(cacheFile, json)
        return parseOverpassResponse(json)
      } catch (err) {
        const transient =
          err instanceof TransientOverpassError ||
          (err instanceof Error &&
            (err.name === 'AbortError' || /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err.message)))
        const msg = err instanceof Error ? err.message : String(err)
        lastErrors.push(`[${endpoint} attempt ${attempt}] ${msg}`)
        if (!transient) {
          throw new Error(
            `Overpass non-transient failure for ${destination.id}/${kind}: ${msg}`,
          )
        }
        // Move to the next endpoint after the first transient failure;
        // only retry-in-place if every endpoint has been tried once.
        if (attempt === 1 && endpoint !== endpoints[endpoints.length - 1]) break
        const wait = 1500 * Math.pow(2, attempt - 1)
        console.warn(`  overpass transient (${msg}); waiting ${wait}ms`)
        await sleep(wait)
      }
    }
  }

  throw new Error(
    `Overpass failed for ${destination.id}/${kind} across all mirrors:\n${lastErrors
      .slice(-6)
      .join('\n')}`,
  )
}
