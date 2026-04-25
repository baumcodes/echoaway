import type { Tool } from './types.js'

export const endSession: Tool = {
  declaration: {
    name: 'endSession',
    description:
      "End the call. Call this only after the traveler has confirmed they have no further questions and you've already said goodbye. Do not say anything after calling — the room disconnects immediately.",
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            "Short reason for ending — e.g. 'traveler said goodbye', 'task complete, no further questions'. For the support log only.",
        },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const reason =
      typeof args['reason'] === 'string' ? (args['reason'] as string) : 'session ended'
    if (ctx.endSession) {
      await ctx.endSession()
      return { ended: true, reason }
    }
    // No room to hang up (CLI / deterministic script). Returning success
    // lets the LLM finish its turn cleanly; the surface itself will exit
    // through its own lifecycle.
    return { ended: false, reason, note: 'no live room to disconnect' }
  },
}
