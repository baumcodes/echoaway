import { tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const getTripDisruptions: Tool = {
  declaration: {
    name: 'getTripDisruptions',
    description:
      "List open disruptions on the loaded trip (flight delays, schedule changes, weather closures, …) with their suggestedActions. Call this right after a successful trip lookup, and again whenever the traveler hints at something going wrong ('my flight is delayed', 'they cancelled my tour'). Each disruption's suggestedActions array tells you which downstream tool to propose — pick the priority-1 action when the traveler's request matches it. Returns an empty list if the trip is healthy.",
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
