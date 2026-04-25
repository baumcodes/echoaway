import { type APIConnectOptions, asLanguageCode, stt } from '@livekit/agents'
import WebSocket from 'ws'

const LANG_EN = asLanguageCode('en')

const GRADIUM_STT_URL = 'wss://api.gradium.ai/api/speech/asr'
const GRADIUM_SAMPLE_RATE = 24_000
// Gradium's per-step VAD prediction at the 2 s lookahead horizon. Per
// the docs, > 0.5 means "the speaker has likely stopped". This is the
// only end-of-turn signal we have — the LiveKit AgentSession's own
// VAD never asks the STT to flush in vad-base turn-detection mode, so
// without server-side VAD-driven flushing the framework would sit on
// our INTERIM_TRANSCRIPT events forever and never run EOU detection.
const TURN_END_INACTIVITY_PROB = 0.5
const TURN_END_HORIZON_INDEX = 2

export interface GradiumSTTOptions {
  apiKey: string
  /** Gradium ASR model name. Defaults to "default". */
  modelName?: string
  /** Override the WebSocket endpoint (mostly for testing). */
  endpoint?: string
  /** Override the inactivity-prob threshold for end-of-turn detection. */
  turnEndProbability?: number
}

/**
 * Custom LiveKit Agents STT plugin backed by Gradium's WebSocket ASR.
 *
 * Phase 7 of PLAN.md — paired with `GradiumTTS` to replace Gemini
 * Live's all-in-one realtime model with the classic 3-piece
 * `{ llm, stt, tts }` voice pipeline.
 */
export class GradiumSTT extends stt.STT {
  label = 'gradium.STT'
  readonly #options: Required<GradiumSTTOptions>

  constructor(options: GradiumSTTOptions) {
    super({ streaming: true, interimResults: true })
    this.#options = {
      modelName: 'default',
      endpoint: GRADIUM_STT_URL,
      turnEndProbability: TURN_END_INACTIVITY_PROB,
      ...options,
    }
  }

  override get model(): string {
    return this.#options.modelName
  }

  override get provider(): string {
    return 'gradium'
  }

  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('GradiumSTT is streaming-only; use stream() instead')
  }

  stream(_options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new GradiumSpeechStream(this, this.#options)
  }
}

class GradiumSpeechStream extends stt.SpeechStream {
  label = 'gradium.SpeechStream'
  readonly #options: Required<GradiumSTTOptions>

  constructor(parent: GradiumSTT, options: Required<GradiumSTTOptions>) {
    // Tell the framework to resample input frames to 24kHz for us.
    super(parent, GRADIUM_SAMPLE_RATE)
    this.#options = options
  }

  protected async run(): Promise<void> {
    const ws = new WebSocket(this.#options.endpoint, {
      headers: { 'x-api-key': this.#options.apiKey },
    })

    await waitForOpen(ws)

    ws.send(
      JSON.stringify({
        type: 'setup',
        model_name: this.#options.modelName,
        input_format: 'pcm',
      }),
    )

    let requestId = ''
    let cumulativeText = ''
    let speechStarted = false
    let endOfStreamSeen = false
    let pendingFlushIds = 0
    // One-shot guard so we only send a flush per turn. Re-armed when
    // a new `text` chunk arrives (i.e. user starts speaking again).
    let flushArmed = true
    const turnEndProb = this.#options.turnEndProbability

    // Guard every queue write: when the AgentSession closes (e.g.
    // because the LLM blew up with a 429), the queue is closed but
    // the Gradium WS may still emit messages mid-flight. Putting into
    // a closed queue throws and kills the worker. No-op here, log,
    // and let the WS close naturally.
    const safePut = (event: stt.SpeechEvent) => {
      if (this.queue.closed || this.closed) return
      try {
        this.queue.put(event)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('Queue is closed')) throw err
      }
    }

    const emitInterim = (segment: string) => {
      safePut({
        type: stt.SpeechEventType.INTERIM_TRANSCRIPT,
        requestId,
        alternatives: [
          {
            language: LANG_EN,
            text: segment,
            startTime: this.startTimeOffset,
            endTime: this.startTimeOffset,
            confidence: 1,
          },
        ],
      })
    }

    const emitFinal = () => {
      const text = cumulativeText.trim()
      if (text.length === 0) {
        speechStarted = false
        cumulativeText = ''
        return
      }
      safePut({
        type: stt.SpeechEventType.FINAL_TRANSCRIPT,
        requestId,
        alternatives: [
          {
            language: LANG_EN,
            text,
            startTime: this.startTimeOffset,
            endTime: this.startTimeOffset,
            confidence: 1,
          },
        ],
      })
      safePut({
        type: stt.SpeechEventType.END_OF_SPEECH,
        requestId,
      })
      cumulativeText = ''
      speechStarted = false
    }

    const flushSegment = () => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (!flushArmed) return
      flushArmed = false
      pendingFlushIds += 1
      ws.send(
        JSON.stringify({ type: 'flush', flush_id: String(pendingFlushIds) }),
      )
    }

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      switch (msg.type) {
        case 'ready': {
          requestId = (msg.request_id as string | undefined) ?? requestId
          break
        }
        case 'text': {
          const segment = (msg.text as string | undefined) ?? ''
          if (!segment) break
          if (!speechStarted) {
            speechStarted = true
            safePut({
              type: stt.SpeechEventType.START_OF_SPEECH,
              requestId,
            })
          }
          // New text means the user is actively speaking — re-arm the
          // VAD-driven flush so we'll fire at the next end-of-turn.
          flushArmed = true
          cumulativeText += (cumulativeText ? ' ' : '') + segment
          emitInterim(cumulativeText)
          break
        }
        case 'step': {
          const vad = msg.vad as
            | Array<{ horizon_s: number; inactivity_prob: number }>
            | undefined
          if (!speechStarted || !flushArmed || !vad || vad.length === 0)
            break
          const horizon =
            vad[TURN_END_HORIZON_INDEX] ?? vad[vad.length - 1]
          if (horizon && horizon.inactivity_prob > turnEndProb) {
            // Server VAD says the speaker has likely stopped. Flush
            // the model — it'll respond with `flushed`, at which
            // point we emit FINAL_TRANSCRIPT and the framework runs
            // EOU detection. The `flushArmed` gate makes this a
            // one-shot per turn, so we don't double-flush mid-thought.
            flushSegment()
          }
          break
        }
        case 'flushed': {
          emitFinal()
          break
        }
        case 'end_text': {
          // Server marks the end of a text segment. If the framework
          // also flushed, `flushed` will follow shortly; otherwise this
          // is just a chunk boundary — keep accumulating.
          break
        }
        case 'end_of_stream': {
          endOfStreamSeen = true
          emitFinal()
          break
        }
        case 'error': {
          throw new Error(
            `Gradium STT error: ${(msg.message as string) ?? 'unknown'} (code ${msg.code as number | undefined})`,
          )
        }
      }
    })

    const wsClosed = new Promise<void>((resolve, reject) => {
      ws.on('close', () => resolve())
      ws.on('error', (err) => reject(err))
    })

    const pumpAudio = async () => {
      for await (const item of this.input) {
        if (item === stt.SpeechStream.FLUSH_SENTINEL) {
          flushSegment()
          continue
        }
        if (ws.readyState !== WebSocket.OPEN) break
        // item is an AudioFrame — Int16Array PCM mono (resampled to
        // 24 kHz by the framework based on neededSampleRate).
        const bytes = Buffer.from(
          item.data.buffer,
          item.data.byteOffset,
          item.data.byteLength,
        )
        ws.send(
          JSON.stringify({
            type: 'audio',
            audio: bytes.toString('base64'),
          }),
        )
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end_of_stream' }))
      }
    }

    try {
      await Promise.race([pumpAudio(), wsClosed])
      if (!endOfStreamSeen) {
        // Drain whatever the server still has queued.
        await Promise.race([
          wsClosed,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ])
      }
    } finally {
      if (ws.readyState === WebSocket.OPEN) ws.close()
      // Flush whatever we accumulated so the agent sees a final.
      emitFinal()
    }
  }
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve()
    ws.once('open', () => resolve())
    ws.once('error', (err) => reject(err))
  })
}
