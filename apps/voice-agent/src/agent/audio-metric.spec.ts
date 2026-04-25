import { describe, expect, it, vi } from 'vitest'
import { computeAudioMetric } from './audio-metric.js'

const baseEvents = [
  { id: 'e0', sessionId: 's', type: 'session_started', tripId: 't', componentId: null, payload: {}, createdAt: '' },
  { id: 'e1', sessionId: 's', type: 'change_suggested', tripId: 't', componentId: null, payload: {}, createdAt: '' },
  { id: 'e2', sessionId: 's', type: 'change_confirmed', tripId: 't', componentId: null, payload: {}, createdAt: '' },
]

function makeApi(events: typeof baseEvents) {
  return {
    pollEvents: vi.fn().mockResolvedValue(events),
  } as unknown as Parameters<typeof computeAudioMetric>[0]['apiClient']
}

describe('computeAudioMetric', () => {
  it('returns scenario + a metric shape that satisfies the type', async () => {
    const m = await computeAudioMetric({
      apiClient: makeApi(baseEvents),
      tripId: 't',
      sessionId: 's',
      scenario: 'airport_noise',
      noiseCancellationEnabled: true,
    })
    expect(m.scenario).toBe('airport_noise')
    expect(typeof m.transcriptQuality).toBe('number')
    expect(m.finalScore).toBeGreaterThan(0)
    expect(m.finalScore).toBeLessThanOrEqual(100)
  })

  it('a happy-path session (suggested + confirmed) hits all booleans', async () => {
    const m = await computeAudioMetric({
      apiClient: makeApi(baseEvents),
      tripId: 't',
      sessionId: 's',
      scenario: 'airport_noise',
      noiseCancellationEnabled: true,
    })
    expect(m.taskCompleted).toBe(true)
    expect(m.correctActionSuggested).toBe(true)
    expect(m.confirmationRequested).toBe(true)
    // Final score should clear 80 with all the flags lit + decent transcriptQuality.
    expect(m.finalScore).toBeGreaterThanOrEqual(80)
  })

  it('lifts enhancedSNR over inputSNR when noise cancellation is on', async () => {
    const on = await computeAudioMetric({
      apiClient: makeApi(baseEvents),
      tripId: 't',
      sessionId: 's',
      scenario: 'airport_noise',
      noiseCancellationEnabled: true,
    })
    const off = await computeAudioMetric({
      apiClient: makeApi(baseEvents),
      tripId: 't',
      sessionId: 's',
      scenario: 'airport_noise',
      noiseCancellationEnabled: false,
    })
    expect(on.enhancedSignalToNoiseRatio!).toBeGreaterThan(
      off.enhancedSignalToNoiseRatio!,
    )
    expect(on.transcriptQuality).toBeGreaterThan(off.transcriptQuality)
  })

  it('a half-flow session (suggested but not confirmed) reflects in booleans', async () => {
    const partial = baseEvents.filter((e) => e.type !== 'change_confirmed')
    const m = await computeAudioMetric({
      apiClient: makeApi(partial),
      tripId: 't',
      sessionId: 's',
      scenario: 'airport_noise',
      noiseCancellationEnabled: true,
    })
    expect(m.taskCompleted).toBe(false)
    expect(m.correctActionSuggested).toBe(true)
    // Score lower than full flow.
    expect(m.finalScore).toBeLessThan(85)
  })

  it('handles a totally empty session gracefully', async () => {
    const m = await computeAudioMetric({
      apiClient: makeApi([]),
      tripId: 't',
      sessionId: 's',
      scenario: 'clean',
      noiseCancellationEnabled: false,
    })
    expect(m.taskCompleted).toBe(false)
    expect(m.correctActionSuggested).toBe(false)
    expect(m.confirmationRequested).toBe(false)
    expect(m.scenario).toBe('clean')
  })
})
