import type { Trip, TripComponent, TripDisruption } from './types.js'

/**
 * Pure derivations over a `Trip`. Kept here (not in the hook or in
 * components) so they're testable in isolation and reusable from
 * apps/mobile when it lands.
 *
 * Each selector returns `null` when the underlying data is missing —
 * it's the caller's job to render a skeleton or empty state.
 */

export const selectFlight = (trip: Trip | null): TripComponent | null =>
  trip?.components.find((c) => c.type === 'flight') ?? null

export const selectTransfer = (trip: Trip | null): TripComponent | null =>
  trip?.components.find((c) => c.type === 'transfer') ?? null

export const selectHotel = (trip: Trip | null): TripComponent | null =>
  trip?.components.find((c) => c.type === 'accommodation') ?? null

export const selectActivities = (trip: Trip | null): TripComponent[] =>
  trip?.components.filter((c) => c.type === 'activity') ?? []

export const selectFlightDisruption = (
  trip: Trip | null,
): TripDisruption | null => {
  const flight = selectFlight(trip)
  if (!trip || !flight) return null
  return (
    trip.disruptions.find((d) => d.affectedComponentId === flight.id) ?? null
  )
}

/** Current hotel check-in (ISO date) — drives the demo's "+1 day" target. */
export const selectHotelCheckInDate = (trip: Trip | null): string | null => {
  const hotel = selectHotel(trip)
  if (!hotel?.booking?.data || hotel.booking.data.kind !== 'accommodation') {
    return null
  }
  return hotel.booking.data.checkInDate
}

/** "+1 day" date the demo flow proposes for the wow moment. */
export const selectProposedNewCheckIn = (trip: Trip | null): string | null => {
  const current = selectHotelCheckInDate(trip)
  if (!current) return null
  const d = new Date(`${current}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
