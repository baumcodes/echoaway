import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { createSupportLog } from './createSupportLog.js'

describe('createSupportLog', () => {
  it('passes session + trip + actions through to the API', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    ;(ctx.apiClient.createSupportLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
    })
    await createSupportLog.execute(
      {
        transcript: 'hi',
        summary: 'moved check-in',
        actions: ['confirmHotelCheckInChange'],
      },
      ctx,
    )
    expect(ctx.apiClient.createSupportLog).toHaveBeenCalledWith({
      tripId: 'trip-demo-bcn',
      sessionId: 'sess-1',
      transcript: 'hi',
      summary: 'moved check-in',
      actions: ['confirmHotelCheckInChange'],
    })
  })

  it('drops non-string entries from actions', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    ;(ctx.apiClient.createSupportLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
    })
    await createSupportLog.execute(
      {
        transcript: 'hi',
        summary: 'moved check-in',
        actions: ['ok', 42, null, 'also-ok'],
      },
      ctx,
    )
    expect(
      (ctx.apiClient.createSupportLog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
        .actions,
    ).toEqual(['ok', 'also-ok'])
  })
})
