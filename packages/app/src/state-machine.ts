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
      // Don't roll a terminal state backwards. After confirmed/rejected
      // the demo waits for an explicit reset before listening again.
      if (state.kind === 'confirmed' || state.kind === 'rejected') return state
      return { kind: 'listening', transcript: event.transcript }
    case 'thinking':
      if (state.kind === 'confirmed' || state.kind === 'rejected') return state
      return { kind: 'thinking', intent: event.intent }
    case 'change_suggested':
      // Once the change has been confirmed or rejected, a late-arriving
      // `change_suggested` (e.g. an SSE delivery for an event we already
      // applied via the action's optimistic dispatch) must not roll us
      // backwards. Same quote is a no-op when already suggesting.
      if (state.kind === 'confirmed' || state.kind === 'rejected') return state
      if (
        state.kind === 'suggesting' &&
        state.quote.componentId === event.quote.componentId &&
        state.quote.newValue === event.quote.newValue
      ) {
        return state
      }
      return { kind: 'suggesting', quote: event.quote }
    case 'change_confirmed':
      if (
        state.kind === 'confirmed' &&
        state.quote.componentId === event.quote.componentId &&
        state.quote.newValue === event.quote.newValue
      ) {
        return state
      }
      return { kind: 'confirmed', quote: event.quote }
    case 'change_rejected':
      if (state.kind === 'confirmed') return state
      return { kind: 'rejected', reason: event.reason }
    case 'error':
      return { kind: 'error', message: event.message }
    default:
      return state
  }
}
