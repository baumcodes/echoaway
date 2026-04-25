import { requireString } from './_shared.js'
import type { Tool } from './types.js'

export const searchTravelContext: Tool = {
  declaration: {
    name: 'searchTravelContext',
    description:
      "Pull external travel context (web search) when the booking data alone won't answer the traveler. Good fits: airport arrival hall layout, transit options between airport and city, hotel check-in norms in a country, airline delay support guidance, weather / event context for a destination. NOT for: anything about the traveler's own booking (use getTrip*… and getTripDisruptions for that), pricing or availability of catalog inventory (use listAccommodations etc.). Keep queries short and specific — one topic at a time. Treat results as supplementary — never as a guarantee or legal claim.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text query.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args) => {
    const query = requireString(args['query'], 'query')
    return {
      query,
      note: 'searchTravelContext is a stub until Phase 8 wires Tavily.',
      results: [],
    }
  },
}
