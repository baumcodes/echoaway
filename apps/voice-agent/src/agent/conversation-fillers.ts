/**
 * Pools of natural-sounding filler phrases the worker can say
 * programmatically when the LLM hasn't filled silence on its own.
 *
 * Two pools today:
 *   - `slowToolFillers` — fired when a tool call has been running for
 *     more than ~3.5 s without a response, so the traveler hears a
 *     human "still working on it" instead of dead air.
 *   - `autoContinueInstructions` — system instructions handed to
 *     `session.generateReply()` when the LLM ended a turn after a tool
 *     error without resolving. The LLM is told to repair (retry or
 *     name the missing detail) instead of waiting for the user.
 *
 * Pick from each pool with `pickRandom(pool)`. Pure / testable so we
 * can unit-test without mocking the LiveKit session.
 */
export const slowToolFillers: readonly string[] = [
  'Hmm, the system is a bit slow today, hang on…',
  'One sec, still pulling that up…',
  'Almost there, bear with me…',
  'Mhm, just a moment longer…',
  "Okay, this one's taking a beat — hang on…",
]

export const autoContinueInstructions: readonly string[] = [
  'The previous tool call errored. Decide right now: retry it (you may try once more silently) or, if it looks like wrong input, name the specific issue and ask the traveler for the missing detail. Do NOT ask the traveler for permission to retry, and do NOT just say "bear with me".',
  'Your previous tool returned an error. Take action immediately — either retry once with the same arguments, or report the specific problem (e.g. "I have +49 151 1234 5678 on file — could you confirm the digits?") and ask for the missing detail. Don\'t end the turn with a vague apology.',
]

export function pickRandom<T>(pool: readonly T[]): T {
  if (pool.length === 0) {
    throw new Error('pickRandom called on empty pool')
  }
  return pool[Math.floor(Math.random() * pool.length)]!
}
