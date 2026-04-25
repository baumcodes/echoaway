import { useDemo } from '@echoaway/app'

/** Off-stage controls for driving the demo manually until Phase 4 wires
 *  SSE → assistant state. Kept on the side panel, not inside the phone. */
export function DebugControls() {
  const demo = useDemo()
  const isSuggesting = demo.assistant.kind === 'suggesting'
  return (
    <div className="debug-panel">
      <div className="debug-panel-title">Demo controls (Phase 4 wires SSE)</div>
      <div className="debug-buttons">
        <button onClick={() => void demo.startDemoFlow()}>
          1 · Talk to Away
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
        <button onClick={demo.reset}>Reset</button>
      </div>
    </div>
  )
}
