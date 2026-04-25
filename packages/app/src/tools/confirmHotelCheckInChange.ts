import { requireString, tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const confirmHotelCheckInChange: Tool = {
  declaration: {
    name: 'confirmHotelCheckInChange',
    description:
      'Apply a previously-quoted hotel check-in change. ONLY call this after the traveler has explicitly confirmed.',
    parameters: {
      type: 'object',
      properties: {
        newCheckInDate: {
          type: 'string',
          description:
            'Same target date used in the prior quoteHotelCheckInChange call.',
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
    return ctx.apiClient.confirmHotelCheckInChange(
      tripId,
      newDate,
      ctx.sessionId,
    )
  },
}
