import { requireString } from './_shared.js'
import type { Tool } from './types.js'

/**
 * Companion to `searchTripsByTraveler`. Validates a verifier (last-N
 * digits of the traveler's phone, or a fragment of their email) on
 * the server side. Returns the real `tripId` only on a match — and
 * pins it in `ctx` like the other lookup tools.
 *
 * The candidate retires after 3 wrong verifiers; the next attempt
 * will 404 and the agent should re-search. Candidates also TTL out
 * after a few minutes.
 */
export const confirmTripCandidate: Tool = {
  declaration: {
    name: 'confirmTripCandidate',
    description:
      "Mandatory follow-up to searchTripsByTraveler. Validates a verifier the traveler supplies — last 3 digits of their phone, or a fragment of their email local part — against the redacted candidate. On success the real trip is loaded into context and you can proceed normally. After 3 wrong verifiers the candidate retires server-side: apologise briefly and offer a different lookup (phone, email, or booking reference). Don't call this without a candidateId from a prior searchTripsByTraveler call in the same session.",
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description:
            'The candidateId returned by a previous searchTripsByTraveler call.',
        },
        verifier: {
          type: 'string',
          description:
            "The verifier the traveler said out loud — e.g. '678' (last 3 phone digits) or 'big-berlin' (start of their email). Pass it verbatim; the backend matches case-insensitively.",
        },
      },
      required: ['candidateId', 'verifier'],
    },
  },
  execute: async (args, ctx) => {
    const candidateId = requireString(args['candidateId'], 'candidateId')
    const verifier = requireString(args['verifier'], 'verifier')
    const result = await ctx.apiClient.confirmTripCandidate(
      candidateId,
      verifier,
      ctx.sessionId ?? undefined,
    )
    ctx.tripId = result.tripId
    return {
      tripId: result.tripId,
      title: result.trip.title,
      startDate: result.trip.startDate,
      endDate: result.trip.endDate,
      travelers: result.trip.travelers.map((t) => ({
        name: t.traveler.fullName,
        role: t.role,
      })),
      components: result.trip.components.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        status: c.status,
      })),
    }
  },
}
