import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { listAccommodations } from './listAccommodations.js'

describe('listAccommodations', () => {
  it('forwards destinationId to the API and trims to 20 rows', async () => {
    const ctx = makeToolCtx()
    ;(ctx.apiClient.listAccommodations as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'hotel-bcn-02',
        name: 'Casa del Mar Boutique',
        destinationId: 'dest-barcelona',
        stars: 4,
        pricePerNightCents: 16000,
        currency: 'EUR',
        coordinates: null,
        amenities: ['wifi'],
        images: [],
        description: '',
      },
    ])
    const out = (await listAccommodations.execute(
      { destinationId: 'dest-barcelona' },
      ctx,
    )) as Array<{ id: string }>
    expect(ctx.apiClient.listAccommodations).toHaveBeenCalledWith(
      'dest-barcelona',
    )
    expect(out[0]?.id).toBe('hotel-bcn-02')
  })

  it('throws when destinationId is missing', async () => {
    const ctx = makeToolCtx()
    await expect(listAccommodations.execute({}, ctx)).rejects.toThrow(
      /destinationId/,
    )
  })
})
