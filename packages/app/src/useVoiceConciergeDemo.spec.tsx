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

describe('useVoiceConciergeDemo', () => {
  it('loads the trip on mount and exposes ready state', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))
    expect(result.current.trip?.id).toBe('trip-demo-bcn')
    expect(apiClient.getTripByPhone).toHaveBeenCalledWith('+4915112345678')
  })

  it('triggerQuote dispatches change_suggested and refetches the trip', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))

    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    expect(result.current.assistant.kind).toBe('suggesting')
    if (result.current.assistant.kind === 'suggesting') {
      expect(result.current.assistant.quote.newValue).toBe('2026-05-03')
    }
    // The third arg is the sessionId — it may or may not have been
    // populated by the time triggerQuote ran (the create-session effect
    // races with this test). Assert positional args 0 and 1 only.
    const call = apiClient.quoteHotelCheckInChange.mock.calls[0]
    expect(call?.[0]).toBe('trip-demo-bcn')
    expect(call?.[1]).toBe('2026-05-03')
    // refetch happens after quote
    expect(apiClient.getTripByPhone).toHaveBeenCalledTimes(2)
  })

  it('triggerConfirm dispatches change_confirmed', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))

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
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))

    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    expect(result.current.assistant.kind).toBe('error')
  })

  it('reset returns the assistant to idle', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))
    await act(async () => {
      await result.current.triggerQuote('2026-05-03')
    })
    act(() => result.current.reset())
    expect(result.current.assistant.kind).toBe('idle')
  })

  it('startDemoFlow runs the script, pauses for confirm, and ends in confirmed', async () => {
    const apiClient = makeFakeClient()
    apiClient.getTripById.mockResolvedValue(tripWithStay)
    apiClient.getTripByPhone.mockResolvedValue(tripWithStay)
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    // Kick off the script — it pauses on the confirm hook so we can
    // observe the suggesting state mid-flight.
    let runPromise!: Promise<void>
    act(() => {
      runPromise = result.current.startDemoFlow()
    })
    await waitFor(() => expect(result.current.assistant.kind).toBe('suggesting'))
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
    apiClient.getTripByPhone.mockResolvedValue(tripWithStay)
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    let runPromise!: Promise<void>
    act(() => {
      runPromise = result.current.startDemoFlow()
    })
    await waitFor(() => expect(result.current.assistant.kind).toBe('suggesting'))

    await act(async () => {
      result.current.rejectSuggestion()
      await runPromise
    })
    expect(result.current.assistant.kind).toBe('rejected')
    expect(apiClient.confirmHotelCheckInChange).not.toHaveBeenCalled()
    // Support log still written for the operator's record.
    expect(apiClient.createSupportLog).toHaveBeenCalledTimes(1)
  })

  it('resetDemoTrip calls the backend, returns to idle, and refetches', async () => {
    const apiClient = makeFakeClient()
    const { result } = renderHook(() => useVoiceConciergeDemo({ apiClient }))
    await waitFor(() => expect(result.current.fetchStatus).toBe('ready'))
    const initialFetchCount = apiClient.getTripByPhone.mock.calls.length
    await act(async () => {
      await result.current.resetDemoTrip()
    })
    expect(apiClient.resetDemoTrip).toHaveBeenCalledTimes(1)
    expect(result.current.assistant.kind).toBe('idle')
    expect(apiClient.getTripByPhone.mock.calls.length).toBeGreaterThan(
      initialFetchCount,
    )
  })
})
