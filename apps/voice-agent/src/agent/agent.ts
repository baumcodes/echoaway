import { llm } from '@livekit/agents'
import { LLM as GoogleLLM } from '@livekit/agents-plugin-google'
import { type ToolContext as OurToolContext } from '@echoaway/app'
import { buildLivekitToolCtx } from './livekit-tools.js'
import { SYSTEM_PROMPT } from './system-prompt.js'

export type AgentTurnLog = {
  user?: string
  assistant?: string
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>
}

const MAX_TOOL_LOOPS = 8

/**
 * Gemini-driven agent built on `@livekit/agents-plugin-google` so the
 * LLM stays interchangeable: swap to `@livekit/agents-plugin-openai`
 * (or `-anthropic`, `-cerebras`, …) by changing the import + env key,
 * without rewriting tools, prompt, or the loop.
 *
 * Used in two modes today:
 *   - CLI (text in / text out, no audio) — what this class is wired to
 *   - Phase 6/7 voice pipeline — the same `LLM` instance gets handed to
 *     LiveKit's `VoicePipelineAgent`; this class becomes the offline
 *     fallback driver and stays useful.
 */
export class GeminiAgent {
  private readonly chatCtx: llm.ChatContext
  private readonly llmInstance: GoogleLLM

  constructor(opts: { apiKey: string; model?: string }) {
    this.llmInstance = new GoogleLLM({
      apiKey: opts.apiKey,
      model: opts.model ?? 'gemini-2.5-flash',
    })
    this.chatCtx = llm.ChatContext.empty()
    this.chatCtx.addMessage({ role: 'system', content: SYSTEM_PROMPT })
  }

  /** Send one user turn; drive the tool loop; return text + tool log. */
  async send(userMessage: string, ctx: OurToolContext): Promise<AgentTurnLog> {
    const log: AgentTurnLog = { user: userMessage, toolCalls: [] }
    this.chatCtx.addMessage({ role: 'user', content: userMessage })

    const toolCtx = buildLivekitToolCtx(ctx)

    for (let iter = 0; iter < MAX_TOOL_LOOPS; iter++) {
      const stream = this.llmInstance.chat({ chatCtx: this.chatCtx, toolCtx })

      let assistantText = ''
      const calls: llm.FunctionCall[] = []
      for await (const chunk of stream) {
        if (chunk.delta?.content) assistantText += chunk.delta.content
        if (chunk.delta?.toolCalls) calls.push(...chunk.delta.toolCalls)
      }

      if (calls.length === 0) {
        if (assistantText) {
          this.chatCtx.addMessage({
            role: 'assistant',
            content: assistantText,
          })
          log.assistant = assistantText
        }
        return log
      }

      // Persist the assistant's tool-calling turn into the chat history
      // so the next pass sees it.
      this.chatCtx.insert(calls)

      for (const call of calls) {
        const output = await llm.executeToolCall(call, toolCtx)
        this.chatCtx.insert(output)
        const parsedArgs = safeJson(call.args)
        const parsedOutput = output.isError
          ? { error: output.output }
          : safeJson(output.output)
        log.toolCalls.push({
          name: call.name,
          args: parsedArgs,
          result: parsedOutput,
        })
      }
    }

    log.assistant = '[agent loop hit its tool-call cap; ending turn]'
    return log
  }

  /** Internal — used by tests to verify history evolution. */
  _historySnapshot() {
    return this.chatCtx.items.slice()
  }
}

function safeJson(s: string): unknown {
  if (!s) return {}
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
