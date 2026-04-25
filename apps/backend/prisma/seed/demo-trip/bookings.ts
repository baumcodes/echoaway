import {
  type AccommodationBookingData,
  type ActivityBookingData,
  type BookingPolicy,
  ComponentType,
  type FlightBookingData,
  type TransferBookingData,
  assertComponentDataMatchesType,
  bookingPolicySchema,
  componentBookingDataSchema,
} from '@echoaway/types'
import { format } from 'date-fns'
import { prisma } from '../shared/db.js'
import { COMPONENTS, TRAVELER_COMPANION_ID, TRAVELER_LEAD_ID } from './constants.js'
import type { TripDates } from './dates.js'
import type { DemoCatalog } from './load-catalog.js'

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

const lead = TRAVELER_LEAD_ID
const companion = TRAVELER_COMPANION_ID

function parseCoords(raw: string | null): { lat: number; lng: number } {
  if (!raw) return { lat: 0, lng: 0 }
  return JSON.parse(raw) as { lat: number; lng: number }
}

function parseStringList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

/**
 * Validate + persist a ComponentBooking. We Zod-parse `data` and `policy`
 * before stringify so a typo here fails fast at seed time, not at runtime
 * when the voice agent reads it.
 */
async function writeBooking(args: {
  id: string
  componentId: string
  componentType: ComponentType
  supplierId: string
  supplierBookingReference: string
  priceCents: number
  policy: BookingPolicy
  data:
    | FlightBookingData
    | AccommodationBookingData
    | ActivityBookingData
    | TransferBookingData
}): Promise<void> {
  const validatedData = componentBookingDataSchema.parse(args.data)
  assertComponentDataMatchesType(validatedData, args.componentType)
  const validatedPolicy = bookingPolicySchema.parse(args.policy)

  await prisma.componentBooking.create({
    data: {
      id: args.id,
      componentId: args.componentId,
      supplierId: args.supplierId,
      supplierBookingReference: args.supplierBookingReference,
      status: 'confirmed',
      priceCents: args.priceCents,
      currency: 'EUR',
      policy: JSON.stringify(validatedPolicy),
      data: JSON.stringify(validatedData),
    },
  })
}

export async function seedBookings(
  cat: DemoCatalog,
  dates: TripDates,
): Promise<void> {
  // ---- Flight booking ----------------------------------------------------
  const flightLeg = cat.flightRoute.legs[0]!
  const flightData: FlightBookingData = {
    kind: 'flight',
    routeSnapshot: {
      routeId: cat.flightRoute.id,
      fromIata: 'BER',
      toIata: 'BCN',
      stops: cat.flightRoute.stops,
      durationHours: cat.flightRoute.durationHours,
      fareConditions: cat.flightRoute.fareConditions as
        | 'non_refundable'
        | 'changeable_fee'
        | 'flexible',
      daysOfWeek: JSON.parse(cat.flightRoute.daysOfWeek) as number[],
    },
    legs: [
      {
        order: flightLeg.order,
        fromIata: 'BER',
        toIata: 'BCN',
        flightNo: flightLeg.flightNo,
        airline: flightLeg.airline,
        scheduledDeparture: dates.flight.depart.toISOString(),
        scheduledArrival: dates.flight.arrive.toISOString(),
      },
    ],
    passengers: [
      { travelerId: lead, fareClass: 'economy' },
      { travelerId: companion, fareClass: 'economy' },
    ],
    pnr: 'DEMO-VY-001',
  }
  const flightPolicy: BookingPolicy = {
    cancellation: {
      canCancel: false,
      notes: 'Non-refundable economy fare.',
    },
    modification: {
      canModify: false,
      notes: 'No changes allowed on non-refundable fares.',
    },
    rawText: cat.flightRoute.fareConditions,
  }
  await writeBooking({
    id: 'book-flight-out',
    componentId: COMPONENTS.flightOut,
    componentType: ComponentType.flight,
    supplierId: cat.flightRoute.supplierId,
    supplierBookingReference: 'DEMO-VY-OUT-001',
    priceCents: cat.flightRoute.priceAvgCents * 2, // 2 pax
    policy: flightPolicy,
    data: flightData,
  })

  // ---- Transfer booking --------------------------------------------------
  const transferData: TransferBookingData = {
    kind: 'transfer',
    productSnapshot: {
      productId: cat.transfer.id,
      fromLabel: cat.transfer.fromLabel,
      toLabel: cat.transfer.toLabel,
      mode: cat.transfer.mode as TransferBookingData['productSnapshot']['mode'],
      durationMinutes: cat.transfer.durationMinutes,
      priceCents: cat.transfer.priceCents,
      currency: 'EUR',
    },
    scheduledPickup: dates.transfer.pickup.toISOString(),
    scheduledDropoff: dates.stay.checkIn.toISOString(),
    passengers: [
      { travelerId: lead, luggageCount: 1 },
      { travelerId: companion, luggageCount: 1 },
    ],
    totalPriceCents: cat.transfer.priceCents * 2,
    pickupLocation: {
      name: 'Barcelona–El Prat Airport (T1 arrivals)',
      address: 'Aeroport de Barcelona-El Prat, 08820 El Prat de Llobregat',
    },
    dropoffLocation: {
      name: cat.hotel.name,
      coordinates: parseCoords(cat.hotel.coordinates),
    },
  }
  const transferPolicy: BookingPolicy = {
    cancellation: { canCancel: true, notes: 'Free cancellation up to 24h before pickup.' },
    modification: {
      canModify: true,
      allowedFields: ['pickup_time'],
      notes: 'Pickup time can be re-quoted up to 2h before pickup.',
    },
  }
  await writeBooking({
    id: 'book-transfer',
    componentId: COMPONENTS.transfer,
    componentType: ComponentType.transfer,
    supplierId: cat.transfer.supplierId,
    supplierBookingReference: 'DEMO-TRF-001',
    priceCents: cat.transfer.priceCents * 2,
    policy: transferPolicy,
    data: transferData,
  })

  // ---- Hotel booking (with demo policy override) -------------------------
  const hotelData: AccommodationBookingData = {
    kind: 'accommodation',
    productSnapshot: {
      productId: cat.hotel.id,
      name: cat.hotel.name,
      stars: cat.hotel.stars,
      pricePerNightCents: cat.hotel.pricePerNightCents,
      currency: 'EUR',
      coordinates: parseCoords(cat.hotel.coordinates),
      amenities: parseStringList(cat.hotel.amenities),
      images: parseStringList(cat.hotel.images),
    },
    checkInDate: isoDate(dates.stay.checkIn),
    checkOutDate: isoDate(dates.stay.checkOut),
    nights: dates.nights,
    totalPriceCents: cat.hotel.pricePerNightCents * dates.nights,
    guests: [
      { travelerId: lead, role: 'lead' },
      { travelerId: companion, role: 'companion' },
    ],
    roomCategory: 'Double room with sea view',
  }
  // Demo override: free check-in change until end-of-today so the demo flow
  // always succeeds. See docs/seed-strategy.md §3.3.
  const hotelPolicy: BookingPolicy = {
    cancellation: {
      canCancel: true,
      freeUntil: dates.stay.checkIn.toISOString(),
      notes: 'Free cancellation up to check-in.',
    },
    modification: {
      canModify: true,
      freeUntil: dates.stay.modificationFreeUntil.toISOString(),
      feeAfterCents: 0,
      currency: 'EUR',
      allowedFields: ['check_in_date', 'check_out_date'],
      notes: 'Free same-day check-in adjustment for demo.',
    },
    rawText: cat.hotel.defaultCancellationTerms ?? undefined,
  }
  await writeBooking({
    id: 'book-stay',
    componentId: COMPONENTS.stay,
    componentType: ComponentType.accommodation,
    supplierId: cat.hotel.supplierId,
    supplierBookingReference: 'DEMO-HB-001',
    priceCents: cat.hotel.pricePerNightCents * dates.nights,
    policy: hotelPolicy,
    data: hotelData,
  })

  // ---- Sagrada activity --------------------------------------------------
  const sagradaTags = parseStringList(cat.sagrada.tags)
  const sagradaData: ActivityBookingData = {
    kind: 'activity',
    productSnapshot: {
      productId: cat.sagrada.id,
      name: cat.sagrada.name,
      durationHours: cat.sagrada.durationHours,
      priceCents: cat.sagrada.priceCents,
      currency: 'EUR',
      tags: sagradaTags,
    },
    scheduledStart: dates.sagrada.start.toISOString(),
    participants: [{ travelerId: lead }, { travelerId: companion }],
    totalPriceCents: cat.sagrada.priceCents * 2,
    meetingPoint: {
      name: 'Sagrada Família — main entrance, Carrer de la Marina',
      address: 'C. de Mallorca, 401, 08013 Barcelona',
    },
    ticketBreakdown: 'Adult x2',
  }
  const activityPolicy: BookingPolicy = {
    cancellation: { canCancel: true, notes: 'Free cancellation up to 24h before start.' },
    modification: {
      canModify: true,
      allowedFields: ['date'],
      notes: 'Reschedule subject to availability.',
    },
  }
  await writeBooking({
    id: 'book-act-sagrada',
    componentId: COMPONENTS.actSagrada,
    componentType: ComponentType.activity,
    supplierId: cat.sagrada.supplierId,
    supplierBookingReference: 'DEMO-GYG-SAG-001',
    priceCents: cat.sagrada.priceCents * 2,
    policy: activityPolicy,
    data: sagradaData,
  })

  // ---- Food activity (paella cooking class) ------------------------------
  const foodTags = parseStringList(cat.food.tags)
  const foodData: ActivityBookingData = {
    kind: 'activity',
    productSnapshot: {
      productId: cat.food.id,
      name: cat.food.name,
      durationHours: cat.food.durationHours,
      priceCents: cat.food.priceCents,
      currency: 'EUR',
      tags: foodTags,
    },
    scheduledStart: dates.food.start.toISOString(),
    participants: [{ travelerId: lead }, { travelerId: companion }],
    totalPriceCents: cat.food.priceCents * 2,
    meetingPoint: {
      name: 'Mercat de la Boqueria — main entrance',
      address: 'La Rambla, 91, 08001 Barcelona',
    },
    ticketBreakdown: 'Adult x2',
  }
  await writeBooking({
    id: 'book-act-food',
    componentId: COMPONENTS.actFood,
    componentType: ComponentType.activity,
    supplierId: cat.food.supplierId,
    supplierBookingReference: 'DEMO-GYG-COOK-001',
    priceCents: cat.food.priceCents * 2,
    policy: activityPolicy,
    data: foodData,
  })
}
