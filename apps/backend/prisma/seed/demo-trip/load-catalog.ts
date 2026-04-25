import { prisma } from '../shared/db.js'
import { CATALOG_REFS } from './constants.js'

/**
 * Pre-loads every catalog product the demo trip references, plus the
 * legs of the demo flight. Throws fast and loudly if anything's missing
 * (catalog seed must run first).
 */
export async function loadDemoCatalog() {
  const flightRoute = await prisma.flightRouteProduct.findUnique({
    where: { id: CATALOG_REFS.flightRoute },
    include: { legs: { orderBy: { order: 'asc' } } },
  })
  const transfer = await prisma.groundTransferProduct.findUnique({
    where: { id: CATALOG_REFS.transfer },
  })
  const hotel = await prisma.accommodationProduct.findUnique({
    where: { id: CATALOG_REFS.hotel },
  })
  const sagrada = await prisma.activityProduct.findUnique({
    where: { id: CATALOG_REFS.actSagrada },
  })
  const food = await prisma.activityProduct.findUnique({
    where: { id: CATALOG_REFS.actFood },
  })

  const missing: string[] = []
  if (!flightRoute) missing.push(CATALOG_REFS.flightRoute)
  if (!transfer) missing.push(CATALOG_REFS.transfer)
  if (!hotel) missing.push(CATALOG_REFS.hotel)
  if (!sagrada) missing.push(CATALOG_REFS.actSagrada)
  if (!food) missing.push(CATALOG_REFS.actFood)
  if (missing.length) {
    throw new Error(
      `Catalog is missing demo references: ${missing.join(', ')} — run \`yarn seed\` first.`,
    )
  }

  return {
    flightRoute: flightRoute!,
    transfer: transfer!,
    hotel: hotel!,
    sagrada: sagrada!,
    food: food!,
  }
}

export type DemoCatalog = Awaited<ReturnType<typeof loadDemoCatalog>>
