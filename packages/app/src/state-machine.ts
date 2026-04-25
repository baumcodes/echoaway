import type { ChangeQuote } from '@echoaway/types'

/**
 * Assistant view-state for the demo flow. The web UI decides which screen
 * to render purely from this state object; the voice agent (Phase 5) will
 * drive transitions via VoiceActionEvents from the SSE stream (Phase 4).
 *
 * Until that's wired, the web app exposes debug actions that move through
 * the same states so the demo is reachable end-to-end.
 */
export type AssistantState =
  | { kind: 'idle' }
  | { kind: 'listening'; transcript?: string }
  | { kind: 'thinking'; intent?: string }
  | { kind: 'suggesting'; quote: ChangeQuote }
  | { kind: 'confirmed'; quote: ChangeQuote }
  | { kind: 'rejected'; reason?: string }
  | { kind: 'error'; message: string }

export type AssistantEvent =
  | { type: 'session_started' }
  | { type: 'listening'; transcript?: string }
  | { type: 'thinking'; intent?: string }
  | { type: 'change_suggested'; quote: ChangeQuote }
  | { type: 'change_confirmed'; quote: ChangeQuote }
  | { type: 'change_rejected'; reason?: string }
  | { type: 'session_ended' }
  | { type: 'error'; message: string }
  | { type: 'reset' }

export const initialAssistantState: AssistantState = { kind: 'idle' }

/**
 * Pure reducer. Unknown event types in the current state are ignored —
 * SSE may deliver events out of order during reconnection, and we'd
 * rather render the previous state than throw.
 */
export function assistantReducer(
  state: AssistantState,
  event: AssistantEvent,
): AssistantState {
  switch (event.type) {
    case 'reset':
    case 'session_ended':
      return { kind: 'idle' }
    case 'session_started':
      return state.kind === 'idle' ? { kind: 'listening' } : state
    case 'listening':
      return { kind: 'listening', transcript: event.transcript }
    case 'thinking':
      return { kind: 'thinking', intent: event.intent }
    case 'change_suggested':
      return { kind: 'suggesting', quote: event.quote }
    case 'change_confirmed':
      return { kind: 'confirmed', quote: event.quote }
    case 'change_rejected':
      return { kind: 'rejected', reason: event.reason }
    case 'error':
      return { kind: 'error', message: event.message }
    default:
      return state
  }
}
