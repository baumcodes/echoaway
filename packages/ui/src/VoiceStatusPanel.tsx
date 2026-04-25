import type { AssistantState } from '@echoaway/app'

export type VoiceStatusPanelProps = {
  state: AssistantState
  onTalk: () => void
  onReset?: () => void
  disabled?: boolean
}

const labelByKind: Record<AssistantState['kind'], string> = {
  idle: 'Talk to Away',
  listening: 'Listening…',
  thinking: 'Thinking…',
  suggesting: 'Suggested change',
  confirmed: 'Change confirmed',
  rejected: 'Change cancelled',
  error: 'Something went wrong',
}

export function VoiceStatusPanel({
  state,
  onTalk,
  onReset,
  disabled,
}: VoiceStatusPanelProps) {
  const isActive = state.kind !== 'idle'
  return (
    <div className={`voice-panel voice-panel-${state.kind}`}>
      <button
        type="button"
        className="voice-button"
        onClick={onTalk}
        disabled={disabled}
        aria-label={labelByKind[state.kind]}
      >
        <span className="voice-icon" aria-hidden>
          {state.kind === 'listening' ? '🎙' : '🎤'}
        </span>
        <span className="voice-button-label">{labelByKind[state.kind]}</span>
      </button>
      {state.kind === 'listening' && state.transcript && (
        <p className="voice-transcript">"{state.transcript}"</p>
      )}
      {state.kind === 'thinking' && state.intent && (
        <p className="voice-hint">{state.intent}</p>
      )}
      {state.kind === 'error' && <p className="voice-hint">{state.message}</p>}
      {isActive && onReset && (
        <button type="button" className="voice-reset" onClick={onReset}>
          Reset demo
        </button>
      )}
    </div>
  )
}
