import { vi } from 'vitest'
import type { ToolContext } from './types.js'

/**
 * Tool-spec helper. Returns a ToolContext with every `ApiClient` method
 * stubbed via `vi.fn()` — individual specs override only the methods
 * their tool actually calls. Centralised here so adding a new
 * `ApiClient` method doesn't ripple into seven spec files.
 */
export function makeToolCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    apiClient: {
      health: vi.fn(),
      getTripById: vi.fn(),
      getTripByPhone: vi.fn(),
      getDisruptions: vi.fn(),
      quoteHotelCheckInChange: vi.fn(),
      confirmHotelCheckInChange: vi.fn(),
      createSupportLog: vi.fn(),
      mintVoiceToken: vi.fn(),
      createVoiceSession: vi.fn(),
      pollEvents: vi.fn(),
      eventStreamUrl: vi.fn(),
      transcriptStreamUrl: vi.fn(),
      postTranscript: vi.fn(),
      resetDemoTrip: vi.fn(),
      listDestinations: vi.fn(),
      listAccommodations: vi.fn(),
      listActivities: vi.fn(),
      listFlightRoutes: vi.fn(),
      listTransfers: vi.fn(),
    } as unknown as ToolContext['apiClient'],
    sessionId: 'sess-1',
    tripId: null,
    ...overrides,
  }
}
