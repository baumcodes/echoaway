import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { getTripByPhone } from './getTripByPhone.js'

const sampleTrip = {
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  startDate: '2026-05-02T00:00:00.000Z',
  endDate: '2026-05-06T00:00:00.000Z',
  travelers: [
    {
      role: 'lead',
      traveler: { fullName: 'Stephan Rüschenbaum' },
    },
  ],
  components: [
    { id: 'comp-stay', type: 'accommodation', title: 'Hotel', status: 'booked' },
  ],
}

describe('getTripByPhone', () => {
  it('calls the API and pins tripId into the ctx', async () => {
    const ctx = makeToolCtx()
    ;(ctx.apiClient.getTripByPhone as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleTrip,
    )
    const result = (await getTripByPhone.execute(
      { phoneNumber: '+4915112345678' },
      ctx,
    )) as { tripId: string }
    expect(ctx.apiClient.getTripByPhone).toHaveBeenCalledWith('+4915112345678')
    expect(result.tripId).toBe('trip-demo-bcn')
    expect(ctx.tripId).toBe('trip-demo-bcn')
  })

  it('throws when phoneNumber is missing', async () => {
    const ctx = makeToolCtx()
    await expect(getTripByPhone.execute({}, ctx)).rejects.toThrow(/phoneNumber/)
  })
})
