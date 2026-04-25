// Shapes returned by the EchoAway backend's tool API. Mirrors what
// apps/backend serialises in TripsService.getTripFull etc. Kept narrow
// on purpose — only fields the web client actually consumes.

import type {
  AudioIntelligenceMetric,
  BookingPolicy,
  ChangeQuote,
  ComponentBookingData,
  ComponentEventLocation,
  SuggestedAction,
} from '@echoaway/types'

export type TripTraveler = {
  role: string
  traveler: {
    id: string
    fullName: string
    email: string | null
    phone: string | null
    locale: string | null
  }
}

export type TripSegment = {
  id: string
  tripId: string
  destinationId: string
  startDate: string
  endDate: string
  order: number
  title: string
}

export type TripComponent = {
  id: string
  type: 'flight' | 'accommodation' | 'activity' | 'transfer'
  title: string
  status: string
  segmentId: string | null
  catalogRef: {
    accommodationProductId: string | null
    activityProductId: string | null
    flightRouteProductId: string | null
    groundTransferProductId: string | null
  }
  booking: {
    id: string
    supplierId: string
    supplierBookingReference: string
    status: string
    priceCents: number
    currency: string
    policy: BookingPolicy | null
    data: ComponentBookingData | null
    bookedAt: string
    cancelledAt: string | null
  } | null
  events: Array<{
    id: string
    type: string
    title: string
    startsAt: string
    endsAt: string | null
    timezone: string
    destinationId: string | null
    location: ComponentEventLocation | null
  }>
}

export type TripDisruption = {
  id: string
  type: string
  severity: string
  message: string
  status: string
  affectedComponentId: string | null
  suggestedActions: SuggestedAction[] | null
  detectedAt: string
  resolvedAt: string | null
}

export type Trip = {
  id: string
  title: string
  status: string
  startDate: string
  endDate: string
  currency: string
  segments: TripSegment[]
  travelers: TripTraveler[]
  components: TripComponent[]
  disruptions: TripDisruption[]
}

/** Redacted result row from `/trips/search?q=`. Crucially missing
 *  the raw fullName / email / phone — those stay server-side. The
 *  agent uses the masked fields to ask for a verifier and then
 *  posts to `/trip-candidates/:id/confirm`. */
export type TripCandidate = {
  candidateId: string
  tripTitle: string
  /** "S.R." — joined per-word initials. */
  matchedTravelerInitials: string
  /** Last 3 digits of the phone, or null if the traveler has no phone. */
  phoneTail: string | null
  /** "s***@p***.com", or null if the traveler has no email. */
  emailMasked: string | null
}

export type {
  AudioIntelligenceMetric,
  BookingPolicy,
  ChangeQuote,
  ComponentBookingData,
  ComponentEventLocation,
  SuggestedAction,
}
