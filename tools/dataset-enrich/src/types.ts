// Mirrors the row shapes in /dataset/*.json verbatim. Kept local so the
// enrich tool stays runnable without depending on the rest of the
// monorepo packages.

export type LatLng = { lat: number; lng: number }

export type DatasetDestination = {
  _id: string
  name: string
  country: string
  iso_country_code: string
  description: string
  location: LatLng
  tags: string[]
}

export type DatasetAirport = {
  _id: string
  iata: string
  icao: string
  name: string
  city: string
  country: string
  location: LatLng
}

export type DatasetSupplier = {
  name: string
  contract_ref: string
}

export type DatasetAccommodation = {
  _id: string
  name: string
  city: string
  country: string
  stars: number
  price_per_night: number
  amenities: string[]
  location: LatLng
  description: string
  supplier: DatasetSupplier
  cancellation_terms: string
  images: string[]
}

export type DatasetActivity = {
  _id: string
  name: string
  city: string
  tags: string[]
  duration_hours: number
  opening_hours: Record<string, string>
  price: number
  supplier: DatasetSupplier
  description: string
}

export type DatasetTransferSchedule = {
  start: string
  end: string
  frequency_minutes: number
}

export type DatasetGroundTransfer = {
  _id: string
  from: string
  to: string
  mode: 'bus' | 'shuttle' | 'private_car' | 'train' | 'taxi'
  duration_minutes: number
  price: number
  currency: 'EUR'
  supplier: DatasetSupplier
  schedule: DatasetTransferSchedule
  description: string
}

/** OSM Overpass element after normalization. */
export type OsmEntity = {
  osmType: 'node' | 'way' | 'relation'
  osmId: number
  name: string
  location: LatLng
  /** Selected raw tags useful for downstream enrichment. */
  tags: Record<string, string>
}
