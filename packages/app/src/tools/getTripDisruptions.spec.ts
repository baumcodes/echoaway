import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { getTripDisruptions } from './getTripDisruptions.js'

describe('getTripDisruptions', () => {
  it('uses ctx.tripId when args.tripId is omitted', async () => {
    const ctx = makeToolCtx({ tripId: 'trip-demo-bcn' })
    ;(ctx.apiClient.getDisruptions as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await getTripDisruptions.execute({}, ctx)
    expect(ctx.apiClient.getDisruptions).toHaveBeenCalledWith('trip-demo-bcn')
  })

  it('throws when no tripId is in ctx and no override is passed', async () => {
    const ctx = makeToolCtx({ tripId: null })
    await expect(getTripDisruptions.execute({}, ctx)).rejects.toThrow(/tripId/)
  })
})
