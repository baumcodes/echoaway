import { requireString, tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const quoteHotelCheckInChange: Tool = {
  declaration: {
    name: 'quoteHotelCheckInChange',
    description:
      'Quote the fee + policy summary for moving the hotel check-in to a new date. Does NOT mutate; always call this before confirmHotelCheckInChange.',
    parameters: {
      type: 'object',
      properties: {
        newCheckInDate: {
          type: 'string',
          description: 'Target check-in date in YYYY-MM-DD format.',
        },
        tripId: {
          type: 'string',
          description: "Optional — defaults to the loaded trip.",
        },
      },
      required: ['newCheckInDate'],
    },
  },
  execute: async (args, ctx) => {
    const tripId = tripIdOrFromCtx(args, ctx)
    const newDate = requireString(args['newCheckInDate'], 'newCheckInDate')
    return ctx.apiClient.quoteHotelCheckInChange(
      tripId,
      newDate,
      ctx.sessionId,
    )
  },
}
