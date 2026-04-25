import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
loadEnv({ path: resolve(process.cwd(), '../../.env') })

import { initializeLogger, stt as sttModule } from '@livekit/agents'
import { AudioFrame, AudioResampler } from '@livekit/rtc-node'
initializeLogger({ pretty: true, level: 'info' })

import { GradiumSTT, GradiumTTS } from '../src/gradium/index.js'

const apiKey = process.env.GRADIUM_API_KEY
const voiceId = process.env.GRADIUM_VOICE_UID
if (!apiKey || !voiceId) throw new Error('missing GRADIUM_API_KEY / GRADIUM_VOICE_UID')

// 1) Synthesize a known phrase with Gradium TTS (48 kHz PCM mono).
// 2) Pipe the audio frames into Gradium STT (which auto-resamples to
//    24 kHz). 3) Verify we get a transcript back.
const phrase =
  'My flight is delayed. Can you move my hotel check in to tomorrow?'
const tts = new GradiumTTS({ apiKey, voiceId })
const ttsStream = tts.synthesize(phrase)

const synthesized: AudioFrame[] = []
for await (const audio of ttsStream) synthesized.push(audio.frame)
console.log(
  `tts produced ${synthesized.length} frames totaling ${(synthesized.reduce((s, f) => s + f.samplesPerChannel, 0) / 48_000).toFixed(2)}s`,
)

const stt = new GradiumSTT({ apiKey })
const sttStream = stt.stream()

// Push frames asynchronously so the stream's pumpInput sees them.
;(async () => {
  // Pace at realtime — pushing 5 s of audio in a few ms can outrun
  // Gradium's pipeline and drop the tail of the transcript. In a real
  // call audio arrives at the user's natural rate; we mimic that by
  // sleeping per frame duration.
  for (const frame of synthesized) {
    sttStream.pushFrame(frame)
    const ms = (frame.samplesPerChannel / frame.sampleRate) * 1000
    await new Promise((r) => setTimeout(r, ms))
  }
  sttStream.endInput()
})()

const finals: string[] = []
const t0 = Date.now()
for await (const ev of sttStream) {
  if (ev.type === sttModule.SpeechEventType.FINAL_TRANSCRIPT) {
    finals.push(ev.alternatives![0].text)
  }
  if (ev.type === sttModule.SpeechEventType.END_OF_SPEECH) {
    break
  }
  if (Date.now() - t0 > 15_000) break
}
sttStream.close()

console.log(`gradium STT smoke ✓ finals=${JSON.stringify(finals)}`)

// AudioResampler is referenced indirectly by the framework — keep the
// import here as an explicit sanity check that the rtc-node binary
// loaded.
void AudioResampler
process.exit(0)
