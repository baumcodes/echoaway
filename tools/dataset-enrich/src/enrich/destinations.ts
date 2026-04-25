// Curated destinations → DatasetDestination rows (no OSM, no Gemini).
//
// Existing rows are preserved by mergeById; this just produces the
// candidate list and lets the merger drop duplicates.

import { CURATED_DESTINATIONS } from '../destinations.js'
import type { DatasetDestination } from '../types.js'

export function buildDestinationCandidates(): DatasetDestination[] {
  return CURATED_DESTINATIONS.map((d) => ({
    _id: d.id,
    name: d.name,
    country: 'Spain',
    iso_country_code: 'ES',
    description: d.description,
    location: d.location,
    tags: d.baseTags,
  }))
}
