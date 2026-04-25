/**
 * Pure transition mapper for the LiveKit room chimes. Lives here, not
 * in `apps/web`, because the rule is platform-agnostic — `apps/mobile`
 * (when it lands) will use the same logic with a different audio
 * playback implementation.
 *
 * Plays at most one chime per transition.
 *
 * Rules:
 *   `* → connected`            → ready chime (mic just went hot)
 *   `connected → *` (anything) → closed chime (session ended cleanly
 *                                 or with error; either way the user
 *                                 needs to hear the close)
 *   `prev === next`            → no chime (no transition)
 *   anything else              → no chime (e.g. `idle → connecting`,
 *                                 `connecting → error`; we only mark
 *                                 the open and close edges)
 */
export type Chime = 'ready' | 'closed' | null

export function pickSessionChime(
  prev: string | null,
  next: string,
): Chime {
  if (prev === next) return null
  if (next === 'connected') return 'ready'
  if (prev === 'connected') return 'closed'
  return null
}
