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
import { VoiceEventsBus } from '../events/voice-events.bus.js'
import { parseJson, stringifyJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'

const QUOTE_VALID_MINUTES = 15

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: VoiceEventsBus,
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

  async getTripByPhone(phone: string) {
    const traveler = await this.prisma.traveler.findUnique({
      where: { phone },
    })
    if (!traveler) {
      throw new NotFoundException(`No traveler found for phone ${phone}`)
    }
    const trip = await this.prisma.trip.findFirst({
      where: { travelers: { some: { travelerId: traveler.id } } },
      orderBy: { startDate: 'asc' },
    })
    if (!trip) {
      throw new NotFoundException(`No trip found for traveler ${traveler.id}`)
    }
    return this.getTripFull(trip.id)
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
