import { requireString, tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const quoteHotelCheckInChange: Tool = {
  declaration: {
    name: 'quoteHotelCheckInChange',
    description:
      "Read-only quote for moving the hotel check-in date. Returns the fee, applicable policy, and a ChangeQuote — and ALSO renders a confirmation card in the traveler's app, which is how they tap-to-confirm. Always call this first; confirmHotelCheckInChange will refuse without a fresh quote in the same session. Safe to call repeatedly while the traveler picks a date.",
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
