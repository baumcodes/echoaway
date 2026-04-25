/**
 * Voice-agent feature flags & tunable knobs — single source of truth.
 *
 * Anything that's a *behavior choice* (turn-taking strategy, model
 * selection, debug fillers) lives here, not in `.env`. Restart the
 * worker to pick up changes.
 *
 * What stays in `.env`: secrets (API keys), connection URLs, anything
 * a deployment environment needs to override (`BACKEND_URL`,
 * `LIVEKIT_URL`, etc.). Behavior toggles do not — they're code.
 *
 * Add a new flag? Add it here with a clear comment and a sensible
 * default, then import it where you need it. Don't reach for
 * `process.env` for behavior knobs.
 */

// ─────────────────────────────────────────────────────────────────
// Voice backbone
// ─────────────────────────────────────────────────────────────────

/**
 * Picks the audio + LLM substrate inside `buildAgentSession()`.
 *
 * - `'gradium-3-piece'` — `{ llm: Gemini text, stt: GradiumSTT, tts: GradiumTTS }`.
 *   Real Gradium STT + TTS integration (the hackathon's Gradium
 *   side-challenge target). Slightly higher latency than the
 *   realtime path because audio takes two extra hops, but unlocks
 *   the ambience track, custom voices, and the prompt-driven
 *   filler/cadence work.
 * - `'gemini-realtime'` — Gemini Live `RealtimeModel` (audio in +
 *   LLM + audio out as one WebSocket). Fastest end-to-end, but
 *   replaces both Gradium plugins, so the side-challenge integration
 *   is bypassed.
 *
 * Default: `'gradium-3-piece'` — that's the path the rest of the
 * Phase-7 work assumes.
 */
export const VOICE_BACKBONE: 'gradium-3-piece' | 'gemini-realtime' =
  'gradium-3-piece'

// ─────────────────────────────────────────────────────────────────
// LLM model
// ─────────────────────────────────────────────────────────────────

/**
 * Model id for the text-LLM slot in the 3-piece pipeline.
 *
 * - `'gemini-2.0-flash'` — generous free-tier quota (~1500 req/day),
 *   reliable tool calling. Safest hackathon default.
 * - `'gemini-2.5-flash-lite'` — fastest 2.5 family (~150-300 ms
 *   TTFT). Recommended once Tier-1 billing is enabled.
 * - `'gemini-2.5-flash'` — heavier 2.5; higher quality but only 20
 *   req/day on free tier.
 *
 * Ignored when `VOICE_BACKBONE === 'gemini-realtime'` — the realtime
 * model is hard-coded inside `buildAgentSession()` because it lives
 * in a different plugin slot.
 */
export const LLM_MODEL: string = 'gemini-3-flash-preview'

// ─────────────────────────────────────────────────────────────────
// Programmatic conversation behaviors
// ─────────────────────────────────────────────────────────────────

/**
 * After every tool call that returned `isError`, watch for the agent
 * ending its turn without resolving. If it does, fire a
 * `session.generateReply()` with explicit "retry or report
 * specifically" instructions — the safety net for when the LLM says
 * "system error, please bear with me" and stops.
 *
 * Off by default: this listens on `AgentStateChanged → 'listening'`
 * and can race with normal turn-taking when paired with slow tools
 * or mid-stream LLM errors. Validate against your specific setup
 * before enabling.
 */
export const AUTO_CONTINUE_ON_TOOL_ERROR = true

/**
 * When a single tool's `execute()` runs longer than
 * {@link SLOW_TOOL_FILLER_MS}, fire a programmatic
 * `session.say(<random filler>)` so the traveler doesn't sit in
 * silence. Pool defined in `agent/conversation-fillers.ts`.
 *
 * Off by default for the same race reasons as
 * {@link AUTO_CONTINUE_ON_TOOL_ERROR} — the filler can collide with
 * the LLM's own queued speech.
 */
export const SLOW_TOOL_FILLER = true

/** Threshold in ms before {@link SLOW_TOOL_FILLER} fires. */
export const SLOW_TOOL_FILLER_MS = 3500

/**
 * The web UI's "Confirm change" button hits the same backend mutation
 * the agent's `confirmHotelCheckInChange` tool would. Without this,
 * a UI tap goes through silently and the agent keeps waiting on the
 * user (or re-prompts awkwardly).
 *
 * When ON, the worker polls `apiClient.pollEvents({ tripId, since })`
 * for `change_confirmed` events and, if one arrives that the agent
 * didn't initiate, fires a brief `generateReply()` so the agent
 * acknowledges the tap.
 *
 * Default: ON — the natural UX after the prompt fix that lets the
 * traveler either tap or speak.
 */
export const UI_CONFIRM_ACK = true

/** Poll interval in ms for {@link UI_CONFIRM_ACK}. */
export const UI_CONFIRM_ACK_POLL_MS = 1000

/**
 * Debounce window in ms used by {@link UI_CONFIRM_ACK} to tell
 * "agent just called confirm" apart from "user tapped Confirm in the
 * UI". A `change_confirmed` event arriving inside this window after
 * the agent's own `confirmHotelCheckInChange` tool call is
 * considered the agent's own echo and ignored.
 */
export const UI_CONFIRM_ACK_DEBOUNCE_MS = 3000

// ─────────────────────────────────────────────────────────────────
// Audio / ambience
// ─────────────────────────────────────────────────────────────────

/**
 * Path (relative to `apps/voice-agent`) of the pre-rendered ambience
 * loop. Built by `scripts/build-ambience.sh`. Published as a second
 * audio track when {@link VOICE_BACKBONE} is `'gradium-3-piece'`.
 */
export const AMBIENCE_PCM_RELATIVE_PATH =
  '../fixtures/ambient-office-48k-mono.s16le'

// ─────────────────────────────────────────────────────────────────
// Audio intelligence metric defaults
// ─────────────────────────────────────────────────────────────────

/**
 * Default scenario tag persisted on `VoiceSession.audioMetric`. The
 * web client can override via room-token metadata in a future
 * iteration.
 */
export const DEFAULT_AUDIO_METRIC_SCENARIO:
  | 'clean'
  | 'airport_noise'
  | 'cafe_noise'
  | 'street_noise' = 'airport_noise'
