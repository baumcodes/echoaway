import { describe, expect, it } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { searchTravelContext } from './searchTravelContext.js'

describe('searchTravelContext', () => {
  it('returns a stub note (Phase 8 placeholder)', async () => {
    const ctx = makeToolCtx()
    const out = (await searchTravelContext.execute(
      { query: 'BCN airport arrival' },
      ctx,
    )) as { note: string; results: unknown[] }
    expect(out.note).toMatch(/Phase 8/)
    expect(out.results).toEqual([])
  })

  it('throws when query is missing', async () => {
    const ctx = makeToolCtx()
    await expect(searchTravelContext.execute({}, ctx)).rejects.toThrow(/query/)
  })
})
