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
