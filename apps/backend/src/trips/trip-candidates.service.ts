import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

/**
 * Privacy-safe trip search has two steps. (1) `/trips/search?q=` runs
 * a fuzzy match on traveler name and returns *redacted* candidates —
 * no raw name / email / phone leaks back to the caller. Each candidate
 * gets an opaque `candidateId` we hold here for a few minutes so the
 * agent can complete the second step. (2) The agent asks the traveler
 * for a verifier (last 3 phone digits, a fragment of their email,
 * etc.) and POSTs to `/trip-candidates/:id/confirm` — we validate
 * server-side, return the real `tripId` only on a match.
 *
 * Holding state in memory is fine for the demo: hackathon scale, one
 * worker. A future redeploy with multiple replicas would want a
 * shared store (Redis), but that's out of scope.
 */
export interface StoredCandidate {
  candidateId: string
  tripId: string
  /** Snapshot taken at search time so re-issuing an updated `phone`
   *  for the traveler doesn't retroactively let a stale verifier
   *  succeed. */
  travelerPhone: string
  travelerEmail: string | null
  travelerFullName: string
  expiresAt: number
  attemptsLeft: number
}

const TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 3

@Injectable()
export class TripCandidatesService {
  readonly #store = new Map<string, StoredCandidate>()

  /** Mint a new candidate id pinned to one trip + traveler snapshot. */
  issue(input: {
    tripId: string
    travelerPhone: string
    travelerEmail: string | null
    travelerFullName: string
  }): StoredCandidate {
    const candidate: StoredCandidate = {
      candidateId: randomUUID(),
      tripId: input.tripId,
      travelerPhone: input.travelerPhone,
      travelerEmail: input.travelerEmail,
      travelerFullName: input.travelerFullName,
      expiresAt: Date.now() + TTL_MS,
      attemptsLeft: MAX_ATTEMPTS,
    }
    this.#store.set(candidate.candidateId, candidate)
    return candidate
  }

  /** Read-only fetch with TTL eviction — does NOT decrement attempts. */
  peek(candidateId: string): StoredCandidate | null {
    const c = this.#store.get(candidateId)
    if (!c) return null
    if (c.expiresAt < Date.now()) {
      this.#store.delete(candidateId)
      return null
    }
    return c
  }

  /** Decrement attempts on a failed verifier check. Returns the new
   *  remaining count; deletes the candidate when it hits zero. */
  recordFailedAttempt(candidateId: string): number {
    const c = this.#store.get(candidateId)
    if (!c) return 0
    c.attemptsLeft -= 1
    if (c.attemptsLeft <= 0) {
      this.#store.delete(candidateId)
      return 0
    }
    return c.attemptsLeft
  }

  /** Once verified, the candidate can be retired. */
  consume(candidateId: string): void {
    this.#store.delete(candidateId)
  }
}
