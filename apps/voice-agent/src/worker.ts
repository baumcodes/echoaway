import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
loadEnv({ path: resolve(__dirname, '../../../.env') })

import { cli, defineAgent, voice, WorkerOptions, type JobContext } from '@livekit/agents'
import { beta } from '@livekit/agents-plugin-google'
import { createApiClient } from '@echoaway/app'
import { buildLivekitToolCtx } from './agent/livekit-tools.js'
import { SYSTEM_PROMPT } from './agent/system-prompt.js'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

/**
 * LiveKit Agents worker entry. The worker registers with LiveKit Cloud
 * (using `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` from
 * the root `.env`) and dispatches an agent session whenever a
 * participant joins a matching room.
 *
 * Audio I/O comes from Gemini Live (`RealtimeModel`) — single websocket
 * for STT + LLM + TTS, no separate plugins. Tools are the same
 * `@echoaway/app` registry the CLI and the deterministic script use,
 * so a swap, a quote, or a confirm fires the same backend mutation +
 * SSE event regardless of which surface the user reaches.
 *
 * The web client passes `{ tripId, sessionId }` as participant metadata
 * when minting its token (see `apps/backend/src/voice/voice.service.ts`),
 * so the worker can build a `ToolContext` without hitting the backend
 * for resolution.
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    if (!GEMINI_API_KEY) {
      throw new Error(
        '[voice-agent worker] GEMINI_API_KEY missing — set it in /.env',
      )
    }

    await ctx.connect()

    // Wait for the (single) human participant to land so we can read
    // their token metadata. Auto-dispatch fires `entry` as soon as a
    // job request arrives; the participant joins a moment later.
    const participant = await ctx.waitForParticipant()
    const metadata = parseMetadata(participant.metadata)

    if (!metadata.tripId || !metadata.sessionId) {
      console.warn(
        `[voice-agent worker] participant ${participant.identity} joined without tripId/sessionId metadata — running with the seeded demo trip as fallback`,
      )
    }

    const apiClient = createApiClient({ baseUrl: BACKEND_URL })

    // Resolve / open a session. If the web client already opened one,
    // reuse it; otherwise fall back to the seeded demo (single-user
    // dev mode where you joined the room directly via `lk room join`).
    const { tripId, sessionId } = await resolveSession(
      apiClient,
      metadata,
    )

    const ourToolCtx = { apiClient, sessionId, tripId }
    const toolCtx = buildLivekitToolCtx(ourToolCtx)

    // Let the plugin pick its default model (`gemini-2.5-flash-native-
    // audio-preview-12-2025` for API-key auth as of plugin 1.3.0).
    // Pinning a specific model here is brittle — Live models churn
    // through preview names; the plugin's allowlist is the source of
    // truth: `node_modules/@livekit/agents-plugin-google/.../api_proto.d.ts`.
    const realtime = new beta.realtime.RealtimeModel({
      apiKey: GEMINI_API_KEY,
      voice: 'Aoede',
      instructions: SYSTEM_PROMPT,
    })
    // Phase 7: when Gradium STT + TTS land, this whole `RealtimeModel`
    // is replaced by `{ llm: LLM, stt: GradiumSTT, tts: GradiumTTS }`.
    // The RealtimeModel has no separate stt/tts slots — it's audio-in +
    // LLM + audio-out fused, so you can't bolt Gradium onto it. The
    // switch will be gated behind USE_GRADIUM_VOICE so this branch
    // remains the always-available fallback. Phase 7's PLAN block
    // documents the migration in detail.

    const session = new voice.AgentSession({ llm: realtime })
    await session.start({
      agent: new voice.Agent({
        instructions: SYSTEM_PROMPT,
        tools: toolCtx,
      }),
      room: ctx.room,
    })

    console.log(
      `[voice-agent worker] session ready · tripId=${tripId} sessionId=${sessionId}`,
    )

    ctx.addShutdownCallback(async () => {
      // Best-effort shutdown logging. If the trip / VoiceSession was
      // wiped mid-call (e.g. a demo `Reset trip`), the FK is gone and
      // the backend will 500 — that's expected, not a worker bug.
      try {
        await apiClient.createSupportLog({
          tripId,
          sessionId,
          transcript: '(transcript persisted via VoiceActionEvents)',
          summary: 'LiveKit room session closed.',
          actions: [],
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[voice-agent worker] support-log write failed (non-fatal): ${msg}`,
        )
      }
    })
  },
})

function parseMetadata(raw: string | undefined): {
  tripId?: string
  sessionId?: string
} {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as { tripId?: string; sessionId?: string }
  } catch {
    return {}
  }
}

async function resolveSession(
  apiClient: ReturnType<typeof createApiClient>,
  metadata: { tripId?: string; sessionId?: string },
): Promise<{ tripId: string; sessionId: string }> {
  if (metadata.tripId && metadata.sessionId) {
    return { tripId: metadata.tripId, sessionId: metadata.sessionId }
  }
  // Fallback for `lk room join` (no metadata): open a session against
  // the seeded demo trip so the worker is still useful in dev.
  const trip = await apiClient.getTripByPhone('+4915112345678')
  const session = await apiClient.createVoiceSession({ tripId: trip.id })
  return { tripId: trip.id, sessionId: session.id }
}

cli.runApp(new WorkerOptions({ agent: __filename }))
