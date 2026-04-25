import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVoiceRoom } from './useVoiceRoom.js'

// Minimal mock of livekit-client. We only assert the orchestration —
// token mint, Room.connect, mic publish, state transitions — not the
// real RTC plumbing (jsdom can't do WebRTC anyway).
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDisconnect = vi.fn().mockResolvedValue(undefined)
const mockSetMic = vi.fn().mockResolvedValue(undefined)

vi.mock('livekit-client', () => {
  class FakeRoom {
    remoteParticipants = new Map()
    localParticipant = { setMicrophoneEnabled: mockSetMic }
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    on(event: string, fn: (...args: unknown[]) => void) {
      const list = this.listeners.get(event) ?? []
      list.push(fn)
      this.listeners.set(event, list)
      return this
    }
    async connect(...args: unknown[]) {
      await mockConnect(...args)
      // Fire the connection-state event so the hook flips to connected.
      const fns = this.listeners.get('connectionStateChanged') ?? []
      for (const fn of fns) fn('connected')
    }
    async disconnect() {
      await mockDisconnect()
      const fns = this.listeners.get('disconnected') ?? []
      for (const fn of fns) fn()
    }
  }
  return {
    Room: FakeRoom,
    RoomEvent: {
      TrackSubscribed: 'trackSubscribed',
      Disconnected: 'disconnected',
      ConnectionStateChanged: 'connectionStateChanged',
    },
    ConnectionState: { Connected: 'connected' },
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  }
})

function makeApi() {
  return {
    mintVoiceToken: vi.fn().mockResolvedValue({
      token: 'fake-jwt',
      url: 'wss://test.local',
      room: 'echoaway-sess-1',
      identity: 'web-traveler',
    }),
  } as unknown as Parameters<typeof useVoiceRoom>[0]['apiClient']
}

describe('useVoiceRoom', () => {
  it('starts idle', () => {
    const { result } = renderHook(() =>
      useVoiceRoom({ apiClient: makeApi(), identity: 'web-traveler' }),
    )
    expect(result.current.state).toEqual({ kind: 'idle' })
  })

  it('connect mints a token, joins, publishes mic, ends connected', async () => {
    const apiClient = makeApi()
    const { result } = renderHook(() =>
      useVoiceRoom({ apiClient, identity: 'web-traveler' }),
    )
    await act(async () => {
      await result.current.connect({
        tripId: 'trip-demo-bcn',
        sessionId: 'sess-1',
        roomName: 'echoaway-sess-1',
      })
    })
    await waitFor(() =>
      expect(result.current.state.kind).toBe('connected'),
    )
    expect(apiClient.mintVoiceToken).toHaveBeenCalledWith({
      identity: 'web-traveler',
      name: undefined,
      room: 'echoaway-sess-1',
      metadata: { tripId: 'trip-demo-bcn', sessionId: 'sess-1' },
    })
    expect(mockConnect).toHaveBeenCalledWith('wss://test.local', 'fake-jwt')
    expect(mockSetMic).toHaveBeenCalledWith(true)
  })

  it('surfaces token-mint failures as error state', async () => {
    const apiClient = makeApi()
    ;(
      apiClient.mintVoiceToken as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('LiveKit env not configured'))
    const { result } = renderHook(() =>
      useVoiceRoom({ apiClient, identity: 'x' }),
    )
    await act(async () => {
      await result.current.connect({
        tripId: 't',
        sessionId: 's',
        roomName: 'r',
      })
    })
    expect(result.current.state.kind).toBe('error')
  })

  it('disconnect tears down and returns to idle', async () => {
    const apiClient = makeApi()
    const { result } = renderHook(() =>
      useVoiceRoom({ apiClient, identity: 'x' }),
    )
    await act(async () => {
      await result.current.connect({
        tripId: 't',
        sessionId: 's',
        roomName: 'r',
      })
    })
    await waitFor(() => expect(result.current.state.kind).toBe('connected'))

    await act(async () => {
      await result.current.disconnect()
    })
    expect(result.current.state).toEqual({ kind: 'idle' })
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
