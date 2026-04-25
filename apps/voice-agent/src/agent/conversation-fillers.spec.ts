import { describe, expect, it } from 'vitest'
import {
  autoContinueInstructions,
  pickRandom,
  slowToolFillers,
} from './conversation-fillers.js'

describe('conversation-fillers', () => {
  it('exposes non-empty filler pools', () => {
    expect(slowToolFillers.length).toBeGreaterThan(0)
    expect(autoContinueInstructions.length).toBeGreaterThan(0)
    for (const f of slowToolFillers) expect(f.trim().length).toBeGreaterThan(0)
    for (const f of autoContinueInstructions)
      expect(f.trim().length).toBeGreaterThan(0)
  })

  it('pickRandom returns an element of the pool', () => {
    const pool = ['a', 'b', 'c'] as const
    for (let i = 0; i < 50; i++) {
      const picked = pickRandom(pool)
      expect(pool).toContain(picked)
    }
  })

  it('pickRandom throws on empty pool', () => {
    expect(() => pickRandom([])).toThrow()
  })
})
