import {
  type ComponentEventLocation,
  componentEventLocationSchema,
} from '@echoaway/types'
import { prisma } from '../shared/db.js'
import { COMPONENTS } from './constants.js'
import type { TripDates } from './dates.js'
import type { DemoCatalog } from './load-catalog.js'

const TZ = 'Europe/Madrid'
const BCN_DEST_ID = 'dest-barcelona'
const BER_AIRPORT = { id: 'air-ber', iata: 'BER' }
const BCN_AIRPORT = { id: 'air-bcn', iata: 'BCN' }

function loc(location: ComponentEventLocation): string {
  return JSON.stringify(componentEventLocationSchema.parse(location))
}

function parseCoords(raw: string | null): { lat: number; lng: number } | undefined {
  if (!raw) return undefined
  return JSON.parse(raw) as { lat: number; lng: number }
}

export async function seedEvents(
  cat: DemoCatalog,
  dates: TripDates,
): Promise<void> {
  const hotelCoords = parseCoords(cat.hotel.coordinates)

  await prisma.componentEvent.createMany({
    data: [
      // Flight: BER departure (no destinationId — Berlin is not a seeded
      // destination, only an airport)
      {
        id: 'evt-flight-depart',
        componentId: COMPONENTS.flightOut,
        destinationId: null,
        type: 'departure',
        title: 'Vueling VY1885 — Berlin (BER) departure',
        startsAt: dates.flight.depart,
        endsAt: null,
        timezone: 'Europe/Berlin',
        location: loc({
          kind: 'airport',
          iataCode: BER_AIRPORT.iata,
          airportId: BER_AIRPORT.id,
          terminal: 'T1',
        }),
      },
      // Flight: BCN arrival
      {
        id: 'evt-flight-arrive',
        componentId: COMPONENTS.flightOut,
        destinationId: BCN_DEST_ID,
        type: 'arrival',
        title: 'Vueling VY1885 — Barcelona (BCN) arrival',
        startsAt: dates.flight.arrive,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'airport',
          iataCode: BCN_AIRPORT.iata,
          airportId: BCN_AIRPORT.id,
        }),
      },
      // Transfer: pickup at BCN airport
      {
        id: 'evt-transfer-pickup',
        componentId: COMPONENTS.transfer,
        destinationId: BCN_DEST_ID,
        type: 'pickup',
        title: 'Airport shuttle pickup — BCN T1 arrivals',
        startsAt: dates.transfer.pickup,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'airport',
          iataCode: BCN_AIRPORT.iata,
          airportId: BCN_AIRPORT.id,
          terminal: 'T1',
        }),
      },
      // Hotel: check-in
      {
        id: 'evt-stay-checkin',
        componentId: COMPONENTS.stay,
        destinationId: BCN_DEST_ID,
        type: 'check_in',
        title: `${cat.hotel.name} — check-in`,
        startsAt: dates.stay.checkIn,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'accommodation',
          accommodationProductId: cat.hotel.id,
          name: cat.hotel.name,
          coordinates: hotelCoords,
        }),
      },
      // Hotel: check-out
      {
        id: 'evt-stay-checkout',
        componentId: COMPONENTS.stay,
        destinationId: BCN_DEST_ID,
        type: 'check_out',
        title: `${cat.hotel.name} — check-out`,
        startsAt: dates.stay.checkOut,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'accommodation',
          accommodationProductId: cat.hotel.id,
          name: cat.hotel.name,
          coordinates: hotelCoords,
        }),
      },
      // Sagrada: meeting point
      {
        id: 'evt-act-sagrada-meet',
        componentId: COMPONENTS.actSagrada,
        destinationId: BCN_DEST_ID,
        type: 'meeting_point',
        title: 'Sagrada Família tour — meet at main entrance',
        startsAt: dates.sagrada.meet,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'activity',
          meetingPointName: 'Sagrada Família — main entrance',
          address: 'C. de Mallorca, 401, 08013 Barcelona',
        }),
      },
      // Sagrada: activity start
      {
        id: 'evt-act-sagrada-start',
        componentId: COMPONENTS.actSagrada,
        destinationId: BCN_DEST_ID,
        type: 'activity_start',
        title: 'Sagrada Família tour — start',
        startsAt: dates.sagrada.start,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'activity',
          meetingPointName: 'Sagrada Família — main entrance',
        }),
      },
      // Sagrada: activity end
      {
        id: 'evt-act-sagrada-end',
        componentId: COMPONENTS.actSagrada,
        destinationId: BCN_DEST_ID,
        type: 'activity_end',
        title: 'Sagrada Família tour — end',
        startsAt: dates.sagrada.end,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'activity',
          meetingPointName: 'Sagrada Família — exit',
        }),
      },
      // Food (cooking class): activity start
      {
        id: 'evt-act-food-start',
        componentId: COMPONENTS.actFood,
        destinationId: BCN_DEST_ID,
        type: 'activity_start',
        title: 'Paella cooking class — start',
        startsAt: dates.food.start,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'activity',
          meetingPointName: 'Mercat de la Boqueria — main entrance',
          address: 'La Rambla, 91, 08001 Barcelona',
        }),
      },
      // Food: activity end
      {
        id: 'evt-act-food-end',
        componentId: COMPONENTS.actFood,
        destinationId: BCN_DEST_ID,
        type: 'activity_end',
        title: 'Paella cooking class — end',
        startsAt: dates.food.end,
        endsAt: null,
        timezone: TZ,
        location: loc({
          kind: 'activity',
          meetingPointName: 'Cooking studio (Born district)',
        }),
      },
    ],
  })
}
