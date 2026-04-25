import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
loadEnv({ path: resolve(__dirname, '../../../.env') })

import { cli, defineAgent, voice, WorkerOptions, type JobContext } from '@livekit/agents'

const E = voice.AgentSessionEventTypes
import { beta } from '@livekit/agents-plugin-google'
import * as aiCoustics from '@livekit/plugins-ai-coustics'
import { createApiClient } from '@echoaway/app'
import { buildLivekitToolCtx } from './agent/livekit-tools.js'
import { SYSTEM_PROMPT } from './agent/system-prompt.js'
import { computeAudioMetric } from './agent/audio-metric.js'

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
 * Phase 6 inserts ai-coustics speech enhancement into the input audio
 * pipeline via `inputOptions.noiseCancellation` so the agent receives
 * cleaned audio even when the user is in a noisy environment (the
 * "voice AI in the wild" track angle). Plugin runs locally; only
 * LiveKit Cloud auth is required.
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
    // Whether the client signalled a noisy scenario (used for the
    // audio-intelligence metric scenario field). We default to
    // `airport_noise` because that's the demo's storyline, but the
    // web app can override via metadata.scenario in a future iteration.
    const scenario = (metadata.scenario as
      | 'clean'
      | 'airport_noise'
      | 'cafe_noise'
      | 'street_noise'
      | undefined) ?? 'airport_noise'

    const ourToolCtx = { apiClient, sessionId, tripId }
    const toolCtx = buildLivekitToolCtx(ourToolCtx)

    // Picking the Live model is a moving target — Google sunsets and
    // renames bidiGenerateContent models on a quarterly cadence:
    //   2025-10-20  gemini-2.5-flash-preview-native-audio-dialog       ✗
    //   2025-12-09  gemini-2.0-flash-exp                                ✗
    //   2025-12-09  gemini-2.0-flash-live-001                           ✗
    //   2025-12-09  gemini-live-2.5-flash-preview                       ✗
    //   …
    // The two models active for AI Studio API keys (v1beta endpoint,
    // i.e. `GEMINI_API_KEY` rather than Vertex) as of April 2026:
    //   • gemini-3.1-flash-live-preview                  (2026-03-26, newest)
    //   • gemini-2.5-flash-native-audio-preview-12-2025  (2025-12-12, plugin default)
    // Names like `gemini-live-2.5-flash-native-audio` only resolve via
    // Vertex (`*-aiplatform.googleapis.com`), so they 1008-close on the
    // AI Studio websocket.
    //
    // Picked the December model — it has the most real-world flight
    // time for function calling. If it starts dropping connections
    // mid-tool-call (the recurring failure mode of these previews),
    // step UP to `gemini-3.1-flash-live-preview`. Plugin allowlist:
    //   node_modules/@livekit/agents-plugin-google/.../api_proto.d.ts
    //
    // Phase 7 sidesteps all this churn by swapping to the 3-piece
    // `{ llm, stt, tts }` pipeline backed by Gradium.
    const realtime = new beta.realtime.RealtimeModel({
      apiKey: GEMINI_API_KEY,
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
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

    // Phase 6: ai-coustics speech enhancement on the input pipeline.
    // The Quail Voice Focus model isolates the foreground speaker; a
    // 0.8 enhancement level matches the plugin's recommendation for
    // optimal word-error-rate on challenging data (see
    // docs/ai-coustics/livekit-quickstart.md).
    //
    // Note: the plugin's quickstart adds `vad: aiCoustics.vad()` to
    // the AgentSession — that's for the 3-piece `{ llm, stt, tts }`
    // pipeline. With `RealtimeModel`, Gemini Live runs its own
    // server-side VAD and emits input-speech events for AgentSession
    // to track user activity. Adding aicVad on top intercepts frames
    // before those events fire, which trips the user-away timeout
    // after 15s of "silence" even when the user is talking. So we
    // skip it here and only attach the audio-enhancement FrameProcessor
    // (which runs in the input pipeline irrespective of VAD choice).
    const noiseCancellation = aiCoustics.audioEnhancement({
      model: 'quailVfL',
      modelParameters: { enhancementLevel: 0.8 },
      vadSettings: {
        speechHoldDuration: 0.03,
        sensitivity: 6.0,
        minimumSpeechDuration: 0.0,
      },
    })

    const session = new voice.AgentSession({ llm: realtime })
    // Telemetry: surface the events that drive turn detection so future
    // debug sessions don't have to read the SDK source. Most pertinent
    // for diagnosing "agent never replies" — `user_input_transcribed`
    // tells you whether Gemini Live decoded any speech at all, and
    // `user_state_changed` tracks the AgentSession's internal idea of
    // whether the user is "talking" / "listening" / "away".
    // The Agents framework auto-publishes both user and agent
    // transcripts to the LiveKit room as streaming `TranscriptionReceived`
    // segments (default `transcriptionEnabled: true`). The web client
    // subscribes to `RoomEvent.TranscriptionReceived` directly — no
    // backend roundtrip needed, partials stream as Gemini generates.
    // We just keep these as console telemetry for diagnosing
    // "agent never replies" / turn-detection issues.
    session.on(E.UserInputTranscribed, (ev) =>
      console.log('[voice-agent worker] user_input_transcribed', ev),
    )
    session.on(E.UserStateChanged, (ev) =>
      console.log('[voice-agent worker] user_state_changed', ev),
    )
    session.on(E.AgentStateChanged, (ev) =>
      console.log('[voice-agent worker] agent_state_changed', ev),
    )
    session.on(E.Error, (ev) =>
      console.error('[voice-agent worker] session error', ev),
    )

    await session.start({
      agent: new voice.Agent({
        instructions: SYSTEM_PROMPT,
        tools: toolCtx,
      }),
      room: ctx.room,
      inputOptions: {
        noiseCancellation,
      },
    })

    console.log(
      `[voice-agent worker] session ready · tripId=${tripId} sessionId=${sessionId} · ai-coustics=quailVfL@0.8 · scenario=${scenario}`,
    )

    ctx.addShutdownCallback(async () => {
      // Best-effort shutdown logging + audio metric. If the trip /
      // VoiceSession was wiped mid-call (e.g. a demo `Reset trip`),
      // the FK is gone and the backend will 500 — that's expected,
      // not a worker bug.
      try {
        const metric = await computeAudioMetric({
          apiClient,
          tripId,
          sessionId,
          scenario,
          noiseCancellationEnabled: true,
        })
        await apiClient.setVoiceSessionAudioMetric(sessionId, metric)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[voice-agent worker] audio-metric write failed (non-fatal): ${msg}`,
        )
      }
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
  scenario?: string
} {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as {
      tripId?: string
      sessionId?: string
      scenario?: string
    }
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
