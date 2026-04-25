import type { AssistantState } from '@echoaway/app'

export type VoiceMicButtonProps = {
  state: AssistantState
  onClick: () => void
  disabled?: boolean
  /** Override the accessible label. Defaults are state-driven. */
  ariaLabel?: string
}

const defaultLabel: Record<AssistantState['kind'], string> = {
  idle: 'Talk to Away',
  listening: 'Listening — tap to stop',
  thinking: 'Thinking',
  // The visible label conveys the state; the aria-label adds the
  // tap-to-cancel affordance for screen readers.
  suggesting: 'Awaiting confirmation — tap to cancel',
  confirmed: 'Change confirmed',
  rejected: 'Talk to Away',
  error: 'Try again',
}

const SUGGESTING_LABEL = 'Awaiting confirmation'

/**
 * Round icon-only voice button. Morphs into a pill with a label when
 * the assistant is `suggesting` (awaiting user approval) so the state
 * is unmistakable and the cancel affordance is reachable from the
 * header. State-driven via CSS class (`mic-btn-<kind>`); the consumer
 * routes clicks (e.g. start in idle, reject in suggesting).
 */
export function VoiceMicButton({
  state,
  onClick,
  disabled,
  ariaLabel,
}: VoiceMicButtonProps) {
  const isSuggesting = state.kind === 'suggesting'
  const className = [
    'mic-btn',
    `mic-btn-${state.kind}`,
    isSuggesting ? 'mic-btn-wide' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? defaultLabel[state.kind]}
    >
      {isSuggesting ? <PendingIcon /> : <WaveIcon />}
      {isSuggesting && (
        <span className="mic-btn-label">{SUGGESTING_LABEL}</span>
      )}
    </button>
  )
}

/** Five-bar audio waveform; the listening state animates each bar
 *  via the `.mic-btn-listening .wave-bar-*` rules in the consumer
 *  stylesheet. */
function WaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="wave-bar wave-bar-1" x="3" y="9.5" width="2.4" height="5" rx="1.2" />
      <rect className="wave-bar wave-bar-2" x="7.4" y="6" width="2.4" height="12" rx="1.2" />
      <rect className="wave-bar wave-bar-3" x="11.8" y="3.5" width="2.4" height="17" rx="1.2" />
      <rect className="wave-bar wave-bar-4" x="16.2" y="6" width="2.4" height="12" rx="1.2" />
      <rect className="wave-bar wave-bar-5" x="20.6" y="9.5" width="2.4" height="5" rx="1.2" />
    </svg>
  )
}

/** Three-dot "awaiting" indicator. Each dot pulses with a stagger so
 *  the icon reads as a single breathing unit alongside the pill,
 *  which itself pulses via `mic-breath`. */
function PendingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="pending-dot pending-dot-1" cx="5" cy="12" r="2" />
      <circle className="pending-dot pending-dot-2" cx="12" cy="12" r="2" />
      <circle className="pending-dot pending-dot-3" cx="19" cy="12" r="2" />
    </svg>
  )
}
