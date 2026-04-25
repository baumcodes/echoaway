import { useDemo } from '@echoaway/app'
import { PhoneShell, VoiceMicButton } from '@echoaway/ui'
import { AssistantOverlay } from './AssistantOverlay.js'
import { BookingPager } from './BookingPager.js'
import { TripOverview } from './TripOverview.js'
import { TripTimeline } from './TripTimeline.js'

export function PhoneStage() {
  const { trip } = useDemo()
  if (!trip) return null
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
    </div>
  )
}

function PhoneHeader() {
  const demo = useDemo()
  // The mic button morphs into a "Awaiting confirmation" pill while
  // the assistant is suggesting a change; tapping it then rejects.
  // In every other state the same tap starts the demo flow.
  const onMicClick = () => {
    if (demo.assistant.kind === 'suggesting') {
      demo.rejectSuggestion()
      return
    }
    void demo.startDemoFlow()
  }
  return (
    <div className="phone-header">
      <span className="phone-header-title">EchoAway</span>
      <VoiceMicButton state={demo.assistant} onClick={onMicClick} />
    </div>
  )
}
