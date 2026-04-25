// Gemini batch enricher.
//
// We feed Gemini a list of (real) hotel or attraction names + city, and
// ask it to return synthetic-but-plausible soft fields: short marketing
// description, tags, price band, amenities, opening hours.
//
// Real, googleable names + coords come from OSM. Only the fields you
// can't get from open data are generated here.

import { GoogleGenerativeAI } from '@google/generative-ai'

export type EnrichmentKind = 'hotel' | 'activity'

export type HotelEnrichmentRequest = {
  index: number
  name: string
  city: string
  region: string
  baseTags: string[]
}

export type HotelEnrichmentResult = {
  index: number
  description: string
  tags: string[]
  stars: number
  pricePerNight: number
  amenities: string[]
}

export type ActivityEnrichmentRequest = {
  index: number
  name: string
  city: string
  rawTags: string[]
}

export type ActivityEnrichmentResult = {
  index: number
  description: string
  tags: string[]
  durationHours: number
  price: number
  openingHours: Record<string, string>
}

export type GeminiClient = {
  enrichHotels(batch: HotelEnrichmentRequest[]): Promise<HotelEnrichmentResult[]>
  enrichActivities(
    batch: ActivityEnrichmentRequest[],
  ): Promise<ActivityEnrichmentResult[]>
}

export const DEFAULT_BATCH_SIZE = 100

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Loose JSON extractor — Gemini sometimes wraps responses in ```json fences
 * or adds a stray prose line. Pull out the first balanced top-level array.
 */
export function extractJsonArray(raw: string): unknown[] {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence?.[1] ?? raw
  const start = body.indexOf('[')
  if (start === -1) throw new Error('no JSON array found in Gemini response')

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        const slice = body.slice(start, i + 1)
        const parsed = JSON.parse(slice) as unknown
        if (!Array.isArray(parsed)) {
          throw new Error('extracted JSON is not an array')
        }
        return parsed
      }
    }
  }
  throw new Error('unbalanced JSON array in Gemini response')
}

const HOTEL_PROMPT_HEADER = `You are populating a travel-app catalogue. For EACH input hotel return ONE
result with synthetic-but-plausible marketing data. Output a JSON array
where every element matches the request's "index" exactly.

Schema per element:
  index: number               // copy from input
  description: string         // 1-2 sentences, no fake addresses
  tags: string[]              // 3-6 short snake_case tags
  stars: number               // 2..5, integer
  pricePerNight: number       // EUR per night, integer, 60..600
  amenities: string[]         // 3-8 from: wifi, ac, breakfast_included, pool,
                              // gym, spa, sea_view, terrace, restaurant, bar,
                              // parking, family_friendly, pet_friendly,
                              // bike_rental, rooftop, beachfront

Rules:
- DO NOT invent addresses, phone numbers, or supplier references.
- DO NOT mention competitor brands.
- Keep descriptions vivid but neutral (no superlatives like "best in town").
- Match the destination's character (coastal, urban, pueblo, etc.).

Return ONLY the JSON array. No prose, no fences.

Inputs:
`

const ACTIVITY_PROMPT_HEADER = `You are populating a travel-app catalogue. For EACH input attraction
return ONE bookable activity around it.

Schema per element:
  index: number                       // copy from input
  description: string                 // 1-2 sentences
  tags: string[]                      // 3-5 snake_case tags
  durationHours: number               // 0.5..6
  price: number                       // EUR, integer, 8..120
  openingHours: object                // keys mon..sun, "HH:MM-HH:MM" or "closed"

Rules:
- DO NOT invent addresses or guide names.
- Keep tone neutral. No superlatives.
- If unsure, choose modest values (e.g. 2 hours, EUR 30, daily 09:00-18:00).

Return ONLY the JSON array. No prose, no fences.

Inputs:
`

export type CreateClientOptions = {
  apiKey: string
  model?: string
}

export function createGeminiClient(opts: CreateClientOptions): GeminiClient {
  const ai = new GoogleGenerativeAI(opts.apiKey)
  const model = ai.getGenerativeModel({
    model: opts.model ?? 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  async function ask(prompt: string): Promise<string> {
    const result = await model.generateContent(prompt)
    return result.response.text()
  }

  return {
    async enrichHotels(batch) {
      if (batch.length === 0) return []
      const text = await ask(HOTEL_PROMPT_HEADER + JSON.stringify(batch))
      return extractJsonArray(text) as HotelEnrichmentResult[]
    },
    async enrichActivities(batch) {
      if (batch.length === 0) return []
      const text = await ask(ACTIVITY_PROMPT_HEADER + JSON.stringify(batch))
      return extractJsonArray(text) as ActivityEnrichmentResult[]
    },
  }
}
