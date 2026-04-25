import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVoiceConciergeDemo } from './useVoiceConciergeDemo.js'
import type { Trip } from './types.js'

const sampleTrip: Trip = {
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  status: 'booked',
  startDate: '2026-05-02T00:00:00.000Z',
  endDate: '2026-05-06T00:00:00.000Z',
  currency: 'EUR',
  segments: [],
  travelers: [],
  components: [],
  disruptions: [],
}

// Trip with a hotel booking — required for startDemoFlow because the
// script reads the current check-in to compute the proposed +1 day.
const tripWithStay: Trip = {
  ...sampleTrip,
  components: [
    {
      id: 'comp-stay',
      type: 'accommodation',
      title: 'Hotel',
      status: 'booked',
      segmentId: null,
      catalogRef: {
        accommodationProductId: 'hotel-bcn-01',
        activityProductId: null,
        flightRouteProductId: null,
        groundTransferProductId: null,
      },
      booking: {
        id: 'book-stay',
        supplierId: 'sup-hotelbeds',
        supplierBookingReference: 'DEMO-HB-001',
        status: 'confirmed',
        priceCents: 58000,
        currency: 'EUR',
        policy: null,
        data: {
          kind: 'accommodation',
          productSnapshot: {
            productId: 'hotel-bcn-01',
            name: 'Hotel Brisa Barcelona',
            stars: 4,
            pricePerNightCents: 14500,
            currency: 'EUR',
            coordinates: { lat: 0, lng: 0 },
            amenities: [],
            images: [],
          },
          checkInDate: '2026-05-02',
          checkOutDate: '2026-05-06',
          nights: 4,
          totalPriceCents: 58000,
          guests: [],
        },
        bookedAt: '2026-04-25T00:00:00.000Z',
        cancelledAt: null,
      },
      events: [],
    },
  ],
}

const sampleQuote = {
  componentId: 'comp-stay',
  changeType: 'check_in_date' as const,
  oldValue: '2026-05-02',
  newValue: '2026-05-03',
  feeCents: 0,
  currency: 'EUR' as const,
  policySummary: 'Free until end of today',
  validUntil: '2026-04-25T23:59:00.000Z',
}

function makeFakeClient() {
  return {
    health: vi.fn(),
    getTripById: vi.fn().mockResolvedValue(sampleTrip),
    getTripByPhone: vi.fn().mockResolvedValue(sampleTrip),
    getTripByEmail: vi.fn().mockResolvedValue(sampleTrip),
    getTripByIdLoose: vi.fn().mockResolvedValue(sampleTrip),
    searchTrips: vi.fn().mockResolvedValue([]),
    confirmTripCandidate: vi.fn().mockResolvedValue({
      tripId: 'trip-demo-bcn',
      trip: sampleTrip,
    }),
    getDisruptions: vi.fn().mockResolvedValue([]),
    quoteHotelCheckInChange: vi.fn().mockResolvedValue(sampleQuote),
    confirmHotelCheckInChange: vi.fn().mockResolvedValue({
      quote: sampleQuote,
      booking: {
        id: 'book-stay',
        status: 'confirmed',
        priceCents: 43500,
        currency: 'EUR',
        data: {},
      },
      checkInEventStartsAt: '2026-05-03T20:00:00.000Z',
    }),
    createSupportLog: vi.fn(),
    mintVoiceToken: vi.fn(),
    createVoiceSession: vi.fn().mockResolvedValue({
      id: 'sess-1',
      tripId: 'trip-demo-bcn',
      travelerId: null,
      status: 'active',
      startedAt: '2026-04-25T00:00:00.000Z',
    }),
    pollEvents: vi.fn().mockResolvedValue([]),
    eventStreamUrl: vi.fn().mockReturnValue('http://test.local/events/stream'),
    transcriptStreamUrl: vi
      .fn()
      .mockReturnValue('http://test.local/transcripts/stream'),
    postTranscript: vi.fn().mockResolvedValue({ ok: true }),
    resetDemoTrip: vi.fn().mockResolvedValue({ ok: true }),
    listDestinations: vi.fn().mockResolvedValue([]),
    listAccommodations: vi.fn().mockResolvedValue([]),
    listActivities: vi.fn().mockResolvedValue([]),
    listFlightRoutes: vi.fn().mockResolvedValue([]),
    listTransfers: vi.fn().mockResolvedValue([]),
    getVoiceSession: vi.fn().mockResolvedValue({
      id: 'sess-1',
      tripId: 'trip-demo-bcn',
      travelerId: null,
      status: 'ended',
      startedAt: '2026-04-25T00:00:00.000Z',
      roomName: 'echoaway-sess-1',
      audioMetric: null,
    }),
    setVoiceSessionAudioMetric: vi.fn().mockResolvedValue({
      ok: true,
      audioMetric: null,
    }),
  }
}

/** Drive the new lazy-load flow in tests: simulate the agent's
 *  trip-lookup having succeeded by calling `refreshTrip(tripId)`
 *  directly. In production this is triggered by the `trip_loaded`
 *  SSE event the backend emits when a lookup tool runs. */
async function loadTripForTest(
  result: ReturnType<typeof renderHook<ReturnType<typeof useVoiceConciergeDemo>, unknown>>['result'],
  tripId: string,
) {
  await act(async () => {
    await result.current.refreshTrip(tripId)
  })
}

describe('useVoiceConciergeDemo', () => {
  it('starts in idle state with no trip loaded — waits for trip_loaded SSE', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    // Mount-time: no eager fetch. The hook stays idle until the
    // backend pushes a `trip_loaded` event (driven by the agent
    // calling a lookup tool).
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.trip).toBeNull()
    expect(apiClient.getTripByPhone).not.toHaveBeenCalled()
    expect(apiClient.getTripById).not.toHaveBeenCalled()
  })

  it('refreshTrip(id) loads the trip and exposes ready state', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')
    expect(result.current.fetchStatus).toBe('ready')
    expect(result.current.trip?.id).toBe('trip-demo-bcn')
    expect(apiClient.getTripById).toHaveBeenCalledWith('trip-demo-bcn')
  })

  it('triggerQuote dispatches change_suggested and refetches the trip', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')

    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    expect(result.current.assistant.kind).toBe('suggesting')
    if (result.current.assistant.kind === 'suggesting') {
      expect(result.current.assistant.quote.newValue).toBe('2026-05-03')
    }
    const call = apiClient.quoteHotelCheckInChange.mock.calls[0]
    expect(call?.[0]).toBe('trip-demo-bcn')
    expect(call?.[1]).toBe('2026-05-03')
    // Initial load + post-quote refetch.
    expect(apiClient.getTripById).toHaveBeenCalledTimes(2)
  })

  it('triggerConfirm dispatches change_confirmed', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')

    await act(async () => {
      await result.current.triggerConfirm('2026-05-03')
    })
    expect(result.current.assistant.kind).toBe('confirmed')
  })

  it('triggerQuote surfaces backend errors as error state', async () => {
    const apiClient = makeFakeClient()
    apiClient.quoteHotelCheckInChange.mockRejectedValueOnce(
      new Error('Hotel booking is non-modifiable'),
    )
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')

    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    expect(result.current.assistant.kind).toBe('error')
  })

  it('reset returns the assistant to idle', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')
    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    act(() => result.current.reset())
    expect(result.current.assistant.kind).toBe('idle')
  })

  it('startDemoFlow runs the script, pauses for confirm, and ends in confirmed', async () => {
    const apiClient = makeFakeClient()
    apiClient.getTripById.mockResolvedValue(tripWithStay)
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')

    // Kick off the script — it pauses on the confirm hook so we can
    // observe the suggesting state mid-flight.
    let runPromise!: Promise<void>
    act(() => {
      runPromise = result.current.startDemoFlow()
    })
    await waitFor(() =>
      expect(result.current.assistant.kind).toBe('suggesting'),
    )
    expect(apiClient.quoteHotelCheckInChange).toHaveBeenCalledTimes(1)
    expect(apiClient.confirmHotelCheckInChange).not.toHaveBeenCalled()

    // Resolve the pause via the user-facing confirm action.
    await act(async () => {
      await result.current.confirmSuggestion()
      await runPromise
    })
    expect(apiClient.confirmHotelCheckInChange).toHaveBeenCalledTimes(1)
    expect(apiClient.createSupportLog).toHaveBeenCalledTimes(1)
  })

  it('rejectSuggestion resolves the script pause and skips confirm', async () => {
    const apiClient = makeFakeClient()
    apiClient.getTripById.mockResolvedValue(tripWithStay)
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')

    let runPromise!: Promise<void>
    act(() => {
      runPromise = result.current.startDemoFlow()
    })
    await waitFor(() =>
      expect(result.current.assistant.kind).toBe('suggesting'),
    )

    await act(async () => {
      result.current.rejectSuggestion()
      await runPromise
    })
    expect(result.current.assistant.kind).toBe('rejected')
    expect(apiClient.confirmHotelCheckInChange).not.toHaveBeenCalled()
    // Support log still written for the operator's record.
    expect(apiClient.createSupportLog).toHaveBeenCalledTimes(1)
  })

  it('resetDemoTrip calls the backend, returns to idle, and clears the trip', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await loadTripForTest(result, 'trip-demo-bcn')
    expect(result.current.trip).not.toBeNull()
    await act(async () => {
      await result.current.resetDemoTrip()
    })
    expect(apiClient.resetDemoTrip).toHaveBeenCalledTimes(1)
    expect(result.current.assistant.kind).toBe('idle')
    // After reset, the trip is cleared — the user has to talk to the
    // agent again to load a fresh one (matches the production flow).
    expect(result.current.trip).toBeNull()
    expect(result.current.fetchStatus).toBe('idle')
  })
})
