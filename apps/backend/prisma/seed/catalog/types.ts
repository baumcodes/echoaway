// Re-exports of canonical enum values + a local type for the parsed
// modification policy used by accommodations seeding (it's a one-off shape
// that's a precursor to BookingPolicy.modification, kept narrow on purpose).

export {
  ComponentType,
  ComponentStatus,
  BookingStatus,
  EventType,
  DestinationType,
  SupplierCategory,
  TransferMode,
} from '@echoaway/types'

export type ModificationPolicyParsed = {
  canModify: boolean
  feeAmount: number
  currency: 'EUR'
  latestModificationTime: string | null
  notes: string
}
