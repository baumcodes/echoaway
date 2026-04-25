import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, ensureLivekitEnvOrSkip } from './helpers'

describe('POST /voice/token', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it.skipIf(!ensureLivekitEnvOrSkip())(
    'mints a JWT and echoes the LiveKit URL',
    async () => {
      const res = await request(app.getHttpServer())
        .post('/voice/token')
        .send({ identity: 'trav-stephan', name: 'Stephan' })
      expect(res.status).toBe(201)
      expect(res.body.token).toBeTypeOf('string')
      expect(res.body.token.split('.')).toHaveLength(3) // JWT header.payload.sig
      expect(res.body.url).toBe(process.env.LIVEKIT_URL)
      expect(res.body.identity).toBe('trav-stephan')
      expect(res.body.room).toBe('echoaway-demo')
    },
  )

  it.skipIf(!ensureLivekitEnvOrSkip())(
    'embeds tripId/sessionId metadata into the token',
    async () => {
      const res = await request(app.getHttpServer())
        .post('/voice/token')
        .send({
          identity: 'trav-stephan',
          room: 'echoaway-sess-1',
          metadata: { tripId: 'trip-demo-bcn', sessionId: 'sess-1' },
        })
      expect(res.status).toBe(201)
      expect(res.body.room).toBe('echoaway-sess-1')
      // Decode the JWT payload (no signature check here — just shape).
      const [, payload] = (res.body.token as string).split('.')
      const decoded = JSON.parse(
        Buffer.from(payload!, 'base64url').toString('utf8'),
      ) as { metadata?: string }
      const meta = JSON.parse(decoded.metadata ?? '{}')
      expect(meta).toEqual({ tripId: 'trip-demo-bcn', sessionId: 'sess-1' })
    },
  )

  it('400s when identity is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/voice/token')
      .send({ name: 'Stephan' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Validation failed')
  })

  it.skipIf(ensureLivekitEnvOrSkip())(
    '500s when LiveKit env is not configured',
    async () => {
      const res = await request(app.getHttpServer())
        .post('/voice/token')
        .send({ identity: 'trav-stephan' })
      expect(res.status).toBe(500)
    },
  )
})
