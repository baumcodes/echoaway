import { describe, expect, it } from 'vitest'
import {
  selectActivities,
  selectFlight,
  selectFlightDisruption,
  selectHotel,
  selectHotelCheckInDate,
  selectProposedNewCheckIn,
  selectTransfer,
} from './selectors.js'
import type { Trip, TripComponent } from './types.js'

const flight: TripComponent = {
  id: 'comp-flight-out',
  type: 'flight',
  title: 'BER → BCN',
  status: 'booked',
  segmentId: null,
  catalogRef: {
    accommodationProductId: null,
    activityProductId: null,
    flightRouteProductId: 'flt-ber-bcn-01',
    groundTransferProductId: null,
  },
  booking: null,
  events: [],
}

const transfer: TripComponent = { ...flight, id: 'comp-transfer', type: 'transfer' }
const hotel: TripComponent = {
  ...flight,
  id: 'comp-stay',
  type: 'accommodation',
  booking: {
    id: 'book-stay',
    supplierId: 'sup-hotelbeds',
    supplierBookingReference: 'DEMO-HB-001',
    status: 'confirmed',
    priceCents: 58000,
    currency: 'EUR',
    policy: null,
    data: {
      kind: 'accommodation',
      productSnapshot: {
        productId: 'hotel-bcn-01',
        name: 'Hotel Brisa Barcelona',
        stars: 4,
        pricePerNightCents: 14500,
        currency: 'EUR',
        coordinates: { lat: 0, lng: 0 },
        amenities: [],
        images: [],
      },
      checkInDate: '2026-05-02',
      checkOutDate: '2026-05-06',
      nights: 4,
      totalPriceCents: 58000,
      guests: [],
    },
    bookedAt: '2026-04-25T00:00:00.000Z',
    cancelledAt: null,
  },
}
const sagrada: TripComponent = { ...flight, id: 'comp-act-sagrada', type: 'activity' }
const food: TripComponent = { ...flight, id: 'comp-act-food', type: 'activity' }

const trip: Trip = {
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  status: 'booked',
  startDate: '2026-05-02T00:00:00.000Z',
  endDate: '2026-05-06T00:00:00.000Z',
  currency: 'EUR',
  segments: [],
  travelers: [],
  components: [flight, transfer, hotel, sagrada, food],
  disruptions: [
    {
      id: 'disrupt-flight-delay-bcn',
      type: 'flight_delay',
      severity: 'major',
      message: 'delayed',
      status: 'open',
      affectedComponentId: 'comp-flight-out',
      suggestedActions: null,
      detectedAt: '2026-04-25T00:00:00.000Z',
      resolvedAt: null,
    },
  ],
}

describe('selectors', () => {
  it('select* returns null when trip is null', () => {
    expect(selectFlight(null)).toBeNull()
    expect(selectHotel(null)).toBeNull()
    expect(selectTransfer(null)).toBeNull()
    expect(selectFlightDisruption(null)).toBeNull()
    expect(selectHotelCheckInDate(null)).toBeNull()
    expect(selectProposedNewCheckIn(null)).toBeNull()
    expect(selectActivities(null)).toEqual([])
  })

  it('returns the right component by type', () => {
    expect(selectFlight(trip)?.id).toBe('comp-flight-out')
    expect(selectTransfer(trip)?.id).toBe('comp-transfer')
    expect(selectHotel(trip)?.id).toBe('comp-stay')
    expect(selectActivities(trip).map((a) => a.id)).toEqual([
      'comp-act-sagrada',
      'comp-act-food',
    ])
  })

  it('finds the disruption tied to the flight component', () => {
    expect(selectFlightDisruption(trip)?.id).toBe('disrupt-flight-delay-bcn')
  })

  it('returns null disruption when flight component has none', () => {
    const tripNoDisruption: Trip = { ...trip, disruptions: [] }
    expect(selectFlightDisruption(tripNoDisruption)).toBeNull()
  })

  it('selectHotelCheckInDate reads the booking snapshot', () => {
    expect(selectHotelCheckInDate(trip)).toBe('2026-05-02')
  })

  it('selectProposedNewCheckIn returns +1 day in UTC-safe form', () => {
    expect(selectProposedNewCheckIn(trip)).toBe('2026-05-03')
  })

  it('selectProposedNewCheckIn handles month rollover', () => {
    const tripEndOfMonth: Trip = {
      ...trip,
      components: trip.components.map((c) =>
        c.id === 'comp-stay' && c.booking?.data?.kind === 'accommodation'
          ? {
              ...c,
              booking: {
                ...c.booking,
                data: { ...c.booking.data, checkInDate: '2026-05-31' },
              },
            }
          : c,
      ),
    }
    expect(selectProposedNewCheckIn(tripEndOfMonth)).toBe('2026-06-01')
  })
})
