import { useEffect, useRef } from 'react'
import { Card } from './Card.js'

export type TranscriptEntry = {
  id: string
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
  createdAt: string
}

export type TranscriptCardProps = {
  entries: TranscriptEntry[]
  collapsible?: boolean
  defaultOpen?: boolean
  onClear?: () => void
}

/**
 * Realtime debug overlay for the voice session — colour-codes user
 * input vs. agent output so you can see at a glance what the agent
 * actually heard and what it said back. Auto-scrolls as new lines land.
 */
export function TranscriptCard({
  entries,
  collapsible = true,
  defaultOpen = true,
  onClear,
}: TranscriptCardProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  const headerExtra = (
    <div className="transcript-card-actions">
      <span className="transcript-card-count">{entries.length}</span>
      {onClear && entries.length > 0 ? (
        <button
          type="button"
          className="transcript-card-clear"
          onClick={(e) => {
            // Stop the click from toggling the parent <details>.
            e.preventDefault()
            e.stopPropagation()
            onClear()
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  )

  return (
    <Card
      title="Live transcript"
      subtitle="Realtime debug · user vs. agent"
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      headerExtra={headerExtra}
    >
      {entries.length === 0 ? (
        <p className="transcript-empty">
          Waiting for speech — start a session and talk to the agent.
        </p>
      ) : (
        <div ref={listRef} className="transcript-list">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`transcript-entry transcript-entry-${entry.role}${
                entry.isFinal ? '' : ' transcript-entry-interim'
              }`}
            >
              <span className="transcript-role">
                {entry.role === 'user' ? 'You' : 'Agent'}
              </span>
              <span className="transcript-text">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
