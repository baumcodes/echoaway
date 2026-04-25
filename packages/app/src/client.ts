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

    mintVoiceToken: (req: {
      identity: string
      name?: string
      room?: string
      /** Encoded into the participant token; the agent worker reads
       *  this to resolve tripId/sessionId without an extra round-trip. */
      metadata?: { tripId?: string; sessionId?: string }
    }) =>
      request<{ token: string; url: string; room: string; identity: string }>(
        `/voice/token`,
        { method: 'POST', body: JSON.stringify(req) },
      ),

    createVoiceSession: (req: {
      tripId: string
      travelerId?: string
      status?: 'active' | 'ended' | 'failed'
    }) =>
      request<{
        id: string
        tripId: string
        travelerId: string | null
        status: string
        startedAt: string
        /** LiveKit room name owned by this VoiceSession. */
        roomName: string
      }>(`/voice-sessions`, {
        method: 'POST',
        body: JSON.stringify(req),
      }),

    getVoiceSession: (id: string) =>
      request<{
        id: string
        tripId: string
        travelerId: string | null
        status: string
        startedAt: string
        roomName: string
        /** Populated by the agent worker on shutdown. Null until the
         *  session ends. Shape matches `AudioIntelligenceMetric` from
         *  `@echoaway/types`. */
        audioMetric: unknown | null
      }>(`/voice-sessions/${encodeURIComponent(id)}`),

    /** Persist the AI-listening metric snapshot at session end. The
     *  agent worker calls this from its shutdown callback so the web
     *  UI can refetch + render the audio-clarity card. */
    setVoiceSessionAudioMetric: (id: string, metric: unknown) =>
      request<{ ok: boolean; audioMetric: unknown }>(
        `/voice-sessions/${encodeURIComponent(id)}/audio-metric`,
        { method: 'PUT', body: JSON.stringify(metric) },
      ),

    pollEvents: (params: { since?: string; tripId?: string } = {}) => {
      const search = new URLSearchParams()
      if (params.since) search.set('since', params.since)
      if (params.tripId) search.set('tripId', params.tripId)
      const qs = search.toString()
      return request<VoiceEventEnvelope[]>(
        `/events${qs ? `?${qs}` : ''}`,
      )
    },

    /** Streaming URL — passed to `EventSource` in the browser, or to
     *  the polling fallback when SSE is unavailable. */
    eventStreamUrl: () => `${base}/events/stream`,

    /** Re-runs the demo-trip seed so the bookable window is fresh.
     *  Useful for debugging when consecutive confirms have consumed
     *  the slack between check-in and check-out. */
    resetDemoTrip: () =>
      request<{ ok: boolean }>(`/admin/reset-demo`, { method: 'POST' }),

    // -------- Catalog reads ------------------------------------------------
    // Browser-friendly wrappers around `GET /catalog/*`. The voice agent
    // (and future expanded tool surface) uses these to suggest swaps,
    // alternatives, or context — keep them all here so adding a new
    // catalog query doesn't touch the agent layer.

    listDestinations: (countryCode?: string) => {
      const qs = countryCode ? `?countryCode=${encodeURIComponent(countryCode)}` : ''
      return request<CatalogDestination[]>(`/catalog/destinations${qs}`)
    },

    listAccommodations: (destinationId?: string) => {
      const qs = destinationId
        ? `?destinationId=${encodeURIComponent(destinationId)}`
        : ''
      return request<CatalogAccommodation[]>(`/catalog/accommodations${qs}`)
    },

    listActivities: (destinationId?: string) => {
      const qs = destinationId
        ? `?destinationId=${encodeURIComponent(destinationId)}`
        : ''
      return request<CatalogActivity[]>(`/catalog/activities${qs}`)
    },

    listFlightRoutes: (params: { fromIata?: string; toIata?: string } = {}) => {
      const search = new URLSearchParams()
      if (params.fromIata) search.set('fromIata', params.fromIata)
      if (params.toIata) search.set('toIata', params.toIata)
      const qs = search.toString()
      return request<CatalogFlightRoute[]>(
        `/catalog/flight-routes${qs ? `?${qs}` : ''}`,
      )
    },

    listTransfers: (fromAirportId?: string) => {
      const qs = fromAirportId
        ? `?fromAirportId=${encodeURIComponent(fromAirportId)}`
        : ''
      return request<CatalogTransfer[]>(`/catalog/transfers${qs}`)
    },
  }
}

// Catalog response shapes. Kept narrow — only fields the agent / web UI
// consume. Backend serialises JSON columns server-side so these are
// already-parsed objects.

export type CatalogDestination = {
  id: string
  name: string
  type: string
  countryCode: string
  countryName: string
  timezone: string
  coordinates: { lat: number; lng: number } | null
  summary: string | null
  tags: string[] | null
}

export type CatalogAccommodation = {
  id: string
  name: string
  destinationId: string | null
  stars: number
  pricePerNightCents: number
  currency: string
  coordinates: { lat: number; lng: number } | null
  amenities: string[] | null
  images: string[] | null
  description: string | null
}

export type CatalogActivity = {
  id: string
  name: string
  destinationId: string | null
  durationHours: number
  priceCents: number
  currency: string
  tags: string[] | null
  description: string | null
}

export type CatalogFlightRoute = {
  id: string
  from: { id: string; iata: string }
  to: { id: string; iata: string }
  stops: number
  durationHours: number
  priceAvgCents: number
  currency: string
  fareConditions: string
  daysOfWeek: number[] | null
  legs: Array<{
    id: string
    order: number
    flightNo: string
    airline: string
    fromAirportId: string
    toAirportId: string
    depTime: string
    arrTime: string
  }>
}

export type CatalogTransfer = {
  id: string
  fromAirportId: string | null
  toAccommodationProductId: string | null
  toDestinationId: string | null
  fromLabel: string
  toLabel: string
  mode: string
  durationMinutes: number
  priceCents: number
  currency: string
  schedule: unknown
}

/** Shape of one row pushed by `/events/stream` and `/events`. Matches
 *  the backend's `VoiceEventEnvelope` exactly so consumers can treat
 *  both transports interchangeably. */
export type VoiceEventEnvelope = {
  id: string
  type: string
  sessionId: string
  tripId: string | null
  componentId: string | null
  payload: unknown
  createdAt: string
}

export type ApiClient = ReturnType<typeof createApiClient>
