import { createApiClient, openVoiceSession } from '@echoaway/app'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { GeminiAgent } from './agent/agent.js'

export type CliOptions = {
  backendUrl: string
  apiKey: string
  tripPhone: string
  model?: string
}

/**
 * Read-eval-print loop for the agent. Boots a session, opens readline,
 * forwards each user line to Gemini, prints assistant replies + a
 * one-line summary of every tool call. Ctrl-D / "exit" / "quit" leaves.
 */
export async function runCli(opts: CliOptions): Promise<void> {
  const apiClient = createApiClient({ baseUrl: opts.backendUrl })

  // Bootstrap: load the trip first so the session creation has the right tripId.
  const trip = await apiClient.getTripByPhone(opts.tripPhone)
  const ctx = await openVoiceSession(apiClient, trip.id)
  const agent = new GeminiAgent({ apiKey: opts.apiKey, model: opts.model })

  const rl = createInterface({ input, output })
  console.log(
    `[agent] connected. tripId=${trip.id} sessionId=${ctx.sessionId}`,
  )
  console.log(`        backend=${opts.backendUrl}`)
  console.log(`        type 'exit' to quit, Ctrl-D also works.\n`)

  // Seed with a context-priming line so the agent doesn't have to ask
  // for the phone number on the first turn.
  ctx.tripId = trip.id

  try {
    while (true) {
      const line = (await rl.question('you ❯ ')).trim()
      if (!line) continue
      if (line === 'exit' || line === 'quit') break
      try {
        const log = await agent.send(line, ctx)
        for (const tc of log.toolCalls) {
          console.log(
            `      🔧 ${tc.name}(${JSON.stringify(tc.args ?? {})})`,
          )
        }
        if (log.assistant) {
          console.log(`away ❯ ${log.assistant}\n`)
        }
      } catch (err) {
        console.error(
          `[agent error]`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  } finally {
    rl.close()
  }
}
