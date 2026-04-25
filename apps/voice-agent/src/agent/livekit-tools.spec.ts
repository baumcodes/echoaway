import type { Tool, ToolContext } from '@echoaway/app'
import { afterEach, describe, expect, it, vi } from 'vitest'

// We mock the @echoaway/app registry to keep this test focused on the
// slow-tool timer behavior — no need to thread through the real tool
// implementations.
const fakeRegistry: Record<string, Tool> = {
  fastTool: {
    declaration: {
      name: 'fastTool',
      description: 'returns immediately',
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(async () => ({ ok: true })),
  } as unknown as Tool,
  slowTool: {
    declaration: {
      name: 'slowTool',
      description: 'takes a while',
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(
      async () =>
        await new Promise((r) => setTimeout(() => r({ ok: true }), 80)),
    ),
  } as unknown as Tool,
}

vi.mock('@echoaway/app', () => ({ tools: fakeRegistry }))

const { buildLivekitToolCtx } = await import('./livekit-tools.js')

const ctx = {} as ToolContext

afterEach(() => {
  vi.useRealTimers()
})

describe('buildLivekitToolCtx slow-tool wrapper', () => {
  it('does not call onSlowToolCall when the tool finishes before threshold', async () => {
    const onSlow = vi.fn()
    const tools = buildLivekitToolCtx(ctx, {
      onSlowToolCall: onSlow,
      slowToolThresholdMs: 200,
    })
    await tools.fastTool!.execute({}, {} as never)
    expect(onSlow).not.toHaveBeenCalled()
  })

  it('calls onSlowToolCall once when the tool exceeds threshold', async () => {
    const onSlow = vi.fn()
    const tools = buildLivekitToolCtx(ctx, {
      onSlowToolCall: onSlow,
      // 10ms < the slowTool's 80ms latency → timer should fire.
      slowToolThresholdMs: 10,
    })
    await tools.slowTool!.execute({}, {} as never)
    expect(onSlow).toHaveBeenCalledTimes(1)
    const arg = onSlow.mock.calls[0]![0]
    expect(arg.toolName).toBe('slowTool')
    expect(arg.elapsedMs).toBeGreaterThanOrEqual(10)
  })

  it('swallows onSlowToolCall errors so they do not break the tool', async () => {
    const onSlow = vi.fn(() => {
      throw new Error('intentional')
    })
    const tools = buildLivekitToolCtx(ctx, {
      onSlowToolCall: onSlow,
      slowToolThresholdMs: 10,
    })
    const result = await tools.slowTool!.execute({}, {} as never)
    expect(onSlow).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('omitting onSlowToolCall keeps execute behavior unchanged', async () => {
    const tools = buildLivekitToolCtx(ctx, {})
    const result = await tools.fastTool!.execute({}, {} as never)
    expect(result).toEqual({ ok: true })
  })
})
