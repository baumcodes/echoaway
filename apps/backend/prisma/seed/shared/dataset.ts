import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET_DIR = resolve(__dirname, '../../../../../dataset')

const load = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(DATASET_DIR, file), 'utf8')) as T

export type DestinationSrc = {
  _id: string
  name: string
  country: string
  iso_country_code: string
  description: string
  location: { lat: number; lng: number }
  tags: string[]
}

export type AirportSrc = {
  _id: string
  iata: string
  icao: string
  name: string
  city: string
  country: string
  location: { lat: number; lng: number }
}

export type AccommodationSrc = {
  _id: string
  name: string
  city: string
  country: string
  stars: number
  price_per_night: number
  amenities: string[]
  location: { lat: number; lng: number }
  description: string
  supplier: { name: string; contract_ref: string }
  cancellation_terms: string
  images: string[]
}

export type ActivitySrc = {
  _id: string
  name: string
  city: string
  tags: string[]
  duration_hours: number
  opening_hours: Record<string, string>
  price: number
  supplier: { name: string; contract_ref: string }
  description: string
}

export type FlightRouteSrc = {
  _id: string
  from: string
  to: string
  stops: number
  legs: Array<{
    from: string
    to: string
    flight_no: string
    airline: string
    dep_time: string
    arr_time: string
  }>
  days_of_week: number[]
  price_avg: number
  currency: string
  fare_conditions: string
  duration_hours: number
}

export type GroundTransferSrc = {
  _id: string
  from: string
  to: string
  mode: string
  duration_minutes: number
  price: number
  currency: string
  supplier: { name: string; contract_ref: string }
  schedule: Record<string, unknown>
  description: string
}

export const dataset = {
  destinations: () => load<DestinationSrc[]>('destinations.json'),
  airports: () => load<AirportSrc[]>('airports.json'),
  accommodations: () => load<AccommodationSrc[]>('accommodations.json'),
  activities: () => load<ActivitySrc[]>('activities.json'),
  flightRoutes: () => load<FlightRouteSrc[]>('flight_routes.json'),
  groundTransfers: () => load<GroundTransferSrc[]>('ground_transfers.json'),
}
