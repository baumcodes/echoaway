// Mirrors the enums declared in docs/erm.md §2.
// Until Phase 2A creates the Prisma schema, these are the canonical
// runtime enums. Phase 2A will re-export the Prisma-generated enums
// from this same file so the rest of the monorepo keeps importing
// from @echoaway/types/enums regardless.

export const ComponentType = {
  flight: 'flight',
  accommodation: 'accommodation',
  activity: 'activity',
  transfer: 'transfer',
} as const
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType]

export const ComponentStatus = {
  planned: 'planned',
  quoted: 'quoted',
  booked: 'booked',
  cancelled: 'cancelled',
  changed: 'changed',
} as const
export type ComponentStatus = (typeof ComponentStatus)[keyof typeof ComponentStatus]

export const BookingStatus = {
  confirmed: 'confirmed',
  pending_change: 'pending_change',
  cancelled: 'cancelled',
} as const
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus]

export const EventType = {
  departure: 'departure',
  arrival: 'arrival',
  check_in: 'check_in',
  check_out: 'check_out',
  pickup: 'pickup',
  meeting_point: 'meeting_point',
  activity_start: 'activity_start',
  activity_end: 'activity_end',
} as const
export type EventType = (typeof EventType)[keyof typeof EventType]

export const DestinationType = {
  country: 'country',
  region: 'region',
  city: 'city',
  city_area: 'city_area',
  island: 'island',
  park: 'park',
} as const
export type DestinationType = (typeof DestinationType)[keyof typeof DestinationType]

export const SupplierCategory = {
  accommodation: 'accommodation',
  activity: 'activity',
  transfer: 'transfer',
  flight: 'flight',
} as const
export type SupplierCategory = (typeof SupplierCategory)[keyof typeof SupplierCategory]

export const TransferMode = {
  bus: 'bus',
  shuttle: 'shuttle',
  private_car: 'private_car',
  train: 'train',
  taxi: 'taxi',
} as const
export type TransferMode = (typeof TransferMode)[keyof typeof TransferMode]

export const TripTravelerRole = {
  lead: 'lead',
  companion: 'companion',
  child: 'child',
} as const
export type TripTravelerRole = (typeof TripTravelerRole)[keyof typeof TripTravelerRole]

export const DisruptionType = {
  flight_delay: 'flight_delay',
  flight_cancellation: 'flight_cancellation',
  schedule_change: 'schedule_change',
  overbooking: 'overbooking',
  closure: 'closure',
  weather: 'weather',
} as const
export type DisruptionType = (typeof DisruptionType)[keyof typeof DisruptionType]

export const DisruptionSeverity = {
  info: 'info',
  minor: 'minor',
  major: 'major',
  critical: 'critical',
} as const
export type DisruptionSeverity = (typeof DisruptionSeverity)[keyof typeof DisruptionSeverity]

export const DisruptionStatus = {
  open: 'open',
  mitigated: 'mitigated',
  resolved: 'resolved',
} as const
export type DisruptionStatus = (typeof DisruptionStatus)[keyof typeof DisruptionStatus]

export const VoiceActionEventType = {
  session_started: 'session_started',
  assistant_listening: 'assistant_listening',
  assistant_thinking: 'assistant_thinking',
  trip_loaded: 'trip_loaded',
  change_suggested: 'change_suggested',
  confirmation_required: 'confirmation_required',
  change_confirmed: 'change_confirmed',
  change_rejected: 'change_rejected',
  support_log_created: 'support_log_created',
  session_ended: 'session_ended',
} as const
export type VoiceActionEventType =
  (typeof VoiceActionEventType)[keyof typeof VoiceActionEventType]

export const TripStatus = {
  draft: 'draft',
  booked: 'booked',
  in_progress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
} as const
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus]
