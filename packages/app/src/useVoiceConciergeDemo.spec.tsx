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
