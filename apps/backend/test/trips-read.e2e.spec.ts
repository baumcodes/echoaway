import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

describe('Trips — read endpoints', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  describe('GET /trips/:tripId', () => {
    it('inflates the demo trip with parsed JSON columns', async () => {
      const res = await request(app.getHttpServer()).get('/trips/trip-demo-bcn')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('trip-demo-bcn')
      expect(res.body.title).toBe('Barcelona Long Weekend')
      expect(res.body.components).toHaveLength(5)
      expect(res.body.disruptions).toHaveLength(1)

      const stay = res.body.components.find((c: { id: string }) => c.id === 'comp-stay')
      expect(stay.type).toBe('accommodation')
      // policy is a parsed object, not a string
      expect(typeof stay.booking.policy).toBe('object')
      expect(stay.booking.policy.modification.canModify).toBe(true)
      // data.kind matches component.type (the polymorphic invariant)
      expect(stay.booking.data.kind).toBe('accommodation')

      const totalEvents = res.body.components.reduce(
        (n: number, c: { events: unknown[] }) => n + c.events.length,
        0,
      )
      expect(totalEvents).toBe(10)
    })

    it('404s when the trip is unknown', async () => {
      const res = await request(app.getHttpServer()).get('/trips/no-such-trip')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /trips/by-phone/:phone', () => {
    it('resolves the lead traveler to the demo trip', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-phone/+4915112345678',
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('trip-demo-bcn')
    })

    it('404s when no traveler matches the phone', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-phone/+99999999999',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('GET /trips/:tripId/disruptions', () => {
    it('returns the seeded flight_delay with parsed suggestedActions', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/trip-demo-bcn/disruptions',
      )
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      const d = res.body[0]
      expect(d.type).toBe('flight_delay')
      expect(d.severity).toBe('major')
      expect(Array.isArray(d.suggestedActions)).toBe(true)
      const tools = d.suggestedActions.map(
        (a: { toolCall: { tool: string } }) => a.toolCall.tool,
      )
      expect(tools).toEqual(['quoteHotelCheckInChange', 'requoteTransfer'])
    })

    it('404s on unknown trip', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/no-such-trip/disruptions',
      )
      expect(res.status).toBe(404)
    })
  })
})
