import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

describe('POST /voice-sessions', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('creates a session, returns the room name, and persists a session_started event', async () => {
    const res = await request(app.getHttpServer())
      .post('/voice-sessions')
      .send({ tripId: 'trip-demo-bcn' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.tripId).toBe('trip-demo-bcn')
    expect(res.body.status).toBe('active')
    expect(res.body.roomName).toBe(`echoaway-${res.body.id}`)

    // The session_started event should be visible via the polling endpoint.
    const events = await request(app.getHttpServer())
      .get('/events')
      .query({ tripId: 'trip-demo-bcn' })
    const matching = events.body.filter(
      (e: { sessionId: string; type: string }) =>
        e.sessionId === res.body.id && e.type === 'session_started',
    )
    expect(matching).toHaveLength(1)
  })

  it('GET /voice-sessions/:id returns the session', async () => {
    const created = await request(app.getHttpServer())
      .post('/voice-sessions')
      .send({ tripId: 'trip-demo-bcn' })
    const got = await request(app.getHttpServer()).get(
      `/voice-sessions/${created.body.id}`,
    )
    expect(got.status).toBe(200)
    expect(got.body.id).toBe(created.body.id)
    expect(got.body.roomName).toBe(`echoaway-${created.body.id}`)
  })

  it('GET /voice-sessions/:unknown 404s', async () => {
    const res = await request(app.getHttpServer()).get(
      '/voice-sessions/no-such-session',
    )
    expect(res.status).toBe(404)
  })

  it('404s on unknown trip', async () => {
    const res = await request(app.getHttpServer())
      .post('/voice-sessions')
      .send({ tripId: 'no-such-trip' })
    expect(res.status).toBe(404)
  })

  it('400s when tripId is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/voice-sessions')
      .send({})
    expect(res.status).toBe(400)
  })
})
