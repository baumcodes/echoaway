import { confirmHotelCheckInChange } from './confirmHotelCheckInChange.js'
import { confirmTripCandidate } from './confirmTripCandidate.js'
import { createSupportLog } from './createSupportLog.js'
import { endSession } from './endSession.js'
import { findTripById } from './findTripById.js'
import { getTripByEmail } from './getTripByEmail.js'
import { getTripByPhone } from './getTripByPhone.js'
import { getTripDisruptions } from './getTripDisruptions.js'
import { listAccommodations } from './listAccommodations.js'
import { quoteHotelCheckInChange } from './quoteHotelCheckInChange.js'
import { searchTravelContext } from './searchTravelContext.js'
import { searchTripsByTraveler } from './searchTripsByTraveler.js'
import type { Tool, ToolDeclaration } from './types.js'

/**
 * The agent's tool surface — one canonical registry powering the
 * Gemini-driven LiveKit agent, the deterministic demo script, and the
 * web's debug button.
 *
 * **Adding a new tool:**
 *   1. Add a wrapper to `apiClient` in `../client.ts` (or reuse one).
 *   2. Drop a new file `./<toolName>.ts` exporting a `Tool` value.
 *   3. Import it here and register it in the object below.
 *   4. Mention guardrails in `apps/voice-agent/src/agent/system-prompt.ts`
 *      ONLY if the tool mutates state.
 *   5. Add a unit test next to the source: `./<toolName>.spec.ts`.
 *
 * Tool wrappers thread `sessionId` and the loaded `tripId` through the
 * underlying API calls so the backend can persist VoiceActionEvents and
 * the SSE stream can deliver them to the web UI.
 */
export const tools = {
  // Trip lookup — four ways in, picked by what the traveler offers.
  getTripByPhone,
  getTripByEmail,
  findTripById,
  searchTripsByTraveler,
  confirmTripCandidate,
  // Trip / change handling once a trip is loaded.
  getTripDisruptions,
  quoteHotelCheckInChange,
  confirmHotelCheckInChange,
  createSupportLog,
  listAccommodations,
  searchTravelContext,
  // Wrap-up — agent calls this once the traveler is done.
  endSession,
} satisfies Record<string, Tool>

export type ToolName = keyof typeof tools

/** Look up a tool by name without `string`-index undefined-ness. */
export function lookupTool(name: string): Tool | null {
  return (tools as Record<string, Tool>)[name] ?? null
}

/** Gemini-shaped function declarations array. */
export function toolDeclarations(): ToolDeclaration[] {
  return Object.values(tools).map((t) => t.declaration)
}

export type { Tool, ToolContext, ToolDeclaration, ToolExecutor } from './types.js'
