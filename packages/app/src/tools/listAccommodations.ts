import { requireString } from './_shared.js'
import type { Tool } from './types.js'

export const listAccommodations: Tool = {
  declaration: {
    name: 'listAccommodations',
    description:
      "List bookable hotels in a destination — used when the traveler asks 'what other hotels are nearby?' or wants to swap their stay. Returns id, name, stars, nightly price, amenities; the agent should propose options conversationally before any change tool is called.",
    parameters: {
      type: 'object',
      properties: {
        destinationId: {
          type: 'string',
          description:
            "Destination id (e.g. 'dest-barcelona'). Discoverable via the loaded trip's segment.destinationId or via getTripByPhone.",
        },
      },
      required: ['destinationId'],
    },
  },
  execute: async (args, ctx) => {
    const destinationId = requireString(args['destinationId'], 'destinationId')
    const rows = await ctx.apiClient.listAccommodations(destinationId)
    // Trim to keep the model's context tight — the model only needs
    // enough to reason about "which to suggest"; a follow-up can pull
    // full details when the traveler picks one.
    return rows.slice(0, 20).map((a) => ({
      id: a.id,
      name: a.name,
      stars: a.stars,
      pricePerNightCents: a.pricePerNightCents,
      currency: a.currency,
      amenities: a.amenities,
    }))
  },
}
