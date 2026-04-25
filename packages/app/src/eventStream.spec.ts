import { describe, expect, it } from 'vitest'
import { envelopeToAssistantEvent } from './eventStream.js'
import type { VoiceEventEnvelope } from './client.js'

const sampleQuote = {
  componentId: 'comp-stay',
  changeType: 'check_in_date',
  oldValue: '2026-05-02',
  newValue: '2026-05-03',
  feeCents: 0,
  currency: 'EUR',
  policySummary: 'Free until end of today',
  validUntil: '2026-04-25T23:59:00.000Z',
}

const make = (
  type: string,
  payload: Record<string, unknown>,
): VoiceEventEnvelope => ({
  id: 'evt-1',
  type,
  sessionId: 'sess-1',
  tripId: 'trip-demo-bcn',
  componentId: null,
  payload,
  createdAt: '2026-04-25T00:00:00.000Z',
})

describe('envelopeToAssistantEvent', () => {
  it('maps session_started → session_started', () => {
    expect(envelopeToAssistantEvent(make('session_started', {}))).toEqual({
      type: 'session_started',
    })
  })

  it('maps assistant_listening → listening with transcript', () => {
    expect(
      envelopeToAssistantEvent(
        make('assistant_listening', { transcript: 'hi' }),
      ),
    ).toEqual({ type: 'listening', transcript: 'hi' })
  })

  it('maps assistant_thinking → thinking with intent', () => {
    expect(
      envelopeToAssistantEvent(
        make('assistant_thinking', { intent: 'looking up' }),
      ),
    ).toEqual({ type: 'thinking', intent: 'looking up' })
  })

  it('maps change_suggested → change_suggested with the quote', () => {
    const out = envelopeToAssistantEvent(
      make('change_suggested', { quote: sampleQuote }),
    )
    expect(out?.type).toBe('change_suggested')
    expect(
      out?.type === 'change_suggested' && out.quote.newValue,
    ).toBe('2026-05-03')
  })

  it('returns null for change_suggested without a quote', () => {
    expect(envelopeToAssistantEvent(make('change_suggested', {}))).toBeNull()
  })

  it('maps change_confirmed → change_confirmed', () => {
    const out = envelopeToAssistantEvent(
      make('change_confirmed', { quote: sampleQuote }),
    )
    expect(out?.type).toBe('change_confirmed')
  })

  it('maps change_rejected → change_rejected with reason', () => {
    expect(
      envelopeToAssistantEvent(
        make('change_rejected', { reason: 'user' }),
      ),
    ).toEqual({ type: 'change_rejected', reason: 'user' })
  })

  it('maps session_ended → session_ended', () => {
    expect(envelopeToAssistantEvent(make('session_ended', {}))).toEqual({
      type: 'session_ended',
    })
  })

  it('returns null for purely-informational events', () => {
    expect(
      envelopeToAssistantEvent(
        make('support_log_created', { supportLogId: 's-1' }),
      ),
    ).toBeNull()
    expect(envelopeToAssistantEvent(make('trip_loaded', {}))).toBeNull()
    expect(
      envelopeToAssistantEvent(make('confirmation_required', {})),
    ).toBeNull()
  })

  it('returns null for unknown event types', () => {
    expect(envelopeToAssistantEvent(make('mystery', {}))).toBeNull()
  })
})
