import { prisma } from '../shared/db.js'
import { COMPONENTS, DEMO_SEGMENT_ID, DEMO_TRIP_ID } from './constants.js'
import type { DemoCatalog } from './load-catalog.js'

/**
 * Creates the 5 Component rows. Each row sets exactly ONE of the four
 * catalog FKs, matching `type` (the polymorphic-by-nullable-FK rule from
 * docs/data-model.md §3.2).
 */
export async function seedComponents(cat: DemoCatalog): Promise<void> {
  await prisma.component.createMany({
    data: [
      {
        id: COMPONENTS.flightOut,
        tripId: DEMO_TRIP_ID,
        segmentId: DEMO_SEGMENT_ID,
        type: 'flight',
        title: 'Berlin → Barcelona (Vueling VY1885)',
        status: 'booked',
        flightRouteProductId: cat.flightRoute.id,
      },
      {
        id: COMPONENTS.transfer,
        tripId: DEMO_TRIP_ID,
        segmentId: DEMO_SEGMENT_ID,
        type: 'transfer',
        title: 'Airport shuttle to Hotel Brisa',
        status: 'booked',
        groundTransferProductId: cat.transfer.id,
      },
      {
        id: COMPONENTS.stay,
        tripId: DEMO_TRIP_ID,
        segmentId: DEMO_SEGMENT_ID,
        type: 'accommodation',
        title: 'Hotel Brisa Barcelona — 4 nights',
        status: 'booked',
        accommodationProductId: cat.hotel.id,
      },
      {
        id: COMPONENTS.actSagrada,
        tripId: DEMO_TRIP_ID,
        segmentId: DEMO_SEGMENT_ID,
        type: 'activity',
        title: 'Sagrada Família guided tour',
        status: 'booked',
        activityProductId: cat.sagrada.id,
      },
      {
        id: COMPONENTS.actFood,
        tripId: DEMO_TRIP_ID,
        segmentId: DEMO_SEGMENT_ID,
        type: 'activity',
        title: 'Paella cooking class & market visit',
        status: 'booked',
        activityProductId: cat.food.id,
      },
    ],
  })
}
