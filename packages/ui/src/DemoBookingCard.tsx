import { useState } from 'react'
import { Card } from './Card.js'

export type DemoBookingCardProps = {
  /** Demo seed values the agent should be able to find this trip
   *  with. Each row is a click-to-copy verifier so a presenter can
   *  grab the exact string and dictate it without typos. */
  rows: ReadonlyArray<{
    label: string
    value: string
    /** Optional secondary line shown muted under the value — e.g.
     *  "say 'last three digits' for the verifier". */
    hint?: string
  }>
}

/**
 * Always-visible demo helper card. Lists the seeded values (phone,
 * email, booking reference, traveler names) the user can dictate to
 * the voice agent so they don't have to remember anything during the
 * demo.
 *
 * Keep this **dumb**: the values come from the consuming app — the
 * card itself doesn't know about the seed or the apiClient.
 */
export function DemoBookingCard({ rows }: DemoBookingCardProps) {
  return (
    <Card
      accent="info"
      title="Demo booking"
      subtitle="Tell Remí any of these to load the trip"
    >
      <div className="demo-booking-rows">
        {rows.map((row) => (
          <DemoBookingRow key={row.label} row={row} />
        ))}
      </div>
    </Card>
  )
}

function DemoBookingRow({
  row,
}: {
  row: DemoBookingCardProps['rows'][number]
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard might be unavailable (no permissions / insecure
      // context) — fail silently; the value is still readable.
    }
  }
  return (
    <button
      type="button"
      className="demo-booking-row"
      onClick={() => void copy()}
      title="Click to copy"
    >
      <div className="demo-booking-row-label">{row.label}</div>
      <div className="demo-booking-row-value">
        <code>{row.value}</code>
        <span
          className={`demo-booking-row-copy${copied ? ' is-copied' : ''}`}
          aria-live="polite"
        >
          {copied ? 'Copied' : 'Copy'}
        </span>
      </div>
      {row.hint && <div className="demo-booking-row-hint">{row.hint}</div>}
    </button>
  )
}
