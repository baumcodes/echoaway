import { AudioMetricCard } from '@echoaway/ui'
import { DebugControls } from './DebugControls.js'

export function SidePanel() {
  return (
    <aside className="demo-side">
      <Brand />
      <Lede />
      <Tracks />
      <AudioMetricCard metric={null} />
      <DebugControls />
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
