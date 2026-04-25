import { requireString, tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const confirmHotelCheckInChange: Tool = {
  declaration: {
    name: 'confirmHotelCheckInChange',
    description:
      "Mutates the booking — applies a previously-quoted hotel check-in change. Hard preconditions: (1) quoteHotelCheckInChange was called in this session with the same date, and (2) the traveler said yes verbally. If they tapped Confirm in the app instead, DO NOT call this tool — the app already applied the change and you'd double-apply. Same date arg as the prior quote.",
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
