import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { quoteHotelCheckInChange } from './quoteHotelCheckInChange.js'

describe('quoteHotelCheckInChange', () => {
  it('forwards tripId, newCheckInDate, and sessionId to the API', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    ;(ctx.apiClient.quoteHotelCheckInChange as ReturnType<typeof vi.fn>).mockResolvedValue({
      feeCents: 0,
    })
    await quoteHotelCheckInChange.execute({ newCheckInDate: '2026-05-03' }, ctx)
    expect(ctx.apiClient.quoteHotelCheckInChange).toHaveBeenCalledWith(
      'trip-demo-bcn',
      '2026-05-03',
      'sess-1',
    )
  })

  it('throws when no tripId is in ctx and no override is passed', async () => {
    const ctx = makeToolCtx({ tripId: null })
    await expect(
      quoteHotelCheckInChange.execute({ newCheckInDate: '2026-05-03' }, ctx),
    ).rejects.toThrow(/tripId/)
  })

  it('throws when newCheckInDate is missing', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    await expect(quoteHotelCheckInChange.execute({}, ctx)).rejects.toThrow(
      /newCheckInDate/,
    )
  })
})
