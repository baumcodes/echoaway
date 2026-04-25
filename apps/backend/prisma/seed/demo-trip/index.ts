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
 * docs/data-model.md §5 and PLAN.md §1.
 *
 * Always wipes the demo trip first (cheap; cascades from Trip clear
 * Components/Bookings/Events/Disruption) so re-runs are safe. The
 * `reset` flag is retained for the `seed:demo:reset` alias and for
 * explicit log lines, but the wipe happens unconditionally.
 */
export async function seedDemoTrip(opts: { reset: boolean }): Promise<void> {
  await resetDemoTrip()

  const catalog = await loadDemoCatalog()
  const dates = tripDates()

  await seedTravelers()
  await seedTrip(dates)
  await seedComponents(catalog)
  await seedBookings(catalog, dates)
  await seedEvents(catalog, dates)
  await seedDisruption(dates)
}
