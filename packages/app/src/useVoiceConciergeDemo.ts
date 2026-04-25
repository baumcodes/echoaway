import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, type ApiClient } from './client.js'
import { selectProposedNewCheckIn } from './selectors.js'
import {
  type AssistantEvent,
  assistantReducer,
  initialAssistantState,
} from './state-machine.js'
import type { Trip } from './types.js'

export type DemoFetchStatus = 'idle' | 'loading' | 'ready' | 'error'

export type DemoState = {
  trip: Trip | null
  fetchStatus: DemoFetchStatus
  fetchError: string | null
  assistant: ReturnType<typeof assistantReducer>
}

export type DemoActions = {
  refreshTrip: () => Promise<void>
  dispatchAssistant: (event: AssistantEvent) => void
  /** Hits the backend quote endpoint and dispatches `change_suggested`. */
  triggerQuote: (newCheckInDate: string) => Promise<void>
  /** Hits the backend confirm endpoint, dispatches `change_confirmed`,
   *  then refreshes the trip so cards reflect the mutation. */
  triggerConfirm: (newCheckInDate: string) => Promise<void>
  /** Demo "wow moment" — simulates listening, then quotes the +1 day
   *  hotel check-in change. Phase 4 will replace this with a real
   *  voice-agent driven flow over SSE. */
  startDemoFlow: () => Promise<void>
  rejectSuggestion: () => void
  confirmSuggestion: () => Promise<void>
  reset: () => void
}

export type UseVoiceConciergeDemoOptions = {
  apiClient: ApiClient
  /** Demo lookup key. Defaults to the seeded lead traveler's phone. */
  travelerPhone?: string
}

const DEMO_PHONE = '+4915112345678'

/**
 * Drives the demo screen state. Loads the trip via /trips/by-phone, owns
 * the assistant state machine, and exposes imperative `triggerQuote` /
 * `triggerConfirm` actions that the "Talk to Away" debug button (and
 * eventually the SSE event stream) will call.
 */
export function useVoiceConciergeDemo(
  opts: UseVoiceConciergeDemoOptions,
): DemoState & DemoActions {
  const { apiClient, travelerPhone = DEMO_PHONE } = opts
  const [trip, setTrip] = useState<Trip | null>(null)
  const [fetchStatus, setFetchStatus] = useState<DemoFetchStatus>('idle')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [assistant, dispatchAssistant] = useReducer(
    assistantReducer,
    initialAssistantState,
  )
  // Stable ref so callbacks don't recreate on every trip refetch.
  const tripIdRef = useRef<string | null>(null)
  tripIdRef.current = trip?.id ?? null

  const refreshTrip = useCallback(async () => {
    setFetchStatus((s) => (s === 'idle' ? 'loading' : s))
    try {
      const fresh = await apiClient.getTripByPhone(travelerPhone)
      setTrip(fresh)
      setFetchStatus('ready')
      setFetchError(null)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `Backend ${err.status}: ${typeof err.body === 'object' ? JSON.stringify(err.body) : String(err.body)}`
          : err instanceof Error
            ? err.message
            : 'Unknown error'
      setFetchStatus('error')
      setFetchError(message)
    }
  }, [apiClient, travelerPhone])

  // Initial load.
  useEffect(() => {
    setFetchStatus('loading')
    void refreshTrip()
  }, [refreshTrip])

  const triggerQuote = useCallback(
    async (newCheckInDate: string) => {
      const tripId = tripIdRef.current
      if (!tripId) return
      dispatchAssistant({ type: 'thinking', intent: 'quoting hotel change' })
      try {
        const quote = await apiClient.quoteHotelCheckInChange(
          tripId,
          newCheckInDate,
        )
        dispatchAssistant({ type: 'change_suggested', quote })
        await refreshTrip()
      } catch (err) {
        dispatchAssistant({
          type: 'error',
          message: err instanceof Error ? err.message : 'Quote failed',
        })
      }
    },
    [apiClient, refreshTrip],
  )

  const triggerConfirm = useCallback(
    async (newCheckInDate: string) => {
      const tripId = tripIdRef.current
      if (!tripId) return
      dispatchAssistant({ type: 'thinking', intent: 'confirming change' })
      try {
        const result = await apiClient.confirmHotelCheckInChange(
          tripId,
          newCheckInDate,
        )
        dispatchAssistant({ type: 'change_confirmed', quote: result.quote })
        await refreshTrip()
      } catch (err) {
        dispatchAssistant({
          type: 'error',
          message: err instanceof Error ? err.message : 'Confirm failed',
        })
      }
    },
    [apiClient, refreshTrip],
  )

  const reset = useCallback(() => {
    dispatchAssistant({ type: 'reset' })
  }, [])

  const tripRef = useRef<Trip | null>(trip)
  tripRef.current = trip
  const assistantRef = useRef(assistant)
  assistantRef.current = assistant

  const startDemoFlow = useCallback(async () => {
    const current = assistantRef.current
    if (current.kind !== 'idle' && current.kind !== 'rejected') return
    const newCheckIn = selectProposedNewCheckIn(tripRef.current)
    if (!newCheckIn) {
      dispatchAssistant({
        type: 'error',
        message: 'No hotel booking — cannot quote a change.',
      })
      return
    }
    dispatchAssistant({
      type: 'listening',
      transcript:
        'My flight to Barcelona is delayed. Can I move my hotel check-in to tomorrow?',
    })
    // Tiny pause for the UI to read the transcript before the
    // quote response replaces it. Phase 4's SSE-driven flow makes
    // this implicit (events arrive over time naturally).
    await new Promise((r) => setTimeout(r, 600))
    await triggerQuote(newCheckIn)
  }, [triggerQuote])

  const confirmSuggestion = useCallback(async () => {
    const current = assistantRef.current
    if (current.kind !== 'suggesting') return
    await triggerConfirm(current.quote.newValue)
  }, [triggerConfirm])

  const rejectSuggestion = useCallback(() => {
    dispatchAssistant({ type: 'change_rejected', reason: 'user' })
  }, [])

  return {
    trip,
    fetchStatus,
    fetchError,
    assistant,
    refreshTrip,
    dispatchAssistant,
    triggerQuote,
    triggerConfirm,
    startDemoFlow,
    confirmSuggestion,
    rejectSuggestion,
    reset,
  }
}

export type DemoController = DemoState & DemoActions
