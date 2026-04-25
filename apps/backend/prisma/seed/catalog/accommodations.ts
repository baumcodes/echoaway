import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import {
  makeDestinationByCityMatcher,
  matchSupplier,
  parseCancellationToPolicy,
} from './shared.js'

export async function seedAccommodations(): Promise<void> {
  const allDestinations = await prisma.destination.findMany({
    select: { id: true, name: true },
  })
  const matchByCity = makeDestinationByCityMatcher(allDestinations)
  const hotelbedsId = matchSupplier('Hotelbeds')
  if (!hotelbedsId) throw new Error('Hotelbeds supplier missing — seed suppliers first')

  for (const src of dataset.accommodations()) {
    const data = {
      id: src._id,
      destinationId: matchByCity(src.city),
      supplierId: hotelbedsId,
      name: src.name,
      stars: src.stars,
      pricePerNightCents: src.price_per_night * 100,
      currency: 'EUR',
      amenities: j(src.amenities ?? []),
      coordinates: j(src.location),
      description: src.description,
      defaultCancellationTerms: src.cancellation_terms,
      defaultModificationPolicy: j(parseCancellationToPolicy(src.cancellation_terms)),
      images: j(src.images ?? []),
      contractRef: src.supplier.contract_ref,
    }
    await prisma.accommodationProduct.upsert({
      where: { id: src._id },
      create: data,
      update: {
        destinationId: data.destinationId,
        supplierId: data.supplierId,
        name: data.name,
        stars: data.stars,
        pricePerNightCents: data.pricePerNightCents,
        currency: data.currency,
        amenities: data.amenities,
        coordinates: data.coordinates,
        description: data.description,
        defaultCancellationTerms: data.defaultCancellationTerms,
        defaultModificationPolicy: data.defaultModificationPolicy,
        images: data.images,
        contractRef: data.contractRef,
      },
    })
  }
}
