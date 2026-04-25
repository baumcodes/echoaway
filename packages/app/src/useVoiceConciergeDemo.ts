import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, type ApiClient } from './client.js'
import {
  envelopeToAssistantEvent,
  subscribeToEvents,
} from './eventStream.js'
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
  sessionId: string | null
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
   *  hotel check-in change. Phase 5 will replace this with a real
   *  voice-agent driven flow over SSE; events arrive identically. */
  startDemoFlow: () => Promise<void>
  rejectSuggestion: () => void
  confirmSuggestion: () => Promise<void>
  reset: () => void
  /** Wipe + recompose the demo trip on the backend, then refetch.
   *  Use when consecutive confirms have consumed the bookable slack
   *  (`newCheckInDate must be at least 1 day before checkOutDate`). */
  resetDemoTrip: () => Promise<void>
}

export type UseVoiceConciergeDemoOptions = {
  apiClient: ApiClient
  /** Demo lookup key. Defaults to the seeded lead traveler's phone. */
  travelerPhone?: string
}

const DEMO_PHONE = '+4915112345678'

/**
 * Drives the demo screen state. Loads the trip via /trips/by-phone, opens
 * a VoiceSession, owns the assistant state machine, and subscribes to
 * the backend SSE stream so out-of-process emitters (the voice agent in
 * Phase 5) update the same UI without RPC.
 *
 * Direct action dispatches (`triggerQuote` etc.) coexist with the SSE
 * stream — the reducer's guards make duplicate event delivery a no-op.
 */
export function useVoiceConciergeDemo(
  opts: UseVoiceConciergeDemoOptions,
): DemoState & DemoActions {
  const { apiClient, travelerPhone = DEMO_PHONE } = opts
  const [trip, setTrip] = useState<Trip | null>(null)
  const [fetchStatus, setFetchStatus] = useState<DemoFetchStatus>('idle')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [assistant, dispatchAssistant] = useReducer(
    assistantReducer,
    initialAssistantState,
  )
  // Stable refs so callbacks don't recreate on every state change.
  const tripIdRef = useRef<string | null>(null)
  tripIdRef.current = trip?.id ?? null
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId

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

  // Open a VoiceSession once we know the trip id. The session backs
  // every persisted VoiceActionEvent and lets SSE filter to this UI.
  useEffect(() => {
    if (!trip || sessionIdRef.current) return
    let cancelled = false
    void (async () => {
      try {
        const session = await apiClient.createVoiceSession({ tripId: trip.id })
        if (!cancelled) setSessionId(session.id)
      } catch (err) {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.warn(
          '[demo] could not open voice session; live updates disabled',
          err,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [trip, apiClient])

  // Subscribe to the SSE stream once. Stays open for the life of the
  // hook; events for other trips are filtered out client-side.
  useEffect(() => {
    const teardown = subscribeToEvents(apiClient, {
      onEvent: (envelope) => {
        const ourTrip = tripIdRef.current
        if (envelope.tripId && ourTrip && envelope.tripId !== ourTrip) return
        const mapped = envelopeToAssistantEvent(envelope)
        if (mapped) dispatchAssistant(mapped)
      },
      onError: () => {
        // EventSource auto-retries; nothing to do here. A future
        // enhancement could surface the disconnect via a banner.
      },
    })
    return teardown
  }, [apiClient])

  const triggerQuote = useCallback(
    async (newCheckInDate: string) => {
      const tripId = tripIdRef.current
      if (!tripId) return
      dispatchAssistant({ type: 'thinking', intent: 'quoting hotel change' })
      try {
        const quote = await apiClient.quoteHotelCheckInChange(
          tripId,
          newCheckInDate,
          sessionIdRef.current ?? undefined,
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
          sessionIdRef.current ?? undefined,
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
    // Tiny pause so the UI can read the transcript before the quote
    // response replaces it.
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

  const resetDemoTrip = useCallback(async () => {
    try {
      await apiClient.resetDemoTrip()
      dispatchAssistant({ type: 'reset' })
      await refreshTrip()
    } catch (err) {
      dispatchAssistant({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Could not reset demo trip',
      })
    }
  }, [apiClient, refreshTrip])

  return {
    trip,
    fetchStatus,
    fetchError,
    assistant,
    sessionId,
    refreshTrip,
    dispatchAssistant,
    triggerQuote,
    triggerConfirm,
    startDemoFlow,
    confirmSuggestion,
    rejectSuggestion,
    reset,
    resetDemoTrip,
  }
}

export type DemoController = DemoState & DemoActions
