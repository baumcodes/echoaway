import type { ChangeQuote } from '@echoaway/types'
import type { Trip, TripDisruption } from './types.js'

export type ApiClientOptions = {
  baseUrl: string
  /** Allow tests / SSR to inject a custom fetch. Defaults to global. */
  fetch?: typeof fetch
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
  ) {
    super(
      `Request to ${url} failed with ${status}: ${
        typeof body === 'object' ? JSON.stringify(body) : String(body)
      }`,
    )
    this.name = 'ApiError'
  }
}

/**
 * Typed wrapper around the EchoAway backend tool API. Used by both the
 * web app and (later) the voice-agent worker. All methods throw `ApiError`
 * on non-2xx responses; the body is parsed as JSON when possible.
 */
export function createApiClient(opts: ApiClientOptions) {
  const fetchImpl = opts.fetch ?? fetch
  const base = opts.baseUrl.replace(/\/$/, '')

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${base}${path}`
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    let body: unknown = null
    const text = await res.text()
    if (text.length > 0) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    if (!res.ok) throw new ApiError(res.status, url, body)
    return body as T
  }

  return {
    health: () => request<{ status: string; service: string }>('/health'),

    getTripById: (tripId: string) =>
      request<Trip>(`/trips/${encodeURIComponent(tripId)}`),

    getTripByPhone: (phone: string) =>
      request<Trip>(`/trips/by-phone/${encodeURIComponent(phone)}`),

    getDisruptions: (tripId: string) =>
      request<TripDisruption[]>(
        `/trips/${encodeURIComponent(tripId)}/disruptions`,
      ),

    quoteHotelCheckInChange: (
      tripId: string,
      newCheckInDate: string,
      sessionId?: string,
    ) =>
      request<ChangeQuote>(
        `/trips/${encodeURIComponent(tripId)}/hotel/check-in/quote-change`,
        {
          method: 'POST',
          body: JSON.stringify({ newCheckInDate, sessionId }),
        },
      ),

    confirmHotelCheckInChange: (
      tripId: string,
      newCheckInDate: string,
      sessionId?: string,
    ) =>
      request<{
        quote: ChangeQuote
        booking: {
          id: string
          status: string
          priceCents: number
          currency: string
          data: unknown
        }
        checkInEventStartsAt: string
      }>(
        `/trips/${encodeURIComponent(tripId)}/hotel/check-in/confirm-change`,
        {
          method: 'POST',
          body: JSON.stringify({ newCheckInDate, sessionId }),
        },
      ),

    createSupportLog: (req: {
      tripId: string
      sessionId?: string
      transcript: string
      summary: string
      actions?: string[]
    }) =>
      request<{ id: string; createdAt: string }>(`/support-logs`, {
        method: 'POST',
        body: JSON.stringify(req),
      }),

    mintVoiceToken: (req: { identity: string; name?: string; room?: string }) =>
      request<{ token: string; url: string; room: string; identity: string }>(
        `/voice/token`,
        { method: 'POST', body: JSON.stringify(req) },
      ),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
