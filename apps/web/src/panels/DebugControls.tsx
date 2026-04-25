import { useDemo } from '@echoaway/app'
import { useState } from 'react'

/** Off-stage controls for driving the demo manually. SSE is wired,
 *  LiveKit room joining is wired — buttons let you exercise paths
 *  individually without going through the mic. The "Reset trip"
 *  button is the recovery path when consecutive confirms have consumed
 *  the bookable slack between check-in and check-out. */
export function DebugControls() {
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
  const roomLabel =
    demo.voiceRoom.kind === 'connected'
      ? `Room: ${demo.voiceRoom.roomName.slice(-8)} ✓`
      : demo.voiceRoom.kind === 'connecting'
        ? 'Room: connecting…'
        : demo.voiceRoom.kind === 'error'
          ? `Room: ${demo.voiceRoom.message}`
          : 'Room: not connected'
  return (
    <div className="debug-panel">
      <div className="debug-panel-title">Demo controls</div>
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
      <div className="debug-panel-title" style={{ marginTop: '0.7rem' }}>
        Voice session
      </div>
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
      </div>
    </div>
  )
}
