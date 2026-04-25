import { requireString } from './_shared.js'
import type { Tool } from './types.js'

/**
 * Privacy-safe fuzzy search by traveler name. The agent uses this
 * when the traveler offers their name (and only their name) instead
 * of a phone, email, or booking reference.
 *
 * The backend never returns raw name / email / phone — it returns
 * redacted candidates with a phone tail and a masked email plus an
 * opaque `candidateId`. The agent must NOT read the redacted fields
 * back to the traveler verbatim — instead, ask for a verifier they
 * supply (last 3 digits of phone, fragment of their email) and call
 * `confirmTripCandidate` with it. Only after a successful verify do
 * we have a real `tripId` and can move on.
 */
export const searchTripsByTraveler: Tool = {
  declaration: {
    name: 'searchTripsByTraveler',
    description:
      "Last-resort lookup by traveler name — use ONLY when the traveler can't supply a phone, email, or booking reference (those map to getTripByPhone / getTripByEmail / findTripById and are far cheaper). Returns ANONYMISED candidates: opaque candidateIds plus boolean hints about which verifiers exist. PRIVACY RULE — you MUST NOT read names, emails, or phones aloud, even if the traveler said the name first. Mandatory follow-up: ask the traveler for a verifier they should know (last 3 digits of their phone, or the start of their email) and call confirmTripCandidate. Multiple matches are disambiguated by the verifier itself; do not enumerate candidates to the caller.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "Full name or any substring of the traveler's name. Two characters minimum.",
        },
      },
      required: ['query'],
    },
  },
  execute: async (args, ctx) => {
    const query = requireString(args['query'], 'query')
    const candidates = await ctx.apiClient.searchTrips(query)
    return {
      // Help the LLM phrase its next prompt without leaking data.
      matchCount: candidates.length,
      // Strip the masked email/phone so the model is even less tempted
      // to read them back. The verifier is a *user-supplied* string;
      // the agent doesn't need to know what's on file.
      candidates: candidates.map((c) => ({
        candidateId: c.candidateId,
        tripTitle: c.tripTitle,
        hasPhoneVerifier: c.phoneTail !== null,
        hasEmailVerifier: c.emailMasked !== null,
      })),
    }
  },
}
