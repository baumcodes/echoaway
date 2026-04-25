import type { ToolContext } from './types.js'

/** Argument coercion shared by every tool's execute() — keeps the
 *  individual tool files focused on their own behavior, not boilerplate. */

export const requireString = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) {
    throw new Error(`Tool arg "${name}" is required`)
  }
  return v
}

/** Pick the trip id off the args (model-supplied) or the context (pinned
 *  by `getTripByPhone`). Throws if neither is available so the model
 *  gets a clear "call getTripByPhone first" error instead of an
 *  unrelated 404. */
export const tripIdOrFromCtx = (
  args: Record<string, unknown>,
  ctx: ToolContext,
): string => {
  const explicit = args['tripId']
  if (typeof explicit === 'string' && explicit) return explicit
  if (!ctx.tripId) {
    throw new Error(
      'No tripId in context — call getTripByPhone before this tool.',
    )
  }
  return ctx.tripId
}
