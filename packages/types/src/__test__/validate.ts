// Round-trip sanity test for the Zod schemas. Run via `yarn test`.
// If any sample fails to parse, the script exits non-zero.

import { strict as assert } from 'node:assert'

import {
  audioIntelligenceMetricSchema,
  bookingPolicySchema,
  componentBookingDataSchema,
  componentEventLocationSchema,
  suggestedActionSchema,
  voiceActionEventPayloadSchema,
} from '../schemas.js'
import { ComponentType } from '../enums.js'
import { assertComponentDataMatchesType } from '../assert.js'

const accommodationSample = {
  kind: 'accommodation',
  productSnapshot: {
    productId: 'hotel-bcn-01',
    name: 'Hotel Brisa Barcelona',
    stars: 4,
    pricePerNightCents: 14500,
    currency: 'EUR',
    coordinates: { lat: 41.3825, lng: 2.1769 },
    amenities: ['wifi', 'breakfast'],
    images: ['https://example.com/img.jpg'],
  },
  checkInDate: '2026-05-02',
  checkOutDate: '2026-05-06',
  nights: 4,
  totalPriceCents: 58000,
  guests: [
    { travelerId: 'trav-stephan', role: 'lead' },
    { travelerId: 'trav-anna', role: 'companion' },
  ],
} as const

const parsed = componentBookingDataSchema.parse(accommodationSample)
assert.equal(parsed.kind, 'accommodation')
assertComponentDataMatchesType(parsed, ComponentType.accommodation)

bookingPolicySchema.parse({
  cancellation: { canCancel: true, freeUntil: '2026-04-30T18:00:00.000Z' },
  modification: {
    canModify: true,
    freeUntil: '2026-04-25T22:00:00.000Z',
    feeAfterCents: 0,
    currency: 'EUR',
    allowedFields: ['check_in_date', 'check_out_date'],
  },
})

componentEventLocationSchema.parse({
  kind: 'airport',
  iataCode: 'BCN',
  airportId: 'air-bcn',
})

suggestedActionSchema.parse({
  id: 'shift-checkin',
  description: 'Move check-in to tomorrow',
  toolCall: {
    tool: 'quoteHotelCheckInChange',
    arguments: { componentId: 'comp-stay', newCheckInDate: '2026-05-03' },
  },
  priority: 1,
})

audioIntelligenceMetricSchema.parse({
  scenario: 'airport_noise',
  inputSignalToNoiseRatio: 0.4,
  enhancedSignalToNoiseRatio: 0.85,
  transcriptQuality: 0.87,
  taskCompleted: true,
  correctTripIdentified: true,
  correctActionSuggested: true,
  confirmationRequested: true,
  finalScore: 91,
})

voiceActionEventPayloadSchema.parse({
  type: 'change_suggested',
  sessionId: 'sess-1',
  componentId: 'comp-stay',
  quote: {
    componentId: 'comp-stay',
    changeType: 'check_in_date',
    oldValue: '2026-05-02',
    newValue: '2026-05-03',
    feeCents: 0,
    currency: 'EUR',
    policySummary: 'Free until 18:00 today',
    validUntil: '2026-04-25T23:59:00.000Z',
  },
})

// Negative case: mismatched discriminator must throw.
assert.throws(() =>
  assertComponentDataMatchesType(parsed, ComponentType.flight),
)

console.log('@echoaway/types schema validation: ok')
