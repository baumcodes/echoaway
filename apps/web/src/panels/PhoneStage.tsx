import { useDemo } from '@echoaway/app'
import { PhoneShell, VoiceMicButton } from '@echoaway/ui'
import { AssistantOverlay } from './AssistantOverlay.js'
import { BookingPager } from './BookingPager.js'
import { TripOverview } from './TripOverview.js'
import { TripTimeline } from './TripTimeline.js'

export function PhoneStage() {
  const demo = useDemo()
  if (!demo.trip) return null
  return (
    <div className="demo-stage">
      <PhoneShell>
        <PhoneHeader />
        <TripOverview />
        {/* Agent-driven interactive cards sit *above* the booking pager
            so the call-to-action is always visible without scrolling. */}
        <AssistantOverlay />
        <BookingPager />
        <TripTimeline />
      </PhoneShell>
      {/* Hidden audio sink for the agent's TTS track. Has to live in
          the DOM (not just a ref) so the browser actually plays audio. */}
      <audio
        ref={demo.voiceAudioRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />
    </div>
  )
}

function PhoneHeader() {
  const demo = useDemo()
  // Three click behaviors layered on the same button:
  //   - while a change is awaiting confirmation, tap rejects;
  //   - while in a LiveKit room, tap ends the call;
  //   - otherwise tap starts a new room session (mic + agent join).
  const onMicClick = () => {
    if (demo.assistant.kind === 'suggesting') {
      demo.rejectSuggestion()
      return
    }
    if (demo.voiceRoom.kind === 'connected') {
      void demo.endSession()
      return
    }
    void demo.startNewSession()
  }
  // Effective visual state: room state drives the animation while the
  // assistant is between events, but agent-driven states (suggesting /
  // confirmed / error) win because they need user attention.
  const effective = pickButtonState(demo.assistant, demo.voiceRoom)
  return (
    <div className="phone-header">
      <span className="phone-header-title">EchoAway</span>
      <VoiceMicButton state={effective} onClick={onMicClick} />
    </div>
  )
}

type Demo = ReturnType<typeof useDemo>

/** Resolve which `AssistantState` shape the mic button should render.
 *
 *  Priority:
 *   1. `suggesting` / `confirmed` — agent is asking for or has just
 *      acknowledged a decision. Always wins (needs user action).
 *   2. Room state takes over the in-between moments:
 *        - `connecting` → spinner ("thinking")
 *        - `connected`  → listening animation (mic is hot — even if the
 *          agent hasn't transcribed anything yet)
 *        - `error`      → error
 *   3. Otherwise, fall through to the assistant's own state.
 */
function pickButtonState(
  assistant: Demo['assistant'],
  room: Demo['voiceRoom'],
): Demo['assistant'] {
  if (assistant.kind === 'suggesting' || assistant.kind === 'confirmed') {
    return assistant
  }
  switch (room.kind) {
    case 'connecting':
      return { kind: 'thinking', intent: 'connecting…' }
    case 'connected':
      return assistant.kind === 'listening' ? assistant : { kind: 'listening' }
    case 'error':
      return { kind: 'error', message: room.message }
    default:
      return assistant
  }
}
