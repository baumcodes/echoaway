import { requireString } from './_shared.js'
import type { Tool } from './types.js'

export const getTripByPhone: Tool = {
  declaration: {
    name: 'getTripByPhone',
    description:
      "Look up the traveler's active trip by phone number. Use this when the traveler offers a phone number. For email use getTripByEmail; for a booking reference like 'trip-demo-bcn' use findTripById; if they only know their name use searchTripsByTraveler. Loads the trip into context so subsequent tools (quote, confirm, etc.) can default to it.",
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description:
            'Phone number, ideally E.164 (e.g. +4915112345678). The backend tolerates spaces and dashes; pass it as the traveler said it.',
        },
      },
      required: ['phoneNumber'],
    },
  },
  execute: async (args, ctx) => {
    const phone = requireString(args['phoneNumber'], 'phoneNumber')
    // Thread sessionId so the backend emits `trip_loaded` for the SSE
    // stream — that's what triggers the web UI to render the trip.
    const trip = await ctx.apiClient.getTripByPhone(
      phone,
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
