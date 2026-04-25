import { requireString } from './_shared.js'
import type { Tool } from './types.js'

/**
 * Direct trip lookup by the lead traveler's email. Pins the resulting
 * `tripId` in `ctx` like `getTripByPhone` does, so subsequent tools
 * (quote, confirm, etc.) inherit it.
 *
 * The backend trims + lowercases on its side; the LLM doesn't have to
 * canonicalize — but we still hint at the format because models like
 * to add trailing punctuation otherwise.
 */
export const getTripByEmail: Tool = {
  declaration: {
    name: 'getTripByEmail',
    description:
      "Look up the traveler's active trip by email address. Use this when the traveler offers an email. For phone use getTripByPhone; for a booking reference like 'trip-demo-bcn' use findTripById; if they only know their name use searchTripsByTraveler. Loads the trip into context so subsequent tools can default to it.",
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description:
            'Email address. Will be trimmed + lowercased server-side; do not add quotes or trailing punctuation.',
        },
      },
      required: ['email'],
    },
  },
  execute: async (args, ctx) => {
    const email = requireString(args['email'], 'email')
    const trip = await ctx.apiClient.getTripByEmail(
      email,
      ctx.sessionId ?? undefined,
    )
    ctx.tripId = trip.id
    return {
      tripId: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      travelers: trip.travelers.map((t) => ({
        name: t.traveler.fullName,
        role: t.role,
      })),
      components: trip.components.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        status: c.status,
      })),
    }
  },
}
