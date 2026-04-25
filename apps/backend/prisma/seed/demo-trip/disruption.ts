import { type SuggestedAction, suggestedActionSchema } from '@echoaway/types'
import { addDays, format } from 'date-fns'
import { z } from 'zod'
import { prisma } from '../shared/db.js'
import {
  COMPONENTS,
  DEMO_TRIP_ID,
  DISRUPTION_ID,
} from './constants.js'
import type { TripDates } from './dates.js'

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

export async function seedDisruption(dates: TripDates): Promise<void> {
  const newCheckInDate = isoDate(addDays(dates.stay.checkIn, 1))

  const suggestedActions: SuggestedAction[] = [
    {
      id: 'shift-checkin',
      description: 'Move hotel check-in to tomorrow.',
      toolCall: {
        tool: 'quoteHotelCheckInChange',
        arguments: {
          componentId: COMPONENTS.stay,
          newCheckInDate,
        },
      },
      priority: 1,
    },
    {
      id: 'requote-transfer',
      description: 'Reschedule airport transfer to match new arrival.',
      toolCall: {
        tool: 'requoteTransfer',
        arguments: {
          componentId: COMPONENTS.transfer,
          newPickup: '23:50',
        },
      },
      priority: 2,
    },
  ]

  // Validate the array against the schema before stringify so a typo
  // surfaces here, not in the voice agent.
  const validated = z.array(suggestedActionSchema).parse(suggestedActions)

  await prisma.disruption.create({
    data: {
      id: DISRUPTION_ID,
      tripId: DEMO_TRIP_ID,
      affectedComponentId: COMPONENTS.flightOut,
      type: 'flight_delay',
      severity: 'major',
      message:
        'Vueling VY1885 BER → BCN is delayed by 3h. Estimated arrival: 23:40 local.',
      suggestedActions: JSON.stringify(validated),
      status: 'open',
      detectedAt: dates.now,
    },
  })
}
