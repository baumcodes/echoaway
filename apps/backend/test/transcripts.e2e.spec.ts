import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

/**
 * Transcripts are an ephemeral debug overlay: not persisted, no GET-by-id,
 * just a publish + SSE broadcast. We cover the publish path's validation
 * + the SSE pipe end-to-end.
 */
describe('Transcripts', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('POST /transcripts validates the role enum', async () => {
    const res = await request(app.getHttpServer())
      .post('/transcripts')
      .send({ sessionId: 'sess-1', role: 'system', text: 'nope' })
    expect(res.status).toBe(400)
  })

  it('POST /transcripts accepts valid payloads with 202', async () => {
    const res = await request(app.getHttpServer())
      .post('/transcripts')
      .send({ sessionId: 'sess-1', role: 'user', text: 'hello' })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true })
  })

  it('SSE /transcripts/stream broadcasts published transcripts', async () => {
    const server = app.getHttpServer() as {
      listen: (...a: unknown[]) => unknown
    }
    const handle: {
      close: (cb: () => void) => void
      address: () => { port: number }
    } = await new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = (server as any).listen(0, () => resolve(h))
    })
    const port = handle.address().port

    const controller = new AbortController()
    const received: string[] = []
    const streamed = (async () => {
      const res = await fetch(`http://127.0.0.1:${port}/transcripts/stream`, {
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

    await new Promise((r) => setTimeout(r, 50))
    await request(`http://127.0.0.1:${port}`)
      .post('/transcripts')
      .send({
        sessionId: 'sess-1',
        tripId: 'trip-demo-bcn',
        role: 'assistant',
        text: 'I can move your check-in.',
        isFinal: true,
      })
      .expect(202)
    await new Promise((r) => setTimeout(r, 100))
    controller.abort()
    await streamed
    await new Promise<void>((resolve) => handle.close(() => resolve()))

    const allText = received.join('')
    expect(allText).toContain('event: transcript')
    expect(allText).toContain('"role":"assistant"')
    expect(allText).toContain('I can move your check-in.')
  })
})
