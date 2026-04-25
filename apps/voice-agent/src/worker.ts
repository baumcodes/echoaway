import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
loadEnv({ path: resolve(__dirname, '../../../.env') })

import {
  cli,
  defineAgent,
  voice,
  WorkerOptions,
  type JobContext,
} from '@livekit/agents'

const E = voice.AgentSessionEventTypes
import { beta, LLM as GoogleLLM } from '@livekit/agents-plugin-google'
import * as aiCoustics from '@livekit/plugins-ai-coustics'
import { createApiClient } from '@echoaway/app'
import { buildLivekitToolCtx } from './agent/livekit-tools.js'
import { SYSTEM_PROMPT } from './agent/system-prompt.js'
import { computeAudioMetric } from './agent/audio-metric.js'
import { GradiumSTT, GradiumTTS } from './gradium/index.js'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GRADIUM_API_KEY = process.env.GRADIUM_API_KEY
const GRADIUM_VOICE_UID = process.env.GRADIUM_VOICE_UID
const USE_GRADIUM_VOICE = process.env.USE_GRADIUM_VOICE === 'true'

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

    // Phase 6: ai-coustics speech enhancement on the input pipeline.
    // The Quail Voice Focus model isolates the foreground speaker; a
    // 0.8 enhancement level matches the plugin's recommendation for
    // optimal word-error-rate on challenging data (see
    // docs/ai-coustics/livekit-quickstart.md).
    const noiseCancellation = aiCoustics.audioEnhancement({
      model: 'quailVfL',
      modelParameters: { enhancementLevel: 0.8 },
      vadSettings: {
        speechHoldDuration: 0.03,
        sensitivity: 6.0,
        minimumSpeechDuration: 0.0,
      },
    })

    const { session, backbone } = buildAgentSession()
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
      `[voice-agent worker] session ready · backbone=${backbone} · tripId=${tripId} sessionId=${sessionId} · ai-coustics=quailVfL@0.8 · scenario=${scenario}`,
    )

    // 3-piece cold-start mitigation. The ai-coustics VAD piggy-backs on
    // the audio-enhancement model's per-frame metadata, so it can't
    // fire until the enhancement model has processed the first ~1-2 s
    // of audio. Until VAD fires, AgentSession holds frames back from
    // STT — so anything the user says in those first seconds is
    // silently dropped. Greeting the user immediately solves both
    // halves of that problem: (a) the input pipeline warms up while
    // we speak, and (b) the user has a clear "I'm listening" cue and
    // naturally waits before replying.
    //
    // Use `generateReply` (not `say`) so the wording follows the
    // system prompt — persona, brand name, "ask for phone number"
    // hint, etc. all stay authoritative in one place.
    //
    // Gemini Live runs its own server-side VAD with no warmup, so we
    // skip the greeting on that path to keep the existing behavior.
    if (backbone === 'gradium-3-piece') {
      session.generateReply({
        instructions:
          'Open the conversation. Greet the traveler briefly per your persona and ask whatever question you would normally ask first to load their trip.',
        allowInterruptions: true,
      })
    }

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

/**
 * Constructs the AgentSession backbone in one of two shapes,
 * gated by USE_GRADIUM_VOICE:
 *
 * 1. **`gradium-3-piece`** (USE_GRADIUM_VOICE=true) — classic pipeline
 *    `{ llm: Gemini, stt: Gradium, tts: Gradium }`. Each leg is its
 *    own websocket, so we get a real Gradium STT + TTS integration
 *    for the side challenge. AgentSession needs an explicit VAD for
 *    turn-taking (Gemini is text-only here), so we attach
 *    `aiCoustics.vad()`.
 *
 * 2. **`gemini-realtime`** (USE_GRADIUM_VOICE unset / false) — the
 *    Phase-5 fallback. Gemini Live's `RealtimeModel` handles audio in
 *    + LLM + audio out as one websocket; there are no STT / TTS slots.
 *    Server-side VAD is built into Gemini Live, so we deliberately
 *    skip `aiCoustics.vad()` (it would intercept frames before
 *    Gemini's input-speech events fire and trip the user-away
 *    timeout).
 *
 * Both branches share the same `Agent` definition (instructions +
 * tools) — only the audio + LLM substrate changes. Switching back is
 * a one-line env flip with no rebuild.
 */
function buildAgentSession(): {
  session: voice.AgentSession
  backbone: 'gradium-3-piece' | 'gemini-realtime'
} {
  if (USE_GRADIUM_VOICE) {
    if (!GRADIUM_API_KEY || !GRADIUM_VOICE_UID) {
      throw new Error(
        '[voice-agent worker] USE_GRADIUM_VOICE=true but GRADIUM_API_KEY / GRADIUM_VOICE_UID missing — set them in /.env',
      )
    }
    const llm = new GoogleLLM({
      apiKey: GEMINI_API_KEY,
      // Tool calling on a fast non-realtime model is rock-solid; pick
      // the latest 2.5-flash for low-latency, high-throughput function
      // calling. Swappable to any plugin model id without code change.
      model: 'gemini-2.5-flash',
    })
    const sttPlugin = new GradiumSTT({
      apiKey: GRADIUM_API_KEY,
    })
    const ttsPlugin = new GradiumTTS({
      apiKey: GRADIUM_API_KEY,
      voiceId: GRADIUM_VOICE_UID,
    })
    const session = new voice.AgentSession({
      llm,
      stt: sttPlugin,
      tts: ttsPlugin,
      vad: aiCoustics.vad(),
    })
    return { session, backbone: 'gradium-3-piece' }
  }

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
  const realtime = new beta.realtime.RealtimeModel({
    apiKey: GEMINI_API_KEY,
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    voice: 'Aoede',
    instructions: SYSTEM_PROMPT,
  })
  const session = new voice.AgentSession({ llm: realtime })
  return { session, backbone: 'gemini-realtime' }
}

cli.runApp(new WorkerOptions({ agent: __filename }))
