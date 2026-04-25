import { useDemo } from '@echoaway/app'
import {
  AudioMetricCard,
  DemoBookingCard,
  TranscriptCard,
} from '@echoaway/ui'
import { DebugControls } from './DebugControls.js'

/** Always-visible cheat sheet: the four lookup keys the agent can
 *  resolve. Click-to-copy on each row. Sourced from the seed.
 *  Update if `apps/backend/prisma/seed/demo-trip/travelers.ts`
 *  changes. */
const DEMO_BOOKING_ROWS = [
  {
    label: 'Phone',
    value: '+49 151 1234 5678',
    hint: 'verifier: last 3 digits → 678',
  },
  {
    label: 'Email',
    value: 'big-berlin-hack-april-26@planaway.com',
    hint: 'verifier: any fragment of the local part',
  },
  { label: 'Booking reference', value: 'trip-demo-bcn' },
  { label: 'Lead traveler', value: 'Stephan Rüschenbaum' },
  { label: 'Companion', value: 'Anna Müller' },
] as const

export function SidePanel() {
  const { audioMetric, transcripts, clearTranscripts } = useDemo()
  return (
    <aside className="demo-side">
      <Brand />
      <Lede />
      <Tracks />
      <DemoBookingCard rows={DEMO_BOOKING_ROWS} />
      <AudioMetricCard
        metric={audioMetric}
        placeholder="Pending — populated when a voice session ends. ai-coustics enhances speech in real time during the call; metric numbers land here on disconnect."
        collapsible
        defaultOpen={false}
      />
      <DebugControls />
      <TranscriptCard
        entries={transcripts}
        onClear={clearTranscripts}
        defaultOpen
      />
    </aside>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-dot" aria-hidden />
      <span>EchoAway</span>
      <span className="brand-tag">Voice Concierge</span>
    </div>
  )
}

function Lede() {
  return (
    <div className="lede">
      <h1>Travel support that still works in airport chaos.</h1>
      <p>
        A voice-first interface that loads your trip, reads disruptions, and
        updates the app live while you talk — even in noisy real-world
        environments.
      </p>
    </div>
  )
}

function Tracks() {
  return (
    <div className="tracks">
      telli & ai-coustics · Gradium · Gemini · Tavily
    </div>
  )
}
