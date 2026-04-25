import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  ApiError,
  type ApiClient,
  type TranscriptEnvelope,
} from './client.js'
import {
  type PauseDecision,
  type ScriptTurn,
  runDemoScript,
} from './demo-script.js'
import {
  envelopeToAssistantEvent,
  subscribeToEvents,
  subscribeToTranscripts,
} from './eventStream.js'
import {
  type AssistantEvent,
  assistantReducer,
  initialAssistantState,
} from './state-machine.js'
import type { Trip } from './types.js'
import { useVoiceRoom, type VoiceRoomState } from './useVoiceRoom.js'

export type DemoFetchStatus = 'idle' | 'loading' | 'ready' | 'error'

export type DemoState = {
  trip: Trip | null
  fetchStatus: DemoFetchStatus
  fetchError: string | null
  assistant: ReturnType<typeof assistantReducer>
  sessionId: string | null
  /** LiveKit room state. `idle` → no audio session; `connected` → web
   *  is in the room and the agent worker should be too. */
  voiceRoom: VoiceRoomState
  /** Audio element ref the consumer must attach to a `<audio>` so the
   *  agent's voice actually plays. */
  voiceAudioRef: React.RefObject<HTMLAudioElement>
  /** `VoiceSession.audioMetric` from the most recent session (refetched
   *  when the room closes). Drives the audio-clarity card in the side
   *  panel. Null until the agent worker has computed + persisted it. */
  audioMetric: import('@echoaway/types').AudioIntelligenceMetric | null
  /** When true, `startNewSession` defaults to mixing airport noise into
   *  the published mic track so ai-coustics has something to clean up.
   *  Phase 6 demo mode. */
  noisyMode: boolean
  /** Live transcript fragments from the agent worker. Capped at the
   *  most recent N entries so the UI doesn't grow unbounded over a
   *  long demo. Cleared when the user starts a new session. */
  transcripts: TranscriptEnvelope[]
}

export type DemoActions = {
  /** Refetch the trip by id, or pass `null` to clear. The web UI
   *  shouldn't call this directly any more — the SSE handler does it
   *  on `trip_loaded`. Kept exported for tests / future tooling. */
  refreshTrip: (tripId: string | null) => Promise<void>
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
  /** Open a fresh VoiceSession + LK room and connect the web mic. The
   *  agent worker auto-dispatches into the same room and brings audio.
   *  When `noisy` is true the published mic track is mixed with the
   *  airport-noise audio file so the ai-coustics plugin's enhancement
   *  is observable end-to-end (Phase 6 demo). Defaults to the
   *  controller's `noisyMode` flag. */
  startNewSession: (opts?: { noisy?: boolean }) => Promise<void>
  /** End the current LK room session. */
  endSession: () => Promise<void>
  /** Phase 6 toggle. The flag takes effect on the *next* session —
   *  flipping it during a connected session does nothing until the
   *  user reconnects (renegotiating the local audio track on the fly
   *  is doable but adds complexity for marginal demo value). */
  setNoisyMode: (next: boolean) => void
  /** Wipe the live-transcript debug buffer. */
  clearTranscripts: () => void
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

  /**
   * Refetch the trip by id. Triggered by:
   *   - the `trip_loaded` SSE event (the agent just looked up a trip
   *     via getTripByPhone / -ByEmail / findTripById /
   *     confirmTripCandidate; the backend emitted the event so the
   *     web knows which trip to render)
   *   - mutations (quote / confirm) that change the trip and want a
   *     fresh snapshot
   *
   * Pass `null` to reset (clears the trip + status — used when the
   * voice room is closed or the demo trip is reset).
   */
  const refreshTrip = useCallback(
    async (tripId: string | null) => {
      if (!tripId) {
        setTrip(null)
        setFetchStatus('idle')
        setFetchError(null)
        return
      }
      setFetchStatus((s) => (s === 'idle' ? 'loading' : s))
      try {
        const fresh = await apiClient.getTripById(tripId)
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
    },
    [apiClient],
  )

  // No mount-time fetch. The web stays in `idle` (showing
  // TripPlaceholder) until the agent looks up a trip via voice and
  // the backend emits a `trip_loaded` SSE event — handled below in
  // the SSE subscription. The session is created by the agent worker
  // when it joins the room; nothing for us to do here.
  // (`travelerPhone` is now unused but kept on the options for
  // backward compatibility with existing call sites.)
  void travelerPhone

  // ---- Live transcript debug overlay ----
  // Both user and agent transcripts arrive via the LiveKit room as
  // `RoomEvent.TranscriptionReceived` (the Agents framework publishes
  // them by default). Each segment carries a stable `id` that's reused
  // across interim updates and the final version, so we dedupe by id —
  // streaming an entry rewrites it in place rather than appending a
  // new row. Bounded ring keeps long sessions from growing unbounded.
  const TRANSCRIPT_CAP = 200
  const [transcripts, setTranscripts] = useState<TranscriptEnvelope[]>([])
  const clearTranscripts = useCallback(() => setTranscripts([]), [])
  const handleRoomTranscription = useCallback(
    (event: {
      id: string
      role: 'user' | 'assistant'
      text: string
      isFinal: boolean
    }) => {
      setTranscripts((prev) => {
        const envelope: TranscriptEnvelope = {
          id: event.id,
          sessionId: sessionIdRef.current ?? '',
          tripId: tripIdRef.current,
          role: event.role,
          text: event.text,
          isFinal: event.isFinal,
          createdAt: new Date().toISOString(),
        }
        const idx = prev.findIndex((t) => t.id === event.id)
        const next =
          idx >= 0
            ? [...prev.slice(0, idx), envelope, ...prev.slice(idx + 1)]
            : [...prev, envelope]
        return next.length > TRANSCRIPT_CAP
          ? next.slice(next.length - TRANSCRIPT_CAP)
          : next
      })
    },
    [],
  )
  // Backend SSE remains a fallback path (for non-room debug consumers).
  // It coexists harmlessly with room transcription because the worker
  // no longer POSTs to /transcripts — but the SSE endpoint stays live
  // for ad-hoc tooling / future external producers.
  useEffect(() => {
    const teardown = subscribeToTranscripts(apiClient, {
      onTranscript: (env) => {
        setTranscripts((prev) => {
          const idx = prev.findIndex((t) => t.id === env.id)
          const next =
            idx >= 0
              ? [...prev.slice(0, idx), env, ...prev.slice(idx + 1)]
              : [...prev, env]
          return next.length > TRANSCRIPT_CAP
            ? next.slice(next.length - TRANSCRIPT_CAP)
            : next
        })
      },
    })
    return teardown
  }, [apiClient])

  // Subscribe to the SSE stream once. Stays open for the life of the
  // hook; events for other trips are filtered out client-side.
  //
  // The `trip_loaded` event is special — it's how the agent tells the
  // web "I just looked up a trip, here's the id, go fetch it". Until
  // we get one, we have no trip and the UI shows the empty
  // placeholder. Subsequent assistant events (`change_suggested`,
  // `change_confirmed`, …) all carry tripId, and we filter them
  // against the loaded trip so a stray cross-trip event doesn't
  // confuse the UI.
  useEffect(() => {
    const teardown = subscribeToEvents(apiClient, {
      onEvent: (envelope) => {
        if (envelope.type === 'trip_loaded' && envelope.tripId) {
          const incoming = envelope.tripId
          // If we already had a different trip loaded (the agent
          // switched), drop the assistant state and re-fetch.
          if (tripIdRef.current && tripIdRef.current !== incoming) {
            dispatchAssistant({ type: 'reset' })
          }
          void refreshTrip(incoming)
          return
        }
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
  }, [apiClient, refreshTrip])

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
        await refreshTrip(tripIdRef.current)
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
        await refreshTrip(tripIdRef.current)
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

  // Resolver for the script's pauseBeforeConfirm hook. Set while a script
  // run is waiting on the human; cleared by confirmSuggestion /
  // rejectSuggestion (or the script's own teardown) so it can't fire twice.
  const pauseResolverRef = useRef<((d: PauseDecision) => void) | null>(null)

  const startDemoFlow = useCallback(async () => {
    const current = assistantRef.current
    if (current.kind !== 'idle' && current.kind !== 'rejected') return
    const tripId = tripIdRef.current
    if (!tripId) {
      dispatchAssistant({
        type: 'error',
        message:
          'No trip loaded yet — talk to the agent to load one first.',
      })
      return
    }
    // sessionId is optional now (web no longer pre-creates one — the
    // agent worker owns session lifecycle). The script + apiClient
    // methods all treat sessionId as optional, so falling through with
    // an empty string is safe; just drops the SSE event tagging.
    const sessionId = sessionIdRef.current ?? ''
    // Closed-over flag so the onTurn callback can ignore the script's
    // post-decision user line ("Actually, keep it as is" / "Yes, please
    // confirm"). Without this, that line would dispatch a fresh
    // `listening` event after the user has already chosen — rolling the
    // UI back to listening when it should sit on rejected/confirmed.
    let userDecided: PauseDecision | null = null
    try {
      await runDemoScript(
        { apiClient, sessionId, tripId },
        {
          onTurn: (turn: ScriptTurn) => {
            if (turn.speaker !== 'user') return
            if (userDecided) return
            dispatchAssistant({ type: 'listening', transcript: turn.text })
          },
          // Drive the state machine synchronously alongside the SSE
          // delivery — the reducer dedupes identical quotes/confirms so
          // the duplicate event is a no-op.
          onQuote: (quote) => {
            dispatchAssistant({ type: 'change_suggested', quote })
          },
          onConfirm: (quote) => {
            dispatchAssistant({ type: 'change_confirmed', quote })
          },
          pauseBeforeConfirm: async () => {
            const decision = await new Promise<PauseDecision>((resolve) => {
              pauseResolverRef.current = resolve
            })
            userDecided = decision
            return decision
          },
        },
      )
      await refreshTrip(tripIdRef.current)
    } catch (err) {
      dispatchAssistant({
        type: 'error',
        message: err instanceof Error ? err.message : 'Demo flow failed',
      })
    } finally {
      pauseResolverRef.current = null
    }
  }, [apiClient, refreshTrip])

  const confirmSuggestion = useCallback(async () => {
    const current = assistantRef.current
    if (current.kind !== 'suggesting') return
    const resolve = pauseResolverRef.current
    if (resolve) {
      pauseResolverRef.current = null
      resolve('confirm')
      return
    }
    // Fallback for direct callers (tests, future integrations) that
    // dispatched a `change_suggested` event without going through the
    // script — call confirm directly so the UI still progresses.
    await triggerConfirm(current.quote.newValue)
  }, [triggerConfirm])

  const rejectSuggestion = useCallback(() => {
    dispatchAssistant({ type: 'change_rejected', reason: 'user' })
    const resolve = pauseResolverRef.current
    if (resolve) {
      pauseResolverRef.current = null
      resolve('reject')
    }
  }, [])

  const resetDemoTrip = useCallback(async () => {
    try {
      await apiClient.resetDemoTrip()
      dispatchAssistant({ type: 'reset' })
      // Clear the trip — the user has to talk to the agent again to
      // load a fresh one, same as on first mount.
      await refreshTrip(null)
    } catch (err) {
      dispatchAssistant({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Could not reset demo trip',
      })
    }
  }, [apiClient, refreshTrip])

  // ---- LiveKit voice room (Phase 5 audio path) ----
  const voiceRoom = useVoiceRoom({
    apiClient,
    identity: 'web-traveler',
    name: 'Web Traveler',
    onTranscription: handleRoomTranscription,
  })

  const [noisyMode, setNoisyMode] = useState(false)
  const noisyModeRef = useRef(noisyMode)
  noisyModeRef.current = noisyMode

  const startNewSession = useCallback(
    async (callOpts?: { noisy?: boolean }) => {
      const noisy = callOpts?.noisy ?? noisyModeRef.current
      try {
        // Two paths:
        //
        // 1. Trip already loaded (re-opening the call after a hangup).
        //    Pre-create the VoiceSession on the backend and pass its
        //    id + the trip id as token metadata. The worker reads
        //    metadata and skips its fallback path. Audio metric and
        //    SSE filtering work normally.
        //
        // 2. No trip yet (fresh page load — the typical demo open).
        //    Mint a token with no metadata and a fresh per-session
        //    room name. The worker falls back to creating its own
        //    session against the seeded demo trip; the agent then
        //    looks up the trip via voice (any of the four lookup
        //    tools) and the backend emits `trip_loaded` over SSE
        //    so the web can fetch + render. We don't track the
        //    server-side sessionId in this path — audio metric on
        //    disconnect is best-effort.
        const tripId = tripIdRef.current
        let roomName: string
        let sessionId: string | undefined
        if (tripId) {
          const session = await apiClient.createVoiceSession({ tripId })
          setSessionId(session.id)
          roomName = session.roomName
          sessionId = session.id
        } else {
          roomName = `echoaway-${Math.random().toString(36).slice(2, 10)}`
        }
        dispatchAssistant({ type: 'reset' })
        setTranscripts([])
        await voiceRoom.connect({
          tripId: tripId ?? undefined,
          sessionId,
          roomName,
          noisy,
        })
      } catch (err) {
        dispatchAssistant({
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not start session',
        })
      }
    },
    [apiClient, voiceRoom],
  )

  const endSession = useCallback(async () => {
    await voiceRoom.disconnect()
  }, [voiceRoom])

  // Refetch the VoiceSession after the room closes so we can render
  // its `audioMetric` (computed + persisted by the agent worker on
  // shutdown). Polls a few times because the worker's PUT lands a
  // moment after the disconnect — racing the UI repaint.
  const [audioMetric, setAudioMetric] =
    useState<import('@echoaway/types').AudioIntelligenceMetric | null>(null)
  const prevRoomKindRef = useRef<string>('idle')
  useEffect(() => {
    const prev = prevRoomKindRef.current
    const next = voiceRoom.state.kind
    prevRoomKindRef.current = next
    const sid = sessionIdRef.current
    if (prev !== 'connected' || next === 'connected' || !sid) return
    let cancelled = false
    void (async () => {
      // Up to 6 retries × 500ms — the worker writes the metric after
      // its shutdown callback fires, which can lag the user disconnect
      // by a couple of seconds.
      for (let attempt = 0; attempt < 6; attempt++) {
        if (cancelled) return
        try {
          const session = await apiClient.getVoiceSession(sid)
          if (cancelled) return
          if (session.audioMetric) {
            setAudioMetric(
              session.audioMetric as import('@echoaway/types').AudioIntelligenceMetric,
            )
            return
          }
        } catch {
          // session was deleted (Reset trip) — bail.
          return
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiClient, voiceRoom.state.kind])

  return {
    trip,
    fetchStatus,
    fetchError,
    assistant,
    sessionId,
    voiceRoom: voiceRoom.state,
    voiceAudioRef: voiceRoom.audioRef,
    audioMetric,
    noisyMode,
    setNoisyMode,
    transcripts,
    clearTranscripts,
    refreshTrip,
    dispatchAssistant,
    triggerQuote,
    triggerConfirm,
    startDemoFlow,
    confirmSuggestion,
    rejectSuggestion,
    reset,
    resetDemoTrip,
    startNewSession,
    endSession,
  }
}

export type DemoController = DemoState & DemoActions
