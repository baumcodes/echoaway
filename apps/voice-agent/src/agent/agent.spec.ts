import { llm } from '@livekit/agents'
import type { ToolContext } from '@echoaway/app'
import { describe, expect, it, vi } from 'vitest'
import { GeminiAgent } from './agent.js'

/**
 * The plugin's `LLM.chat()` returns an `AsyncIterable<ChatChunk>`. We
 * mock the entire `@livekit/agents-plugin-google` module to expose a
 * fake `LLM` whose `chat()` returns a queued AsyncIterable so tests can
 * script multi-turn interactions.
 */
type ScriptedTurn = {
  text?: string
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>
}

const scripted: ScriptedTurn[] = []
const enqueue = (turn: ScriptedTurn) => scripted.push(turn)

vi.mock('@livekit/agents-plugin-google', async () => {
  const real = await vi.importActual<typeof import('@livekit/agents')>(
    '@livekit/agents',
  )
  class FakeLLM extends real.llm.LLM {
    label() {
      return 'fake-google'
    }
    chat() {
      const turn = scripted.shift() ?? { text: '' }
      const stream: AsyncIterable<llm.ChatChunk> = {
        async *[Symbol.asyncIterator]() {
          if (turn.text) {
            yield {
              id: 'c1',
              delta: { role: 'assistant', content: turn.text },
            }
          }
          if (turn.toolCalls?.length) {
            const calls = turn.toolCalls.map(
              (t, i) =>
                new real.llm.FunctionCall({
                  callId: `call-${i}`,
                  name: t.name,
                  args: JSON.stringify(t.args),
                }),
            )
            yield {
              id: 'c2',
              delta: { role: 'assistant', toolCalls: calls },
            }
          }
        },
      }
      return stream as unknown as llm.LLMStream
    }
  }
  return { LLM: FakeLLM }
})

function makeCtx(): ToolContext {
  return {
    apiClient: {
      getTripByPhone: vi.fn().mockResolvedValue({
        id: 'trip-demo-bcn',
        title: 'Barcelona Long Weekend',
        startDate: '',
        endDate: '',
        travelers: [],
        components: [],
      }),
      quoteHotelCheckInChange: vi.fn().mockResolvedValue({
        feeCents: 0,
        oldValue: '2026-05-02',
        newValue: '2026-05-03',
      }),
    } as unknown as ToolContext['apiClient'],
    sessionId: 'sess-1',
    tripId: null,
  }
}

describe('GeminiAgent (LiveKit plugin)', () => {
  it('returns model text when no tools are called', async () => {
    enqueue({ text: 'Hi! How can I help?' })
    const agent = new GeminiAgent({ apiKey: 'test' })
    const log = await agent.send('hello', makeCtx())
    expect(log.assistant).toBe('Hi! How can I help?')
    expect(log.toolCalls).toHaveLength(0)
  })

  it('dispatches tool calls and feeds the result back to the model', async () => {
    enqueue({
      toolCalls: [
        { name: 'getTripByPhone', args: { phoneNumber: '+4915112345678' } },
      ],
    })
    enqueue({ text: 'Found your Barcelona Long Weekend.' })

    const ctx = makeCtx()
    const agent = new GeminiAgent({ apiKey: 'test' })
    const log = await agent.send('look me up', ctx)

    expect(log.toolCalls.map((t) => t.name)).toEqual(['getTripByPhone'])
    expect(log.assistant).toBe('Found your Barcelona Long Weekend.')
    expect(ctx.apiClient.getTripByPhone).toHaveBeenCalledWith(
      '+4915112345678',
    )
    expect(ctx.tripId).toBe('trip-demo-bcn')
  })

  it('surfaces tool errors as function-call output errors and recovers', async () => {
    enqueue({
      toolCalls: [
        { name: 'quoteHotelCheckInChange', args: { newCheckInDate: 'x' } },
      ],
    })
    enqueue({ text: "Couldn't quote — let me try a different date." })

    const ctx = makeCtx()
    const agent = new GeminiAgent({ apiKey: 'test' })
    const log = await agent.send('move it', ctx)

    expect(log.toolCalls[0]?.result).toMatchObject({
      error: expect.stringMatching(/tripId/),
    })
    expect(log.assistant).toMatch(/different date/)
  })

  it('returns a graceful message if the model loops past the cap', async () => {
    for (let i = 0; i < 20; i++) {
      enqueue({
        toolCalls: [{ name: 'searchTravelContext', args: { query: 'hi' } }],
      })
    }
    const agent = new GeminiAgent({ apiKey: 'test' })
    const log = await agent.send('loop forever', makeCtx())
    expect(log.assistant).toMatch(/cap/)
  })
})
