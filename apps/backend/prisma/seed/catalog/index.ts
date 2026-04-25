import { seedAccommodations } from './accommodations.js'
import { seedActivities } from './activities.js'
import { seedAirports } from './airports.js'
import { seedDestinations } from './destinations.js'
import { seedFlightRoutes } from './flight-routes.js'
import { seedGroundTransfers } from './ground-transfers.js'
import { seedSuppliers } from './suppliers.js'

/**
 * Catalog seed pipeline — runs in FK-safe order per docs/seed-strategy.md §2.1.
 * Idempotent: every step upserts on the source `_id` (or synthetic id).
 */
export async function seedCatalog(): Promise<void> {
  await seedDestinations()
  await seedAirports()
  await seedSuppliers()
  await seedAccommodations()
  await seedActivities()
  await seedGroundTransfers()
  await seedFlightRoutes()
}
