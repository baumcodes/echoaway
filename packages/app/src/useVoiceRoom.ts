import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
  type TranscriptionSegment,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from './client.js'

export type VoiceRoomState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; roomName: string; sessionId: string; noisy: boolean }
  | { kind: 'error'; message: string }

/** One segment as published by the LiveKit Agents framework — both
 *  the user's STT/realtime transcript and the agent's spoken-text
 *  output land here, streamed as they're generated. The same `id`
 *  is reused as a segment grows (interim → final), so consumers
 *  should dedupe on it. */
export type RoomTranscriptionEvent = {
  id: string
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
}

export type UseVoiceRoomOptions = {
  apiClient: ApiClient
  /** Identity used for the LiveKit token. Usually the traveler id. */
  identity: string
  /** Display name shown to other room participants. */
  name?: string
  /** Fires for every transcription segment published in the room.
   *  Role is derived from participant identity: `user` if the
   *  segment is attributed to the local participant, else `assistant`. */
  onTranscription?: (event: RoomTranscriptionEvent) => void
}

export type ConnectArgs = {
  tripId: string
  sessionId: string
  roomName: string
  /** When true, the published mic track is the user's voice MIXED with
   *  a looping ambient-noise file (`/airport-noise.mp3` from the web's
   *  `public/`). Use this to demonstrate ai-coustics speech enhancement
   *  on the agent side without needing the user to actually be in a
   *  noisy environment. Defaults to false (clean mic). */
  noisy?: boolean
}

export type UseVoiceRoomResult = {
  state: VoiceRoomState
  /** Open a new VoiceSession + LK room and connect. */
  connect: (args: ConnectArgs) => Promise<void>
  /** Disconnect from the current room. */
  disconnect: () => Promise<void>
  /** The agent's audio element — attach to the DOM (`audioRef={…}`) so
   *  remote audio actually plays. */
  audioRef: React.RefObject<HTMLAudioElement>
}

const NOISE_URL = '/airport-noise.mp3'
const NOISE_GAIN = 0.6
const VOICE_GAIN = 1.0

type NoisyMicHandle = {
  stream: MediaStream
  cleanup: () => void
}

/**
 * Build a MediaStream that is the user's microphone mixed with a
 * looping background-noise file. Used by the ai-coustics demo so the
 * agent receives a noisy input which the ai-coustics plugin then
 * cleans up server-side.
 *
 * Pure browser code — not testable in node, not pulled into mobile.
 * Returns a teardown that stops the user's mic tracks + the audio
 * context so the browser releases the mic indicator.
 */
async function buildNoisyMicStream(noiseUrl: string): Promise<NoisyMicHandle> {
  const userStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const audioCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)()

  const userSource = audioCtx.createMediaStreamSource(userStream)
  const userGain = audioCtx.createGain()
  userGain.gain.value = VOICE_GAIN

  const resp = await fetch(noiseUrl)
  if (!resp.ok) {
    throw new Error(
      `Could not fetch ${noiseUrl} (HTTP ${resp.status}). Drop a real airport-noise file at apps/web/public/airport-noise.mp3.`,
    )
  }
  const buf = await resp.arrayBuffer()
  const decoded = await audioCtx.decodeAudioData(buf)
  const noiseSource = audioCtx.createBufferSource()
  noiseSource.buffer = decoded
  noiseSource.loop = true
  const noiseGain = audioCtx.createGain()
  noiseGain.gain.value = NOISE_GAIN

  const dest = audioCtx.createMediaStreamDestination()
  userSource.connect(userGain).connect(dest)
  noiseSource.connect(noiseGain).connect(dest)
  noiseSource.start(0)

  return {
    stream: dest.stream,
    cleanup: () => {
      try {
        noiseSource.stop()
      } catch {
        /* already stopped */
      }
      userStream.getTracks().forEach((t) => t.stop())
      void audioCtx.close()
    },
  }
}

/**
 * Cross-platform wrapper around `livekit-client`. Hides the room
 * lifecycle, mic publishing, and remote audio attachment so the web
 * (and later RN, with a different track-attach strategy) can compose
 * a voice button without touching `livekit-client` directly.
 *
 * Lives in `@echoaway/app` because the orchestration is pure logic;
 * the actual `<audio>` element comes from the consuming app via
 * `audioRef`. Mobile would substitute its own audio renderer.
 */
export function useVoiceRoom(opts: UseVoiceRoomOptions): UseVoiceRoomResult {
  const { apiClient, identity, name, onTranscription } = opts
  const [state, setState] = useState<VoiceRoomState>({ kind: 'idle' })
  const roomRef = useRef<Room | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const noisyHandleRef = useRef<NoisyMicHandle | null>(null)
  // Latest callback ref so the room listener picks up renames without
  // re-binding the listener on every render.
  const onTranscriptionRef = useRef(onTranscription)
  onTranscriptionRef.current = onTranscription

  const detachAll = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        pub.track?.detach().forEach((el) => el.remove())
      }
    }
  }, [])

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    if (!room) {
      setState({ kind: 'idle' })
      return
    }
    detachAll()
    await room.disconnect()
    roomRef.current = null
    if (noisyHandleRef.current) {
      noisyHandleRef.current.cleanup()
      noisyHandleRef.current = null
    }
    setState({ kind: 'idle' })
  }, [detachAll])

  const connect = useCallback(
    async (args: ConnectArgs) => {
      // Tear down any prior connection first.
      if (roomRef.current) await disconnect()

      setState({ kind: 'connecting' })
      try {
        const { token, url } = await apiClient.mintVoiceToken({
          identity,
          name,
          room: args.roomName,
          metadata: { tripId: args.tripId, sessionId: args.sessionId },
        })

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        })
        roomRef.current = room

        room.on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            _participant: RemoteParticipant,
          ) => {
            if (track.kind !== Track.Kind.Audio) return
            const el = audioRef.current
            if (!el) return
            ;(track as RemoteAudioTrack).attach(el)
          },
        )
        // The Agents framework publishes both user and agent transcripts
        // here as they stream — interim segments share an `id` with
        // their final version, so the consumer should dedupe on that.
        room.on(
          RoomEvent.TranscriptionReceived,
          (
            segments: TranscriptionSegment[],
            participant?: Participant,
            _publication?: TrackPublication,
          ) => {
            const cb = onTranscriptionRef.current
            if (!cb) return
            const isLocal =
              participant?.identity === room.localParticipant?.identity
            for (const seg of segments) {
              cb({
                id: seg.id,
                role: isLocal ? 'user' : 'assistant',
                text: seg.text,
                isFinal: seg.final,
              })
            }
          },
        )
        room.on(RoomEvent.Disconnected, () => {
          roomRef.current = null
          if (noisyHandleRef.current) {
            noisyHandleRef.current.cleanup()
            noisyHandleRef.current = null
          }
          setState({ kind: 'idle' })
        })
        room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
          if (cs === ConnectionState.Connected) {
            setState({
              kind: 'connected',
              roomName: args.roomName,
              sessionId: args.sessionId,
              noisy: !!args.noisy,
            })
          }
        })

        await room.connect(url, token)

        if (args.noisy) {
          // Path A from PLAN.md Phase 6: mix the noise file in-browser
          // and publish the combined stream as the room's mic. The
          // agent worker's ai-coustics plugin then cleans the audio
          // up before the LLM hears it.
          try {
            const handle = await buildNoisyMicStream(NOISE_URL)
            noisyHandleRef.current = handle
            const audioTrack = handle.stream.getAudioTracks()[0]
            if (!audioTrack) {
              throw new Error('mixed stream has no audio track')
            }
            await room.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.Microphone,
              name: 'mic-noisy',
            })
          } catch (err) {
            // Fall back to a clean mic so the demo still runs.
            console.warn(
              '[useVoiceRoom] noisy mic build failed, falling back to clean mic:',
              err,
            )
            await room.localParticipant.setMicrophoneEnabled(true)
          }
        } else {
          await room.localParticipant.setMicrophoneEnabled(true)
        }
      } catch (err) {
        roomRef.current = null
        if (noisyHandleRef.current) {
          noisyHandleRef.current.cleanup()
          noisyHandleRef.current = null
        }
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not connect',
        })
      }
    },
    [apiClient, identity, name, disconnect],
  )

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect()
      roomRef.current = null
      if (noisyHandleRef.current) {
        noisyHandleRef.current.cleanup()
        noisyHandleRef.current = null
      }
    }
  }, [])

  return { state, connect, disconnect, audioRef }
}
