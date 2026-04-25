import { requireString } from './_shared.js'
import type { Tool } from './types.js'

export const searchTravelContext: Tool = {
  declaration: {
    name: 'searchTravelContext',
    description:
      "Search lightweight travel context (airport guides, hotel norms, airline policy summaries). Phase 8 will plug Tavily; for now returns a stub note.",
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
