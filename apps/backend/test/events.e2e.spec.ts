import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bootApp, resetDemoTrip } from './helpers'

/**
 * Event stream coverage. SSE itself (`/events/stream`) is hard to
 * exercise via supertest because the response stays open; we cover it
 * indirectly: a quote-change call triggers the bus → both SSE consumers
 * AND `prisma.voiceActionEvent.create` see the same write, and the
 * polling endpoint returns it. If polling sees it, SSE published it.
 */
describe('GET /events (polling)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    resetDemoTrip()
  })

  async function openSession(tripId: string) {
    const res = await request(app.getHttpServer())
      .post('/voice-sessions')
      .send({ tripId })
    return res.body.id as string
  }

  it('returns events created after `since`', async () => {
    const sessionId = await openSession('trip-demo-bcn')
    const cutoff = new Date().toISOString()
    // Wait one ms so the cutoff is strictly before the next write.
    await new Promise((r) => setTimeout(r, 5))

    await request(app.getHttpServer())
      .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
      .send({ newCheckInDate: '2026-05-03', sessionId })
      .expect(201)

    const res = await request(app.getHttpServer())
      .get('/events')
      .query({ since: cutoff, tripId: 'trip-demo-bcn' })
    expect(res.status).toBe(200)
    const types = res.body.map((e: { type: string }) => e.type)
    expect(types).toContain('change_suggested')
  })

  it('filters by tripId', async () => {
    const sessionId = await openSession('trip-demo-bcn')
    await request(app.getHttpServer())
      .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
      .send({ newCheckInDate: '2026-05-03', sessionId })
      .expect(201)

    const ours = await request(app.getHttpServer())
      .get('/events')
      .query({ tripId: 'trip-demo-bcn' })
    const others = await request(app.getHttpServer())
      .get('/events')
      .query({ tripId: 'no-such-trip' })

    expect(ours.body.length).toBeGreaterThan(0)
    expect(others.body).toEqual([])
  })

  it('payload is parsed JSON, not a string', async () => {
    const sessionId = await openSession('trip-demo-bcn')
    await request(app.getHttpServer())
      .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
      .send({ newCheckInDate: '2026-05-03', sessionId })
      .expect(201)

    const res = await request(app.getHttpServer())
      .get('/events')
      .query({ tripId: 'trip-demo-bcn' })
    const suggested = res.body.find(
      (e: { type: string }) => e.type === 'change_suggested',
    )
    expect(suggested).toBeTruthy()
    expect(typeof suggested.payload).toBe('object')
    expect(suggested.payload.quote).toBeTruthy()
    expect(suggested.payload.quote.newValue).toBe('2026-05-03')
  })

  it('confirm-change persists a change_confirmed event', async () => {
    const sessionId = await openSession('trip-demo-bcn')
    await request(app.getHttpServer())
      .post('/trips/trip-demo-bcn/hotel/check-in/confirm-change')
      .send({ newCheckInDate: '2026-05-03', sessionId })
      .expect(201)

    const res = await request(app.getHttpServer())
      .get('/events')
      .query({ tripId: 'trip-demo-bcn' })
    const types = res.body.map((e: { type: string }) => e.type)
    expect(types).toContain('change_confirmed')
  })

  it('SSE endpoint serves text/event-stream and pushes published events', async () => {
    // Boot a real listener so we can use fetch + AbortController instead
    // of supertest, which doesn't gracefully abort open streams.
    const server = app.getHttpServer() as { listen: (...a: unknown[]) => unknown }
    const handle: { close: (cb: () => void) => void; address: () => { port: number } } =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = (server as any).listen(0, () => resolve(h))
      })
    const port = handle.address().port

    const sessionId = await openSession('trip-demo-bcn')
    const controller = new AbortController()
    const received: string[] = []

    const streamed = (async () => {
      const res = await fetch(`http://127.0.0.1:${port}/events/stream`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          received.push(decoder.decode(value))
        }
      } catch {
        // aborted — expected
      }
    })()

    // Give the SSE handler a tick to wire its subscription before we
    // publish; otherwise the event fires before we listen.
    await new Promise((r) => setTimeout(r, 50))
    await request(`http://127.0.0.1:${port}`)
      .post('/trips/trip-demo-bcn/hotel/check-in/quote-change')
      .send({ newCheckInDate: '2026-05-03', sessionId })
      .expect(201)
    await new Promise((r) => setTimeout(r, 100))
    controller.abort()
    await streamed
    await new Promise<void>((resolve) => handle.close(() => resolve()))

    const allText = received.join('')
    expect(allText).toContain('change_suggested')
    expect(allText).toContain('"newValue":"2026-05-03"')
  })
})
