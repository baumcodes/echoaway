import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { confirmHotelCheckInChange } from './confirmHotelCheckInChange.js'

describe('confirmHotelCheckInChange', () => {
  it('threads sessionId for SSE delivery', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    ;(ctx.apiClient.confirmHotelCheckInChange as ReturnType<typeof vi.fn>).mockResolvedValue({
      booking: {},
    })
    await confirmHotelCheckInChange.execute(
      { newCheckInDate: '2026-05-03' },
      ctx,
    )
    expect(ctx.apiClient.confirmHotelCheckInChange).toHaveBeenCalledWith(
      'trip-demo-bcn',
      '2026-05-03',
      'sess-1',
    )
  })

  it('throws when newCheckInDate is missing', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    await expect(confirmHotelCheckInChange.execute({}, ctx)).rejects.toThrow(
      /newCheckInDate/,
    )
  })
})
