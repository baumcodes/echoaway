import { requireString, tripIdOrFromCtx } from './_shared.js'
import type { Tool } from './types.js'

export const createSupportLog: Tool = {
  declaration: {
    name: 'createSupportLog',
    description:
      "Persist a short summary + transcript of the conversation. Call once at the end of the session, after any actions are confirmed or rejected.",
    parameters: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'Full session transcript (user + assistant turns).',
        },
        summary: {
          type: 'string',
          description: 'One-sentence summary of what was achieved.',
        },
        actions: {
          type: 'array',
          // Gemini Live's BidiGenerate validator requires `items` on
          // every array — schemas without it are rejected at the
          // websocket setup step. Stick to a primitive item shape; the
          // executor coerces non-strings out anyway.
          items: { type: 'string' },
          description:
            'Names of the tools that mutated state during this session.',
        },
        tripId: {
          type: 'string',
          description: 'Optional — defaults to the loaded trip.',
        },
      },
      required: ['transcript', 'summary'],
    },
  },
  execute: async (args, ctx) => {
    const tripId = tripIdOrFromCtx(args, ctx)
    const transcript = requireString(args['transcript'], 'transcript')
    const summary = requireString(args['summary'], 'summary')
    const actions = Array.isArray(args['actions'])
      ? (args['actions'] as string[]).filter((a) => typeof a === 'string')
      : []
    return ctx.apiClient.createSupportLog({
      tripId,
      sessionId: ctx.sessionId,
      transcript,
      summary,
      actions,
    })
  },
}
