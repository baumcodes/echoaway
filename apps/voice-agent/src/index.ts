import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../.env') })

import { createApiClient, openVoiceSession, runDemoScript } from '@echoaway/app'
import { runCli } from './cli.js'

const DEMO_PHONE = '+4915112345678'
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'

type Mode = 'cli' | 'script' | 'help'

function modeFromArgv(argv: readonly string[]): Mode {
  const positional = argv.find((a) => !a.startsWith('--'))
  if (!positional) return 'cli'
  if (positional === 'cli') return 'cli'
  if (positional === 'script') return 'script'
  return 'help'
}

async function main() {
  const mode = modeFromArgv(process.argv.slice(2))

  if (mode === 'help') {
    console.log(`Usage:
  yarn cli              Interactive Gemini-powered chat (needs GEMINI_API_KEY)
  yarn script           Deterministic demo replay (no Gemini, no network egress)`)
    return
  }

  if (mode === 'script') {
    const apiClient = createApiClient({ baseUrl: BACKEND_URL })
    const trip = await apiClient.getTripByPhone(DEMO_PHONE)
    const ctx = await openVoiceSession(apiClient, trip.id)
    console.log(
      `[script] tripId=${trip.id} sessionId=${ctx.sessionId} backend=${BACKEND_URL}\n`,
    )
    const result = await runDemoScript(ctx)
    for (const turn of result.turns) {
      const speaker = turn.speaker === 'user' ? 'you ❯' : 'away ❯'
      console.log(`${speaker} ${turn.text}`)
      if (turn.toolCall) {
        console.log(
          `       🔧 ${turn.toolCall.name}(${JSON.stringify(turn.toolCall.args)})`,
        )
      }
    }
    return
  }

  // mode === 'cli'
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error(
      '[agent] GEMINI_API_KEY is not set. Either:\n' +
        '  1. Add it to the root .env (recommended), or\n' +
        '  2. Run `yarn script` for the deterministic Gemini-free flow.',
    )
    process.exit(1)
  }
  await runCli({
    backendUrl: BACKEND_URL,
    apiKey,
    tripPhone: DEMO_PHONE,
  })
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
