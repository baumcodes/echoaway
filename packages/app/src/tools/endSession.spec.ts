import { describe, expect, it, vi } from 'vitest'
import { makeToolCtx } from './_test-fixtures.js'
import { endSession } from './endSession.js'

describe('endSession', () => {
  it('calls the room-disconnect callback when one is provided', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    const ctx = makeToolCtx({ endSession: disconnect })
    const result = await endSession.execute({ reason: 'goodbye' }, ctx)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(result).toEqual({ ended: true, reason: 'goodbye' })
  })

  it('no-ops cleanly when there is no live room (CLI / replay surfaces)', async () => {
    const ctx = makeToolCtx()
    const result = (await endSession.execute({}, ctx)) as {
      ended: boolean
      reason: string
    }
    expect(result.ended).toBe(false)
    expect(result.reason).toBe('session ended')
  })
})
