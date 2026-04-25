import { type APIConnectOptions, tts } from '@livekit/agents'
import { AudioFrame } from '@livekit/rtc-node'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

const GRADIUM_TTS_URL = 'wss://api.gradium.ai/api/speech/tts'
// Gradium PCM output: 48 kHz mono 16-bit chunks of 3840 samples (80 ms).
const GRADIUM_SAMPLE_RATE = 48_000
const GRADIUM_NUM_CHANNELS = 1

export interface GradiumTTSOptions {
  apiKey: string
  voiceId: string
  /** Gradium TTS model name. Defaults to "default". */
  modelName?: string
  /** Override the WebSocket endpoint (mostly for testing). */
  endpoint?: string
}

/**
 * Custom LiveKit Agents TTS plugin backed by Gradium's WebSocket TTS.
 *
 * Phase 7 of PLAN.md — paired with `GradiumSTT` to replace Gemini
 * Live's all-in-one realtime model with the classic 3-piece
 * `{ llm, stt, tts }` voice pipeline.
 */
export class GradiumTTS extends tts.TTS {
  label = 'gradium.TTS'
  readonly #options: Required<GradiumTTSOptions>

  constructor(options: GradiumTTSOptions) {
    super(GRADIUM_SAMPLE_RATE, GRADIUM_NUM_CHANNELS, { streaming: true })
    this.#options = {
      modelName: 'default',
      endpoint: GRADIUM_TTS_URL,
      ...options,
    }
  }

  override get model(): string {
    return this.#options.modelName
  }

  override get provider(): string {
    return 'gradium'
  }

  synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ): tts.ChunkedStream {
    return new GradiumChunkedStream(text, this, this.#options, connOptions, abortSignal)
  }

  stream(_options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    return new GradiumSynthesizeStream(this, this.#options)
  }
}

class GradiumSynthesizeStream extends tts.SynthesizeStream {
  label = 'gradium.SynthesizeStream'
  readonly #options: Required<GradiumTTSOptions>

  constructor(parent: GradiumTTS, options: Required<GradiumTTSOptions>) {
    super(parent)
    this.#options = options
  }

  protected async run(): Promise<void> {
    let segmentText = ''
    const synth = async (text: string) => {
      await synthesizeSegment({
        text,
        options: this.#options,
        requestId: randomUUID(),
        segmentId: randomUUID(),
        push: (audio) => this.queue.put(audio),
      })
    }
    for await (const item of this.input) {
      if (item === tts.SynthesizeStream.FLUSH_SENTINEL) {
        if (segmentText.trim().length === 0) continue
        await synth(segmentText)
        segmentText = ''
        continue
      }
      segmentText += item
    }

    if (segmentText.trim().length > 0) {
      await synth(segmentText)
    }

    this.queue.put(tts.SynthesizeStream.END_OF_STREAM)
  }
}

class GradiumChunkedStream extends tts.ChunkedStream {
  label = 'gradium.ChunkedStream'
  readonly #options: Required<GradiumTTSOptions>

  constructor(
    text: string,
    parent: GradiumTTS,
    options: Required<GradiumTTSOptions>,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ) {
    super(text, parent, connOptions, abortSignal)
    this.#options = options
  }

  protected async run(): Promise<void> {
    await synthesizeSegment({
      text: this.inputText,
      options: this.#options,
      requestId: randomUUID(),
      segmentId: randomUUID(),
      push: (audio) => this.queue.put(audio),
    })
  }
}

/**
 * Open one Gradium TTS websocket for the supplied text, stream audio
 * chunks back via `push`, and close cleanly. Each segment uses its
 * own websocket because Gradium closes the connection after
 * `end_of_stream` — re-opening per segment keeps the state machine
 * simple and is fine for hackathon latency budgets (TTFB < 300 ms per
 * the Gradium docs).
 */
async function synthesizeSegment({
  text,
  options,
  requestId,
  segmentId,
  push,
}: {
  text: string
  options: Required<GradiumTTSOptions>
  requestId: string
  segmentId: string
  push: (audio: tts.SynthesizedAudio) => void
}): Promise<void> {
  const ws = new WebSocket(options.endpoint, {
    headers: { 'x-api-key': options.apiKey },
  })

  await waitForOpen(ws)

  ws.send(
    JSON.stringify({
      type: 'setup',
      model_name: options.modelName,
      voice_id: options.voiceId,
      output_format: 'pcm',
    }),
  )

  // Wait for `ready` before queueing text. Setup errors arrive on the
  // same channel and abort the segment.
  await new Promise<void>((resolve, reject) => {
    const onMessage = (raw: WebSocket.RawData) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      if (msg.type === 'ready') {
        ws.off('message', onMessage)
        ws.off('error', onError)
        resolve()
      } else if (msg.type === 'error') {
        ws.off('message', onMessage)
        ws.off('error', onError)
        reject(
          new Error(
            `Gradium TTS setup error: ${(msg.message as string) ?? 'unknown'}`,
          ),
        )
      }
    }
    const onError = (err: Error) => {
      ws.off('message', onMessage)
      reject(err)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })

  let pendingAudio: tts.SynthesizedAudio | null = null
  let endOfStreamSeen = false

  const flushPending = (final: boolean) => {
    if (!pendingAudio) return
    pendingAudio.final = final
    push(pendingAudio)
    pendingAudio = null
  }

  await new Promise<void>((resolve, reject) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      switch (msg.type) {
        case 'audio': {
          const b64 = msg.audio as string | undefined
          if (!b64) return
          const buf = Buffer.from(b64, 'base64')
          // PCM 16-bit little-endian mono → Int16Array. Buffer's
          // underlying ArrayBuffer may be larger than the slice, so
          // clamp on (byteOffset, byteLength).
          const samples = new Int16Array(
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          )
          if (samples.length === 0) return
          // Drain whatever was buffered (final=false because more is
          // probably coming) before queueing the new chunk.
          flushPending(false)
          pendingAudio = {
            requestId,
            segmentId,
            frame: new AudioFrame(
              samples,
              GRADIUM_SAMPLE_RATE,
              GRADIUM_NUM_CHANNELS,
              samples.length,
            ),
            final: false,
          }
          break
        }
        case 'text': {
          if (pendingAudio) {
            pendingAudio.deltaText = (msg.text as string | undefined) ?? ''
          }
          break
        }
        case 'end_of_stream': {
          endOfStreamSeen = true
          flushPending(true)
          resolve()
          break
        }
        case 'error': {
          reject(
            new Error(
              `Gradium TTS error: ${(msg.message as string) ?? 'unknown'} (code ${msg.code as number | undefined})`,
            ),
          )
          break
        }
      }
    })
    ws.on('close', () => {
      if (!endOfStreamSeen) resolve()
    })
    ws.on('error', (err) => reject(err))

    ws.send(JSON.stringify({ type: 'text', text }))
    ws.send(JSON.stringify({ type: 'end_of_stream' }))
  }).finally(() => {
    flushPending(true)
    if (ws.readyState === WebSocket.OPEN) ws.close()
  })
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve()
    ws.once('open', () => resolve())
    ws.once('error', (err) => reject(err))
  })
}
