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

/** Minimal JSON-schema-ish shape for one tool parameter. The fields
 *  below are the union of what Gemini Live's BidiGenerate validator
 *  requires for the types we actually use:
 *
 *  - `type: 'array'` MUST carry an `items` schema, otherwise setup
 *    rejects with `parameters.properties[…].items: missing field`.
 *  - `type: 'string'` may carry an `enum` to constrain values.
 *
 *  Kept loose on purpose; the model treats `description` as the only
 *  semantic signal anyway. Adding richer JSON Schema (oneOf, $ref, …)
 *  would tighten typing but Gemini Live doesn't accept all of it.
 */
export type ToolParamSchema = {
  type: string
  /** Required on top-level properties (model uses it to choose tools);
   *  omittable on nested `items` schemas where the parent's description
   *  already carries the meaning. */
  description?: string
  enum?: string[]
  items?: ToolParamSchema
}

/** Top-level properties always need a description so the model has
 *  something to read; arrays additionally need `items`. */
export type ToolPropertySchema = ToolParamSchema & { description: string }

export type ToolDeclaration = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolPropertySchema>
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
