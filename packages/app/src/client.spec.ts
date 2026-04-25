import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client.js'

function mockFetch(
  responses: Array<{ status: number; body: unknown }>,
): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let idx = 0
  const f: typeof fetch = vi.fn(async (input, init) => {
    const r = responses[idx++] ?? { status: 500, body: { error: 'no mock' } }
    calls.push({
      url: typeof input === 'string' ? input : input.toString(),
      init: init ?? {},
    })
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { fetch: f, calls }
}

describe('createApiClient', () => {
  it('GETs /trips/:id and parses JSON', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { id: 'trip-demo-bcn', title: 'X' } },
    ])
    const client = createApiClient({
      baseUrl: 'http://test.local',
      fetch,
    })
    const trip = await client.getTripById('trip-demo-bcn')
    expect((trip as { id: string }).id).toBe('trip-demo-bcn')
    expect(calls[0]!.url).toBe('http://test.local/trips/trip-demo-bcn')
  })

  it('URL-encodes path params', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }])
    const client = createApiClient({ baseUrl: 'http://test.local', fetch })
    await client.getTripByPhone('+4915112345678')
    expect(calls[0]!.url).toBe(
      'http://test.local/trips/by-phone/%2B4915112345678',
    )
  })

  it('strips trailing slash from baseUrl', async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { status: 'ok' } }])
    const client = createApiClient({
      baseUrl: 'http://test.local/',
      fetch,
    })
    await client.health()
    expect(calls[0]!.url).toBe('http://test.local/health')
  })

  it('POSTs JSON body for quoteHotelCheckInChange', async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { feeCents: 0 } },
    ])
    const client = createApiClient({ baseUrl: 'http://test.local', fetch })
    await client.quoteHotelCheckInChange('trip-demo-bcn', '2026-05-03', 'sess-1')
    const call = calls[0]!
    expect(call.url).toMatch(/quote-change$/)
    expect(call.init.method).toBe('POST')
    expect(JSON.parse(call.init.body as string)).toEqual({
      newCheckInDate: '2026-05-03',
      sessionId: 'sess-1',
    })
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
  })

  it('throws ApiError with status and parsed body on non-2xx', async () => {
    const { fetch } = mockFetch([
      { status: 400, body: { message: 'Validation failed', issues: [] } },
    ])
    const client = createApiClient({ baseUrl: 'http://test.local', fetch })
    let caught: unknown
    try {
      await client.getTripById('boom')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    const apiErr = caught as ApiError
    expect(apiErr.status).toBe(400)
    expect(apiErr.body).toEqual({
      message: 'Validation failed',
      issues: [],
    })
  })
})
