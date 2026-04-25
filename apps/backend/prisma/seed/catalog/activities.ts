import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import { makeDestinationByCityMatcher, matchSupplier } from './shared.js'

export async function seedActivities(): Promise<void> {
  const allDestinations = await prisma.destination.findMany({
    select: { id: true, name: true },
  })
  const matchByCity = makeDestinationByCityMatcher(allDestinations)

  for (const src of dataset.activities()) {
    const supplierId = matchSupplier(src.supplier.name)
    if (!supplierId) {
      throw new Error(
        `Unknown activity supplier "${src.supplier.name}" on ${src._id}`,
      )
    }
    const data = {
      id: src._id,
      destinationId: matchByCity(src.city),
      supplierId,
      name: src.name,
      tags: j(src.tags ?? []),
      durationHours: src.duration_hours,
      openingHours: j(src.opening_hours ?? {}),
      priceCents: src.price * 100,
      currency: 'EUR',
      description: src.description,
      contractRef: src.supplier.contract_ref,
    }
    await prisma.activityProduct.upsert({
      where: { id: src._id },
      create: data,
      update: {
        destinationId: data.destinationId,
        supplierId: data.supplierId,
        name: data.name,
        tags: data.tags,
        durationHours: data.durationHours,
        openingHours: data.openingHours,
        priceCents: data.priceCents,
        currency: data.currency,
        description: data.description,
        contractRef: data.contractRef,
      },
    })
  }
}
