import { requireString } from './_shared.js'
import type { Tool } from './types.js'

/**
 * Direct trip lookup by booking reference / trip id. Tolerant of
 * dashes, spaces, and casing — the backend normalizes both sides
 * before matching, so "trip-demo-bcn", "trip demo bcn", and
 * "TRIPDEMOBCN" all resolve to the same trip.
 *
 * Pins the resulting `tripId` in `ctx` so downstream tools inherit it.
 */
export const findTripById: Tool = {
  declaration: {
    name: 'findTripById',
    description:
      "Look up a trip by its booking reference / trip id (e.g. 'trip-demo-bcn'). Use this when the traveler reads back a code that starts with 'trip-' or sounds like an alphanumeric booking ref. For phone use getTripByPhone; for email use getTripByEmail; for name-only fallback use searchTripsByTraveler. Dashes, spacing, and casing are all tolerated — pass the raw input. Loads the trip into context.",
    parameters: {
      type: 'object',
      properties: {
        tripId: {
          type: 'string',
          description:
            'Trip id / booking reference. Dashes optional. Pass it as the traveler said it; the backend strips formatting.',
        },
      },
      required: ['tripId'],
    },
  },
  execute: async (args, ctx) => {
    const tripIdInput = requireString(args['tripId'], 'tripId')
    const trip = await ctx.apiClient.getTripByIdLoose(
      tripIdInput,
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
