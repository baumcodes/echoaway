import type { ComponentType } from './enums.js'
import type { ComponentBookingData } from './schemas.js'

/**
 * Validates the discriminated `ComponentBookingData.kind` matches the
 * parent `Component.type`. SQLite cannot enforce this; the seed and
 * tool layer must.
 */
export function assertComponentDataMatchesType(
  data: ComponentBookingData,
  type: ComponentType,
): void {
  if (data.kind !== type) {
    throw new Error(
      `ComponentBookingData.kind="${data.kind}" does not match Component.type="${type}"`,
    )
  }
}
