import type { ApiClient } from '../client.js'

/**
 * Shared shapes for every tool in the registry. Lives in its own file
 * so each tool module imports just `Tool` + `ToolContext` and stays
 * self-contained — adding a new tool means dropping a single file in
 * this directory plus a one-line entry in `index.ts`.
 */

export type ToolContext = {
  apiClient: ApiClient
  sessionId: string
  /** Set after the first `getTripByPhone` call so subsequent tools can
   *  default to it instead of asking the model to pass it again. */
  tripId: string | null
}

export type ToolDeclaration = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >
    required: string[]
  }
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>

export type Tool = {
  declaration: ToolDeclaration
  execute: ToolExecutor
}
