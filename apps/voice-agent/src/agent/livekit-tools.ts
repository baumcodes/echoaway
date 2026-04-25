import { llm } from '@livekit/agents'
import { tools as registry, type ToolContext as OurToolContext } from '@echoaway/app'
import type { JSONSchema7 } from 'json-schema'

export interface BuildLivekitToolCtxOptions {
  /**
   * Threshold in milliseconds. If a single tool execute() takes longer
   * than this, `onSlowToolCall` fires once for that call so the worker
   * can speak a "still working" filler. Defaults to 3500 ms.
   */
  slowToolThresholdMs?: number
  /**
   * Called when a tool has been running longer than the threshold.
   * Fire-and-forget — no return value awaited. The callback runs at
   * most once per tool call (cleared if execute resolves first).
   */
  onSlowToolCall?: (info: { toolName: string; elapsedMs: number }) => void
}

/**
 * Bridge our `@echoaway/app` tool registry into LiveKit's `ToolContext`.
 *
 * Each LiveKit `tool()` captures the same `OurToolContext` via closure
 * so mutations (e.g. `getTripByPhone` pinning `ctx.tripId`) persist
 * across tool calls in one room session. Used by both the text-mode
 * `GeminiAgent` (CLI) and the LiveKit Agents worker (live audio).
 *
 * When `onSlowToolCall` is provided, each tool's execute() is wrapped
 * with a timer; if a call exceeds `slowToolThresholdMs` (default 3.5 s)
 * the callback fires so the worker can keep the traveler entertained
 * with a programmatic filler instead of dead silence.
 */
export function buildLivekitToolCtx(
  ctx: OurToolContext,
  options: BuildLivekitToolCtxOptions = {},
): llm.ToolContext {
  const threshold = options.slowToolThresholdMs ?? 3500
  const onSlow = options.onSlowToolCall
  const out: llm.ToolContext = {}
  for (const [name, definition] of Object.entries(registry)) {
    out[name] = llm.tool({
      description: definition.declaration.description,
      parameters: definition.declaration.parameters as unknown as JSONSchema7,
      execute: async (args) => {
        if (!onSlow) {
          return await definition.execute(args as Record<string, unknown>, ctx)
        }
        const startedAt = Date.now()
        let timer: NodeJS.Timeout | null = setTimeout(() => {
          timer = null
          try {
            onSlow({ toolName: name, elapsedMs: Date.now() - startedAt })
          } catch (err) {
            console.warn(
              `[livekit-tools] onSlowToolCall threw (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }, threshold)
        try {
          return await definition.execute(args as Record<string, unknown>, ctx)
        } finally {
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
        }
      },
    })
  }
  return out
}
