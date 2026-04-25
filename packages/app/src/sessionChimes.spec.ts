import { describe, expect, it } from 'vitest'
import { pickSessionChime } from './sessionChimes.js'

describe('pickSessionChime', () => {
  it('plays the ready chime on the connected edge', () => {
    expect(pickSessionChime('idle', 'connected')).toBe('ready')
    expect(pickSessionChime('connecting', 'connected')).toBe('ready')
    expect(pickSessionChime(null, 'connected')).toBe('ready')
  })

  it('plays the closed chime when leaving connected', () => {
    expect(pickSessionChime('connected', 'idle')).toBe('closed')
    expect(pickSessionChime('connected', 'error')).toBe('closed')
  })

  it('does not chime on intermediate transitions', () => {
    // We don't want a sound on every loading hiccup.
    expect(pickSessionChime('idle', 'connecting')).toBeNull()
    expect(pickSessionChime('connecting', 'error')).toBeNull()
    expect(pickSessionChime('error', 'idle')).toBeNull()
    expect(pickSessionChime(null, 'connecting')).toBeNull()
  })

  it('does not re-fire on level (same state twice)', () => {
    expect(pickSessionChime('connected', 'connected')).toBeNull()
    expect(pickSessionChime('idle', 'idle')).toBeNull()
  })
})
