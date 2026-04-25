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
import { AmbiencePublisher } from './ambience/ambience-publisher.js'
import {
  autoContinueInstructions,
  pickRandom,
  slowToolFillers,
} from './agent/conversation-fillers.js'
import {
  AMBIENCE_PCM_RELATIVE_PATH,
  AUTO_CONTINUE_ON_TOOL_ERROR,
  DEFAULT_AUDIO_METRIC_SCENARIO,
  LLM_MODEL,
  SLOW_TOOL_FILLER,
  SLOW_TOOL_FILLER_MS,
  UI_CONFIRM_ACK,
  UI_CONFIRM_ACK_DEBOUNCE_MS,
  UI_CONFIRM_ACK_POLL_MS,
  VOICE_BACKBONE,
} from './config/feature-flags.js'

// Connection / secrets stay in env — these are deployment-specific
// or sensitive and should never live in checked-in code. Feature
// behavior toggles live in `./config/feature-flags.ts` instead.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GRADIUM_API_KEY = process.env.GRADIUM_API_KEY
const GRADIUM_VOICE_UID = process.env.GRADIUM_VOICE_UID
const AMBIENCE_PCM_PATH = resolve(__dirname, AMBIENCE_PCM_RELATIVE_PATH)

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
    // audio-intelligence metric scenario field). The web client can
    // override via token metadata; otherwise the default lives in
    // `feature-flags.ts` so the demo's storyline is configurable in
    // one place.
    const scenario = (metadata.scenario as
      | 'clean'
      | 'airport_noise'
      | 'cafe_noise'
      | 'street_noise'
      | undefined) ?? DEFAULT_AUDIO_METRIC_SCENARIO

    const ourToolCtx = { apiClient, sessionId, tripId }
    // sessionRef is filled in once buildAgentSession() returns. Both
    // the slow-tool callback and the auto-continue listener (below)
    // need to call back into the session, but the session can't be
    // built until after the toolCtx is in hand — Agent → tools is set
    // at session.start time.
    const sessionRef: { current: voice.AgentSession | null } = {
      current: null,
    }
    const toolCtx = buildLivekitToolCtx(ourToolCtx, {
      slowToolThresholdMs: SLOW_TOOL_FILLER_MS,
      // Only attach the filler callback when the env flag is set.
      // Otherwise we don't even start the timer — zero overhead and
      // zero risk of interfering with turn-taking.
      onSlowToolCall: SLOW_TOOL_FILLER
        ? ({ toolName, elapsedMs }) => {
            const session = sessionRef.current
            if (!session) return
            const filler = pickRandom(slowToolFillers)
            console.log(
              `[voice-agent worker] slow tool · ${toolName} · ${elapsedMs}ms · filler="${filler}"`,
            )
            try {
              // addToChatCtx=false: this is filler the LLM didn't ask
              // for; adding it to chat context would confuse the next
              // reply.
              session.say(filler, {
                allowInterruptions: false,
                addToChatCtx: false,
              })
            } catch (err) {
              console.warn(
                `[voice-agent worker] slow-tool filler say() failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          }
        : undefined,
    })

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
    sessionRef.current = session

    // Auto-continue safety net (opt-in via AUTO_CONTINUE_ON_TOOL_ERROR).
    // When the LLM ends a turn after a tool error without resolving
    // (e.g. "system error, please bear with me" then stops), fire a
    // follow-up generateReply with explicit repair instructions.
    //
    // Why opt-in: this listens on AgentStateChanged → 'listening' and
    // can race with normal turn-taking when paired with slow tools or
    // mid-stream LLM errors. Off by default until validated.
    //
    // Guards (when enabled):
    //   • only fire once per user turn (`autoContinueArmed`) so we
    //     don't loop if the retry also fails
    //   • re-arm on user_input_transcribed=true so each new user turn
    //     gets a fresh attempt
    if (AUTO_CONTINUE_ON_TOOL_ERROR) {
      let autoContinueArmed = true
      let lastTurnHadToolError = false
      session.on(E.UserInputTranscribed, (ev) => {
        if (ev.isFinal) {
          autoContinueArmed = true
          lastTurnHadToolError = false
        }
      })
      session.on(E.FunctionToolsExecuted, (ev) => {
        const failed = ev.functionCallOutputs.filter((o) => o.isError)
        if (failed.length === 0) {
          lastTurnHadToolError = false
          return
        }
        lastTurnHadToolError = true
        console.warn(
          `[voice-agent worker] tool error(s) in turn:`,
          failed.map((o) => ({ name: o.name, output: o.output.slice(0, 200) })),
        )
      })
      session.on(E.AgentStateChanged, (ev) => {
        // Once the agent stops speaking and is back to listening,
        // check whether we left the user hanging on a tool error. If
        // so, kick the LLM back into action with a repair instruction.
        if (
          ev.newState === 'listening' &&
          lastTurnHadToolError &&
          autoContinueArmed
        ) {
          autoContinueArmed = false
          const instructions = pickRandom(autoContinueInstructions)
          console.log(
            '[voice-agent worker] auto-continue · firing generateReply for tool-error repair',
          )
          try {
            session.generateReply({
              instructions,
              allowInterruptions: true,
            })
          } catch (err) {
            console.warn(
              `[voice-agent worker] auto-continue generateReply failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      })
    }

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

    // UI confirm acknowledgment. The agent and the web UI share one
    // confirm endpoint, so a tap on "Confirm change" mutates the
    // booking exactly the same way the agent's `confirmHotelCheckInChange`
    // tool would. The agent isn't notified about the tap on its own,
    // though — without this it would either go silent (if it was
    // waiting on the user) or re-prompt awkwardly. We poll the backend
    // for `change_confirmed` events and, when one arrives that we
    // didn't initiate ourselves, fire a brief generateReply so the
    // agent acknowledges the tap. The 3-second debounce window
    // distinguishes "agent just called confirm" from "user tapped".
    let uiAckPollHandle: ReturnType<typeof setInterval> | null = null
    if (UI_CONFIRM_ACK) {
      let lastAgentConfirmAt = 0
      let lastSeenEventAt = new Date().toISOString()
      session.on(E.FunctionToolsExecuted, (ev) => {
        for (const call of ev.functionCalls ?? []) {
          if (call.name === 'confirmHotelCheckInChange') {
            lastAgentConfirmAt = Date.now()
          }
        }
      })
      uiAckPollHandle = setInterval(async () => {
        try {
          const events = await apiClient.pollEvents({
            tripId,
            since: lastSeenEventAt,
          })
          if (events.length === 0) return
          // Advance the cursor to just past the newest event so we
          // don't re-deliver on the next tick.
          const newest = events[events.length - 1]
          if (newest) lastSeenEventAt = newest.createdAt
          for (const evt of events) {
            if (evt.type !== 'change_confirmed') continue
            const sinceAgent = Date.now() - lastAgentConfirmAt
            if (sinceAgent < UI_CONFIRM_ACK_DEBOUNCE_MS) {
              // Within debounce window — the agent just called confirm,
              // this is its own echo, not a UI tap.
              continue
            }
            console.log(
              '[voice-agent worker] UI confirm detected → asking agent to acknowledge',
            )
            try {
              session.generateReply({
                instructions:
                  'The traveler just tapped Confirm in the app to apply the change. Briefly acknowledge that it is done — one short sentence. Do not call any tools.',
                allowInterruptions: true,
              })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              console.warn(
                `[voice-agent worker] UI confirm ack failed (non-fatal): ${msg}`,
              )
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(
            `[voice-agent worker] UI confirm poller failed (non-fatal): ${msg}`,
          )
        }
      }, UI_CONFIRM_ACK_POLL_MS)
    }

    // Ambience: publish a second audio track that loops a pre-rendered
    // office-background PCM file. The web client subscribes to all of
    // the agent's tracks; WebRTC mixes ambience + TTS at the receiver,
    // so the agent always sounds like it's calling from a busy
    // concierge desk — even during silent gaps between turns.
    //
    // 3-piece path only: Gemini Live publishes its own server-side
    // audio and would fight with a second track for echo cancellation
    // budget, and the user can't hear ambience from the agent
    // realistically anyway when the model is doing audio-out itself.
    let ambience: AmbiencePublisher | null = null
    if (backbone === 'gradium-3-piece') {
      try {
        ambience = AmbiencePublisher.fromFile(AMBIENCE_PCM_PATH)
        await ambience.start(ctx.room)
        console.log('[voice-agent worker] ambience track published')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[voice-agent worker] ambience publish failed (non-fatal): ${msg}`,
        )
        ambience = null
      }
    }

    ctx.addShutdownCallback(async () => {
      if (uiAckPollHandle) {
        clearInterval(uiAckPollHandle)
        uiAckPollHandle = null
      }
      if (ambience) {
        try {
          await ambience.stop()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(
            `[voice-agent worker] ambience stop failed (non-fatal): ${msg}`,
          )
        }
      }
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
 * Constructs the AgentSession backbone, picking the audio + LLM
 * substrate from {@link VOICE_BACKBONE} in
 * `./config/feature-flags.ts`:
 *
 * 1. **`'gradium-3-piece'`** — classic pipeline
 *    `{ llm: Gemini text, stt: Gradium, tts: Gradium }`. Each leg is
 *    its own websocket, so we get a real Gradium STT + TTS
 *    integration for the side challenge. AgentSession needs an
 *    explicit VAD for turn-taking (Gemini is text-only here), so we
 *    attach `aiCoustics.vad()`.
 *
 * 2. **`'gemini-realtime'`** — Gemini Live `RealtimeModel` handles
 *    audio in + LLM + audio out as one websocket; there are no STT /
 *    TTS slots. Server-side VAD is built into Gemini Live, so we
 *    deliberately skip `aiCoustics.vad()` (it would intercept frames
 *    before Gemini's input-speech events fire and trip the user-away
 *    timeout).
 *
 * Both branches share the same `Agent` definition (instructions +
 * tools) — only the audio + LLM substrate changes.
 */
function buildAgentSession(): {
  session: voice.AgentSession
  backbone: 'gradium-3-piece' | 'gemini-realtime'
} {
  if (VOICE_BACKBONE === 'gradium-3-piece') {
    if (!GRADIUM_API_KEY || !GRADIUM_VOICE_UID) {
      throw new Error(
        '[voice-agent worker] VOICE_BACKBONE=gradium-3-piece but GRADIUM_API_KEY / GRADIUM_VOICE_UID missing — set them in /.env',
      )
    }
    const llm = new GoogleLLM({
      apiKey: GEMINI_API_KEY,
      model: LLM_MODEL,
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
