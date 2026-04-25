import { tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const getTripDisruptions: Tool = {
  declaration: {
    name: 'getTripDisruptions',
    description:
      'List open disruptions on the loaded trip (flight delays, schedule changes, …) with their suggestedActions.',
    parameters: {
      type: 'object',
      properties: {
        tripId: {
          type: 'string',
          description:
            "Optional — defaults to the trip currently loaded into the agent's context.",
        },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const tripId = tripIdOrFromCtx(args, ctx)
    return ctx.apiClient.getDisruptions(tripId)
  },
}
