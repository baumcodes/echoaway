import { useDemo } from '@echoaway/app'
import { Card } from '@echoaway/ui'
import { useEffect, useRef, useState } from 'react'

/** Same file the noisy-mic mixer fetches in `useVoiceRoom`. Keeping
 *  one constant in two places (here + the hook) is fine for a single
 *  asset; if a third consumer shows up, hoist to a shared constant. */
const NOISE_URL = '/airport-noise.mp3'

/** Off-stage controls for driving the demo manually. SSE is wired,
 *  LiveKit room joining is wired — buttons let you exercise paths
 *  individually without going through the mic. The "Reset trip"
 *  button is the recovery path when consecutive confirms have consumed
 *  the bookable slack between check-in and check-out.
 *
 *  Rendered as two collapsible cards (`Demo controls`, `Voice session`)
 *  so the side panel can be triaged at a glance — collapse the
 *  buttons you don't need, expand the live transcript.
 */
export function DebugControls() {
  return (
    <>
      <DemoControlsCard />
      <VoiceSessionCard />
    </>
  )
}

function DemoControlsCard() {
  const demo = useDemo()
  const [resetting, setResetting] = useState(false)
  const isSuggesting = demo.assistant.kind === 'suggesting'
  const onResetTrip = async () => {
    setResetting(true)
    try {
      await demo.resetDemoTrip()
    } finally {
      setResetting(false)
    }
  }
  return (
    <Card
      title="Demo controls"
      subtitle="Drive the demo without the mic"
      collapsible
      defaultOpen={false}
    >
      <div className="debug-buttons">
        <button onClick={() => void demo.startDemoFlow()}>
          1 · Run demo script
        </button>
        <button
          onClick={() => void demo.confirmSuggestion()}
          disabled={!isSuggesting}
        >
          2 · Confirm change
        </button>
        <button onClick={demo.rejectSuggestion} disabled={!isSuggesting}>
          Reject
        </button>
        <button onClick={demo.reset}>Reset assistant</button>
        <button onClick={() => void onResetTrip()} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset trip'}
        </button>
      </div>
    </Card>
  )
}

function VoiceSessionCard() {
  const demo = useDemo()
  const roomLabel =
    demo.voiceRoom.kind === 'connected'
      ? `Room: ${demo.voiceRoom.roomName.slice(-8)} ✓`
      : demo.voiceRoom.kind === 'connecting'
        ? 'Room: connecting…'
        : demo.voiceRoom.kind === 'error'
          ? `Room: ${demo.voiceRoom.message}`
          : 'Room: not connected'
  return (
    <Card
      title="Voice session"
      subtitle="LiveKit room + noisy-mic toggle"
      collapsible
      defaultOpen={false}
    >
      <NoiseToggleRow />
      <div className="debug-buttons">
        <button
          onClick={() => void demo.startNewSession()}
          disabled={demo.voiceRoom.kind === 'connecting'}
        >
          New session (mic + agent)
        </button>
        <button
          onClick={() => void demo.endSession()}
          disabled={demo.voiceRoom.kind !== 'connected'}
        >
          End session
        </button>
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          fontSize: '0.7rem',
          color: 'var(--ink-muted)',
        }}
      >
        {roomLabel}
        {demo.voiceRoom.kind === 'connected' && demo.voiceRoom.noisy
          ? ' · ✈ noisy mic'
          : ''}
      </div>
    </Card>
  )
}

/**
 * The noisy-environment toggle plus a preview play/pause for the same
 * audio file the mixer will inject into the user's mic. Lets a
 * presenter hear what the agent will be receiving before starting a
 * real session — and quietly confirms the file actually loaded.
 */
function NoiseToggleRow() {
  const demo = useDemo()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lazy-create the preview Audio element once. Loops so it matches
  // what the mixer plays in-session.
  if (!audioRef.current && typeof window !== 'undefined') {
    const a = new Audio(NOISE_URL)
    a.loop = true
    a.preload = 'auto'
    audioRef.current = a
  }

  // Reflect the natural end of playback (rare with loop=true, but the
  // user can also pause from the OS-level media controls).
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
    }
  }, [])

  // Stop the preview on unmount so it doesn't keep playing if the
  // panel is unmounted by a layout change.
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const onTogglePlay = async () => {
    const a = audioRef.current
    if (!a) return
    setError(null)
    try {
      if (a.paused) {
        a.currentTime = 0
        await a.play()
      } else {
        a.pause()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not play'
      setError(msg)
    }
  }

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.78rem',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={demo.noisyMode}
          onChange={(e) => demo.setNoisyMode(e.target.checked)}
        />
        Airport noise (Phase 6 — applies on next session)
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.3rem',
          marginLeft: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => void onTogglePlay()}
          aria-label={playing ? 'Pause noise preview' : 'Play noise preview'}
          style={{
            padding: '0.25rem 0.55rem',
            borderRadius: '6px',
            fontSize: '0.7rem',
            border: '1px solid var(--line)',
            background: 'var(--surface-soft)',
            cursor: 'pointer',
          }}
        >
          {playing ? '⏸ Stop preview' : '▶ Preview noise'}
        </button>
        {error ? (
          <span style={{ fontSize: '0.7rem', color: 'var(--warning)' }}>
            {error}
          </span>
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--ink-muted)' }}>
            {playing ? 'Preview playing — speakers' : 'Preview only — not in mic'}
          </span>
        )}
      </div>
    </div>
  )
}
