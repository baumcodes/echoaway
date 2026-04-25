import { describe, expect, it, vi } from 'vitest'
import { confirmTripCandidate } from './confirmTripCandidate.js'
import { findTripById } from './findTripById.js'
import { getTripByEmail } from './getTripByEmail.js'
import { searchTripsByTraveler } from './searchTripsByTraveler.js'
import { makeToolCtx } from './_test-fixtures.js'

const sampleTrip = {
  id: 'trip-demo-bcn',
  title: 'Barcelona Long Weekend',
  startDate: '2026-05-02T00:00:00.000Z',
  endDate: '2026-05-06T00:00:00.000Z',
  travelers: [
    { role: 'lead', traveler: { fullName: 'Stephan Rüschenbaum' } },
  ],
  components: [
    { id: 'comp-stay', type: 'accommodation', title: 'Hotel', status: 'booked' },
  ],
}

describe('getTripByEmail', () => {
  it('hits the email endpoint and pins tripId', async () => {
    const ctx = makeToolCtx()
    ;(
      ctx.apiClient.getTripByEmail as ReturnType<typeof vi.fn>
    ).mockResolvedValue(sampleTrip)
    const result = (await getTripByEmail.execute(
      { email: 'stephan@planaway.com' },
      ctx,
    )) as { tripId: string }
    expect(ctx.apiClient.getTripByEmail).toHaveBeenCalledWith(
      'stephan@planaway.com',
      'sess-1',
    )
    expect(result.tripId).toBe('trip-demo-bcn')
    expect(ctx.tripId).toBe('trip-demo-bcn')
  })

  it('throws when email is missing', async () => {
    const ctx = makeToolCtx()
    await expect(getTripByEmail.execute({}, ctx)).rejects.toThrow(/email/)
  })
})

describe('findTripById', () => {
  it('hits the loose-id endpoint and pins tripId', async () => {
    const ctx = makeToolCtx()
    ;(
      ctx.apiClient.getTripByIdLoose as ReturnType<typeof vi.fn>
    ).mockResolvedValue(sampleTrip)
    const result = (await findTripById.execute(
      { tripId: 'trip demo bcn' },
      ctx,
    )) as { tripId: string }
    expect(ctx.apiClient.getTripByIdLoose).toHaveBeenCalledWith(
      'trip demo bcn',
      'sess-1',
    )
    expect(result.tripId).toBe('trip-demo-bcn')
    expect(ctx.tripId).toBe('trip-demo-bcn')
  })

  it('throws when tripId is missing', async () => {
    const ctx = makeToolCtx()
    await expect(findTripById.execute({}, ctx)).rejects.toThrow(/tripId/)
  })
})

describe('searchTripsByTraveler', () => {
  it('returns redacted candidates without leaking name/email/phone', async () => {
    const ctx = makeToolCtx()
    ;(ctx.apiClient.searchTrips as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        candidateId: 'cand-1',
        tripTitle: 'Barcelona Long Weekend',
        matchedTravelerInitials: 'S.R.',
        phoneTail: '678',
        emailMasked: 's***@p***.com',
      },
    ])
    const result = (await searchTripsByTraveler.execute(
      { query: 'Stephan' },
      ctx,
    )) as { matchCount: number; candidates: unknown[] }

    expect(result.matchCount).toBe(1)
    // Crucially: the tool's own output strips even the masked
    // fields, so the LLM is one less step away from leaking them.
    const json = JSON.stringify(result)
    expect(json).not.toContain('S.R.')
    expect(json).not.toContain('678')
    expect(json).not.toContain('s***')
    // But the boolean hints + candidate id survive.
    expect(json).toContain('hasPhoneVerifier')
    expect(json).toContain('cand-1')
  })

  it('throws when query is missing', async () => {
    const ctx = makeToolCtx()
    await expect(searchTripsByTraveler.execute({}, ctx)).rejects.toThrow(
      /query/,
    )
  })
})

describe('confirmTripCandidate', () => {
  it('calls confirm with verifier and pins tripId on success', async () => {
    const ctx = makeToolCtx()
    ;(
      ctx.apiClient.confirmTripCandidate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ tripId: 'trip-demo-bcn', trip: sampleTrip })
    const result = (await confirmTripCandidate.execute(
      { candidateId: 'cand-1', verifier: '678' },
      ctx,
    )) as { tripId: string }
    expect(ctx.apiClient.confirmTripCandidate).toHaveBeenCalledWith(
      'cand-1',
      '678',
      'sess-1',
    )
    expect(result.tripId).toBe('trip-demo-bcn')
    expect(ctx.tripId).toBe('trip-demo-bcn')
  })

  it('propagates verifier-mismatch errors', async () => {
    const ctx = makeToolCtx()
    ;(
      ctx.apiClient.confirmTripCandidate as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Verifier did not match. 2 attempts left.'))
    await expect(
      confirmTripCandidate.execute(
        { candidateId: 'cand-1', verifier: '999' },
        ctx,
      ),
    ).rejects.toThrow(/attempt/i)
    expect(ctx.tripId).toBeNull()
  })

  it('throws when args are missing', async () => {
    const ctx = makeToolCtx()
    await expect(
      confirmTripCandidate.execute({ candidateId: 'cand-1' }, ctx),
    ).rejects.toThrow(/verifier/)
    await expect(
      confirmTripCandidate.execute({ verifier: '678' }, ctx),
    ).rejects.toThrow(/candidateId/)
  })
})
