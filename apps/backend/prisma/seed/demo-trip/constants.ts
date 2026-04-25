/**
 * Stable IDs and pinned references for the "Barcelona Long Weekend" demo
 * trip. Centralised so every demo-trip module agrees on the same anchors;
 * the voice-agent tools and the web UI also import these (eventually).
 */

export const DEMO_TRIP_ID = 'trip-demo-bcn'
export const DEMO_SEGMENT_ID = 'seg-1-bcn'

export const TRAVELER_LEAD_ID = 'trav-stephan'
export const TRAVELER_COMPANION_ID = 'trav-anna'
export const LEAD_PHONE = '+4915112345678'

export const COMPONENTS = {
  flightOut: 'comp-flight-out',
  transfer: 'comp-transfer',
  stay: 'comp-stay',
  actSagrada: 'comp-act-sagrada',
  actFood: 'comp-act-food',
} as const

// Catalog products this demo references — all seeded by Phase 2B.
export const CATALOG_REFS = {
  flightRoute: 'flt-ber-bcn-01',
  transfer: 'trf-bcn-hotelbrisa',
  hotel: 'hotel-bcn-01',
  actSagrada: 'act-bcn-sagrada',
  // The PLAN calls for "Tapas tour"; the dataset has no tapas activity in
  // Barcelona, so we use the paella cooking class as the second culinary
  // experience. The Component.title overrides display text anyway.
  actFood: 'act-bcn-cooking',
} as const

export const DISRUPTION_ID = 'disrupt-flight-delay-bcn'
