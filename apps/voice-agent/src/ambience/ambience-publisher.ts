import { TrackPublishOptions, TrackSource } from '@livekit/rtc-ffi-bindings'
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  type Room,
} from '@livekit/rtc-node'
import { readFileSync } from 'node:fs'

/**
 * Publishes a looped ambience PCM file as a second audio track in the
 * agent's LiveKit room. The web client subscribes to all of the
 * agent's audio tracks; WebRTC mixes the ambience and the TTS for any
 * subscriber, including future mobile clients and recordings.
 *
 * The PCM source is pre-converted (see `scripts/build-ambience.sh`) to
 * the exact format we publish — 48 kHz mono signed-16-bit little-endian
 * — so we don't need an MP3 decoder at runtime, and we don't need to
 * resample on every frame.
 */
const SAMPLE_RATE = 48_000
const NUM_CHANNELS = 1
// 80 ms frames match what GradiumTTS emits and what LiveKit prefers.
const FRAME_SAMPLES = (SAMPLE_RATE * 80) / 1000
const QUEUE_SIZE_MS = 200

export class AmbiencePublisher {
  readonly #pcm: Int16Array
  #source: AudioSource | null = null
  #track: LocalAudioTrack | null = null
  #publicationSid: string | null = null
  #room: Room | null = null
  #stopped = false
  #loopTask: Promise<void> | null = null

  constructor(pcm: Int16Array) {
    if (pcm.length === 0) {
      throw new Error('AmbiencePublisher: PCM buffer is empty')
    }
    this.#pcm = pcm
  }

  /**
   * Load the pre-built PCM file from disk. Pure-sync so callers can
   * keep the worker startup path linear; the file is small (~3 MB for
   * a 30 s loop).
   */
  static fromFile(path: string): AmbiencePublisher {
    const buf = readFileSync(path)
    const samples = new Int16Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    )
    return new AmbiencePublisher(samples)
  }

  async start(room: Room, trackName = 'ambience'): Promise<void> {
    if (this.#source) throw new Error('AmbiencePublisher already started')
    this.#room = room
    this.#source = new AudioSource(SAMPLE_RATE, NUM_CHANNELS, QUEUE_SIZE_MS)
    this.#track = LocalAudioTrack.createAudioTrack(trackName, this.#source)
    const pub = await room.localParticipant!.publishTrack(
      this.#track,
      new TrackPublishOptions({
        source: TrackSource.SOURCE_UNKNOWN,
        // Disable DTX — the ambience is continuous "noise" and DTX
        // would drop chunks the encoder considers silence, defeating
        // the point. RED helps with packet loss but isn't critical.
        dtx: false,
        red: true,
      }),
    )
    this.#publicationSid = pub.sid ?? null
    this.#loopTask = this.#runLoop()
  }

  async stop(): Promise<void> {
    this.#stopped = true
    try {
      await this.#loopTask
    } catch {
      // captureFrame after close throws — expected during shutdown.
    }
    if (this.#publicationSid && this.#room?.localParticipant) {
      await this.#room.localParticipant.unpublishTrack(
        this.#publicationSid,
        true,
      )
    }
    if (this.#track) await this.#track.close(true)
    if (this.#source) await this.#source.close()
    this.#publicationSid = null
    this.#track = null
    this.#source = null
    this.#room = null
  }

  async #runLoop(): Promise<void> {
    if (!this.#source) return
    const source = this.#source
    let cursor = 0
    while (!this.#stopped) {
      const samples = new Int16Array(FRAME_SAMPLES)
      let written = 0
      while (written < FRAME_SAMPLES) {
        const remainingInLoop = this.#pcm.length - cursor
        const take = Math.min(FRAME_SAMPLES - written, remainingInLoop)
        samples.set(
          this.#pcm.subarray(cursor, cursor + take),
          written,
        )
        written += take
        cursor += take
        if (cursor >= this.#pcm.length) cursor = 0
      }
      const frame = new AudioFrame(
        samples,
        SAMPLE_RATE,
        NUM_CHANNELS,
        FRAME_SAMPLES,
      )
      // captureFrame self-paces — see audio_source.js: it tracks the
      // internal queue and resolves only when there's room. So this
      // is a natural realtime loop, no setTimeout needed.
      await source.captureFrame(frame)
    }
  }
}
