import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

const SEED_PHONE = '+4915112345678'
const SEED_EMAIL = 'big-berlin-hack-april-26@planaway.com'
const SEED_TRIP_ID = 'trip-demo-bcn'

describe('Trips — lookup endpoints', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  describe('GET /trips/by-email/:email', () => {
    it('finds the seeded lead traveler by exact email', async () => {
      const res = await request(app.getHttpServer()).get(
        `/trips/by-email/${encodeURIComponent(SEED_EMAIL)}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('normalizes case + trailing punctuation', async () => {
      const res = await request(app.getHttpServer()).get(
        `/trips/by-email/${encodeURIComponent(SEED_EMAIL.toUpperCase() + '.')}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('404s on unknown email', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-email/nobody@example.com',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('GET /trips/by-id/:tripId', () => {
    it('finds the trip by exact id', async () => {
      const res = await request(app.getHttpServer()).get(
        `/trips/by-id/${SEED_TRIP_ID}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('finds the trip with no dashes', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-id/tripdemobcn',
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('finds the trip with mixed case', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-id/TRIP-DEMO-BCN',
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('404s on unknown id', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/by-id/no-such-trip',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('GET /trips/by-phone/:phone — normalization', () => {
    it('accepts loose punctuation', async () => {
      const res = await request(app.getHttpServer()).get(
        `/trips/by-phone/${encodeURIComponent('+49 (151) 1234-5678')}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
    it('accepts 0049 prefix', async () => {
      const res = await request(app.getHttpServer()).get(
        `/trips/by-phone/${encodeURIComponent('0049 151 1234 5678')}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(SEED_TRIP_ID)
    })
  })

  describe('GET /trips/search?q=', () => {
    it('returns redacted candidates — never raw name/email/phone', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/search?q=Stephan',
      )
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      const c = res.body[0]
      expect(c.candidateId).toEqual(expect.any(String))
      expect(c.tripTitle).toBe('Barcelona Long Weekend')
      expect(c.matchedTravelerInitials).toBe('S.R.')
      expect(c.phoneTail).toBe('678')
      expect(c.emailMasked).toMatch(/^b\*{3}@p\*{3}\.com$/)
      // Crucially: no raw fields leak.
      expect(JSON.stringify(c)).not.toContain('Stephan')
      expect(JSON.stringify(c)).not.toContain('4915112345678')
      expect(JSON.stringify(c)).not.toContain(SEED_EMAIL)
    })
    it('empty array on no match', async () => {
      const res = await request(app.getHttpServer()).get(
        '/trips/search?q=ZorgomotronXyz',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
    it('400s on too-short query', async () => {
      const res = await request(app.getHttpServer()).get('/trips/search?q=a')
      expect(res.status).toBe(400)
    })
    it('hides candidates without a phone or email (unverifiable)', async () => {
      // Seeded "Anna Müller" has email=null and phone=null — she
      // matches the name but can't be verified, so the API hides her.
      const res = await request(app.getHttpServer()).get(
        '/trips/search?q=Anna',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  describe('POST /trip-candidates/:id/confirm', () => {
    it('returns the trip on a phone-tail verifier match', async () => {
      const search = await request(app.getHttpServer()).get(
        '/trips/search?q=Stephan',
      )
      const candidateId = search.body[0].candidateId

      const res = await request(app.getHttpServer())
        .post(`/trip-candidates/${candidateId}/confirm`)
        .send({ verifier: '678' })
      expect(res.status).toBe(201)
      expect(res.body.tripId).toBe(SEED_TRIP_ID)
      expect(res.body.trip.id).toBe(SEED_TRIP_ID)
    })
    it('returns the trip on an email-fragment verifier match', async () => {
      const search = await request(app.getHttpServer()).get(
        '/trips/search?q=Stephan',
      )
      const candidateId = search.body[0].candidateId

      const res = await request(app.getHttpServer())
        .post(`/trip-candidates/${candidateId}/confirm`)
        .send({ verifier: 'big-berlin' })
      expect(res.status).toBe(201)
      expect(res.body.tripId).toBe(SEED_TRIP_ID)
    })
    it('rejects wrong verifier with attempts-remaining message', async () => {
      const search = await request(app.getHttpServer()).get(
        '/trips/search?q=Stephan',
      )
      const candidateId = search.body[0].candidateId

      const res = await request(app.getHttpServer())
        .post(`/trip-candidates/${candidateId}/confirm`)
        .send({ verifier: '999' })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/attempt/i)
    })
    it('retires the candidate after 3 failed attempts', async () => {
      const search = await request(app.getHttpServer()).get(
        '/trips/search?q=Stephan',
      )
      const candidateId = search.body[0].candidateId

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post(`/trip-candidates/${candidateId}/confirm`)
          .send({ verifier: '000' })
      }
      // Fourth try: candidate is gone.
      const res = await request(app.getHttpServer())
        .post(`/trip-candidates/${candidateId}/confirm`)
        .send({ verifier: '678' })
      expect(res.status).toBe(404)
    })
    it('404s on unknown candidate id', async () => {
      const res = await request(app.getHttpServer())
        .post('/trip-candidates/never-issued/confirm')
        .send({ verifier: '678' })
      expect(res.status).toBe(404)
    })
  })
})
