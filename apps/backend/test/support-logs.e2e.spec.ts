import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

describe('POST /support-logs', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('persists a log without a sessionId', async () => {
    const res = await request(app.getHttpServer())
      .post('/support-logs')
      .send({
        tripId: 'trip-demo-bcn',
        transcript: 'User asked to move check-in. Confirmed.',
        summary: 'Hotel check-in shifted by 1 day, no fee.',
        actions: ['confirmHotelCheckInChange'],
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.tripId).toBe('trip-demo-bcn')
    expect(res.body.sessionId).toBeNull()
    expect(res.body.actions).toEqual(['confirmHotelCheckInChange'])
  })

  it('404s on unknown trip', async () => {
    const res = await request(app.getHttpServer())
      .post('/support-logs')
      .send({
        tripId: 'no-such-trip',
        transcript: 'x',
        summary: 'y',
      })
    expect(res.status).toBe(404)
  })

  it('400s when required fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/support-logs')
      .send({ transcript: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Validation failed')
  })
})
