/**
 * Lookup-input normalizers shared by the backend, the agent's tool
 * wrappers, and the web client. Anything that takes a phone number,
 * email, trip id, or traveler name from a human (or an LLM that just
 * transcribed a human) goes through here first so equality / LIKE
 * matches don't fail on incidental whitespace, dash placement, or
 * casing.
 *
 * Pure functions. No I/O. Each has a unit test in `normalize.spec.ts`.
 */

/**
 * Phone numbers as the user dictates them are messy: "plus four nine,
 * one five one, one two three four, five six seven eight" → STT might
 * give "+49 151 1234 5678" or "0049 151 1234 5678" or any of a dozen
 * other punctuation variants. We collapse to the E.164-ish shape
 * `+<digits>` so the DB can do an exact match.
 *
 * Rules:
 *   - keep one leading `+` if present anywhere up front
 *   - if the input starts with `00` (international prefix in EU dialing)
 *     replace it with `+`
 *   - drop everything that isn't a digit
 *   - empty input returns ''
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  let body = trimmed
  let plus = ''
  if (body.startsWith('+')) {
    plus = '+'
    body = body.slice(1)
  } else if (body.startsWith('00')) {
    plus = '+'
    body = body.slice(2)
  }
  const digits = body.replace(/\D+/g, '')
  return digits ? `${plus}${digits}` : plus
}

/**
 * Emails: trim + lowercase. We don't validate the shape here — the
 * lookup is a `WHERE email = ?` against seeded values, and the LLM
 * occasionally adds a trailing period from the prompt cadence rules
 * which would break the match.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase().replace(/[.,;]+$/g, '')
}

/**
 * Trip ids in the seed are slug-style ("trip-demo-bcn"). The LLM may
 * receive them spoken as "trip demo bcn" or "tripdemobcn"; the user
 * may type with or without dashes. We canonicalize to a comparison
 * key by lowercasing and stripping every character that isn't a
 * letter or digit. Lookups should compare on this canonical form on
 * both sides (input + DB row), which the backend does.
 */
export function normalizeTripIdKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Free-form name search query: trim + collapse whitespace +
 * lowercase. Used to build a `LIKE %q%` against `Traveler.fullName`
 * with `mode: 'insensitive'`.
 */
export function normalizeNameQuery(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Last-N digits of a phone number, used as a verifier challenge in
 * the privacy-safe lookup flow. We normalize first so "+49 151 1234
 * 5678" and "01511234.5678" both yield the same tail.
 */
export function lastDigitsOfPhone(phone: string, count: number): string {
  const digits = normalizePhone(phone).replace(/^\+/, '')
  return digits.slice(-count)
}

/**
 * Initials shown in redacted candidate listings. "Stephan Rüschenbaum"
 * → "S.R.". Keeps one initial per whitespace-separated word, dot-joined.
 */
export function initialsOfName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return words.map((w) => `${w[0]!.toUpperCase()}.`).join('')
}

/**
 * Mask an email so it can be read back without exposing the full
 * address. "stephan@planaway.com" → "s***@p***.com".
 *
 * Rules: keep first char of local part + first char of domain + the
 * TLD; everything else becomes `***`. Falsy/invalid input returns ''.
 */
export function maskEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.indexOf('@')
  if (at <= 0) return ''
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  if (dot <= 0) return ''
  const localMasked = `${local[0]}***`
  const domainHead = domain.slice(0, dot)
  const tld = domain.slice(dot)
  const domainMasked = `${domainHead[0]}***${tld}`
  return `${localMasked}@${domainMasked}`
}
