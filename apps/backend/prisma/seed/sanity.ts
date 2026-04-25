import { prisma } from './shared/db.js'

export async function printSanity(): Promise<void> {
  const counts = {
    Destination: await prisma.destination.count(),
    Airport: await prisma.airport.count(),
    Supplier: await prisma.supplier.count(),
    AccommodationProduct: await prisma.accommodationProduct.count(),
    ActivityProduct: await prisma.activityProduct.count(),
    FlightRouteProduct: await prisma.flightRouteProduct.count(),
    FlightRouteLeg: await prisma.flightRouteLeg.count(),
    GroundTransferProduct: await prisma.groundTransferProduct.count(),
    Traveler: await prisma.traveler.count(),
    Trip: await prisma.trip.count(),
    Component: await prisma.component.count(),
    ComponentBooking: await prisma.componentBooking.count(),
    ComponentEvent: await prisma.componentEvent.count(),
    Disruption: await prisma.disruption.count(),
  }
  console.log('\n[sanity] row counts')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printSanity()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
