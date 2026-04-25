import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import { EXTRA_AIRPORTS, makeDestinationByCityMatcher } from './shared.js'

export async function seedAirports(): Promise<void> {
  const allDestinations = await prisma.destination.findMany({
    select: { id: true, name: true },
  })
  const matchByCity = makeDestinationByCityMatcher(allDestinations)

  const all = [
    ...dataset.airports(),
    ...EXTRA_AIRPORTS.map((a) => ({
      _id: a.id,
      iata: a.iata,
      icao: a.icao,
      name: a.name,
      city: a.city,
      country: a.country,
      location: a.location,
    })),
  ]

  for (const src of all) {
    const data = {
      id: src._id,
      iataCode: src.iata,
      icaoCode: src.icao ?? null,
      name: src.name,
      city: src.city,
      country: src.country,
      servesDestinationId: matchByCity(src.city),
      coordinates: j(src.location),
    }
    await prisma.airport.upsert({
      where: { id: src._id },
      create: data,
      update: {
        iataCode: data.iataCode,
        icaoCode: data.icaoCode,
        name: data.name,
        city: data.city,
        country: data.country,
        servesDestinationId: data.servesDestinationId,
        coordinates: data.coordinates,
      },
    })
  }
}
