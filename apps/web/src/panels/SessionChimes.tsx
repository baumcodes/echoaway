import { pickSessionChime, useDemo } from '@echoaway/app'
import { useEffect, useMemo, useRef } from 'react'

/** Sound files served from `apps/web/public/`. Drop the files there
 *  and they're reachable at the URLs below with no build step. */
const READY_SRC = '/session-ready.mp3'
const CLOSED_SRC = '/session-closed.mp3'

/**
 * Plays short chimes on the LiveKit room's open / close transitions.
 * Renders nothing; mount once.
 *
 * Browser autoplay rules require a recent user gesture. The ready
 * chime is safe because the user just clicked the mic. The closed
 * chime is also safe because either the user clicked "End session" or
 * a previous gesture already unlocked audio for the page.
 */
export function SessionChimes() {
  const { voiceRoom } = useDemo()
  // One Audio element per file; lazy-init so the file is decoded by
  // the time we need it. Memo'd so it survives re-renders.
  const audios = useMemo(() => {
    if (typeof window === 'undefined') return null
    const ready = new Audio(READY_SRC)
    const closed = new Audio(CLOSED_SRC)
    ready.preload = 'auto'
    closed.preload = 'auto'
    return { ready, closed }
  }, [])

  const prevKindRef = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevKindRef.current
    const next = voiceRoom.kind
    prevKindRef.current = next

    const which = pickSessionChime(prev, next)
    if (!which || !audios) return

    const audio = audios[which]
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Autoplay blocked (no recent user gesture) — fine; the next
      // chime will fire normally and the agent's voice fills in.
    })
  }, [voiceRoom.kind, audios])

  return null
}
