import {
  type BookingPolicy,
  type ChangeQuote,
  type ComponentBookingData,
  bookingPolicySchema,
  componentBookingDataSchema,
} from '@echoaway/types'

type AccommodationBookingData = Extract<ComponentBookingData, { kind: 'accommodation' }>
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { randomUUID } from 'node:crypto'
import {
  initialsOfName,
  lastDigitsOfPhone,
  maskEmail,
  normalizeEmail,
  normalizeNameQuery,
  normalizePhone,
  normalizeTripIdKey,
} from '@echoaway/types'
import { VoiceEventsBus } from '../events/voice-events.bus.js'
import { parseJson, stringifyJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'
import { TripCandidatesService } from './trip-candidates.service.js'

const QUOTE_VALID_MINUTES = 15

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: VoiceEventsBus,
    private readonly candidates: TripCandidatesService,
  ) {}

  /**
   * Inflate a Trip with components / bookings / events / disruptions and
   * parse all the JSON-stringified columns into real objects so the API
   * boundary returns clean shapes.
   */
  async getTripFull(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        segments: { orderBy: { order: 'asc' } },
        travelers: { include: { traveler: true } },
        components: {
          include: {
            booking: true,
            events: { orderBy: { startsAt: 'asc' } },
          },
        },
        disruptions: true,
      },
    })
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`)

    return {
      id: trip.id,
      title: trip.title,
      status: trip.status,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      currency: trip.currency,
      segments: trip.segments,
      travelers: trip.travelers.map((t) => ({
        role: t.role,
        traveler: t.traveler,
      })),
      components: trip.components.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        status: c.status,
        segmentId: c.segmentId,
        catalogRef: {
          accommodationProductId: c.accommodationProductId,
          activityProductId: c.activityProductId,
          flightRouteProductId: c.flightRouteProductId,
          groundTransferProductId: c.groundTransferProductId,
        },
        booking: c.booking
          ? {
              id: c.booking.id,
              supplierId: c.booking.supplierId,
              supplierBookingReference: c.booking.supplierBookingReference,
              status: c.booking.status,
              priceCents: c.booking.priceCents,
              currency: c.booking.currency,
              policy: parseJson<BookingPolicy>(c.booking.policy),
              data: parseJson(c.booking.data),
              bookedAt: c.booking.bookedAt.toISOString(),
              cancelledAt: c.booking.cancelledAt?.toISOString() ?? null,
            }
          : null,
        events: c.events.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt?.toISOString() ?? null,
          timezone: e.timezone,
          destinationId: e.destinationId,
          location: parseJson(e.location),
        })),
      })),
      disruptions: trip.disruptions.map((d) => ({
        id: d.id,
        type: d.type,
        severity: d.severity,
        message: d.message,
        status: d.status,
        affectedComponentId: d.affectedComponentId,
        suggestedActions: parseJson(d.suggestedActions),
        detectedAt: d.detectedAt.toISOString(),
        resolvedAt: d.resolvedAt?.toISOString() ?? null,
      })),
    }
  }

  async getTripByPhone(phone: string, sessionId?: string) {
    // Normalize aggressively — STT renders "+49 151 1234 5678" as
    // every variant under the sun; the seed stores the canonical form.
    const normalized = normalizePhone(phone)
    if (!normalized) {
      throw new BadRequestException('Phone number is empty')
    }
    const traveler = await this.prisma.traveler.findUnique({
      where: { phone: normalized },
    })
    if (!traveler) {
      throw new NotFoundException(
        `No traveler found for phone ${normalized}`,
      )
    }
    const trip = await this.prisma.trip.findFirst({
      where: { travelers: { some: { travelerId: traveler.id } } },
      orderBy: { startDate: 'asc' },
    })
    if (!trip) {
      throw new NotFoundException(`No trip found for traveler ${traveler.id}`)
    }
    const full = await this.getTripFull(trip.id)
    await this.emitTripLoaded(sessionId, full)
    return full
  }

  /**
   * Direct lookup by email. Email is non-unique in the schema so we
   * use `findFirst` and pick the earliest-starting trip if a traveler
   * happens to be on more than one. Trim + lowercase on input.
   */
  async getTripByEmail(email: string, sessionId?: string) {
    const normalized = normalizeEmail(email)
    if (!normalized) {
      throw new BadRequestException('Email is empty')
    }
    const traveler = await this.prisma.traveler.findFirst({
      where: { email: normalized },
    })
    if (!traveler) {
      throw new NotFoundException(`No traveler found for email ${normalized}`)
    }
    const trip = await this.prisma.trip.findFirst({
      where: { travelers: { some: { travelerId: traveler.id } } },
      orderBy: { startDate: 'asc' },
    })
    if (!trip) {
      throw new NotFoundException(`No trip found for traveler ${traveler.id}`)
    }
    const full = await this.getTripFull(trip.id)
    await this.emitTripLoaded(sessionId, full)
    return full
  }

  /**
   * Trip-id lookup that tolerates dashes, spaces, casing. We compare
   * a normalized key on both sides — input "trip demo bcn" / "trip-
   * demo-bcn" / "TRIPDEMOBCN" all hit `trip-demo-bcn`. SQLite has no
   * functional index for this, so we scan and match in JS — fine at
   * hackathon scale (~handfuls of trips).
   */
  async getTripByIdLoose(tripIdInput: string, sessionId?: string) {
    const key = normalizeTripIdKey(tripIdInput)
    if (!key) {
      throw new BadRequestException('Trip id is empty')
    }
    // First try the exact match — covers the happy path without a
    // table scan.
    const exact = await this.prisma.trip.findUnique({
      where: { id: tripIdInput },
      select: { id: true },
    })
    if (exact) {
      const full = await this.getTripFull(exact.id)
      await this.emitTripLoaded(sessionId, full)
      return full
    }

    const all = await this.prisma.trip.findMany({ select: { id: true } })
    const hit = all.find((t) => normalizeTripIdKey(t.id) === key)
    if (!hit) {
      throw new NotFoundException(`No trip found matching id "${tripIdInput}"`)
    }
    const full = await this.getTripFull(hit.id)
    await this.emitTripLoaded(sessionId, full)
    return full
  }

  /**
   * Privacy-safe fuzzy search by traveler name. Returns *redacted*
   * candidates — never raw name / email / phone — plus an opaque
   * `candidateId` the caller can later confirm with a verifier. See
   * `TripCandidatesService` for the in-memory store + TTL semantics.
   *
   * SQLite + Prisma's `contains` is case-sensitive on the default
   * collation; we lowercase both sides ourselves by normalizing the
   * query and storing fullName as-is and post-filtering in JS. At
   * the seeded scale this is trivially fast.
   */
  async searchTrips(query: string) {
    const q = normalizeNameQuery(query)
    if (q.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters')
    }

    const allTravelers = await this.prisma.traveler.findMany({
      include: {
        trips: {
          include: { trip: { select: { id: true, title: true } } },
        },
      },
    })

    const matches = allTravelers
      .filter((t) => t.fullName.toLowerCase().includes(q))
      // Need at least one trip to issue a candidate, AND at least one
      // verifier (phone or email) — otherwise the candidate would be
      // permanently unverifiable, which we'd rather hide than show.
      .filter((t) => t.trips.length > 0 && (t.phone || t.email))

    // Cap results so a broad query doesn't return everyone.
    const capped = matches.slice(0, 10)

    return capped.map((t) => {
      // Pick the earliest trip for this traveler as the candidate's
      // canonical trip — same convention as getTripByPhone.
      const trip = [...t.trips]
        .map((x) => x.trip)
        .sort((a, b) => a.id.localeCompare(b.id))[0]!
      const candidate = this.candidates.issue({
        tripId: trip.id,
        travelerPhone: t.phone ?? '',
        travelerEmail: t.email,
        travelerFullName: t.fullName,
      })
      return {
        candidateId: candidate.candidateId,
        tripTitle: trip.title,
        matchedTravelerInitials: initialsOfName(t.fullName),
        phoneTail: t.phone ? lastDigitsOfPhone(t.phone, 3) : null,
        emailMasked: t.email ? maskEmail(t.email) : null,
      }
    })
  }

  /**
   * Validate a verifier against a previously-issued candidate. The
   * verifier is treated permissively: it matches if it equals the
   * candidate's last-N phone digits (any N from 2 upward) OR appears
   * inside the email's local part. Three failed attempts retire the
   * candidate.
   *
   * On success: returns the real `tripId` plus the full trip payload
   * (one round-trip vs two) and consumes the candidate.
   */
  async confirmTripCandidate(
    candidateId: string,
    verifier: string,
    sessionId?: string,
  ) {
    const c = this.candidates.peek(candidateId)
    if (!c) {
      throw new NotFoundException(
        'Candidate not found or expired — please search again',
      )
    }
    const v = verifier.trim().toLowerCase()
    if (!v) {
      throw new BadRequestException('Verifier is empty')
    }

    const phoneDigits = normalizePhone(c.travelerPhone).replace(/^\+/, '')
    const phoneMatch =
      v.length >= 2 &&
      /^\d+$/.test(v) &&
      phoneDigits.endsWith(v)

    const emailLocal = c.travelerEmail
      ? c.travelerEmail.split('@')[0]?.toLowerCase() ?? ''
      : ''
    const emailMatch =
      v.length >= 2 && emailLocal.length > 0 && emailLocal.includes(v)

    if (!phoneMatch && !emailMatch) {
      const remaining = this.candidates.recordFailedAttempt(candidateId)
      throw new BadRequestException(
        remaining > 0
          ? `Verifier did not match. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'Verifier did not match. Please search again.',
      )
    }

    this.candidates.consume(candidateId)
    const trip = await this.getTripFull(c.tripId)
    await this.emitTripLoaded(sessionId, trip)
    return { tripId: c.tripId, trip }
  }

  /**
   * Emit a `trip_loaded` VoiceActionEvent so the web UI knows when to
   * render the trip cards. No-op when sessionId is missing — direct
   * REST callers (curl, the demo script) skip the event entirely.
   */
  private async emitTripLoaded(
    sessionId: string | undefined,
    trip: { id: string; title: string },
  ): Promise<void> {
    if (!sessionId) return
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      select: { id: true, tripId: true },
    })
    if (!session) return // session was wiped (Reset trip) — best-effort skip
    const row = await this.prisma.voiceActionEvent.create({
      data: {
        id: randomUUID(),
        sessionId,
        tripId: trip.id,
        componentId: null,
        type: 'trip_loaded',
        payload: stringifyJson({
          type: 'trip_loaded',
          sessionId,
          tripId: trip.id,
          tripSummary: trip.title,
        }),
      },
    })
    this.bus.publish({
      id: row.id,
      sessionId: row.sessionId,
      tripId: row.tripId,
      componentId: row.componentId,
      type: row.type,
      payload: parseJson(row.payload),
      createdAt: row.createdAt.toISOString(),
    })
  }

  async getDisruptions(tripId: string) {
    const exists = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    })
    if (!exists) throw new NotFoundException(`Trip ${tripId} not found`)

    const rows = await this.prisma.disruption.findMany({
      where: { tripId },
      orderBy: { detectedAt: 'desc' },
    })
    return rows.map((d) => ({
      id: d.id,
      tripId: d.tripId,
      type: d.type,
      severity: d.severity,
      message: d.message,
      status: d.status,
      affectedComponentId: d.affectedComponentId,
      suggestedActions: parseJson(d.suggestedActions),
      detectedAt: d.detectedAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    }))
  }

  /**
   * Look up the hotel component for a trip + load its booking, policy, and
   * the existing check_in event. Throws if anything's missing or the
   * component isn't an accommodation type.
   */
  private async loadHotelStay(tripId: string) {
    const component = await this.prisma.component.findFirst({
      where: { tripId, type: 'accommodation' },
      include: {
        booking: true,
        events: { where: { type: 'check_in' } },
      },
    })
    if (!component) {
      throw new NotFoundException(
        `No accommodation component on trip ${tripId}`,
      )
    }
    if (!component.booking) {
      throw new BadRequestException('Hotel component has no booking')
    }
    const checkInEvent = component.events[0]
    if (!checkInEvent) {
      throw new BadRequestException('Hotel component has no check_in event')
    }
    const policy = bookingPolicySchema.parse(parseJson(component.booking.policy))
    const data = componentBookingDataSchema.parse(
      parseJson(component.booking.data),
    )
    if (data.kind !== 'accommodation') {
      throw new BadRequestException(
        `Booking ${component.booking.id} is not accommodation`,
      )
    }
    return {
      component,
      booking: component.booking,
      checkInEvent,
      policy,
      data: data as AccommodationBookingData,
    }
  }

  /**
   * Compute the fee + summary for moving the hotel check-in to a new date.
   * Doesn't mutate anything; persists a `change_suggested` VoiceActionEvent
   * if a sessionId is provided.
   */
  async quoteHotelCheckInChange(args: {
    tripId: string
    newCheckInDate: string
    sessionId?: string
  }): Promise<ChangeQuote> {
    const { component, booking, policy, data } = await this.loadHotelStay(
      args.tripId,
    )

    if (!policy.modification.canModify) {
      throw new BadRequestException(
        policy.modification.notes ?? 'Hotel booking is non-modifiable',
      )
    }

    const now = new Date()
    const freeUntil = policy.modification.freeUntil
      ? parseISO(policy.modification.freeUntil)
      : null
    const fee =
      freeUntil && now <= freeUntil ? 0 : policy.modification.feeAfterCents ?? 0

    const validUntil = new Date(now.getTime() + QUOTE_VALID_MINUTES * 60_000)
    const policySummary = freeUntil
      ? `Free until ${format(freeUntil, 'PPP HH:mm')} — ${policy.modification.notes ?? 'see booking policy'}`
      : (policy.modification.notes ?? 'See booking policy')

    const quote: ChangeQuote = {
      componentId: component.id,
      changeType: 'check_in_date',
      oldValue: data.checkInDate,
      newValue: args.newCheckInDate,
      feeCents: fee,
      currency: 'EUR',
      policySummary,
      validUntil: validUntil.toISOString(),
    }

    if (args.sessionId) {
      await this.persistVoiceEvent({
        sessionId: args.sessionId,
        tripId: args.tripId,
        componentId: component.id,
        type: 'change_suggested',
        payload: {
          type: 'change_suggested',
          sessionId: args.sessionId,
          componentId: component.id,
          quote,
        },
      })
    }

    // Mark the booking as pending_change for the live UI; this is reversible
    // until confirm fires (or a new quote arrives).
    await this.prisma.componentBooking.update({
      where: { id: booking.id },
      data: { status: 'pending_change' },
    })

    return quote
  }

  /**
   * Apply a previously-quoted hotel check-in change. Mutates booking.data
   * (checkInDate, nights, totalPriceCents), the check_in ComponentEvent's
   * startsAt, and updates booking + component status.
   */
  async confirmHotelCheckInChange(args: {
    tripId: string
    newCheckInDate: string
    sessionId?: string
  }) {
    const { component, booking, checkInEvent, policy, data } =
      await this.loadHotelStay(args.tripId)

    if (!policy.modification.canModify) {
      throw new BadRequestException(
        policy.modification.notes ?? 'Hotel booking is non-modifiable',
      )
    }

    const newCheckInDate = parseISO(args.newCheckInDate)
    const checkOutDate = parseISO(data.checkOutDate)
    const nights = differenceInCalendarDays(checkOutDate, newCheckInDate)
    if (nights < 1) {
      throw new BadRequestException(
        'newCheckInDate must be at least 1 day before checkOutDate',
      )
    }

    const totalPriceCents = data.productSnapshot.pricePerNightCents * nights

    // Preserve original check-in time-of-day on the new date.
    const newStartsAt = new Date(checkInEvent.startsAt)
    const dayShift = differenceInCalendarDays(
      newCheckInDate,
      parseISO(data.checkInDate),
    )
    newStartsAt.setDate(newStartsAt.getDate() + dayShift)

    const updatedData: AccommodationBookingData = {
      ...data,
      checkInDate: args.newCheckInDate,
      nights,
      totalPriceCents,
    }

    const updatedBooking = await this.prisma.componentBooking.update({
      where: { id: booking.id },
      data: {
        status: 'confirmed',
        priceCents: totalPriceCents,
        data: stringifyJson(updatedData),
      },
    })

    await this.prisma.componentEvent.update({
      where: { id: checkInEvent.id },
      data: { startsAt: newStartsAt },
    })

    await this.prisma.component.update({
      where: { id: component.id },
      data: { status: 'changed' },
    })

    const quote: ChangeQuote = {
      componentId: component.id,
      changeType: 'check_in_date',
      oldValue: data.checkInDate,
      newValue: args.newCheckInDate,
      feeCents: 0,
      currency: 'EUR',
      policySummary: 'Change confirmed',
      validUntil: new Date(Date.now() + QUOTE_VALID_MINUTES * 60_000).toISOString(),
    }

    if (args.sessionId) {
      await this.persistVoiceEvent({
        sessionId: args.sessionId,
        tripId: args.tripId,
        componentId: component.id,
        type: 'change_confirmed',
        payload: {
          type: 'change_confirmed',
          sessionId: args.sessionId,
          componentId: component.id,
          bookingId: updatedBooking.id,
          quote,
        },
      })
    }

    return {
      quote,
      booking: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        priceCents: updatedBooking.priceCents,
        currency: updatedBooking.currency,
        data: updatedData,
      },
      checkInEventStartsAt: newStartsAt.toISOString(),
    }
  }

  /**
   * Persist a VoiceActionEvent. The session must already exist (the voice
   * agent creates it). Caller can ignore the result; this is fire-and-forget
   * relative to the user-facing response.
   */
  private async persistVoiceEvent(args: {
    sessionId: string
    tripId?: string
    componentId?: string
    type: string
    payload: unknown
  }) {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: args.sessionId },
      select: { id: true },
    })
    if (!session) {
      // Don't fail the user-facing change just because telemetry can't write.
      // eslint-disable-next-line no-console
      console.warn(
        `[trips] sessionId ${args.sessionId} not found; skipping VoiceActionEvent ${args.type}`,
      )
      return
    }
    const id = randomUUID()
    const row = await this.prisma.voiceActionEvent.create({
      data: {
        id,
        sessionId: args.sessionId,
        tripId: args.tripId ?? null,
        componentId: args.componentId ?? null,
        type: args.type,
        payload: stringifyJson(args.payload),
      },
    })
    this.bus.publish({
      id: row.id,
      type: row.type,
      sessionId: row.sessionId,
      tripId: row.tripId,
      componentId: row.componentId,
      payload: args.payload,
      createdAt: row.createdAt.toISOString(),
    })
  }
}
