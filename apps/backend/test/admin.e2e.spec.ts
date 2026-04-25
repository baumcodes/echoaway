import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

describe('POST /admin/reset-demo', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('rebuilds the demo trip back to a fresh 4-night stay', async () => {
    // Drive the trip into a "consumed slack" state by confirming a
    // hotel check-in change up to the day before checkout.
    const before = await request(app.getHttpServer()).get(
      '/trips/trip-demo-bcn',
    )
    const stayBefore = before.body.components.find(
      (c: { id: string }) => c.id === 'comp-stay',
    )
    const checkOutDate = stayBefore.booking.data.checkOutDate as string
    const oneNightBeforeCheckout = isoDateMinus(checkOutDate, 1)

    await request(app.getHttpServer())
      .post('/trips/trip-demo-bcn/hotel/check-in/confirm-change')
      .send({ newCheckInDate: oneNightBeforeCheckout })
      .expect(201)

    // Reset.
    const reset = await request(app.getHttpServer()).post('/admin/reset-demo')
    expect(reset.status).toBe(200)
    expect(reset.body).toEqual({ ok: true })

    // Re-fetch and confirm the trip is back to the original window.
    const after = await request(app.getHttpServer()).get('/trips/trip-demo-bcn')
    const stayAfter = after.body.components.find(
      (c: { id: string }) => c.id === 'comp-stay',
    )
    expect(stayAfter.booking.data.nights).toBeGreaterThanOrEqual(4)
    expect(stayAfter.status).toBe('booked')
  }, 30_000)
})

function isoDateMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
