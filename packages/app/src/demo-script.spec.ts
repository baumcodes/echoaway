import { describe, expect, it, vi } from 'vitest'
import { runDemoScript, type ScriptTurn } from './demo-script.js'
import type { ToolContext } from './tools/index.js'

const trip = {
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  status: 'booked',
  startDate: '2026-05-02T00:00:00.000Z',
  endDate: '2026-05-06T00:00:00.000Z',
  currency: 'EUR',
  segments: [],
  travelers: [],
  components: [
    {
      id: 'comp-stay',
      type: 'accommodation' as const,
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
          kind: 'accommodation' as const,
          productSnapshot: {
            productId: 'hotel-bcn-01',
            name: 'Hotel Brisa Barcelona',
            stars: 4,
            pricePerNightCents: 14500,
            currency: 'EUR' as const,
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
        bookedAt: '',
        cancelledAt: null,
      },
      events: [],
    },
  ],
  disruptions: [
    {
      id: 'disrupt-flight-delay-bcn',
      type: 'flight_delay',
      severity: 'major',
      message: 'delayed 3h',
      status: 'open',
      affectedComponentId: 'comp-flight-out',
      suggestedActions: null,
      detectedAt: '',
      resolvedAt: null,
    },
  ],
}

function makeCtx(): ToolContext {
  return {
    apiClient: {
      getTripByPhone: vi.fn().mockResolvedValue(trip),
      getTripById: vi.fn().mockResolvedValue(trip),
      getDisruptions: vi.fn().mockResolvedValue(trip.disruptions),
      quoteHotelCheckInChange: vi.fn().mockResolvedValue({
        componentId: 'comp-stay',
        changeType: 'check_in_date',
        oldValue: '2026-05-02',
        newValue: '2026-05-03',
        feeCents: 0,
        currency: 'EUR',
        policySummary: 'Free until end of today',
        validUntil: '',
      }),
      confirmHotelCheckInChange: vi.fn().mockResolvedValue({
        quote: {},
        booking: {},
        checkInEventStartsAt: '',
      }),
      createSupportLog: vi.fn().mockResolvedValue({ id: 's-1', createdAt: '' }),
      health: vi.fn(),
      mintVoiceToken: vi.fn(),
      createVoiceSession: vi.fn(),
      pollEvents: vi.fn(),
      eventStreamUrl: vi.fn(),
      resetDemoTrip: vi.fn(),
    } as unknown as ToolContext['apiClient'],
    sessionId: 'sess-1',
    tripId: null,
  }
}

describe('runDemoScript', () => {
  it('walks the canonical demo flow end-to-end and auto-confirms when no pause hook is given', async () => {
    const ctx = makeCtx()
    const { turns, transcript, outcome } = await runDemoScript(ctx)

    expect(outcome).toBe('confirmed')

    // Speakers alternate user → assistant in the expected order.
    const speakers = turns.map((t) => t.speaker)
    expect(speakers).toEqual([
      'user',
      'assistant',
      'assistant',
      'assistant',
      'user',
      'assistant',
      'assistant',
    ])

    // Tool calls fired in order.
    const toolNames = turns
      .filter((t) => t.toolCall)
      .map((t) => t.toolCall!.name)
    expect(toolNames).toEqual([
      'getTripByPhone',
      'getTripDisruptions',
      'quoteHotelCheckInChange',
      'confirmHotelCheckInChange',
      'createSupportLog',
    ])

    // Backend was driven through the real apiClient mock.
    expect(ctx.apiClient.confirmHotelCheckInChange).toHaveBeenCalledWith(
      'trip-demo-bcn',
      '2026-05-03',
      'sess-1',
    )
    expect(ctx.apiClient.createSupportLog).toHaveBeenCalledTimes(1)

    // Transcript renders in the canonical "ROLE: text" form.
    expect(transcript).toMatch(/^USER: Hey, my flight to Barcelona/)
    expect(transcript).toContain('ASSISTANT:')
  })

  it('streams turns through onTurn as they happen', async () => {
    const ctx = makeCtx()
    const seen: ScriptTurn[] = []
    const { turns } = await runDemoScript(ctx, {
      onTurn: (turn) => seen.push(turn),
    })
    expect(seen).toEqual(turns)
  })

  it('stops short of confirm when pauseBeforeConfirm rejects', async () => {
    const ctx = makeCtx()
    const { outcome, turns } = await runDemoScript(ctx, {
      pauseBeforeConfirm: () => Promise.resolve('reject'),
    })
    expect(outcome).toBe('rejected')
    expect(ctx.apiClient.confirmHotelCheckInChange).not.toHaveBeenCalled()
    // Support log still written so the operator has the conversation on file.
    expect(ctx.apiClient.createSupportLog).toHaveBeenCalledTimes(1)
    const toolNames = turns
      .filter((t) => t.toolCall)
      .map((t) => t.toolCall!.name)
    expect(toolNames).toEqual([
      'getTripByPhone',
      'getTripDisruptions',
      'quoteHotelCheckInChange',
      'createSupportLog',
    ])
  })

  it('proceeds with the change when pauseBeforeConfirm resolves "confirm"', async () => {
    const ctx = makeCtx()
    const { outcome } = await runDemoScript(ctx, {
      pauseBeforeConfirm: () => Promise.resolve('confirm'),
    })
    expect(outcome).toBe('confirmed')
    expect(ctx.apiClient.confirmHotelCheckInChange).toHaveBeenCalledTimes(1)
  })

  it('throws if the loaded trip has no accommodation booking data', async () => {
    const ctx = makeCtx()
    ;(ctx.apiClient.getTripById as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ...trip, components: [] },
    )
    await expect(runDemoScript(ctx)).rejects.toThrow(/check-in date/)
  })
})
