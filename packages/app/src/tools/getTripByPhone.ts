import { requireString } from './_shared.js'
import type { Tool } from './types.js'

export const getTripByPhone: Tool = {
  declaration: {
    name: 'getTripByPhone',
    description:
      "Look up the traveler's active trip by their phone number in E.164 format (e.g. +4915112345678).",
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description:
            'Phone number in E.164 format including the leading + and country code.',
        },
      },
      required: ['phoneNumber'],
    },
  },
  execute: async (args, ctx) => {
    const phone = requireString(args['phoneNumber'], 'phoneNumber')
    const trip = await ctx.apiClient.getTripByPhone(phone)
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
