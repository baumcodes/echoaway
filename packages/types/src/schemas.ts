// Zod schemas for the typed JSON columns in the data model.
// Phase 1: placeholders that compile and round-trip a sample. Phase 2A
// fills these out to match docs/component-data-shapes.md exactly.

import { z } from 'zod'

const isoDate = z.string()
const isoDateTime = z.string()

const coordinatesSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
  })
  .strict()

// --- ComponentBookingData (discriminated by `kind`) -----------------

const flightBookingDataSchema = z.object({
  kind: z.literal('flight'),
  routeSnapshot: z.object({
    routeId: z.string(),
    fromIata: z.string(),
    toIata: z.string(),
    stops: z.number().int().nonnegative(),
    durationHours: z.number(),
    fareConditions: z.enum(['non_refundable', 'changeable_fee', 'flexible']),
    daysOfWeek: z.array(z.number().int().min(1).max(7)),
  }),
  legs: z.array(
    z.object({
      order: z.number().int().positive(),
      fromIata: z.string(),
      toIata: z.string(),
      flightNo: z.string(),
      airline: z.string(),
      scheduledDeparture: isoDateTime,
      scheduledArrival: isoDateTime,
      actualDeparture: isoDateTime.nullable().optional(),
      actualArrival: isoDateTime.nullable().optional(),
    }),
  ),
  passengers: z.array(
    z.object({
      travelerId: z.string(),
      seat: z.string().optional(),
      fareClass: z
        .enum(['economy', 'premium_economy', 'business', 'first'])
        .optional(),
    }),
  ),
  pnr: z.string().optional(),
})

const accommodationBookingDataSchema = z.object({
  kind: z.literal('accommodation'),
  productSnapshot: z.object({
    productId: z.string(),
    name: z.string(),
    stars: z.number().int().min(0).max(5),
    pricePerNightCents: z.number().int().nonnegative(),
    currency: z.literal('EUR'),
    coordinates: coordinatesSchema,
    amenities: z.array(z.string()),
    images: z.array(z.string()),
  }),
  checkInDate: isoDate,
  checkOutDate: isoDate,
  nights: z.number().int().positive(),
  totalPriceCents: z.number().int().nonnegative(),
  guests: z.array(
    z.object({
      travelerId: z.string(),
      role: z.enum(['lead', 'companion', 'child']),
    }),
  ),
  roomCategory: z.string().optional(),
  notes: z.string().optional(),
})

const activityBookingDataSchema = z.object({
  kind: z.literal('activity'),
  productSnapshot: z.object({
    productId: z.string(),
    name: z.string(),
    durationHours: z.number(),
    priceCents: z.number().int().nonnegative(),
    currency: z.literal('EUR'),
    tags: z.array(z.string()),
  }),
  scheduledStart: isoDateTime,
  participants: z.array(
    z.object({
      travelerId: z.string(),
      notes: z.string().optional(),
    }),
  ),
  totalPriceCents: z.number().int().nonnegative(),
  meetingPoint: z
    .object({
      name: z.string(),
      address: z.string().optional(),
      coordinates: coordinatesSchema.optional(),
    })
    .optional(),
  ticketBreakdown: z.string().optional(),
})

const transferBookingDataSchema = z.object({
  kind: z.literal('transfer'),
  productSnapshot: z.object({
    productId: z.string(),
    fromLabel: z.string(),
    toLabel: z.string(),
    mode: z.enum(['bus', 'shuttle', 'private_car', 'train', 'taxi']),
    durationMinutes: z.number().int().nonnegative(),
    priceCents: z.number().int().nonnegative(),
    currency: z.literal('EUR'),
  }),
  scheduledPickup: isoDateTime,
  scheduledDropoff: isoDateTime,
  passengers: z.array(
    z.object({
      travelerId: z.string(),
      luggageCount: z.number().int().nonnegative().optional(),
    }),
  ),
  totalPriceCents: z.number().int().nonnegative(),
  pickupLocation: z
    .object({
      name: z.string(),
      address: z.string().optional(),
      coordinates: coordinatesSchema.optional(),
    })
    .optional(),
  dropoffLocation: z
    .object({
      name: z.string(),
      address: z.string().optional(),
      coordinates: coordinatesSchema.optional(),
    })
    .optional(),
})

export const componentBookingDataSchema = z.discriminatedUnion('kind', [
  flightBookingDataSchema,
  accommodationBookingDataSchema,
  activityBookingDataSchema,
  transferBookingDataSchema,
])
export type ComponentBookingData = z.infer<typeof componentBookingDataSchema>

// --- ComponentEventLocation ----------------------------------------

export const componentEventLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('airport'),
    iataCode: z.string(),
    airportId: z.string(),
    terminal: z.string().optional(),
    gate: z.string().optional(),
  }),
  z.object({
    kind: z.literal('accommodation'),
    accommodationProductId: z.string(),
    name: z.string(),
    coordinates: coordinatesSchema.optional(),
  }),
  z.object({
    kind: z.literal('activity'),
    meetingPointName: z.string(),
    address: z.string().optional(),
    coordinates: coordinatesSchema.optional(),
  }),
  z.object({
    kind: z.literal('address'),
    label: z.string(),
    address: z.string().optional(),
    coordinates: coordinatesSchema.optional(),
  }),
])
export type ComponentEventLocation = z.infer<
  typeof componentEventLocationSchema
>

// --- BookingPolicy --------------------------------------------------

export const bookingPolicySchema = z.object({
  cancellation: z.object({
    canCancel: z.boolean(),
    freeUntil: isoDateTime.optional(),
    feeAfterCents: z.number().int().nonnegative().optional(),
    currency: z.literal('EUR').optional(),
    notes: z.string().optional(),
  }),
  modification: z.object({
    canModify: z.boolean(),
    freeUntil: isoDateTime.optional(),
    feeAfterCents: z.number().int().nonnegative().optional(),
    currency: z.literal('EUR').optional(),
    allowedFields: z
      .array(
        z.enum([
          'check_in_date',
          'check_out_date',
          'guests',
          'pickup_time',
          'departure_date',
          'date',
        ]),
      )
      .optional(),
    notes: z.string().optional(),
  }),
  rawText: z.string().optional(),
})
export type BookingPolicy = z.infer<typeof bookingPolicySchema>

// --- Disruption.suggestedActions -----------------------------------

export const suggestedActionSchema = z.object({
  id: z.string(),
  description: z.string(),
  toolCall: z.object({
    tool: z.enum([
      'quoteHotelCheckInChange',
      'confirmHotelCheckInChange',
      'cancelComponent',
      'rescheduleActivity',
      'requoteTransfer',
    ]),
    arguments: z.record(z.unknown()),
  }),
  priority: z.number().int().min(1).max(5),
})
export type SuggestedAction = z.infer<typeof suggestedActionSchema>

// --- AudioIntelligenceMetric ---------------------------------------

export const audioIntelligenceMetricSchema = z.object({
  scenario: z.enum(['clean', 'airport_noise', 'cafe_noise', 'street_noise']),
  inputSignalToNoiseRatio: z.number().min(0).max(1).optional(),
  enhancedSignalToNoiseRatio: z.number().min(0).max(1).optional(),
  transcriptQuality: z.number().min(0).max(1),
  taskCompleted: z.boolean(),
  correctTripIdentified: z.boolean(),
  correctActionSuggested: z.boolean(),
  confirmationRequested: z.boolean(),
  finalScore: z.number().min(0).max(100),
})
export type AudioIntelligenceMetric = z.infer<
  typeof audioIntelligenceMetricSchema
>

// --- ChangeQuote + VoiceActionEvent.payload ------------------------

export const changeQuoteSchema = z.object({
  componentId: z.string(),
  changeType: z.enum([
    'check_in_date',
    'check_out_date',
    'departure',
    'pickup',
    'date',
  ]),
  oldValue: z.string(),
  newValue: z.string(),
  feeCents: z.number().int().nonnegative(),
  currency: z.literal('EUR'),
  policySummary: z.string(),
  validUntil: isoDateTime,
})
export type ChangeQuote = z.infer<typeof changeQuoteSchema>

export const voiceActionEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session_started'),
    sessionId: z.string(),
    tripId: z.string(),
    phone: z.string(),
  }),
  z.object({
    type: z.literal('assistant_listening'),
    sessionId: z.string(),
    audioMetric: audioIntelligenceMetricSchema.partial().optional(),
  }),
  z.object({
    type: z.literal('assistant_thinking'),
    sessionId: z.string(),
    intent: z.string().optional(),
  }),
  z.object({
    type: z.literal('trip_loaded'),
    sessionId: z.string(),
    tripId: z.string(),
    tripSummary: z.string(),
  }),
  z.object({
    type: z.literal('change_suggested'),
    sessionId: z.string(),
    componentId: z.string(),
    quote: changeQuoteSchema,
  }),
  z.object({
    type: z.literal('confirmation_required'),
    sessionId: z.string(),
    quote: changeQuoteSchema,
  }),
  z.object({
    type: z.literal('change_confirmed'),
    sessionId: z.string(),
    componentId: z.string(),
    bookingId: z.string(),
    quote: changeQuoteSchema,
  }),
  z.object({
    type: z.literal('change_rejected'),
    sessionId: z.string(),
    componentId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('support_log_created'),
    sessionId: z.string(),
    supportLogId: z.string(),
  }),
  z.object({
    type: z.literal('session_ended'),
    sessionId: z.string(),
    reason: z.string(),
  }),
])
export type VoiceActionEventPayload = z.infer<
  typeof voiceActionEventPayloadSchema
>
