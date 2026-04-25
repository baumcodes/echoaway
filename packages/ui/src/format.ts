/** Cents → "€145" / "€145.50" */
export function formatPriceCents(cents: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency
  const rounded = cents / 100
  const fixed = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2)
  return `${symbol}${fixed}`
}

/** Compact ISO date → "Sat 2 May" */
export function formatDayShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** ISO datetime → "20:40" in the host's local time. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** "2026-04-25T13:02:30.820Z" → "Sat 25 Apr · 15:02" (host-local) */
export function formatDateTime(iso: string): string {
  return `${formatDayShort(iso)} · ${formatTime(iso)}`
}
