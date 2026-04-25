import { describe, expect, it } from 'vitest'
import {
  type AssistantState,
  assistantReducer,
  initialAssistantState,
} from './state-machine.js'

const sampleQuote = {
  componentId: 'comp-stay',
  changeType: 'check_in_date' as const,
  oldValue: '2026-05-02',
  newValue: '2026-05-03',
  feeCents: 0,
  currency: 'EUR' as const,
  policySummary: 'Free until end of today',
  validUntil: '2026-04-25T23:59:00.000Z',
}

describe('assistantReducer', () => {
  it('starts idle', () => {
    expect(initialAssistantState).toEqual({ kind: 'idle' })
  })

  it('idle → listening on session_started', () => {
    const next = assistantReducer(initialAssistantState, {
      type: 'session_started',
    })
    expect(next.kind).toBe('listening')
  })

  it('session_started is a no-op when not idle', () => {
    const listening: AssistantState = { kind: 'listening' }
    expect(assistantReducer(listening, { type: 'session_started' })).toBe(
      listening,
    )
  })

  it('listening preserves transcript', () => {
    const next = assistantReducer(initialAssistantState, {
      type: 'listening',
      transcript: 'move my hotel',
    })
    expect(next).toEqual({ kind: 'listening', transcript: 'move my hotel' })
  })

  it('thinking carries intent', () => {
    const next = assistantReducer(initialAssistantState, {
      type: 'thinking',
      intent: 'quoting hotel change',
    })
    expect(next).toEqual({ kind: 'thinking', intent: 'quoting hotel change' })
  })

  it('change_suggested transitions to suggesting with the quote', () => {
    const next = assistantReducer(initialAssistantState, {
      type: 'change_suggested',
      quote: sampleQuote,
    })
    expect(next.kind).toBe('suggesting')
    expect(next.kind === 'suggesting' && next.quote).toEqual(sampleQuote)
  })

  it('change_confirmed transitions to confirmed', () => {
    const next = assistantReducer(
      { kind: 'suggesting', quote: sampleQuote },
      { type: 'change_confirmed', quote: sampleQuote },
    )
    expect(next.kind).toBe('confirmed')
  })

  it('change_rejected transitions to rejected with reason', () => {
    const next = assistantReducer(
      { kind: 'suggesting', quote: sampleQuote },
      { type: 'change_rejected', reason: 'user' },
    )
    expect(next).toEqual({ kind: 'rejected', reason: 'user' })
  })

  it('error captures message', () => {
    const next = assistantReducer(initialAssistantState, {
      type: 'error',
      message: 'boom',
    })
    expect(next).toEqual({ kind: 'error', message: 'boom' })
  })

  it('reset and session_ended return to idle from anywhere', () => {
    const states: AssistantState[] = [
      { kind: 'listening' },
      { kind: 'thinking' },
      { kind: 'suggesting', quote: sampleQuote },
      { kind: 'confirmed', quote: sampleQuote },
      { kind: 'error', message: 'x' },
    ]
    for (const s of states) {
      expect(assistantReducer(s, { type: 'reset' })).toEqual({ kind: 'idle' })
      expect(assistantReducer(s, { type: 'session_ended' })).toEqual({
        kind: 'idle',
      })
    }
  })
})
