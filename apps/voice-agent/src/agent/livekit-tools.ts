import { llm } from '@livekit/agents'
import { tools as registry, type ToolContext as OurToolContext } from '@echoaway/app'
import type { JSONSchema7 } from 'json-schema'

/**
 * Bridge our `@echoaway/app` tool registry into LiveKit's `ToolContext`.
 *
 * Each LiveKit `tool()` captures the same `OurToolContext` via closure
 * so mutations (e.g. `getTripByPhone` pinning `ctx.tripId`) persist
 * across tool calls in one room session. Used by both the text-mode
 * `GeminiAgent` (CLI) and the LiveKit Agents worker (live audio).
 */
export function buildLivekitToolCtx(ctx: OurToolContext): llm.ToolContext {
  const out: llm.ToolContext = {}
  for (const [name, definition] of Object.entries(registry)) {
    out[name] = llm.tool({
      description: definition.declaration.description,
      parameters: definition.declaration.parameters as unknown as JSONSchema7,
      execute: async (args) => {
        return await definition.execute(args as Record<string, unknown>, ctx)
      },
    })
  }
  return out
}
