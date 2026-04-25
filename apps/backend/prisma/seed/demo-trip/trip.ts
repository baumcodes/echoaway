import { prisma } from '../shared/db.js'
import {
  DEMO_SEGMENT_ID,
  DEMO_TRIP_ID,
  TRAVELER_COMPANION_ID,
  TRAVELER_LEAD_ID,
} from './constants.js'
import type { TripDates } from './dates.js'

const SEGMENT_DESTINATION_ID = 'dest-barcelona'

export async function seedTrip(dates: TripDates): Promise<void> {
  await prisma.trip.create({
    data: {
      id: DEMO_TRIP_ID,
      title: 'Barcelona Long Weekend',
      status: 'booked',
      startDate: dates.tripStart,
      endDate: dates.tripEnd,
      currency: 'EUR',
    },
  })

  await prisma.tripSegment.create({
    data: {
      id: DEMO_SEGMENT_ID,
      tripId: DEMO_TRIP_ID,
      destinationId: SEGMENT_DESTINATION_ID,
      startDate: dates.tripStart,
      endDate: dates.tripEnd,
      order: 1,
      title: 'Barcelona',
    },
  })

  await prisma.tripTraveler.createMany({
    data: [
      { tripId: DEMO_TRIP_ID, travelerId: TRAVELER_LEAD_ID, role: 'lead' },
      {
        tripId: DEMO_TRIP_ID,
        travelerId: TRAVELER_COMPANION_ID,
        role: 'companion',
      },
    ],
  })
}
