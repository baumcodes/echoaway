import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp } from './helpers'

describe('Catalog — read endpoints', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('GET /catalog/destinations returns all rows when unfiltered', async () => {
    const res = await request(app.getHttpServer()).get('/catalog/destinations')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    // dest-spain is synthesised by the catalog seed
    expect(res.body.some((d: { id: string }) => d.id === 'dest-spain')).toBe(true)
  })

  it('GET /catalog/destinations?countryCode=ES filters to Spain', async () => {
    const res = await request(app.getHttpServer())
      .get('/catalog/destinations')
      .query({ countryCode: 'ES' })
    expect(res.status).toBe(200)
    expect(res.body.every((d: { countryCode: string }) => d.countryCode === 'ES')).toBe(true)
  })

  it('GET /catalog/accommodations?destinationId=dest-barcelona', async () => {
    const res = await request(app.getHttpServer())
      .get('/catalog/accommodations')
      .query({ destinationId: 'dest-barcelona' })
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(
      res.body.every(
        (a: { destinationId: string }) => a.destinationId === 'dest-barcelona',
      ),
    ).toBe(true)
    // amenities is parsed JSON array, not a string
    expect(Array.isArray(res.body[0].amenities)).toBe(true)
  })

  it('GET /catalog/activities?destinationId=dest-barcelona', async () => {
    const res = await request(app.getHttpServer())
      .get('/catalog/activities')
      .query({ destinationId: 'dest-barcelona' })
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(
      res.body.every(
        (a: { destinationId: string }) => a.destinationId === 'dest-barcelona',
      ),
    ).toBe(true)
  })

  it('GET /catalog/flight-routes?fromIata=BER&toIata=BCN finds the demo route', async () => {
    const res = await request(app.getHttpServer())
      .get('/catalog/flight-routes')
      .query({ fromIata: 'BER', toIata: 'BCN' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('flt-ber-bcn-01')
    expect(res.body[0].legs.length).toBeGreaterThan(0)
  })

  it('GET /catalog/transfers?fromAirportId=air-bcn returns the BCN→hotel shuttle', async () => {
    const res = await request(app.getHttpServer())
      .get('/catalog/transfers')
      .query({ fromAirportId: 'air-bcn' })
    expect(res.status).toBe(200)
    expect(res.body.some((t: { id: string }) => t.id === 'trf-bcn-hotelbrisa')).toBe(true)
  })
})
