import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from './client.js'

export type VoiceRoomState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; roomName: string; sessionId: string }
  | { kind: 'error'; message: string }

export type UseVoiceRoomOptions = {
  apiClient: ApiClient
  /** Identity used for the LiveKit token. Usually the traveler id. */
  identity: string
  /** Display name shown to other room participants. */
  name?: string
}

export type UseVoiceRoomResult = {
  state: VoiceRoomState
  /** Open a new VoiceSession + LK room and connect. */
  connect: (args: {
    tripId: string
    sessionId: string
    roomName: string
  }) => Promise<void>
  /** Disconnect from the current room. */
  disconnect: () => Promise<void>
  /** The agent's audio element — attach to the DOM (`audioRef={…}`) so
   *  remote audio actually plays. */
  audioRef: React.RefObject<HTMLAudioElement>
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
  const { apiClient, identity, name } = opts
  const [state, setState] = useState<VoiceRoomState>({ kind: 'idle' })
  const roomRef = useRef<Room | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

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
    setState({ kind: 'idle' })
  }, [detachAll])

  const connect = useCallback(
    async (args: { tripId: string; sessionId: string; roomName: string }) => {
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
        room.on(RoomEvent.Disconnected, () => {
          roomRef.current = null
          setState({ kind: 'idle' })
        })
        room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
          if (cs === ConnectionState.Connected) {
            setState({
              kind: 'connected',
              roomName: args.roomName,
              sessionId: args.sessionId,
            })
          }
        })

        await room.connect(url, token)
        // Publish the user's mic so the agent can hear them.
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch (err) {
        roomRef.current = null
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
    }
  }, [])

  return { state, connect, disconnect, audioRef }
}
