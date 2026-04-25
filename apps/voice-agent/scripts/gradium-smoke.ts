import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
loadEnv({ path: resolve(process.cwd(), '../../.env') })

import { initializeLogger } from '@livekit/agents'
initializeLogger({ pretty: true, level: 'info' })

import { GradiumTTS } from '../src/gradium/index.js'

const apiKey = process.env.GRADIUM_API_KEY
const voiceId = process.env.GRADIUM_VOICE_UID
if (!apiKey || !voiceId) throw new Error('missing GRADIUM_API_KEY / GRADIUM_VOICE_UID')

const tts = new GradiumTTS({ apiKey, voiceId })
const stream = tts.synthesize('Hello from EchoAway, this is a Gradium TTS smoke test.')
let chunks = 0
let totalSamples = 0
let firstTtfb: number | null = null
const t0 = Date.now()
for await (const audio of stream) {
  if (firstTtfb === null) firstTtfb = Date.now() - t0
  chunks += 1
  totalSamples += audio.frame.samplesPerChannel
}
const totalMs = Date.now() - t0
const audioSec = totalSamples / 48_000
console.log(
  `gradium TTS smoke ✓ chunks=${chunks} audioSec=${audioSec.toFixed(2)} ttfb=${firstTtfb}ms total=${totalMs}ms`,
)
