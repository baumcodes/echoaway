import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bootApp, resetDemoTrip } from './helpers'

describe('Trips — hotel check-in mutation flow', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    // Each test starts from a fresh demo trip — quote/confirm mutates state.
    resetDemoTrip()
  })

  async function getStayBefore() {
    const res = await request(app.getHttpServer()).get('/trips/trip-demo-bcn')
    const stay = res.body.components.find(
      (c: { id: string }) => c.id === 'comp-stay',
    )
    return stay
  }

  describe('POST /trips/:tripId/hotel/check-in/quote-change', () => {
    it('returns ChangeQuote with feeCents=0 inside the demo override window', async () => {
      const before = await getStayBefore()
      const oldDate = before.booking.data.checkInDate

      const res = await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
        .send({ newCheckInDate: '2026-05-03' })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        componentId: 'comp-stay',
        changeType: 'check_in_date',
        oldValue: oldDate,
        newValue: '2026-05-03',
        feeCents: 0,
        currency: 'EUR',
      })
      expect(res.body.policySummary).toContain('Free until')
      expect(typeof res.body.validUntil).toBe('string')
    })

    it('marks the booking pending_change for the live UI', async () => {
      await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
        .send({ newCheckInDate: '2026-05-03' })
      const stay = await getStayBefore()
      expect(stay.booking.status).toBe('pending_change')
    })

    it('400s on a malformed date', async () => {
      const res = await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
        .send({ newCheckInDate: 'tomorrow' })
      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Validation failed')
    })

    it('400s when newCheckInDate is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
        .send({})
      expect(res.status).toBe(400)
    })
  })

  describe('POST /trips/:tripId/hotel/check-in/confirm-change', () => {
    it('mutates booking.data + check_in event and flips component.status', async () => {
      const before = await getStayBefore()
      const originalNights = before.booking.data.nights

      const res = await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/confirm-change')
        .send({ newCheckInDate: '2026-05-03' })
      expect(res.status).toBe(201)
      expect(res.body.quote.newValue).toBe('2026-05-03')
      expect(res.body.booking.data.checkInDate).toBe('2026-05-03')
      expect(res.body.booking.data.nights).toBe(originalNights - 1)
      // priceCents recomputed against the new night count
      expect(res.body.booking.priceCents).toBe(
        before.booking.data.productSnapshot.pricePerNightCents *
          (originalNights - 1),
      )

      // Verify the GET reflects the same state
      const after = await getStayBefore()
      expect(after.status).toBe('changed')
      expect(after.booking.status).toBe('confirmed')
      const checkIn = after.events.find(
        (e: { type: string }) => e.type === 'check_in',
      )
      expect(checkIn.startsAt.startsWith('2026-05-03')).toBe(true)
    })

    it('rejects a check-in date on/after the existing checkOutDate', async () => {
      const stay = await getStayBefore()
      const checkOut = stay.booking.data.checkOutDate
      const res = await request(app.getHttpServer())
        .post('/trips/trip-demo-bcn/hotel/check-in/confirm-change')
        .send({ newCheckInDate: checkOut })
      expect(res.status).toBe(400)
    })
  })
})
