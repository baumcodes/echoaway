import { seedBookings } from './bookings.js'
import { seedComponents } from './components.js'
import { tripDates } from './dates.js'
import { seedDisruption } from './disruption.js'
import { seedEvents } from './events.js'
import { loadDemoCatalog } from './load-catalog.js'
import { resetDemoTrip } from './reset.js'
import { seedTravelers } from './travelers.js'
import { seedTrip } from './trip.js'

/**
 * Composes the "Barcelona Long Weekend" demo trip referenced in
 * docs/data-model.md §5 and PLAN.md §1. Not idempotent on its own —
 * pass `reset=true` to wipe and recreate.
 */
export async function seedDemoTrip(opts: { reset: boolean }): Promise<void> {
  if (opts.reset) {
    await resetDemoTrip()
  }

  const catalog = await loadDemoCatalog()
  const dates = tripDates()

  await seedTravelers()
  await seedTrip(dates)
  await seedComponents(catalog)
  await seedBookings(catalog, dates)
  await seedEvents(catalog, dates)
  await seedDisruption(dates)
}
